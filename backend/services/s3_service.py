import os
import re
import io
import time
import logging
import threading
from typing import Optional, Dict, Any, Union

import boto3
from botocore.exceptions import ClientError, BotoCoreError

from backend.config.config import (
    AWS_REGION,
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    S3_BUCKET,
    S3_PREFIX,
)

logger = logging.getLogger("planvista3d.s3")


class S3ServiceError(Exception):
    """Clean exception for S3 operations without leaking credentials or raw stack traces."""
    pass


class S3Service:
    """
    Centralized, thread-safe Amazon S3 client wrapper for 3D GLB model persistence.
    Supports explicit AWS credentials as well as default AWS credential provider chains (IAM roles/ECS).
    Guarantees private storage (Block Public Access) and short-lived presigned GET URLs.
    """

    def __init__(
        self,
        region_name: Optional[str] = None,
        aws_access_key_id: Optional[str] = None,
        aws_secret_access_key: Optional[str] = None,
        bucket_name: Optional[str] = None,
        prefix: Optional[str] = None,
    ):
        self._region_name = region_name
        self._aws_access_key_id = aws_access_key_id
        self._aws_secret_access_key = aws_secret_access_key
        self._bucket_name = bucket_name
        self._prefix = prefix
        self._client = None
        self._lock = threading.Lock()

    @property
    def region_name(self) -> str:
        return (self._region_name if self._region_name is not None else AWS_REGION) or "us-east-1"

    @property
    def aws_access_key_id(self) -> str:
        return self._aws_access_key_id if self._aws_access_key_id is not None else AWS_ACCESS_KEY_ID

    @property
    def aws_secret_access_key(self) -> str:
        return (
            self._aws_secret_access_key
            if self._aws_secret_access_key is not None
            else AWS_SECRET_ACCESS_KEY
        )

    @property
    def bucket_name(self) -> str:
        return self._bucket_name if self._bucket_name is not None else S3_BUCKET

    @property
    def prefix(self) -> str:
        return self._prefix if self._prefix is not None else S3_PREFIX

    def is_configured(self) -> bool:
        """
        Returns True if S3_BUCKET is configured and credentials are present
        either via explicit keys or standard AWS credential provider chain.
        """
        if not self.bucket_name:
            return False
        if self.aws_access_key_id and self.aws_secret_access_key:
            return True
        try:
            session = boto3.Session(region_name=self.region_name)
            return session.get_credentials() is not None
        except Exception:
            return False

    def _get_client(self):
        """Thread-safely acquires or initializes the boto3 S3 client."""
        if not self.is_configured():
            return None

        with self._lock:
            if self._client is None:
                try:
                    if self.aws_access_key_id and self.aws_secret_access_key:
                        self._client = boto3.client(
                            "s3",
                            region_name=self.region_name,
                            aws_access_key_id=self.aws_access_key_id,
                            aws_secret_access_key=self.aws_secret_access_key,
                        )
                    else:
                        self._client = boto3.client(
                            "s3",
                            region_name=self.region_name,
                        )
                except Exception as e:
                    logger.error(f"Failed to initialize S3 client: {e.__class__.__name__}")
                    return None
            return self._client

    @staticmethod
    def normalize_id(identifier: str) -> str:
        """
        Validates and sanitizes IDs for use in S3 object keys.
        Prevents path traversal, path manipulation, and unsupported characters.
        """
        if not identifier or not str(identifier).strip():
            raise S3ServiceError("Identifier cannot be empty.")
        clean = str(identifier).strip()
        # Disallow path traversal
        if ".." in clean or "/" in clean or "\\" in clean:
            clean = clean.replace("..", "").replace("/", "_").replace("\\", "_")
        # Keep only alphanumeric, hyphen, underscore, and dot
        clean = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", clean)
        clean = clean.strip("._")
        if not clean:
            raise S3ServiceError(f"Invalid identifier '{identifier}' after sanitization.")
        return clean

    def generate_model_key(
        self, owner_id: str, project_id: str, model_id: Optional[str] = None
    ) -> str:
        """
        Builds a deterministic, collision-resistant S3 object key.
        Format: users/{ownerId}/projects/{projectId}/models/{modelId}.glb
        """
        clean_owner = self.normalize_id(owner_id)
        clean_project = self.normalize_id(project_id)
        clean_model = self.normalize_id(model_id or project_id)

        clean_prefix = (self.prefix or "users").strip().strip("/")
        if not clean_prefix or clean_prefix == "users":
            return f"users/{clean_owner}/projects/{clean_project}/models/{clean_model}.glb"
        if clean_prefix.endswith("users"):
            return f"{clean_prefix}/{clean_owner}/projects/{clean_project}/models/{clean_model}.glb"
        return f"{clean_prefix}/users/{clean_owner}/projects/{clean_project}/models/{clean_model}.glb"

    def upload_model(
        self,
        file_path_or_bytes: Union[str, bytes, io.BytesIO],
        owner_id: str,
        project_id: str,
        model_id: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Uploads a generated 3D GLB model file to S3 under the caller's secure path.
        Validates the file existence and size, and ensures upload confirmation from S3.
        """
        if not self.is_configured():
            raise S3ServiceError("S3 storage is not configured on this server.")

        client = self._get_client()
        if client is None:
            raise S3ServiceError("Unable to initialize S3 client.")

        clean_owner = self.normalize_id(owner_id)
        clean_project = self.normalize_id(project_id)
        clean_model = self.normalize_id(model_id or project_id)
        s3_key = self.generate_model_key(clean_owner, clean_project, clean_model)

        # Prepare payload and determine size
        file_body = None
        file_size = 0

        if isinstance(file_path_or_bytes, str):
            if not os.path.exists(file_path_or_bytes):
                raise S3ServiceError(f"Model file '{file_path_or_bytes}' does not exist.")
            file_size = os.path.getsize(file_path_or_bytes)
            if file_size == 0:
                raise S3ServiceError(f"Model file '{file_path_or_bytes}' is empty (0 bytes).")
            with open(file_path_or_bytes, "rb") as f:
                file_body = f.read()
        elif isinstance(file_path_or_bytes, bytes):
            file_body = file_path_or_bytes
            file_size = len(file_body)
            if file_size == 0:
                raise S3ServiceError("Model bytes payload is empty (0 bytes).")
        elif hasattr(file_path_or_bytes, "read"):
            file_body = file_path_or_bytes.read()
            file_size = len(file_body)
            if file_size == 0:
                raise S3ServiceError("Model stream payload is empty (0 bytes).")
        else:
            raise S3ServiceError("Invalid model data provided for S3 upload.")

        extra_args: Dict[str, Any] = {
            "ContentType": "model/gltf-binary",
        }
        if metadata:
            extra_args["Metadata"] = {
                self.normalize_id(k): str(v) for k, v in metadata.items()
            }

        try:
            client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=file_body,
                **extra_args,
            )
            # Confirm object exists and is recorded in S3
            head_res = client.head_object(Bucket=self.bucket_name, Key=s3_key)
            confirmed_size = head_res.get("ContentLength", file_size)

            return {
                "storage_provider": "s3",
                "bucket": self.bucket_name,
                "key": s3_key,
                "size": confirmed_size,
                "content_type": "model/gltf-binary",
                "format": "glb",
                "owner_id": clean_owner,
                "project_id": clean_project,
                "model_id": clean_model,
                "etag": head_res.get("ETag", "").strip('"'),
                "uploaded_at": int(time.time() * 1000),
            }
        except ClientError as ce:
            code = ce.response.get("Error", {}).get("Code", "ClientError")
            logger.error(f"S3 ClientError during upload to {s3_key}: {code}")
            raise S3ServiceError(f"S3 upload failed: {code}")
        except BotoCoreError as be:
            logger.error(f"S3 BotoCoreError during upload to {s3_key}: {be.__class__.__name__}")
            raise S3ServiceError(f"S3 connection error: {be.__class__.__name__}")
        except Exception as e:
            logger.error(f"Unexpected error during S3 upload to {s3_key}: {e.__class__.__name__}")
            raise S3ServiceError("Failed to upload model to S3 storage.")

    def generate_presigned_url(
        self, object_key: str, expiry_seconds: int = 900
    ) -> str:
        """
        Generates a short-lived presigned GET URL for downloading the private model object.
        Default expiry is 15 minutes (900 seconds). Never reveals AWS credentials.
        """
        if not self.is_configured():
            raise S3ServiceError("S3 storage is not configured.")

        client = self._get_client()
        if client is None:
            raise S3ServiceError("Unable to initialize S3 client.")

        if not object_key or not str(object_key).strip():
            raise S3ServiceError("Object key is required for presigned URL generation.")

        clean_key = str(object_key).strip()

        try:
            url = client.generate_presigned_url(
                ClientMethod="get_object",
                Params={
                    "Bucket": self.bucket_name,
                    "Key": clean_key,
                },
                ExpiresIn=int(expiry_seconds),
            )
            return url
        except Exception as e:
            logger.error(f"Failed to generate S3 presigned URL for {clean_key}: {e.__class__.__name__}")
            raise S3ServiceError("Failed to generate secure model download URL.")

    def delete_object(self, object_key: str) -> bool:
        """
        Deletes a model object from S3.
        Returns True if successful. Safe against nonexistent objects.
        """
        if not self.is_configured():
            logger.warning("S3 delete requested while S3 is unconfigured.")
            return False

        client = self._get_client()
        if client is None:
            return False

        if not object_key or not str(object_key).strip():
            return False

        clean_key = str(object_key).strip()
        try:
            client.delete_object(Bucket=self.bucket_name, Key=clean_key)
            return True
        except Exception as e:
            logger.error(f"Failed to delete S3 object {clean_key}: {e.__class__.__name__}")
            return False

    def get_health_status(self) -> Dict[str, Any]:
        """
        Returns a sanitized configuration status indicator.
        Never reveals secret access keys or AWS access key IDs.
        """
        configured = self.is_configured()
        return {
            "configured": configured,
            "bucket": self.bucket_name if configured else None,
            "region": self.region_name if configured else None,
        }


# Global singleton instance
s3_service = S3Service()
