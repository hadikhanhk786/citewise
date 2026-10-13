import logging
import json
from contextvars import ContextVar
from datetime import datetime

request_id_ctx_var: ContextVar[str] = ContextVar("request_id", default=None)

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "name": record.name,
            "message": record.getMessage(),
            "request_id": request_id_ctx_var.get()
        }
        if record.exc_info:
            log_record["exc_info"] = self.formatException(record.exc_info)
            
        # Add extra custom kwargs pushed via 'extra' dictionary, e.g. metrics
        if hasattr(record, "metrics"):
            log_record["metrics"] = record.metrics
            
        return json.dumps(log_record)

def setup_logging():
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    
    if root_logger.hasHandlers():
        root_logger.handlers.clear()
        
    root_logger.addHandler(handler)
    
    for log_name in ["uvicorn", "uvicorn.error", "uvicorn.access"]:
        log = logging.getLogger(log_name)
        log.handlers = [handler]
        log.propagate = False
