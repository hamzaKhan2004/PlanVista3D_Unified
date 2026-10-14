import time
import os
import uuid
from flask import request, jsonify, send_from_directory
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
                return jsonify({"error": f"ImageKit blueprint upload failed: {str(ik_err)}"}), 502
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

            asset_record = None
            try:
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
        task_data = task_repository.get(task_id)
        if not task_data:
            return jsonify({"status": "error", "progress": 0, "error": "Task not found"}), 200
        return jsonify(task_data)

    @staticmethod
    def download_model(filename: str):
        try:
            return send_from_directory(
                OUTPUT_FOLDER, filename, as_attachment=False
            )
        except FileNotFoundError:
            return jsonify({"error": "File not found"}), 404

    @staticmethod
    def download_source(task_id: str):
        """Streams the original uploaded blueprint file (DXF or Image) without exposing server paths."""
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

            # Check if project has an S3 3D model asset in MongoDB
            try:
                assets = project_repository.get_assets_by_project(task_id, owner_id=owner_id)
                for asset in assets:
                    if (
                        asset.get("asset_type") == "3d_model"
                        and asset.get("storage_provider") == "s3"
                        and asset.get("storage_key")
                    ):
                        if s3_service.is_configured():
                            storage_key = asset["storage_key"]
                            presigned_url = s3_service.generate_presigned_url(storage_key, expiry_seconds=900)
                            return jsonify({
                                "success": True,
                                "storage_provider": "s3",
                                "url": presigned_url,
                                "expires_in": 900,
                                "filename": asset.get("filename", f"{task_id}_model.glb"),
                            }), 200
            except Exception as e:
                print(f"[MODEL_URL] Notice checking MongoDB assets: {e}")

        # Local model fallback (when MongoDB is unconfigured or S3 asset not recorded)
        task_data = task_repository.get(task_id)
        if task_data:
            if task_data.get("s3_key") and s3_service.is_configured():
                try:
                    presigned_url = s3_service.generate_presigned_url(task_data["s3_key"], expiry_seconds=900)
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
                for asset in assets:
                    storage_provider = asset.get("storage_provider")
                    storage_key = asset.get("storage_key")
                    if not storage_key:
                        continue
                    if not project_repository.is_asset_referenced_elsewhere(storage_key, exclude_project_id=task_id):
                        if storage_provider == "imagekit":
                            try:
                                imagekit_service.delete_file(storage_key)
                            except Exception as ik_err:
                                print(f"[CLEANUP] Failed to delete ImageKit asset {storage_key}: {ik_err}")
                        elif storage_provider == "s3":
                            try:
                                s3_service.delete_object(storage_key)
                            except Exception as s3_err:
                                print(f"[CLEANUP] Failed to delete S3 asset {storage_key}: {s3_err}")
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
