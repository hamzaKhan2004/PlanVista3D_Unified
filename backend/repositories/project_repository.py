import time
import uuid
import logging
from typing import Optional, Dict, Any, List
from pymongo.collection import Collection
from pymongo.errors import PyMongoError

from backend.db.mongo import mongo_manager, MongoManager

logger = logging.getLogger("planvista3d.repository")


class DatabaseUnavailableError(Exception):
    """Raised when an operation requires MongoDB but the database is not connected."""
    pass


def _clean_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Strips MongoDB ObjectId or converts it to string for clean JSON serialization."""
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


class ProjectRepository:
    """
    Repository for persisting project metadata, asset references,
    and generation jobs in MongoDB Atlas with strict ownership isolation.
    """

    def __init__(self, manager: Optional[MongoManager] = None):
        self._manager = manager or mongo_manager

    @property
    def db(self):
        return self._manager.get_db()

    def _get_collection(self, name: str) -> Optional[Collection]:
        db = self.db
        if db is None:
            return None
        return db[name]

    # -------------------------------------------------------------------------
    # PROJECTS COLLECTION
    # -------------------------------------------------------------------------

    def create_project(self, project_data: Dict[str, Any], owner_id: str) -> Dict[str, Any]:
        """
        Creates a new project record bound to the authenticated owner_id.
        """
        collection = self._get_collection("projects")
        if collection is None:
            raise DatabaseUnavailableError("MongoDB is not configured or unavailable")

        if not owner_id:
            raise ValueError("owner_id is required to create a project")

        now = int(time.time() * 1000)
        project_id = project_data.get("project_id") or project_data.get("id") or str(uuid.uuid4())

        record = {
            "project_id": str(project_id),
            "owner_id": str(owner_id),
            "name": project_data.get("name", f"Project {str(project_id)[:8]}"),
            "type": project_data.get("type", "model"),  # "model", "image", "dxf"
            "status": project_data.get("status", "queued"),  # "queued", "processing", "completed", "error"
            "pipeline": project_data.get("pipeline", "standard"),
            "source_filename": project_data.get("source_filename"),
            "blueprint_ref": project_data.get("blueprint_ref"),  # Future ImageKit/local blueprint reference
            "generated_image_ref": project_data.get("generated_image_ref"),  # Future ImageKit 2D render reference
            "model_ref": project_data.get("model_ref"),  # Future S3 GLB object reference
            "parameters": project_data.get("parameters", {}),
            "analysis": project_data.get("analysis", {}),
            "customization": project_data.get("customization", {}),
            "created_at": project_data.get("created_at", now),
            "updated_at": now,
        }

        try:
            collection.replace_one(
                {"project_id": str(project_id), "owner_id": str(owner_id)},
                record,
                upsert=True,
            )
            return record
        except PyMongoError as e:
            logger.error(f"Failed to create project {project_id}: {e.__class__.__name__}: {str(e)}")
            raise

    def get_project(self, project_id: str, owner_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves a project by its project_id strictly scoped to the owner_id.
        Rejects missing or empty owner_id with ValueError.
        """
        collection = self._get_collection("projects")
        if collection is None:
            return None

        if not owner_id or not str(owner_id).strip():
            raise ValueError("Valid, non-empty owner_id is required to retrieve project")

        query: Dict[str, Any] = {
            "project_id": str(project_id),
            "owner_id": str(owner_id).strip(),
        }

        try:
            doc = collection.find_one(query)
            return _clean_doc(doc)
        except PyMongoError as e:
            logger.error(f"Failed to query project {project_id}: {e.__class__.__name__}")
            return None

    def get_project_owner(self, project_id: str) -> Optional[str]:
        """
        Retrieves the owner_id of a project if it exists in the database.
        Returns None if the project does not exist or MongoDB is unavailable.
        """
        collection = self._get_collection("projects")
        if collection is None or not project_id:
            return None

        try:
            doc = collection.find_one({"project_id": str(project_id)}, {"owner_id": 1})
            return str(doc["owner_id"]) if doc and "owner_id" in doc else None
        except PyMongoError as e:
            logger.error(f"Failed to query project owner for {project_id}: {e.__class__.__name__}")
            raise DatabaseUnavailableError(f"Database error during project owner lookup: {e}")

    def list_projects_by_owner(
        self,
        owner_id: str,
        project_type: Optional[str] = None,
        limit: int = 50,
        skip: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Lists projects strictly owned by owner_id, sorted by updated_at descending.
        Rejects missing or empty owner_id with ValueError.
        """
        collection = self._get_collection("projects")
        if collection is None:
            return []

        if not owner_id or not str(owner_id).strip():
            raise ValueError("Valid, non-empty owner_id is required to list projects")

        query: Dict[str, Any] = {"owner_id": str(owner_id).strip()}
        if project_type:
            query["type"] = project_type

        try:
            cursor = (
                collection.find(query)
                .sort("updated_at", -1)
                .skip(skip)
                .limit(limit)
            )
            return [_clean_doc(d) for d in cursor]
        except PyMongoError as e:
            logger.error(f"Failed to list projects for owner {owner_id}: {e.__class__.__name__}")
            return []

    def update_project(
        self, project_id: str, updates: Dict[str, Any], owner_id: str
    ) -> bool:
        """
        Updates an existing project record strictly scoped to owner_id.
        Rejects missing or empty owner_id with ValueError.
        """
        collection = self._get_collection("projects")
        if collection is None:
            raise DatabaseUnavailableError("MongoDB is unavailable")

        if not owner_id or not str(owner_id).strip():
            raise ValueError("Valid, non-empty owner_id is required to update project")

        query: Dict[str, Any] = {
            "project_id": str(project_id),
            "owner_id": str(owner_id).strip(),
        }

        doc_updates = dict(updates)
        doc_updates["updated_at"] = int(time.time() * 1000)
        # Prevent mutating immutable identifiers
        doc_updates.pop("project_id", None)
        doc_updates.pop("owner_id", None)

        try:
            result = collection.update_one(query, {"$set": doc_updates})
            return result.matched_count > 0
        except PyMongoError as e:
            logger.error(f"Failed to update project {project_id}: {e.__class__.__name__}")
            raise

    def delete_project(self, project_id: str, owner_id: str) -> bool:
        """
        Deletes project record and cascades deletion to associated assets and generation jobs.
        Rejects missing or empty owner_id with ValueError.
        """
        collection = self._get_collection("projects")
        if collection is None:
            raise DatabaseUnavailableError("MongoDB is unavailable")

        if not owner_id or not str(owner_id).strip():
            raise ValueError("Valid, non-empty owner_id is required to delete project")

        clean_owner_id = str(owner_id).strip()
        query: Dict[str, Any] = {
            "project_id": str(project_id),
            "owner_id": clean_owner_id,
        }

        try:
            result = collection.delete_one(query)
            if result.deleted_count > 0:
                # Clean up associated assets and jobs strictly scoped to owner
                self.delete_assets_by_project(project_id, clean_owner_id)
                self.delete_jobs_by_project(project_id, clean_owner_id)
                return True
            return False
        except PyMongoError as e:
            logger.error(f"Failed to delete project {project_id}: {e.__class__.__name__}")
            raise

    # -------------------------------------------------------------------------
    # ASSETS COLLECTION
    # -------------------------------------------------------------------------

    def record_asset(self, asset_data: Dict[str, Any], owner_id: str) -> Dict[str, Any]:
        """
        Stores metadata and storage provider references for a project asset.
        Does not store binary content; records ImageKit/S3/local references.
        """
        collection = self._get_collection("assets")
        if collection is None:
            raise DatabaseUnavailableError("MongoDB is unavailable")

        if not owner_id:
            raise ValueError("owner_id is required to record an asset")

        asset_id = asset_data.get("asset_id") or str(uuid.uuid4())
        record = {
            "asset_id": str(asset_id),
            "project_id": str(asset_data["project_id"]),
            "owner_id": str(owner_id),
            "asset_type": asset_data.get("asset_type", "blueprint"),  # "blueprint", "generated_image", "3d_model"
            "storage_provider": asset_data.get("storage_provider", "local"),  # "local", "imagekit", "s3"
            "storage_key": asset_data.get("storage_key"),  # ImageKit file_id or S3 object key or filename
            "url": asset_data.get("url"),  # Public or CDN URL if applicable
            "filename": asset_data.get("filename"),
            "content_type": asset_data.get("content_type"),
            "file_size": asset_data.get("file_size", 0),
            "created_at": asset_data.get("created_at", int(time.time() * 1000)),
        }

        try:
            collection.replace_one(
                {"asset_id": str(asset_id), "owner_id": str(owner_id)},
                record,
                upsert=True,
            )
            return record
        except PyMongoError as e:
            logger.error(f"Failed to record asset {asset_id}: {e.__class__.__name__}")
            raise

    def get_assets_by_project(
        self, project_id: str, owner_id: str
    ) -> List[Dict[str, Any]]:
        """
        Retrieves all assets associated with a given project strictly scoped to owner_id.
        Rejects missing or empty owner_id with ValueError.
        """
        collection = self._get_collection("assets")
        if collection is None:
            return []

        if not owner_id or not str(owner_id).strip():
            raise ValueError("Valid, non-empty owner_id is required to query project assets")

        query: Dict[str, Any] = {
            "project_id": str(project_id),
            "owner_id": str(owner_id).strip(),
        }

        try:
            cursor = collection.find(query).sort("created_at", 1)
            return [_clean_doc(d) for d in cursor]
        except PyMongoError as e:
            logger.error(f"Failed to query assets for project {project_id}: {e.__class__.__name__}")
            return []

    def delete_asset(self, asset_id: str, owner_id: str) -> bool:
        """
        Deletes a single asset by its asset_id strictly scoped to owner_id.
        Rejects missing or empty owner_id with ValueError.
        """
        collection = self._get_collection("assets")
        if collection is None:
            return False

        if not owner_id or not str(owner_id).strip():
            raise ValueError("Valid, non-empty owner_id is required to delete asset")

        query: Dict[str, Any] = {
            "asset_id": str(asset_id),
            "owner_id": str(owner_id).strip(),
        }

        try:
            res = collection.delete_one(query)
            return res.deleted_count > 0
        except PyMongoError as e:
            logger.error(f"Failed to delete asset {asset_id}: {e.__class__.__name__}")
            return False

    def delete_assets_by_project(self, project_id: str, owner_id: str) -> int:
        """
        Deletes all asset records associated with a project strictly scoped to owner_id.
        Rejects missing or empty owner_id with ValueError.
        """
        collection = self._get_collection("assets")
        if collection is None:
            return 0

        if not owner_id or not str(owner_id).strip():
            raise ValueError("Valid, non-empty owner_id is required to delete project assets")

        query: Dict[str, Any] = {
            "project_id": str(project_id),
            "owner_id": str(owner_id).strip(),
        }

        try:
            res = collection.delete_many(query)
            return res.deleted_count
        except PyMongoError as e:
            logger.error(f"Failed to delete assets for project {project_id}: {e.__class__.__name__}")
            return 0

    def is_asset_referenced_elsewhere(
        self, storage_key: str, exclude_project_id: str
    ) -> bool:
        """
        Checks if an asset's storage_key is referenced by any project other than exclude_project_id.
        Ensures shared assets are not deleted when one project is removed.
        """
        collection = self._get_collection("assets")
        if collection is None or not storage_key:
            return False

        try:
            count = collection.count_documents({
                "storage_key": str(storage_key),
                "project_id": {"$ne": str(exclude_project_id)},
            })
            return count > 0
        except PyMongoError as e:
            logger.error(f"Failed to check asset reference for {storage_key}: {e.__class__.__name__}")
            return False

    # -------------------------------------------------------------------------
    # GENERATION JOBS COLLECTION
    # -------------------------------------------------------------------------

    def create_generation_job(self, job_data: Dict[str, Any], owner_id: str) -> Dict[str, Any]:
        """Records generation task metadata, status, and progress bound to owner_id."""
        collection = self._get_collection("generation_jobs")
        if collection is None:
            raise DatabaseUnavailableError("MongoDB is unavailable")

        if not owner_id or not str(owner_id).strip():
            raise ValueError("Valid, non-empty owner_id is required to create generation job")

        job_id = job_data.get("job_id") or job_data.get("task_id") or str(uuid.uuid4())
        now = int(time.time() * 1000)

        record = {
            "job_id": str(job_id),
            "project_id": str(job_data.get("project_id", job_id)),
            "owner_id": str(owner_id).strip(),
            "status": job_data.get("status", "queued"),  # "queued", "processing", "completed", "error"
            "progress": job_data.get("progress", 0),
            "pipeline": job_data.get("pipeline", "standard"),
            "error": job_data.get("error"),
            "created_at": job_data.get("created_at", now),
            "updated_at": now,
        }

        try:
            collection.replace_one(
                {"job_id": str(job_id), "owner_id": str(owner_id).strip()},
                record,
                upsert=True,
            )
            return record
        except PyMongoError as e:
            logger.error(f"Failed to create job {job_id}: {e.__class__.__name__}")
            raise

    def get_generation_job(self, job_id: str, owner_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves a generation job by its job_id strictly scoped to owner_id.
        Rejects missing or empty owner_id with ValueError.
        """
        collection = self._get_collection("generation_jobs")
        if collection is None:
            return None

        if not owner_id or not str(owner_id).strip():
            raise ValueError("Valid, non-empty owner_id is required to retrieve generation job")

        query: Dict[str, Any] = {
            "job_id": str(job_id),
            "owner_id": str(owner_id).strip(),
        }

        try:
            doc = collection.find_one(query)
            return _clean_doc(doc)
        except PyMongoError as e:
            logger.error(f"Failed to get job {job_id}: {e.__class__.__name__}")
            return None

    def update_generation_job(
        self, job_id: str, updates: Dict[str, Any], owner_id: str
    ) -> bool:
        """
        Updates progress, status, or error on a generation job strictly scoped to owner_id.
        Rejects missing or empty owner_id with ValueError.
        """
        collection = self._get_collection("generation_jobs")
        if collection is None:
            return False

        if not owner_id or not str(owner_id).strip():
            raise ValueError("Valid, non-empty owner_id is required to update generation job")

        query: Dict[str, Any] = {
            "job_id": str(job_id),
            "owner_id": str(owner_id).strip(),
        }

        doc_updates = dict(updates)
        doc_updates["updated_at"] = int(time.time() * 1000)
        doc_updates.pop("job_id", None)
        doc_updates.pop("owner_id", None)

        try:
            result = collection.update_one(query, {"$set": doc_updates})
            return result.matched_count > 0
        except PyMongoError as e:
            logger.error(f"Failed to update job {job_id}: {e.__class__.__name__}")
            return False

    def delete_jobs_by_project(self, project_id: str, owner_id: str) -> int:
        """
        Deletes jobs associated with a project strictly scoped to owner_id.
        Rejects missing or empty owner_id with ValueError.
        """
        collection = self._get_collection("generation_jobs")
        if collection is None:
            return 0

        if not owner_id or not str(owner_id).strip():
            raise ValueError("Valid, non-empty owner_id is required to delete generation jobs")

        query: Dict[str, Any] = {
            "project_id": str(project_id),
            "owner_id": str(owner_id).strip(),
        }

        try:
            res = collection.delete_many(query)
            return res.deleted_count
        except PyMongoError as e:
            logger.error(f"Failed to delete jobs for project {project_id}: {e.__class__.__name__}")
            return 0


# Global singleton repository
project_repository = ProjectRepository()
