import time
import os
import uuid
import json
from flask import request, jsonify, send_from_directory, Response, redirect
from werkzeug.utils import secure_filename
from backend.config.config import UPLOAD_FOLDER, OUTPUT_FOLDER, resolve_blender_path, is_production_environment
from backend.schemas.validation import allowed_file, parse_upload_params
from backend.repositories.task_repository import task_repository
from backend.services.model_service import dispatch_generation_task
from backend.db.mongo import mongo_manager
from backend.services.imagekit_service import (
    imagekit_service,
    ImageKitServiceError,
    ALLOWED_IMAGE_EXTENSIONS,
    MAX_IMAGE_SIZE_BYTES,
)
from backend.services.s3_service import s3_service, S3ServiceError
from backend.repositories.project_repository import project_repository
from backend.repositories.share_repository import share_repository
from backend.middleware.auth import get_authenticated_user

class ModelController:
    """Controller handling blueprint uploads, job polling, model streaming, and health checks."""

    @staticmethod
    def upload_file():
        print("[UPLOAD] Received upload request")

        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400

        file = request.files["file"]
        if not file or not allowed_file(file.filename):
            return jsonify({"error": "Invalid file format. Supported: PNG, JPG, JPEG, DXF"}), 400

        params = parse_upload_params(request.form)
        print(f"[PARAMS] floors={params['floors']}, wall_height={params['wall_height']}, wall_thickness={params['wall_thickness']}")

        task_id = str(uuid.uuid4())
        filename = secure_filename(file.filename)
        input_filename = f"{task_id}_{filename}"
        output_filename = f"{task_id}_model.glb"

        input_path = os.path.join(UPLOAD_FOLDER, input_filename)
        output_path = os.path.join(OUTPUT_FOLDER, output_filename)

        file.save(input_path)

        if os.path.getsize(input_path) > MAX_IMAGE_SIZE_BYTES:
            try:
                os.remove(input_path)
            except Exception:
                pass
            return jsonify({"error": "File size exceeds 25MB limit"}), 400

        user = get_authenticated_user(request)
        if user is None:
            if os.path.exists(input_path):
                try:
                    os.remove(input_path)
                except Exception:
                    pass
            return jsonify({"error": "Unauthorized", "message": "Valid authentication token required or invalid token provided"}), 401

        owner_id = user["user_id"]
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

        # Check if vector-assisted mode is requested for raster images
        is_vector_assisted = request.form.get("vector_assisted", "").lower() in ("true", "1", "yes")
        raw_vector_data = request.form.get("vector_data")
        vector_data = None
        target_size = float(request.form.get("target_size", 28.0))

        if is_vector_assisted and ext != "dxf":
            if raw_vector_data:
                try:
                    import json
                    vector_data = json.loads(raw_vector_data)
                except Exception as e:
                    print(f"[WARN] Failed to parse vector_data JSON: {e}")

            if not vector_data:
                try:
                    from backend.services.vector_service import extract_vector_walls
                    vector_data = extract_vector_walls(
                        input_path,
                        wall_height=params["wall_height"],
                        wall_thickness=params["wall_thickness"],
                        target_size=target_size,
                    )
                except Exception as e:
                    return jsonify({"error": f"Vector-assisted extraction failed: {str(e)}"}), 422

        imagekit_ref = None
        if imagekit_service.is_configured() and ext in ("png", "jpg", "jpeg"):
            try:
                imagekit_ref = imagekit_service.upload_blueprint_image(
                    file_data=input_path,
                    file_name=filename,
                    project_id=task_id,
                    owner_id=owner_id,
                )
            except ImageKitServiceError as ik_err:
                if os.path.exists(input_path):
                    try:
                        os.remove(input_path)
                    except Exception:
                        pass
                err_text = str(ik_err)
                if not err_text.lower().startswith("imagekit"):
                    err_text = f"ImageKit blueprint upload failed: {err_text}"
                return jsonify({"error": err_text}), 502
            except Exception as e:
                if os.path.exists(input_path):
                    try:
                        os.remove(input_path)
                    except Exception:
                        pass
                return jsonify({"error": f"ImageKit blueprint upload failed: {e.__class__.__name__}"}), 502

        source_info = {
            "filename": filename,
            "type": ext,
            "has_source": True,
            "download_url": f"/api/source/{task_id}",
            "uploaded_at": int(time.time() * 1000),
            "pipeline": "vector_assisted" if vector_data else ("dxf" if ext == "dxf" else "image"),
        }

        if imagekit_ref:
            source_info["imagekit_url"] = imagekit_ref["url"]
            source_info["imagekit_file_id"] = imagekit_ref["file_id"]

        if mongo_manager.is_configured():
            asset_record = None
            try:
                if imagekit_ref:
                    asset_record = project_repository.record_asset(
                        {
                            "asset_id": imagekit_ref["file_id"],
                            "project_id": task_id,
                            "asset_type": "blueprint",
                            "storage_provider": "imagekit",
                            "storage_key": imagekit_ref["file_id"],
                            "url": imagekit_ref["url"],
                            "filename": filename,
                            "file_size": imagekit_ref.get("size", 0),
                        },
                        owner_id=owner_id,
                    )
                project_repository.create_project(
                    {
                        "project_id": task_id,
                        "name": filename.rsplit(".", 1)[0] if "." in filename else filename,
                        "type": "model" if ext != "dxf" else "dxf",
                        "status": "queued",
                        "pipeline": source_info["pipeline"],
                        "source_filename": filename,
                        "blueprint_ref": imagekit_ref,
                        "parameters": params,
                    },
                    owner_id=owner_id,
                )
                project_repository.create_generation_job(
                    {
                        "job_id": task_id,
                        "project_id": task_id,
                        "status": "queued",
                        "progress": 0,
                        "pipeline": source_info["pipeline"],
                    },
                    owner_id=owner_id,
                )
            except Exception as db_err:
                print(f"[MONGO] Failed to record blueprint project in MongoDB: {db_err}")
                mongo_rolled_back = True
                if asset_record and asset_record.get("asset_id"):
                    try:
                        mongo_rolled_back = project_repository.delete_asset(asset_record["asset_id"], owner_id=owner_id)
                    except Exception as del_err:
                        print(f"[ROLLBACK] Failed to delete MongoDB asset record: {del_err}")
                        mongo_rolled_back = False

                # Attempt ImageKit cleanup after the MongoDB rollback
                ik_rolled_back = False
                if imagekit_ref and imagekit_ref.get("file_id"):
                    try:
                        ik_rolled_back = imagekit_service.delete_file(imagekit_ref["file_id"])
                    except Exception as ik_del_err:
                        print(f"[ROLLBACK] Failed to delete ImageKit file: {ik_del_err}")

                if os.path.exists(input_path):
                    try:
                        os.remove(input_path)
                    except Exception:
                        pass

                return jsonify({
                    "error": "Failed to persist project metadata in database",
                    "cleanup_status": {
                        "imagekit_cleaned": bool(ik_rolled_back),
                        "database_cleaned": bool(mongo_rolled_back),
                    }
                }), 500

        task_repository.set(task_id, {
            "status": "queued",
            "progress": 0,
            "source_file": source_info,
            "owner_id": owner_id,
        })

        dispatch_generation_task(
            task_id=task_id,
            input_path=input_path,
            output_path=output_path,
            floors=params["floors"],
            wall_height=float(vector_data.get("wall_height", params["wall_height"])) if vector_data else params["wall_height"],
            wall_thickness=float(vector_data.get("wall_thickness", params["wall_thickness"])) if vector_data else params["wall_thickness"],
            vector_data=vector_data,
            target_size=float(vector_data.get("target_size", target_size)) if vector_data else target_size,
            owner_id=owner_id,
        )

        response_payload = {
            "task_id": task_id,
            "message": "Processing started",
            "pipeline": source_info["pipeline"],
        }
        if imagekit_ref:
            response_payload["imagekit_url"] = imagekit_ref["url"]
            response_payload["imagekit_file_id"] = imagekit_ref["file_id"]

        return (
            jsonify(response_payload),
            200,
        )

    @staticmethod
    def extract_vectors():
        """
        Endpoint for Vector-Assisted 2D geometry extraction and preview.
        Preprocesses raster floor plan, cleans noise, deduplicates walls, and returns 2D vectors & SVG.
        """
        print("[VECTOR_EXTRACT] Received vector extraction request")
        user = get_authenticated_user(request)
        if user is None:
            return jsonify({"error": "Unauthorized", "message": "Valid authentication token required or invalid token provided"}), 401

        if "file" not in request.files:
            return jsonify({"error": "No file uploaded for vector extraction"}), 400

        file = request.files["file"]
        if not file or not allowed_file(file.filename):
            return jsonify({"error": "Invalid file format. Supported: PNG, JPG, JPEG"}), 400

        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext == "dxf":
            return jsonify({"error": "Vector-assisted extraction is for raster images (PNG, JPG). DXF uses direct CAD ingestion."}), 400

        temp_id = str(uuid.uuid4())
        safe_name = secure_filename(file.filename)
        temp_path = os.path.join(UPLOAD_FOLDER, f"temp_vec_{temp_id}_{safe_name}")

        try:
            file.save(temp_path)

            min_wall_len = float(request.form.get("min_wall_length_px", 25))
            snap_radius = float(request.form.get("snap_radius", 18.0))
            wall_height = float(request.form.get("wall_height", 3.0))
            wall_thickness = float(request.form.get("wall_thickness", 0.25))
            target_size = float(request.form.get("target_size", 28.0))

            from backend.services.vector_service import extract_vector_walls
            result = extract_vector_walls(
                temp_path,
                min_wall_length_px=min_wall_len,
                snap_radius=snap_radius,
                wall_height=wall_height,
                wall_thickness=wall_thickness,
                target_size=target_size,
            )

            result["temp_file_id"] = temp_id
            return jsonify(result), 200

        except ValueError as ve:
            return jsonify({"error": str(ve)}), 422
        except Exception as e:
            return jsonify({"error": f"Vector extraction failed: {str(e)}"}), 500
        finally:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

    @staticmethod
    def get_status(task_id: str):
        user = get_authenticated_user(request)
        if user is None:
            return jsonify({"error": "Unauthorized", "message": "Valid authentication token required or invalid token provided"}), 401

        owner_id = user["user_id"]

        if mongo_manager.is_configured():
            try:
                project_owner = project_repository.get_project_owner(task_id)
                if project_owner is not None and project_owner != owner_id:
                    return jsonify({"error": "Forbidden", "message": "You do not have permission to access this task"}), 403
            except Exception as e:
                print(f"[STATUS] Error checking project ownership: {e}")

        task_data = task_repository.get(task_id)
        if not task_data:
            # Check if project exists in MongoDB as completed (e.g. after server restart or on ephemeral storage)
            if mongo_manager.is_configured():
                try:
                    project = project_repository.get_project(task_id, owner_id=owner_id)
                    if project:
                        reconstructed = {
                            "status": project.get("status", "completed"),
                            "progress": 100 if project.get("status") == "completed" else 0,
                            "model_file": f"{task_id}_model.glb",
                            "owner_id": owner_id,
                            "analysis": project.get("analysis") or {
                                "pipeline": project.get("pipeline", "standard"),
                            },
                            "customization": project.get("customization") or {},
                            "source_file": {
                                "filename": project.get("source_filename") or f"{task_id}.png",
                                "type": project.get("type", "model"),
                                "has_source": bool(project.get("blueprint_ref")),
                                "download_url": f"/api/source/{task_id}",
                            },
                        }
                        if project.get("model_ref"):
                            reconstructed["s3_key"] = project["model_ref"].get("key")
                            reconstructed["s3_bucket"] = project["model_ref"].get("bucket")
                            reconstructed["storage_provider"] = "s3"
                        task_repository.set(task_id, reconstructed)
                        return jsonify(reconstructed), 200
                except Exception as mongo_err:
                    print(f"[STATUS] Notice checking MongoDB project fallback: {mongo_err}")

            return jsonify({"status": "error", "progress": 0, "error": "Task not found"}), 200

        task_owner = task_data.get("owner_id")
        if task_owner and task_owner != owner_id:
            return jsonify({"error": "Forbidden", "message": "You do not have permission to access this task"}), 403

        if is_production_environment() and not task_owner and not mongo_manager.is_configured():
            return jsonify({"status": "error", "progress": 0, "error": "Task not found"}), 200

        if mongo_manager.is_configured():
            try:
                proj = project_repository.get_project(task_id, owner_id=owner_id)
                if proj and proj.get("customization"):
                    task_data["customization"] = proj.get("customization")
            except Exception:
                pass

        return jsonify(task_data)

    @staticmethod
    def download_model(filename: str):
        """Streams a local GLB model file with ownership verification, falling back to S3 if not on disk."""
        user = get_authenticated_user(request)
        if user is None:
            return jsonify({"error": "Unauthorized", "message": "Valid authentication token required or invalid token provided"}), 401

        owner_id = user["user_id"]
        safe_filename = secure_filename(filename)

        task_id = None
        if "_" in safe_filename:
            task_id = safe_filename.split("_", 1)[0]

        if task_id:
            if mongo_manager.is_configured():
                try:
                    project_owner = project_repository.get_project_owner(task_id)
                    if project_owner is not None and project_owner != owner_id:
                        return jsonify({"error": "Forbidden", "message": "You do not have permission to access this model"}), 403
                except Exception as e:
                    print(f"[MODEL_DOWNLOAD] Error checking project ownership: {e}")

            task_data = task_repository.get(task_id)
            if task_data:
                task_owner = task_data.get("owner_id")
                if task_owner and task_owner != owner_id:
                    return jsonify({"error": "Forbidden", "message": "You do not have permission to access this model"}), 403

        local_path = os.path.join(OUTPUT_FOLDER, safe_filename)
        if os.path.exists(local_path):
            return send_from_directory(
                OUTPUT_FOLDER, safe_filename, as_attachment=False
            )

        # Fallback: Stream directly from S3 if local file is absent from outputs directory
        if task_id and s3_service.is_configured():
            s3_key = None
            if mongo_manager.is_configured():
                try:
                    assets = project_repository.get_assets_by_project(task_id, owner_id=owner_id)
                    for asset in assets:
                        if asset.get("asset_type") == "3d_model" and asset.get("storage_provider") == "s3":
                            s3_key = asset.get("storage_key")
                            break
                    if not s3_key:
                        proj = project_repository.get_project(task_id, owner_id=owner_id)
                        if proj and proj.get("model_ref"):
                            s3_key = proj["model_ref"].get("key")
                except Exception as e:
                    print(f"[MODEL_DOWNLOAD] Notice looking up S3 asset in Mongo: {e}")

            if not s3_key and task_data and task_data.get("s3_key"):
                s3_key = task_data.get("s3_key")

            if s3_key:
                try:
                    glb_bytes = s3_service.get_object_bytes(s3_key)
                    if glb_bytes:
                        return Response(
                            glb_bytes,
                            mimetype="model/gltf-binary",
                            headers={
                                "Content-Disposition": f'inline; filename="{safe_filename}"',
                            },
                        )
                except Exception as s3_fetch_err:
                    print(f"[MODEL_DOWNLOAD] S3 stream fallback error: {s3_fetch_err}")

        return jsonify({"error": "File not found"}), 404

    @staticmethod
    def download_source(task_id: str):
        """Streams the original uploaded blueprint file (DXF or Image) without exposing server paths."""
        user = get_authenticated_user(request)
        if user is None:
            return jsonify({"error": "Unauthorized", "message": "Valid authentication token required or invalid token provided"}), 401

        owner_id = user["user_id"]

        if mongo_manager.is_configured():
            try:
                project_owner = project_repository.get_project_owner(task_id)
                if project_owner is not None and project_owner != owner_id:
                    return jsonify({"error": "Forbidden", "message": "You do not have permission to access this file"}), 403
            except Exception as e:
                print(f"[SOURCE_DOWNLOAD] Error checking project ownership: {e}")

        task_data = task_repository.get(task_id)
        if task_data:
            task_owner = task_data.get("owner_id")
            if task_owner and task_owner != owner_id:
                return jsonify({"error": "Forbidden", "message": "You do not have permission to access this file"}), 403

        if not os.path.exists(UPLOAD_FOLDER):
            return jsonify({"error": "Source file not found"}), 404

        for fname in os.listdir(UPLOAD_FOLDER):
            if fname.startswith(f"{task_id}_"):
                orig_filename = fname[len(task_id) + 1:]
                return send_from_directory(
                    UPLOAD_FOLDER,
                    fname,
                    download_name=orig_filename,
                    as_attachment=False,
                )

        return jsonify({"error": "Source file not found"}), 404

    @staticmethod
    def get_model_url(task_id: str):
        """
        Securely returns a 3D model access URL.
        If S3 is configured and project has an S3 model asset, returns a short-lived presigned GET URL.
        If local model exists, returns local download URL for backwards compatibility.
        Enforces server-side authentication and owner-scoping.
        """
        user = get_authenticated_user(request)
        if user is None:
            return jsonify({"error": "Unauthorized", "message": "Valid authentication token required or invalid token provided"}), 401

        owner_id = user["user_id"]

        if mongo_manager.is_configured():
            try:
                project_owner = project_repository.get_project_owner(task_id)
            except Exception as e:
                print(f"[MODEL_URL] Error checking project ownership: {e}")
                return jsonify({"error": f"Database error verifying project: {str(e)}"}), 500

            if project_owner is None:
                if is_production_environment():
                    return jsonify({"error": "Project not found"}), 404
                if not task_repository.exists(task_id):
                    return jsonify({"error": "Project not found"}), 404
            elif project_owner != owner_id:
                return jsonify({"error": "Forbidden", "message": "You do not have permission to access this model"}), 403

            # Check if project has an active model_ref or S3 3D model asset in MongoDB
            try:
                # 1. First check the active model_ref on the project document (ensures edited model is preferred over original)
                proj = project_repository.get_project(task_id, owner_id=owner_id)
                if proj and proj.get("model_ref"):
                    model_ref = proj["model_ref"]
                    storage_provider = model_ref.get("storage_provider", "s3")
                    if storage_provider == "s3" and s3_service.is_configured():
                        storage_key = model_ref.get("key")
                        if storage_key:
                            if not s3_service.object_exists(storage_key):
                                local_path = os.path.join(OUTPUT_FOLDER, f"{task_id}_model.glb")
                                if os.path.exists(local_path):
                                    return jsonify({
                                        "success": True,
                                        "storage_provider": "local",
                                        "url": f"/api/download/{task_id}_model.glb",
                                        "filename": f"{task_id}_model.glb",
                                    }), 200
                                return jsonify({
                                    "error": "Model artifact not found in storage",
                                    "message": f"The 3D model object '{storage_key}' does not exist in S3 storage.",
                                    "code": "OBJECT_NOT_FOUND",
                                }), 404

                            presigned_url = s3_service.generate_presigned_url(storage_key, expiry_seconds=900)
                            return jsonify({
                                "success": True,
                                "storage_provider": "s3",
                                "url": presigned_url,
                                "expires_in": 900,
                                "filename": os.path.basename(storage_key),
                            }), 200
                    elif storage_provider == "local":
                        model_filename = model_ref.get("model_file", f"{task_id}_model.glb")
                        return jsonify({
                            "success": True,
                            "storage_provider": "local",
                            "url": f"/api/download/{model_filename}",
                            "filename": model_filename,
                        }), 200

                # 2. Check assets collection, picking the latest 3d_model asset
                assets = project_repository.get_assets_by_project(task_id, owner_id=owner_id)
                model_assets = [
                    a for a in assets
                    if a.get("asset_type") == "3d_model" and a.get("storage_key")
                ]
                if model_assets:
                    latest_asset = model_assets[-1]
                    if latest_asset.get("storage_provider") == "s3" and s3_service.is_configured():
                        storage_key = latest_asset["storage_key"]
                        if not s3_service.object_exists(storage_key):
                            model_filename = latest_asset.get("filename", f"{task_id}_model.glb")
                            local_path = os.path.join(OUTPUT_FOLDER, model_filename)
                            if os.path.exists(local_path):
                                return jsonify({
                                    "success": True,
                                    "storage_provider": "local",
                                    "url": f"/api/download/{model_filename}",
                                    "filename": model_filename,
                                }), 200
                            return jsonify({
                                "error": "Model artifact not found in storage",
                                "message": f"The 3D model object '{storage_key}' does not exist in S3 storage.",
                                "code": "OBJECT_NOT_FOUND",
                            }), 404

                        presigned_url = s3_service.generate_presigned_url(storage_key, expiry_seconds=900)
                        return jsonify({
                            "success": True,
                            "storage_provider": "s3",
                            "url": presigned_url,
                            "expires_in": 900,
                            "filename": latest_asset.get("filename", f"{task_id}_model.glb"),
                        }), 200
            except Exception as e:
                print(f"[MODEL_URL] Notice checking MongoDB assets: {e}")

        # Local model fallback (when MongoDB is unconfigured or S3 asset not recorded)
        task_data = task_repository.get(task_id)
        if task_data:
            task_owner = task_data.get("owner_id")
            if task_owner and task_owner != owner_id:
                return jsonify({"error": "Forbidden", "message": "You do not have permission to access this model"}), 403

            if task_data.get("s3_key") and s3_service.is_configured():
                try:
                    storage_key = task_data["s3_key"]
                    if not s3_service.object_exists(storage_key):
                        local_path = os.path.join(OUTPUT_FOLDER, task_data.get("model_file", f"{task_id}_model.glb"))
                        if os.path.exists(local_path):
                            return jsonify({
                                "success": True,
                                "storage_provider": "local",
                                "url": f"/api/download/{os.path.basename(local_path)}",
                                "filename": os.path.basename(local_path),
                            }), 200
                        return jsonify({
                            "error": "Model artifact not found in storage",
                            "message": f"The 3D model object '{storage_key}' does not exist in S3 storage.",
                            "code": "OBJECT_NOT_FOUND",
                        }), 404

                    presigned_url = s3_service.generate_presigned_url(storage_key, expiry_seconds=900)
                    return jsonify({
                        "success": True,
                        "storage_provider": "s3",
                        "url": presigned_url,
                        "expires_in": 900,
                        "filename": task_data.get("model_file", f"{task_id}_model.glb"),
                    }), 200
                except Exception as e:
                    print(f"[MODEL_URL] Error generating presigned URL from task s3_key: {e}")

            model_filename = task_data.get("model_file") or f"{task_id}_model.glb"
            local_path = os.path.join(OUTPUT_FOLDER, model_filename)
            if os.path.exists(local_path):
                return jsonify({
                    "success": True,
                    "storage_provider": "local",
                    "url": f"/api/download/{model_filename}",
                    "filename": model_filename,
                }), 200

        # Ephemeral restart fallback for existing local files
        fallback_local = os.path.join(OUTPUT_FOLDER, f"{task_id}_model.glb")
        if os.path.exists(fallback_local):
            return jsonify({
                "success": True,
                "storage_provider": "local",
                "url": f"/api/download/{task_id}_model.glb",
                "filename": f"{task_id}_model.glb",
            }), 200

        return jsonify({"error": "Model not found"}), 404

    @staticmethod
    def store_rendered_image():
        """
        Stores newly generated 2D preview/render images in ImageKit and records metadata in MongoDB.
        Accepts JSON { "image": "data:image/...", "project_id": "...", "name": "..." } or form data.
        """
        user = get_authenticated_user(request)
        if user is None:
            return jsonify({"error": "Unauthorized", "message": "Valid authentication token required or invalid token provided"}), 401

        owner_id = user["user_id"]

        data = request.get_json(silent=True) or request.form
        image_data = data.get("image") or (request.files.get("file") if "file" in request.files else None)
        if not image_data:
            return jsonify({"error": "Missing image data"}), 400

        project_id = str(data.get("project_id") or uuid.uuid4())
        name = secure_filename(data.get("name") or f"render_{project_id[:8]}.png")
        if not name or "." not in name:
            name = f"render_{project_id[:8]}.png"

        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            return jsonify({"error": f"Invalid file format '{ext}'. Supported: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}"}), 400

        if not imagekit_service.is_configured():
            return jsonify({"error": "ImageKit is not configured on this server"}), 503

        if mongo_manager.is_configured():
            try:
                existing_owner = project_repository.get_project_owner(project_id)
                if existing_owner is not None and existing_owner != owner_id:
                    return jsonify({"error": "Forbidden", "message": "Project is owned by another user"}), 403
            except Exception as owner_err:
                print(f"[STORE_IMAGE] Error verifying project owner: {owner_err}")
                return jsonify({"error": "Database error checking project ownership"}), 500

        try:
            upload_res = imagekit_service.upload_generated_image(
                file_data=image_data,
                file_name=name,
                project_id=project_id,
                owner_id=owner_id,
            )
        except ImageKitServiceError as ik_err:
            return jsonify({"error": str(ik_err)}), 422
        except Exception as e:
            return jsonify({"error": f"Failed to store rendered image: {e.__class__.__name__}"}), 502

        asset_record = None
        try:
            asset_record = project_repository.record_asset(
                {
                    "asset_id": upload_res["file_id"],
                    "project_id": project_id,
                    "asset_type": "generated_image",
                    "storage_provider": "imagekit",
                    "storage_key": upload_res["file_id"],
                    "url": upload_res["url"],
                    "filename": name,
                    "file_size": upload_res.get("size", 0),
                },
                owner_id=owner_id,
            )
            existing_proj = project_repository.get_project(project_id, owner_id=owner_id)
            if existing_proj:
                project_repository.update_project(
                    project_id=project_id,
                    updates={
                        "generated_image_ref": upload_res,
                        "status": "completed",
                    },
                    owner_id=owner_id,
                )
            else:
                project_repository.create_project(
                    {
                        "project_id": project_id,
                        "name": name.rsplit(".", 1)[0],
                        "type": "render",
                        "status": "completed",
                        "generated_image_ref": upload_res,
                    },
                    owner_id=owner_id,
                )
        except Exception as db_err:
            print(f"[MONGO] Failed to record asset in MongoDB: {db_err}")
            mongo_rolled_back = True
            if asset_record and asset_record.get("asset_id"):
                try:
                    mongo_rolled_back = project_repository.delete_asset(asset_record["asset_id"], owner_id=owner_id)
                except Exception as del_err:
                    print(f"[ROLLBACK] Failed to delete MongoDB asset record: {del_err}")
                    mongo_rolled_back = False

            # Attempt ImageKit cleanup after the MongoDB rollback
            ik_rolled_back = False
            if upload_res and upload_res.get("file_id"):
                try:
                    ik_rolled_back = imagekit_service.delete_file(upload_res["file_id"])
                except Exception as ik_del_err:
                    print(f"[ROLLBACK] Failed to delete ImageKit file: {ik_del_err}")

            return jsonify({
                "error": "Failed to persist asset metadata in database",
                "cleanup_status": {
                    "imagekit_cleaned": bool(ik_rolled_back),
                    "database_cleaned": bool(mongo_rolled_back),
                }
            }), 500

        return jsonify({
            "success": True,
            "url": upload_res["url"],
            "file_id": upload_res["file_id"],
            "thumbnail_url": upload_res.get("thumbnail_url"),
            "asset": asset_record,
        }), 200

    @staticmethod
    def get_imagekit_auth():
        """Returns secure ImageKit authorization parameters without exposing private key."""
        user = get_authenticated_user(request)
        if user is None:
            return jsonify({"error": "Unauthorized", "message": "Valid authentication token required or invalid token provided"}), 401

        if not imagekit_service.is_configured():
            return jsonify({"error": "ImageKit is not configured on this server"}), 503

        try:
            auth_params = imagekit_service.get_auth_parameters()
            return jsonify(auth_params), 200
        except ImageKitServiceError as e:
            return jsonify({"error": str(e)}), 503
        except Exception as e:
            return jsonify({"error": "Failed to generate authorization signature"}), 500

    @staticmethod
    def save_project(task_id: str):
        """
        Saves CAD project customization and/or edited 3D model geometry.
        Enforces server-side authentication and owner-scoping.
        If an edited GLB file is uploaded:
            - Uploads to S3 under an owner-scoped key without overwriting original.
            - Updates MongoDB asset records and project model_ref only after upload succeeds.
        If customization metadata is provided:
            - Updates project customization in MongoDB and task repository.
        """
        user = get_authenticated_user(request)
        if user is None:
            return jsonify({"error": "Unauthorized", "message": "Valid authentication token required or invalid token provided"}), 401

        owner_id = user["user_id"]

        if mongo_manager.is_configured():
            try:
                project_owner = project_repository.get_project_owner(task_id)
            except Exception as e:
                print(f"[SAVE] Error checking project ownership: {e}")
                return jsonify({"error": f"Database error verifying project: {str(e)}"}), 500

            if project_owner is None:
                if is_production_environment():
                    return jsonify({"error": "Project not found"}), 404
                if not task_repository.exists(task_id):
                    return jsonify({"error": "Project not found"}), 404
            elif project_owner != owner_id:
                return jsonify({"error": "Forbidden", "message": "You do not have permission to modify this project"}), 403
        else:
            task_data = task_repository.get(task_id)
            if not task_data:
                return jsonify({"error": "Project not found"}), 404
            task_owner = task_data.get("owner_id")
            if task_owner and task_owner != owner_id:
                return jsonify({"error": "Forbidden", "message": "You do not have permission to modify this project"}), 403

        # Parse request body (JSON or multipart form-data)
        customization = None
        if request.is_json:
            json_data = request.get_json(silent=True) or {}
            customization = json_data.get("customization")
        else:
            if "customization" in request.form:
                try:
                    customization = json.loads(request.form["customization"])
                except Exception:
                    customization = request.form["customization"]

        # Check if an edited GLB file was uploaded
        edited_file = request.files.get("file") or request.files.get("model_file")
        s3_res = None
        if edited_file and edited_file.filename:
            file_bytes = edited_file.read()
            if not file_bytes:
                return jsonify({"error": "Uploaded model file is empty"}), 400

            if s3_service.is_configured():
                try:
                    # Upload new artifact under an owner-scoped key, preserving original model
                    timestamp = int(time.time())
                    model_id = f"{task_id}_edited_{timestamp}"
                    s3_res = s3_service.upload_model(
                        file_path_or_bytes=file_bytes,
                        owner_id=owner_id,
                        project_id=task_id,
                        model_id=model_id,
                    )
                    # Verify object exists in S3 before updating MongoDB
                    if not s3_service.object_exists(s3_res["key"]):
                        raise S3ServiceError("Failed to verify uploaded S3 object existence.")
                except Exception as s3_err:
                    print(f"[SAVE] Failed to upload edited model to S3: {s3_err}")
                    return jsonify({"error": "Failed to upload edited model to S3 storage", "details": str(s3_err)}), 500
            else:
                # Local storage fallback
                edited_filename = f"{task_id}_edited.glb"
                local_path = os.path.join(OUTPUT_FOLDER, edited_filename)
                with open(local_path, "wb") as f:
                    f.write(file_bytes)
                s3_res = {"storage_provider": "local", "model_file": edited_filename}

        # Prepare updates for MongoDB and task repository
        updates = {}
        if customization is not None:
            updates["customization"] = customization

        if s3_res:
            if s3_res.get("storage_provider") == "s3":
                updates["model_ref"] = s3_res
                # Record asset in MongoDB
                if mongo_manager.is_configured():
                    try:
                        project_repository.record_asset(
                            {
                                "asset_id": f"s3_model_edited_{task_id}_{int(time.time())}",
                                "project_id": task_id,
                                "asset_type": "3d_model",
                                "storage_provider": "s3",
                                "storage_key": s3_res["key"],
                                "bucket": s3_res["bucket"],
                                "filename": f"{task_id}_edited.glb",
                                "file_size": s3_res.get("size", 0),
                                "format": "glb",
                            },
                            owner_id=owner_id,
                        )
                    except Exception as asset_err:
                        print(f"[SAVE] Notice recording edited asset in MongoDB: {asset_err}")
            else:
                updates["model_file"] = s3_res.get("model_file")

        if mongo_manager.is_configured():
            try:
                if updates:
                    project_repository.update_project(task_id, updates, owner_id=owner_id)
            except Exception as db_err:
                print(f"[SAVE] Failed to update project in MongoDB: {db_err}")
                return jsonify({"error": "Database error saving project"}), 500

        # Update task repository in memory/disk
        task_repository.update(task_id, updates)

        response_payload = {
            "success": True,
            "message": "Project saved successfully",
            "task_id": task_id,
        }
        if s3_res and s3_res.get("storage_provider") == "s3":
            response_payload["s3_key"] = s3_res["key"]
            response_payload["model_url"] = s3_service.generate_presigned_url(s3_res["key"])

        return jsonify(response_payload), 200

    @staticmethod
    def delete_project(task_id: str):
        """Deletes task metadata, ImageKit assets, and exclusively owned local files."""
        user = get_authenticated_user(request)
        if user is None:
            return jsonify({"error": "Unauthorized", "message": "Valid authentication token required or invalid token provided"}), 401

        owner_id = user["user_id"]

        if mongo_manager.is_configured():
            try:
                project_owner = project_repository.get_project_owner(task_id)
            except Exception as e:
                print(f"[DELETE] Error checking project ownership: {e}")
                return jsonify({"error": f"Database error verifying project: {str(e)}"}), 500

            if project_owner is None:
                return jsonify({"error": "Project not found"}), 404

            if project_owner != owner_id:
                return jsonify({"error": "Forbidden", "message": "You do not have permission to delete this project"}), 403

            # Clean up ImageKit and S3 assets and MongoDB records.
            try:
                assets = project_repository.get_assets_by_project(task_id, owner_id=owner_id)
                storage_errors = []
                for asset in assets:
                    storage_provider = asset.get("storage_provider")
                    storage_key = asset.get("storage_key")
                    if not storage_key:
                        continue
                    if not project_repository.is_asset_referenced_elsewhere(storage_key, exclude_project_id=task_id):
                        if storage_provider == "imagekit":
                            try:
                                ik_res = imagekit_service.delete_file(storage_key)
                                if not ik_res:
                                    storage_errors.append(f"ImageKit failed to delete {storage_key}")
                            except Exception as ik_err:
                                print(f"[CLEANUP] Failed to delete ImageKit asset {storage_key}: {ik_err}")
                                storage_errors.append(f"ImageKit delete error: {str(ik_err)}")
                        elif storage_provider == "s3":
                            try:
                                s3_res = s3_service.delete_object(storage_key)
                                if not s3_res:
                                    storage_errors.append(f"S3 failed to delete {storage_key}")
                            except Exception as s3_err:
                                print(f"[CLEANUP] Failed to delete S3 asset {storage_key}: {s3_err}")
                                storage_errors.append(f"S3 delete error: {str(s3_err)}")
                    else:
                        print(f"[CLEANUP] File {storage_key} referenced by another project; preserving")
                deleted = project_repository.delete_project(task_id, owner_id=owner_id)
                if not deleted:
                    return jsonify({"error": "Project not found"}), 404
            except Exception as db_err:
                print(f"[CLEANUP] Database error during storage/Mongo project cleanup: {db_err}")
                return jsonify({"error": f"Database error during deletion: {str(db_err)}"}), 500

            # Only after MongoDB deletion succeeds, clean up local disk files
            try:
                task_repository.delete(task_id)
            except Exception as fs_err:
                print(f"[CLEANUP] Notice during local file deletion: {fs_err}")

            if storage_errors:
                return jsonify({
                    "success": False,
                    "partial": True,
                    "message": f"Project {task_id} metadata removed, but cloud storage cleanup encountered errors",
                    "storage_errors": storage_errors,
                }), 207

            return jsonify({"success": True, "message": f"Project {task_id} deleted"}), 200

        # MongoDB is unconfigured
        if is_production_environment():
            return jsonify({"error": "Database is unconfigured in production environment"}), 503

        # Local development fallback
        if not task_repository.exists(task_id):
            return jsonify({"error": "Project not found"}), 404

        task_repository.delete(task_id)
        return jsonify({"success": True, "message": f"Project {task_id} deleted"}), 200

    @staticmethod
    def health_check():
        db_status = mongo_manager.get_health_status()
        mongo_state = (
            "connected"
            if db_status["connected"]
            else ("disconnected" if db_status["configured"] else "unconfigured")
        )
        ik_status = imagekit_service.get_health_status()
        s3_status = s3_service.get_health_status()
        return jsonify(
            {
                "status": "healthy",
                "blender_path": resolve_blender_path(),
                "service": "PlanVista3D Model Generation",
                "database": {
                    "mongodb": mongo_state,
                },
                "storage": {
                    "imagekit": "configured" if ik_status["configured"] else "unconfigured",
                    "s3": "configured" if s3_status["configured"] else "unconfigured",
                },
            }
        )

    @staticmethod
    def create_model_share(task_id: str):
        """
        Creates or retrieves an active share token for a 3D model project.
        Enforces user authentication and strict ownership verification.
        """
        user = get_authenticated_user(request)
        if user is None:
            return jsonify({
                "error": "Unauthorized",
                "code": "AUTH_REQUIRED",
                "message": "Valid authentication token required",
            }), 401

        owner_id = user["user_id"]

        # 1. If task_id is already an active share token, return it if caller is the owner
        existing_share = share_repository.get_share(task_id)
        if existing_share and existing_share.get("is_active"):
            if existing_share.get("owner_id") == owner_id:
                return jsonify({
                    "success": True,
                    "share_token": existing_share["share_token"],
                    "is_active": existing_share["is_active"],
                    "created_at": existing_share["created_at"],
                    "expires_at": existing_share.get("expires_at"),
                }), 200
            else:
                return jsonify({
                    "error": "Forbidden",
                    "code": "FORBIDDEN",
                    "message": "You do not have permission to share this model",
                }), 403

        # 2. Verify project ownership in MongoDB or task_repository
        if mongo_manager.is_configured():
            try:
                project_owner = project_repository.get_project_owner(task_id)
            except Exception as e:
                print(f"[SHARE_CREATE] Error verifying project owner: {e}")
                return jsonify({
                    "error": f"Database error verifying project: {str(e)}",
                    "code": "DB_ERROR",
                }), 500

            if project_owner is None:
                task_data = task_repository.get(task_id)
                if task_data:
                    task_owner = task_data.get("owner_id")
                    if task_owner and task_owner != owner_id:
                        return jsonify({
                            "error": "Forbidden",
                            "code": "FORBIDDEN",
                            "message": "You do not have permission to share this model",
                        }), 403
                elif not os.path.exists(os.path.join(OUTPUT_FOLDER, f"{task_id}_model.glb")):
                    return jsonify({
                        "error": "Project not found",
                        "code": "PROJECT_NOT_FOUND",
                    }), 404
            elif project_owner != owner_id:
                return jsonify({
                    "error": "Forbidden",
                    "code": "FORBIDDEN",
                    "message": "You do not have permission to share this model",
                }), 403
        else:
            task_data = task_repository.get(task_id)
            if task_data:
                task_owner = task_data.get("owner_id")
                if task_owner and task_owner != owner_id:
                    return jsonify({
                        "error": "Forbidden",
                        "code": "FORBIDDEN",
                        "message": "You do not have permission to share this model",
                    }), 403
            elif not os.path.exists(os.path.join(OUTPUT_FOLDER, f"{task_id}_model.glb")):
                return jsonify({
                    "error": "Project not found",
                    "code": "PROJECT_NOT_FOUND",
                }), 404

        share_record = share_repository.create_or_get_share(task_id, owner_id)
        return jsonify({
            "success": True,
            "share_token": share_record["share_token"],
            "is_active": share_record["is_active"],
            "created_at": share_record["created_at"],
            "expires_at": share_record.get("expires_at"),
        }), 200

    @staticmethod
    def revoke_model_share(task_id: str):
        """
        Revokes (deactivates) all public share links for a given 3D model project.
        Enforces user authentication and ownership.
        """
        user = get_authenticated_user(request)
        if user is None:
            return jsonify({
                "error": "Unauthorized",
                "code": "AUTH_REQUIRED",
                "message": "Valid authentication token required",
            }), 401

        owner_id = user["user_id"]

        # Support revocation by share_token or project_id
        target_project_id = task_id
        existing_share = share_repository.get_share(task_id)
        if existing_share:
            target_project_id = existing_share["project_id"]
            if existing_share.get("owner_id") and existing_share["owner_id"] != owner_id:
                return jsonify({
                    "error": "Forbidden",
                    "code": "FORBIDDEN",
                    "message": "You do not have permission to revoke this share link",
                }), 403

        if mongo_manager.is_configured():
            try:
                project_owner = project_repository.get_project_owner(target_project_id)
                if project_owner is not None and project_owner != owner_id:
                    return jsonify({
                        "error": "Forbidden",
                        "code": "FORBIDDEN",
                        "message": "You do not have permission to revoke this share link",
                    }), 403
            except Exception as e:
                print(f"[SHARE_REVOKE] Error verifying project owner: {e}")
                return jsonify({"error": "Database error verifying project", "code": "DB_ERROR"}), 500

        task_data = task_repository.get(target_project_id)
        if task_data and task_data.get("owner_id") and task_data["owner_id"] != owner_id:
            return jsonify({
                "error": "Forbidden",
                "code": "FORBIDDEN",
                "message": "You do not have permission to revoke this share link",
            }), 403

        revoked = share_repository.revoke_share(target_project_id, owner_id)
        return jsonify({
            "success": True,
            "message": "AR share link revoked successfully",
            "revoked": revoked,
        }), 200

    @staticmethod
    def get_model_share_status(task_id: str):
        """
        Checks if an active public AR share link exists for a 3D model project.
        Enforces user authentication and ownership.
        """
        user = get_authenticated_user(request)
        if user is None:
            return jsonify({
                "error": "Unauthorized",
                "code": "AUTH_REQUIRED",
                "message": "Valid authentication token required",
            }), 401

        owner_id = user["user_id"]
        share = share_repository.get_share_by_project(task_id, owner_id)
        if not share:
            s = share_repository.get_share(task_id)
            if s and s.get("owner_id") == owner_id:
                share = s

        return jsonify({
            "success": True,
            "is_shared": bool(share and share.get("is_active")),
            "share_token": share["share_token"] if share and share.get("is_active") else None,
            "expires_at": share.get("expires_at") if share else None,
        }), 200

    @staticmethod
    def get_shared_model(share_token: str):
        """
        Public endpoint for loading a 3D model via an AR share token.
        Resolves the stable share token to a short-lived presigned URL or streaming path.
        Does NOT reveal user identities, private storage paths, or other projects.
        """
        share = share_repository.get_share(share_token)
        if not share:
            share = share_repository.get_share_by_project(share_token)

        if not share:
            return jsonify({
                "error": "AR share link not found or invalid",
                "code": "SHARE_NOT_FOUND",
            }), 404

        if not share.get("is_active"):
            return jsonify({
                "error": "This AR share link has expired or was revoked by the model owner",
                "code": "SHARE_REVOKED_OR_EXPIRED",
            }), 404

        task_id = share["project_id"]
        owner_id = share["owner_id"]
        actual_share_token = share["share_token"]
        proj_name = "PlanVista 3D CAD Model"

        # Construct absolute URLs for local streaming & USDZ
        base_url = request.host_url.rstrip("/") if request.host_url else ""
        local_download_url = f"{base_url}/api/share/model/{actual_share_token}/download" if base_url else f"/api/share/model/{actual_share_token}/download"
        usdz_download_url = f"{base_url}/api/share/model/{actual_share_token}/usdz" if base_url else f"/api/share/model/{actual_share_token}/usdz"

        # Check MongoDB project metadata
        if mongo_manager.is_configured():
            try:
                proj = project_repository.get_project(task_id, owner_id=owner_id)
                if not proj:
                    proj = project_repository.get_project_unscoped(task_id)

                if isinstance(proj, dict) and proj.get("name"):
                    proj_name = str(proj.get("name"))

                if proj:
                    # 1. Check model_ref
                    if proj.get("model_ref"):
                        mref = proj["model_ref"]
                        if mref.get("storage_provider") == "s3" and s3_service.is_configured():
                            skey = mref.get("key")
                            if skey and s3_service.object_exists(skey):
                                presigned_url = s3_service.generate_presigned_url(skey, expiry_seconds=900)
                                return jsonify({
                                    "success": True,
                                    "project_name": proj_name,
                                    "share_token": actual_share_token,
                                    "model_url": presigned_url,
                                    "usdz_url": usdz_download_url,
                                    "storage_provider": "s3",
                                    "expires_in": 900,
                                    "is_ar_compatible": True,
                                }), 200

                    # 2. Check 3d_model assets
                    assets = project_repository.get_assets_by_project(task_id, owner_id=owner_id)
                    model_assets = [a for a in assets if a.get("asset_type") == "3d_model" and a.get("storage_key")]
                    if model_assets:
                        latest = model_assets[-1]
                        if latest.get("storage_provider") == "s3" and s3_service.is_configured():
                            skey = latest["storage_key"]
                            if s3_service.object_exists(skey):
                                presigned_url = s3_service.generate_presigned_url(skey, expiry_seconds=900)
                                return jsonify({
                                    "success": True,
                                    "project_name": proj_name,
                                    "share_token": actual_share_token,
                                    "model_url": presigned_url,
                                    "usdz_url": usdz_download_url,
                                    "storage_provider": "s3",
                                    "expires_in": 900,
                                    "is_ar_compatible": True,
                                }), 200
            except Exception as e:
                print(f"[SHARED_MODEL] Notice querying Mongo: {e}")

        # Check task_repository / local storage
        task_data = task_repository.get(task_id)
        if task_data:
            if task_data.get("s3_key") and s3_service.is_configured():
                try:
                    skey = task_data["s3_key"]
                    if s3_service.object_exists(skey):
                        presigned_url = s3_service.generate_presigned_url(skey, expiry_seconds=900)
                        return jsonify({
                            "success": True,
                            "project_name": proj_name,
                            "share_token": actual_share_token,
                            "model_url": presigned_url,
                            "usdz_url": usdz_download_url,
                            "storage_provider": "s3",
                            "expires_in": 900,
                            "is_ar_compatible": True,
                        }), 200
                except Exception as e:
                    print(f"[SHARED_MODEL] S3 presign error: {e}")

            model_filename = task_data.get("model_file") or f"{task_id}_model.glb"
            local_path = os.path.join(OUTPUT_FOLDER, model_filename)
            if os.path.exists(local_path):
                return jsonify({
                    "success": True,
                    "project_name": proj_name,
                    "share_token": actual_share_token,
                    "model_url": local_download_url,
                    "usdz_url": usdz_download_url,
                    "storage_provider": "local",
                    "expires_in": 900,
                    "is_ar_compatible": True,
                }), 200

        # Ephemeral restart fallback for existing local files
        fallback_local = os.path.join(OUTPUT_FOLDER, f"{task_id}_model.glb")
        if os.path.exists(fallback_local):
            return jsonify({
                "success": True,
                "project_name": proj_name,
                "share_token": actual_share_token,
                "model_url": local_download_url,
                "usdz_url": usdz_download_url,
                "storage_provider": "local",
                "expires_in": 900,
                "is_ar_compatible": True,
            }), 200

        return jsonify({
            "error": "3D model asset could not be located on storage",
            "code": "MODEL_FILE_NOT_FOUND",
        }), 404

    @staticmethod
    def download_shared_model(share_token: str):
        """
        Public streaming endpoint for a shared 3D model.
        Directs to S3 presigned URL or streams local GLB.
        Attaches permissive CORS headers for Scene Viewer and WebXR requests.
        """
        share = share_repository.get_share(share_token)
        if not share or not share.get("is_active"):
            return jsonify({
                "error": "AR share link invalid, expired, or revoked",
                "code": "SHARE_REVOKED_OR_EXPIRED",
            }), 404

        task_id = share["project_id"]
        owner_id = share["owner_id"]

        # Check local file first
        safe_filename = f"{task_id}_model.glb"
        local_path = os.path.join(OUTPUT_FOLDER, safe_filename)
        if os.path.exists(local_path):
            resp = send_from_directory(
                OUTPUT_FOLDER, safe_filename, as_attachment=False, mimetype="model/gltf-binary"
            )
            resp.headers["Access-Control-Allow-Origin"] = "*"
            resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
            return resp

        # Check S3 asset
        if s3_service.is_configured():
            skey = None
            if mongo_manager.is_configured():
                try:
                    proj = project_repository.get_project(task_id, owner_id=owner_id)
                    if not proj:
                        proj = project_repository.get_project_unscoped(task_id)
                    if proj and proj.get("model_ref"):
                        skey = proj["model_ref"].get("key")
                except Exception:
                    pass

            if not skey:
                task_data = task_repository.get(task_id)
                if task_data and task_data.get("s3_key"):
                    skey = task_data.get("s3_key")

            if skey and s3_service.object_exists(skey):
                presigned = s3_service.generate_presigned_url(skey, expiry_seconds=900)
                return redirect(presigned, code=302)

        return jsonify({
            "error": "3D model file not found",
            "code": "MODEL_FILE_NOT_FOUND",
        }), 404

    @staticmethod
    def download_shared_usdz(share_token: str):
        """
        Public streaming endpoint for iOS AR Quick Look (.usdz).
        Directs to USDZ file if available, or dynamically converts GLB to USDZ using Blender.
        """
        share = share_repository.get_share(share_token)
        if not share or not share.get("is_active"):
            return jsonify({
                "error": "AR share link invalid, expired, or revoked",
                "code": "SHARE_REVOKED_OR_EXPIRED",
            }), 404

        task_id = share["project_id"]
        owner_id = share["owner_id"]

        usdz_filename = f"{task_id}_model.usdz"
        usdz_path = os.path.join(OUTPUT_FOLDER, usdz_filename)

        if os.path.exists(usdz_path):
            resp = send_from_directory(
                OUTPUT_FOLDER, usdz_filename, as_attachment=False, mimetype="model/vnd.usdz+zip"
            )
            resp.headers["Access-Control-Allow-Origin"] = "*"
            resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
            return resp

        # Check if we have the GLB to convert
        glb_filename = f"{task_id}_model.glb"
        glb_path = os.path.join(OUTPUT_FOLDER, glb_filename)

        if not os.path.exists(glb_path) and s3_service.is_configured():
            try:
                skey = None
                if mongo_manager.is_configured():
                    proj = project_repository.get_project(task_id, owner_id=owner_id)
                    if not proj:
                        proj = project_repository.get_project_unscoped(task_id)
                    if proj and proj.get("model_ref"):
                        skey = proj["model_ref"].get("key")
                if not skey:
                    td = task_repository.get(task_id)
                    if td and td.get("s3_key"):
                        skey = td["s3_key"]
                if skey and s3_service.object_exists(skey):
                    s3_service.download_model(skey, glb_path)
            except Exception as e:
                print(f"[USDZ] Failed to download GLB from S3 for USDZ conversion: {e}")

        if not os.path.exists(glb_path):
            return jsonify({
                "error": "Source 3D model not found for USDZ generation",
                "code": "MODEL_FILE_NOT_FOUND",
            }), 404

        # Convert GLB to USDZ via headless Blender
        try:
            import subprocess
            py_code = (
                "import bpy; "
                "bpy.ops.object.select_all(action='SELECT'); "
                "bpy.ops.object.delete(use_global=False); "
                f"bpy.ops.import_scene.gltf(filepath=r'{glb_path}'); "
                f"bpy.ops.wm.usd_export(filepath=r'{usdz_path}')"
            )
            blender_bin = os.environ.get("BLENDER_PATH") or "blender"
            cmd = [blender_bin, "-b", "--python-expr", py_code]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if res.returncode == 0 and os.path.exists(usdz_path):
                resp = send_from_directory(
                    OUTPUT_FOLDER, usdz_filename, as_attachment=False, mimetype="model/vnd.usdz+zip"
                )
                resp.headers["Access-Control-Allow-Origin"] = "*"
                resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
                return resp
            else:
                print(f"[USDZ] Blender USDZ export exited with code {res.returncode}: {res.stderr}")
                return jsonify({
                    "error": "USDZ conversion failed",
                    "code": "USDZ_CONVERSION_FAILED",
                }), 500
        except Exception as conv_err:
            print(f"[USDZ] Error invoking Blender for USDZ: {conv_err}")
            return jsonify({
                "error": "USDZ generation unavailable",
                "code": "USDZ_UNAVAILABLE",
            }), 500

