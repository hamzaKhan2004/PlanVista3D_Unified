import threading
from typing import Dict, Any, Optional

class TaskRepository:
    """Thread-safe in-memory repository for model generation task statuses."""
    def __init__(self):
        self._tasks: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()

    def set(self, task_id: str, data: Dict[str, Any]) -> None:
        with self._lock:
            self._tasks[task_id] = data

    def update(self, task_id: str, updates: Dict[str, Any]) -> None:
        with self._lock:
            if task_id in self._tasks:
                self._tasks[task_id].update(updates)
            else:
                self._tasks[task_id] = updates

    def get(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._tasks.get(task_id)

    def exists(self, task_id: str) -> bool:
        with self._lock:
            return task_id in self._tasks

    @property
    def raw_dict(self) -> Dict[str, Dict[str, Any]]:
        """Provides direct dictionary access for backward compatibility."""
        return self._tasks

# Global singleton repository instance
task_repository = TaskRepository()
