import os
import json
import time
import secrets
import logging
import threading
from typing import Optional, Dict, Any
from pymongo.collection import Collection
from pymongo.errors import PyMongoError

from backend.db.mongo import mongo_manager, MongoManager
from backend.config.config import OUTPUT_FOLDER

logger = logging.getLogger("planvista3d.share")


def _clean_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


class ShareRepository:
    """
    Repository for managing public AR share links and tokens for 3D CAD models.
    Supports MongoDB persistence with automatic fallback to thread-safe local disk cache.
    """

    def __init__(self, manager: Optional[MongoManager] = None):
        self._manager = manager or mongo_manager
        self._lock = threading.Lock()
        self._local_shares: Dict[str, Dict[str, Any]] = {}
        self._load_local_shares()

    @property
    def db(self):
        return self._manager.get_db()

    def _get_collection(self) -> Optional[Collection]:
        db = self.db
        if db is None:
            return None
        return db["shares"]

    def _get_share_file_path(self, share_token: str) -> str:
        safe_token = "".join(c for c in share_token if c.isalnum() or c in "-_")
        return os.path.join(OUTPUT_FOLDER, f"share_{safe_token}.json")

    def _load_local_shares(self) -> None:
        try:
            if not os.path.exists(OUTPUT_FOLDER):
                return
            for fname in os.listdir(OUTPUT_FOLDER):
                if fname.startswith("share_") and fname.endswith(".json"):
                    fpath = os.path.join(OUTPUT_FOLDER, fname)
                    try:
                        with open(fpath, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            if "share_token" in data:
                                self._local_shares[data["share_token"]] = data
                    except Exception as e:
                        logger.warning(f"Failed to load local share file {fname}: {e}")
        except Exception as e:
            logger.warning(f"Error scanning local shares: {e}")

    def _persist_local_share(self, share_data: Dict[str, Any]) -> None:
        try:
            os.makedirs(OUTPUT_FOLDER, exist_ok=True)
            fpath = self._get_share_file_path(share_data["share_token"])
            with open(fpath, "w", encoding="utf-8") as f:
                json.dump(share_data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to persist local share file: {e}")

    def create_or_get_share(
        self,
        project_id: str,
        owner_id: str,
        expires_in_days: Optional[int] = 30,
    ) -> Dict[str, Any]:
        """
        Creates a new cryptographically secure share token for a 3D model project
        or returns the existing active share record.
        """
        if not project_id or not str(project_id).strip():
            raise ValueError("project_id is required to create a share link")
        if not owner_id or not str(owner_id).strip():
            raise ValueError("owner_id is required to create a share link")

        clean_project = str(project_id).strip()
        clean_owner = str(owner_id).strip()
        now = int(time.time() * 1000)
        expires_at = now + (expires_in_days * 86400 * 1000) if expires_in_days else None

        # Check existing active share first
        existing = self.get_share_by_project(clean_project, clean_owner)
        if existing and existing.get("is_active"):
            return existing

        # Generate a new URL-safe token (32 base64 characters)
        share_token = secrets.token_urlsafe(24)

        record = {
            "share_token": share_token,
            "project_id": clean_project,
            "owner_id": clean_owner,
            "is_active": True,
            "allow_public": True,
            "created_at": now,
            "expires_at": expires_at,
            "view_count": 0,
        }

        # Try MongoDB
        col = self._get_collection()
        if col is not None:
            try:
                col.replace_one(
                    {"project_id": clean_project, "owner_id": clean_owner},
                    record,
                    upsert=True,
                )
            except PyMongoError as e:
                logger.error(f"MongoDB share record creation failed: {e}")

        # Always update local cache for high availability and offline test compatibility
        with self._lock:
            self._local_shares[share_token] = record
            self._persist_local_share(record)

        return record

    def get_share(self, share_token: str, active_only: bool = False) -> Optional[Dict[str, Any]]:
        """
        Retrieves a share record by its share token.
        If active_only is True, returns None if inactive or expired.
        If active_only is False (default), returns the record (with is_active=False if expired)
        so callers can distinguish between non-existent tokens and revoked/expired tokens.
        """
        if not share_token or not str(share_token).strip():
            return None

        clean_token = str(share_token).strip()
        col = self._get_collection()
        doc = None

        if col is not None:
            try:
                doc = col.find_one({"share_token": clean_token})
            except PyMongoError as e:
                logger.warning(f"MongoDB share lookup failed: {e}")

        if doc is None:
            with self._lock:
                doc = self._local_shares.get(clean_token)

        if not doc:
            return None

        doc = _clean_doc(doc)
        now = int(time.time() * 1000)
        if doc.get("expires_at") and doc["expires_at"] < now:
            doc["is_active"] = False

        if active_only and not doc.get("is_active"):
            return None

        return doc

    def get_share_by_project(
        self, project_id: str, owner_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieves the active share record for a given project, optionally scoped to owner.
        """
        if not project_id:
            return None

        clean_project = str(project_id).strip()
        clean_owner = str(owner_id).strip() if owner_id else None

        col = self._get_collection()
        doc = None

        query: Dict[str, Any] = {"project_id": clean_project, "is_active": True}
        if clean_owner:
            query["owner_id"] = clean_owner

        if col is not None:
            try:
                doc = col.find_one(query)
            except PyMongoError as e:
                logger.warning(f"MongoDB share lookup by project failed: {e}")

        if doc is None:
            with self._lock:
                for share in self._local_shares.values():
                    if share.get("project_id") == clean_project and share.get("is_active"):
                        if not clean_owner or share.get("owner_id") == clean_owner:
                            doc = share
                            break

        if not doc:
            return None

        now = int(time.time() * 1000)
        if doc.get("expires_at") and doc["expires_at"] < now:
            return None

        return _clean_doc(doc)

    def revoke_share(self, project_id: str, owner_id: str) -> bool:
        """
        Revokes (deactivates) all share links for a given project and owner.
        """
        clean_project = str(project_id).strip()
        clean_owner = str(owner_id).strip()
        now = int(time.time() * 1000)
        success = False

        col = self._get_collection()
        if col is not None:
            try:
                res = col.update_many(
                    {"project_id": clean_project, "owner_id": clean_owner},
                    {"$set": {"is_active": False, "revoked_at": now}},
                )
                if res.modified_count > 0:
                    success = True
            except PyMongoError as e:
                logger.error(f"MongoDB revoke share failed: {e}")

        with self._lock:
            for token, share in list(self._local_shares.items()):
                if share.get("project_id") == clean_project and share.get("owner_id") == clean_owner:
                    share["is_active"] = False
                    share["revoked_at"] = now
                    self._persist_local_share(share)
                    success = True

        return success


# Global singleton instance
share_repository = ShareRepository()
