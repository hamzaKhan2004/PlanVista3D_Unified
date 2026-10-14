import os
import io
import time
import base64
import logging
from typing import Optional, Dict, Any, Union, List

from backend.config.config import (
    IMAGEKIT_URL,
    IMAGEKIT_PUBLIC_KEY,
    IMAGEKIT_PRIVATE_KEY,
    IMAGEKIT_BLUEPRINT_FOLDER,
    IMAGEKIT_GENERATED_IMAGES_FOLDER,
)

logger = logging.getLogger("planvista3d.imagekit")

# Max allowed file size for image uploads: 25MB
MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}


class ImageKitServiceError(Exception):
    """Clean exception for ImageKit operations without leaking secrets or raw traces."""
    pass


class ImageKitService:
    """
    Service wrapper for official ImageKit SDK (v5.x).
    Manages image uploads to planvista/blueprints/ and planvista/generated-images/,
    asset deletion, and secure authorization signatures.
    Private key is kept exclusively on the backend.
    """

    def __init__(
        self,
        private_key: Optional[str] = None,
        public_key: Optional[str] = None,
        url_endpoint: Optional[str] = None,
    ):
        self._private_key = private_key
        self._public_key = public_key
        self._url_endpoint = url_endpoint
        self._client = None

    @property
    def private_key(self) -> str:
        return self._private_key if self._private_key is not None else IMAGEKIT_PRIVATE_KEY

    @property
    def public_key(self) -> str:
        return self._public_key if self._public_key is not None else IMAGEKIT_PUBLIC_KEY

    @property
    def url_endpoint(self) -> str:
        return self._url_endpoint if self._url_endpoint is not None else IMAGEKIT_URL

    def is_configured(self) -> bool:
        """Returns True if ImageKit credentials are non-empty."""
        return bool(self.private_key and self.url_endpoint)

    def _get_client(self):
        """Lazily initializes the ImageKit client singleton."""
        if not self.is_configured():
            return None

        if self._client is None:
            try:
                from imagekitio import ImageKit
                self._client = ImageKit(private_key=self.private_key)
            except Exception as e:
                logger.warning(f"Failed to initialize ImageKit client: {e.__class__.__name__}")
                return None
        return self._client

    def _prepare_file_payload(self, file_data: Union[str, bytes, io.BytesIO]) -> tuple[Any, int]:
        """
        Normalizes file input into an uploadable format (bytes or file-like object)
        and computes file size for validation.
        """
        if isinstance(file_data, str):
            # Check if it's a data URL (e.g. data:image/png;base64,...)
            if file_data.startswith("data:") and ";base64," in file_data:
                b64_content = file_data.split(";base64,")[1]
                raw_bytes = base64.b64decode(b64_content)
                return raw_bytes, len(raw_bytes)
            # Check if it's a local file path
            elif os.path.exists(file_data):
                size = os.path.getsize(file_data)
                if size > MAX_IMAGE_SIZE_BYTES:
                    raise ImageKitServiceError(f"File size ({size} bytes) exceeds maximum limit of 25MB.")
                with open(file_data, "rb") as f:
                    raw_bytes = f.read()
                return raw_bytes, size
            else:
                # Raw base64 string
                try:
                    raw_bytes = base64.b64decode(file_data)
                    return raw_bytes, len(raw_bytes)
                except Exception:
                    raise ImageKitServiceError("Invalid image string payload: neither path nor valid base64.")

        elif isinstance(file_data, bytes):
            return file_data, len(file_data)

        elif hasattr(file_data, "read"):
            # File-like object (e.g. Werkzeug FileStorage or BytesIO)
            content = file_data.read()
            # Reset seek pointer if possible
            if hasattr(file_data, "seek"):
                file_data.seek(0)
            return content, len(content)

        raise ImageKitServiceError(f"Unsupported file data type: {type(file_data).__name__}")

    def upload_file(
        self,
        file_data: Union[str, bytes, io.BytesIO],
        file_name: str,
        folder: str,
        tags: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Uploads an image file to ImageKit in the specified target folder.
        Enforces size and extension validation.
        """
        if not self.is_configured():
            raise ImageKitServiceError("ImageKit is not configured on this server.")

        client = self._get_client()
        if client is None:
            raise ImageKitServiceError("Failed to obtain ImageKit client.")

        # Check extension
        ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
        if ext and ext not in ALLOWED_IMAGE_EXTENSIONS and ext != "dxf":
            raise ImageKitServiceError(f"File extension '{ext}' is not supported for image storage.")

        # Prepare payload and validate size
        payload, size_bytes = self._prepare_file_payload(file_data)
        if size_bytes > MAX_IMAGE_SIZE_BYTES:
            raise ImageKitServiceError(f"File size ({size_bytes} bytes) exceeds maximum limit of 25MB.")

        upload_tags = tags or ["planvista3d"]

        try:
            resp = client.files.upload(
                file=payload,
                file_name=file_name,
                folder=folder,
                tags=upload_tags,
                use_unique_file_name=True,
            )

            result = {
                "file_id": resp.file_id,
                "name": resp.name,
                "url": resp.url,
                "thumbnail_url": resp.thumbnail_url or resp.url,
                "file_path": resp.file_path,
                "file_type": getattr(resp, "file_type", "image"),
                "size": resp.size or size_bytes,
                "folder": folder,
            }
            logger.info(f"Successfully uploaded to ImageKit: {resp.file_id} ({resp.name})")
            return result

        except Exception as e:
            logger.error(f"ImageKit upload failed for '{file_name}': {e.__class__.__name__}")
            raise ImageKitServiceError(f"ImageKit upload failed: {e.__class__.__name__}")
        finally:
            # Ensure open file handles are closed
            if hasattr(payload, "close") and not isinstance(payload, bytes):
                try:
                    payload.close()
                except Exception:
                    pass

    def upload_blueprint_image(
        self,
        file_data: Union[str, bytes, io.BytesIO],
        file_name: str,
        project_id: str,
        owner_id: str,
    ) -> Dict[str, Any]:
        """Uploads a floor plan blueprint image to planvista/blueprints/."""
        tags = ["blueprint", "planvista3d", f"owner_{owner_id}", f"proj_{project_id}"]
        return self.upload_file(
            file_data=file_data,
            file_name=file_name,
            folder=IMAGEKIT_BLUEPRINT_FOLDER,
            tags=tags,
        )

    def upload_generated_image(
        self,
        file_data: Union[str, bytes, io.BytesIO],
        file_name: str,
        project_id: str,
        owner_id: str,
    ) -> Dict[str, Any]:
        """Uploads a 2D synthesized render image to planvista/generated-images/."""
        tags = ["generated_image", "planvista3d", f"owner_{owner_id}", f"proj_{project_id}"]
        return self.upload_file(
            file_data=file_data,
            file_name=file_name,
            folder=IMAGEKIT_GENERATED_IMAGES_FOLDER,
            tags=tags,
        )

    def delete_file(self, file_id: str) -> bool:
        """
        Deletes a file from ImageKit by file_id.
        Gracefully handles missing files without raising fatal errors.
        """
        if not file_id:
            return False

        if not self.is_configured():
            logger.warning(f"ImageKit not configured; skipping deletion of file_id {file_id}")
            return False

        client = self._get_client()
        if client is None:
            return False

        try:
            client.files.delete(file_id=file_id)
            logger.info(f"Successfully deleted ImageKit file: {file_id}")
            return True
        except Exception as e:
            # Check if file was already deleted / not found
            err_name = e.__class__.__name__
            logger.warning(f"ImageKit file deletion failed for {file_id}: {err_name}")
            return False

    def get_auth_parameters(self, expire_seconds: int = 300) -> Dict[str, Any]:
        """
        Generates client-side upload authentication parameters (token, expire, signature).
        Uses backend private key without exposing it to the client.
        Enforces a short-lived 5-minute (300 seconds) expiry by default.
        """
        if not self.is_configured():
            raise ImageKitServiceError("ImageKit is not configured.")

        client = self._get_client()
        if client is None:
            raise ImageKitServiceError("Failed to obtain ImageKit client.")

        try:
            expire_timestamp = int(time.time()) + int(expire_seconds)
            params = client.helper.get_authentication_parameters(expire=expire_timestamp)
            return {
                "token": params.get("token"),
                "expire": params.get("expire"),
                "signature": params.get("signature"),
                "publicKey": self.public_key,
                "public_key": self.public_key,
                "urlEndpoint": self.url_endpoint,
                "url_endpoint": self.url_endpoint,
            }
        except Exception as e:
            logger.error(f"Failed to generate ImageKit auth params: {e.__class__.__name__}")
            raise ImageKitServiceError("Failed to generate ImageKit authorization parameters.")

    def get_health_status(self) -> Dict[str, Any]:
        """
        Safe health indicator for ImageKit configuration.
        Never reveals the private key.
        """
        configured = self.is_configured()
        return {
            "configured": configured,
            "url_endpoint": self.url_endpoint if configured else None,
            "public_key": self.public_key if configured else None,
        }


# Global singleton instance
imagekit_service = ImageKitService()
