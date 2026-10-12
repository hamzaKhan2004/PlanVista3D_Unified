from typing import Optional, Dict, Any

class TaskStatus:
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    ERROR = "error"

class Task:
    def __init__(
        self,
        task_id: str,
        status: str = TaskStatus.QUEUED,
        progress: int = 0,
        model_file: Optional[str] = None,
        analysis: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ):
        self.task_id = task_id
        self.status = status
        self.progress = progress
        self.model_file = model_file
        self.analysis = analysis
        self.error = error

    def to_dict(self) -> Dict[str, Any]:
        result = {
            "status": self.status,
            "progress": self.progress,
        }
        if self.model_file:
            result["model_file"] = self.model_file
        if self.analysis is not None:
            result["analysis"] = self.analysis
        if self.error:
            result["error"] = self.error
        return result
