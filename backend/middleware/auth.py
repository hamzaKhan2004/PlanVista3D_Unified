import time
import logging
import threading
from functools import wraps
from typing import Optional, Dict, Any
import requests
from flask import request, jsonify

from backend.config.config import PUTER_AUTH_REQUIRED, PUTER_WHOAMI_URL

logger = logging.getLogger("planvista3d.auth")

# In-memory TTL cache for verified tokens: token -> (user_dict, expires_at)
# Protected by _CACHE_LOCK for complete thread safety in multi-threaded servers
_CACHE_LOCK = threading.Lock()
_TOKEN_CACHE: Dict[str, tuple[Dict[str, Any], float]] = {}
_CACHE_TTL_SECONDS = 300  # 5 minutes


def _clean_cache_if_needed():
    """
    Removes expired entries if the cache grows beyond 500 items.
    Must only be called while holding _CACHE_LOCK.
    Uses list snapshot to avoid 'dictionary changed size during iteration' errors.
    """
    now = time.time()
    if len(_TOKEN_CACHE) > 500:
        expired = [k for k, (_, exp) in list(_TOKEN_CACHE.items()) if exp < now]
        for k in expired:
            _TOKEN_CACHE.pop(k, None)


def clear_token_cache():
    """Thread-safely clears the token cache (primarily used in testing)."""
    with _CACHE_LOCK:
        _TOKEN_CACHE.clear()


def verify_puter_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Validates a Puter bearer token against Puter's official /whoami endpoint.
    Caches verified sessions in memory for 5 minutes.
    Never trusts a user identifier supplied directly by the client.
    Thread-safe: never holds the cache lock during external network requests.
    """
    if not token or not token.strip():
        return None

    clean_token = token.strip()
    now = time.time()

    # 1. Thread-safe cache lookup (fast acquire and release)
    with _CACHE_LOCK:
        if clean_token in _TOKEN_CACHE:
            cached_user, expires_at = _TOKEN_CACHE[clean_token]
            if expires_at > now:
                return cached_user
            else:
                _TOKEN_CACHE.pop(clean_token, None)

    # 2. External HTTP call WITHOUT holding the lock to avoid blocking concurrent requests
    try:
        resp = requests.get(
            PUTER_WHOAMI_URL,
            headers={"Authorization": f"Bearer {clean_token}"},
            timeout=4.0,
        )
        if resp.status_code == 200:
            data = resp.json()
            user_uuid = data.get("uuid")
            if not user_uuid:
                return None
            user_info = {
                "user_id": str(user_uuid),
                "username": data.get("username", "puter_user"),
                "authenticated": True,
            }

            # 3. Thread-safe cache insertion
            with _CACHE_LOCK:
                _clean_cache_if_needed()
                _TOKEN_CACHE[clean_token] = (user_info, time.time() + _CACHE_TTL_SECONDS)

            return user_info
        else:
            logger.debug(f"Puter token validation rejected with status: {resp.status_code}")
            return None
    except Exception as e:
        logger.warning(f"Failed to reach Puter auth service: {e.__class__.__name__}")
        return None


def get_authenticated_user(req=None) -> Optional[Dict[str, Any]]:
    """
    Extracts and validates the authenticated user from the request's Authorization header.
    In local dev / test mode (PUTER_AUTH_REQUIRED=false), falls back to a guest user if no token is sent.
    """
    target_req = req or request
    auth_header = target_req.headers.get("Authorization", "")

    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()

    if token:
        user = verify_puter_token(token)
        if user:
            return user
        # If an explicit token was supplied but failed verification, do not fall back to guest
        return None

    # No token provided
    if not PUTER_AUTH_REQUIRED:
        # Fallback guest user for development/offline testing
        return {
            "user_id": "guest_local",
            "username": "guest",
            "authenticated": False,
        }

    return None


def require_auth(f):
    """
    Decorator that enforces authentication on protected endpoints.
    Returns 401 if user cannot be authenticated.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_authenticated_user(request)
        if not user:
            return (
                jsonify({
                    "error": "Unauthorized",
                    "message": "Valid Puter authentication token required in Authorization header.",
                }),
                401,
            )
        # Attach user to request context
        request.authenticated_user = user
        return f(*args, **kwargs)

    return decorated_function
