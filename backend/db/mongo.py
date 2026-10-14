import logging
import threading
from typing import Optional, Dict, Any
from urllib.parse import urlparse
import pymongo
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import PyMongoError, ServerSelectionTimeoutError, ConnectionFailure

from backend.config.config import MONGODB_URI, MONGODB_DB_NAME

logger = logging.getLogger("planvista3d.mongo")


def sanitize_mongo_uri(uri: str) -> str:
    """Returns a sanitized MongoDB URI string with credentials stripped for safe logging."""
    if not uri:
        return "<unset>"
    try:
        parsed = urlparse(uri)
        netloc = parsed.netloc
        if "@" in netloc:
            # Strip username and password before @
            host_part = netloc.split("@")[-1]
            return f"{parsed.scheme}://<credentials-hidden>@{host_part}"
        return f"{parsed.scheme}://{netloc}"
    except Exception:
        return "<malformed-uri>"


class MongoManager:
    """
    Centralized, thread-safe MongoDB connection and lifecycle manager.
    Implements lazy initialization so module import never attempts a network connection.
    """

    def __init__(self, uri: Optional[str] = None, db_name: Optional[str] = None):
        self._uri = uri
        self._db_name = db_name
        self._client: Optional[MongoClient] = None
        self._db: Optional[Database] = None
        self._lock = threading.Lock()
        self._indexes_initialized = False

    @property
    def uri(self) -> str:
        return self._uri if self._uri is not None else MONGODB_URI

    @property
    def db_name(self) -> str:
        return self._db_name if self._db_name is not None else MONGODB_DB_NAME

    def is_configured(self) -> bool:
        """Returns True if MONGODB_URI is configured."""
        return bool(self.uri)

    def get_client(self) -> Optional[MongoClient]:
        """
        Retrieves or initializes the PyMongo MongoClient singleton lazily.
        Returns None if MONGODB_URI is not configured or connection cannot be created.
        """
        if not self.uri:
            return None

        with self._lock:
            if self._client is None:
                try:
                    sanitized = sanitize_mongo_uri(self.uri)
                    logger.info(f"Initializing MongoDB client pool to: {sanitized}")
                    self._client = MongoClient(
                        self.uri,
                        serverSelectionTimeoutMS=2000,
                        connectTimeoutMS=2000,
                        socketTimeoutMS=5000,
                        maxPoolSize=50,
                        minPoolSize=1,
                        retryWrites=True,
                    )
                except Exception as e:
                    logger.warning(f"Failed to initialize MongoClient: {e.__class__.__name__}: {str(e)}")
                    self._client = None
                    return None
            return self._client

    def get_db(self, db_name: Optional[str] = None) -> Optional[Database]:
        """
        Returns the Database instance. Lazily acquires the client and initializes indexes once.
        Returns None if MongoDB is unavailable.
        """
        client = self.get_client()
        if client is None:
            return None

        target_name = db_name or self.db_name
        with self._lock:
            if self._db is None or self._db.name != target_name:
                self._db = client[target_name]
                if not self._indexes_initialized:
                    self._init_indexes_safely(self._db)
            return self._db

    def is_connected(self) -> bool:
        """
        Fast health-check verifying live MongoDB connectivity using ping command.
        Does not raise exceptions; returns False if unreachable.
        """
        client = self.get_client()
        if client is None:
            return False
        try:
            client.admin.command("ping")
            return True
        except (ServerSelectionTimeoutError, ConnectionFailure, PyMongoError, Exception) as e:
            logger.debug(f"MongoDB ping check failed: {e.__class__.__name__}")
            return False

    def _init_indexes_safely(self, db: Database) -> None:
        """Creates required collection indexes without blocking or crashing on network issues."""
        try:
            # 1. Projects collection indexes
            db.projects.create_index([("project_id", pymongo.ASCENDING)], unique=True)
            db.projects.create_index([("owner_id", pymongo.ASCENDING), ("updated_at", pymongo.DESCENDING)])
            db.projects.create_index([("owner_id", pymongo.ASCENDING), ("type", pymongo.ASCENDING)])

            # 2. Assets collection indexes
            db.assets.create_index([("asset_id", pymongo.ASCENDING)], unique=True)
            db.assets.create_index([("project_id", pymongo.ASCENDING), ("owner_id", pymongo.ASCENDING)])
            db.assets.create_index([("owner_id", pymongo.ASCENDING), ("asset_type", pymongo.ASCENDING)])

            # 3. Generation jobs collection indexes
            db.generation_jobs.create_index([("job_id", pymongo.ASCENDING)], unique=True)
            db.generation_jobs.create_index([("owner_id", pymongo.ASCENDING), ("status", pymongo.ASCENDING)])
            db.generation_jobs.create_index([("project_id", pymongo.ASCENDING)])

            self._indexes_initialized = True
            logger.info("MongoDB database indexes successfully verified/created.")
        except Exception as e:
            logger.warning(f"Failed to create MongoDB indexes: {e.__class__.__name__}: {str(e)}")

    def init_indexes(self) -> bool:
        """Public method to manually trigger index creation."""
        db = self.get_db()
        if db is not None:
            self._init_indexes_safely(db)
            return True
        return False

    def close(self) -> None:
        """Closes the MongoClient and resets connection state."""
        with self._lock:
            if self._client is not None:
                try:
                    self._client.close()
                except Exception:
                    pass
                self._client = None
                self._db = None
                self._indexes_initialized = False

    def get_health_status(self) -> Dict[str, Any]:
        """
        Returns a sanitized health status report safe for public API responses.
        Never exposes credentials, database URI, or hostnames.
        """
        configured = bool(self.uri)
        connected = self.is_connected() if configured else False
        return {
            "configured": configured,
            "connected": connected,
            "database": self.db_name if configured else None,
        }


# Global singleton instance
mongo_manager = MongoManager()
