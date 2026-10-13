import os
import json
import threading
from typing import Dict, Any, Optional
from backend.config.config import OUTPUT_FOLDER, UPLOAD_FOLDER

class TaskRepository:
    """Thread-safe persistent repository for model generation task statuses."""
    def __init__(self):
        self._tasks: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._load_persisted_tasks()

    def _get_meta_path(self, task_id: str) -> str:
        return os.path.join(OUTPUT_FOLDER, f"{task_id}_meta.json")

    def _persist_task(self, task_id: str, data: Dict[str, Any]) -> None:
        try:
            meta_path = self._get_meta_path(task_id)
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"[TASK_REPO] Failed to persist task metadata for {task_id}: {e}")

    def _load_persisted_tasks(self) -> None:
        """Loads existing task metadata files from disk on initialization."""
        try:
            if not os.path.exists(OUTPUT_FOLDER):
                return
            for fname in os.listdir(OUTPUT_FOLDER):
                if fname.endswith("_meta.json"):
                    task_id = fname[:-10]
                    meta_path = os.path.join(OUTPUT_FOLDER, fname)
                    try:
                        with open(meta_path, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            self._tasks[task_id] = data
                    except Exception as e:
                        print(f"[TASK_REPO] Error loading {meta_path}: {e}")
            print(f"[TASK_REPO] Initialized with {len(self._tasks)} persisted tasks.")
        except Exception as e:
            print(f"[TASK_REPO] Failed to scan output folder for persisted tasks: {e}")

    def set(self, task_id: str, data: Dict[str, Any]) -> None:
        with self._lock:
            existing = self._tasks.get(task_id, {})
            if "source_file" in existing and "source_file" not in data:
                data["source_file"] = existing["source_file"]
            self._tasks[task_id] = data
            self._persist_task(task_id, data)

    def update(self, task_id: str, updates: Dict[str, Any]) -> None:
        with self._lock:
            if task_id in self._tasks:
                self._tasks[task_id].update(updates)
            else:
                self._tasks[task_id] = updates
            self._persist_task(task_id, self._tasks[task_id])

    def get(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            if task_id in self._tasks:
                return self._tasks[task_id]

            # Check for disk metadata file directly
            meta_path = self._get_meta_path(task_id)
            if os.path.exists(meta_path):
                try:
                    with open(meta_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        self._tasks[task_id] = data
                        return data
                except Exception as e:
                    print(f"[TASK_REPO] Error reading {meta_path}: {e}")

            # Legacy fallback: check if output GLB exists
            glb_path = os.path.join(OUTPUT_FOLDER, f"{task_id}_model.glb")
            if os.path.exists(glb_path):
                file_size = os.path.getsize(glb_path)
                recovered_data = {
                    "status": "completed",
                    "progress": 100,
                    "model_file": f"{task_id}_model.glb",
                    "analysis": {
                        "pipeline": "recovered",
                        "model_size_bytes": file_size,
                    },
                }

                # Try to locate original input file in uploads
                if os.path.exists(UPLOAD_FOLDER):
                    for fname in os.listdir(UPLOAD_FOLDER):
                        if fname.startswith(f"{task_id}_"):
                            orig_name = fname[len(task_id) + 1:]
                            ext = orig_name.rsplit(".", 1)[-1].lower() if "." in orig_name else ""
                            recovered_data["source_file"] = {
                                "filename": orig_name,
                                "type": ext,
                                "has_source": True,
                                "download_url": f"/api/source/{task_id}",
                            }
                            break

                self._tasks[task_id] = recovered_data
                self._persist_task(task_id, recovered_data)
                return recovered_data

            return None

    def exists(self, task_id: str) -> bool:
        return self.get(task_id) is not None

    def delete(self, task_id: str) -> bool:
        """Deletes task from memory and removes exclusively owned files (GLB, metadata, uploads)."""
        with self._lock:
            # Remove from memory
            self._tasks.pop(task_id, None)

            # Remove metadata file
            meta_path = self._get_meta_path(task_id)
            if os.path.exists(meta_path):
                try:
                    os.remove(meta_path)
                except Exception as e:
                    print(f"[TASK_REPO] Failed to delete meta file for {task_id}: {e}")

            # Remove generated GLB model from output folder
            glb_path = os.path.join(OUTPUT_FOLDER, f"{task_id}_model.glb")
            if os.path.exists(glb_path):
                try:
                    os.remove(glb_path)
                except Exception as e:
                    print(f"[TASK_REPO] Failed to delete GLB for {task_id}: {e}")

            # Remove uploaded source and intermediate config from upload folder
            if os.path.exists(UPLOAD_FOLDER):
                for fname in os.listdir(UPLOAD_FOLDER):
                    if fname.startswith(f"{task_id}_"):
                        try:
                            os.remove(os.path.join(UPLOAD_FOLDER, fname))
                        except Exception as e:
                            print(f"[TASK_REPO] Failed to delete upload file {fname}: {e}")

            return True

    @property
    def raw_dict(self) -> Dict[str, Dict[str, Any]]:
        """Provides direct dictionary access for backward compatibility."""
        return self._tasks

# Global singleton repository instance
task_repository = TaskRepository()
