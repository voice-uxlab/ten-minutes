import logging
from contextvars import ContextVar
from dataclasses import dataclass
from pathlib import Path
from traceback import walk_tb
from typing import Optional
from uuid import uuid4

from fastapi import Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException


from .schemas import TTSDiagnostics


logger = logging.getLogger(__name__)
current_request_id = ContextVar("request_id", default=None)


@dataclass
class APIError(Exception):
    status_code: int
    code: str
    message: str
    upstream_status: Optional[int] = None
    diagnostics: Optional[TTSDiagnostics] = None


def error_body(code: str, message: str, request_id: str) -> dict:
    return {"error": {"code": code, "message": message, "request_id": request_id}}


def log_failure(request: Request, status: int, code: str, detail: str) -> str:
    request_id = getattr(request.state, "request_id", None) or f"req_{uuid4().hex}"
    route = getattr(request.scope.get("route"), "path", "<unmatched>")
    logger.log(
        logging.ERROR if status >= 500 else logging.WARNING,
        "request_id=%r method=%s route=%s status=%d code=%s %s",
        request_id, request.method, route, status, code, detail,
    )
    return request_id


async def routing_error_handler(request: Request, exc: HTTPException):
    log_failure(request, exc.status_code, "HTTP_ERROR", type(exc).__name__)
    return await http_exception_handler(request, exc)


async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
    details = []
    if exc.upstream_status is not None:
        details.append(f"upstream_status={exc.upstream_status}")
    if exc.__cause__:
        details.append(f"cause={type(exc.__cause__).__name__}")
    request_id = log_failure(request, exc.status_code, exc.code, " ".join(details))
    body = error_body(exc.code, exc.message, request_id)
    if exc.diagnostics:
        body["error"]["diagnostics"] = exc.diagnostics.model_dump(exclude_none=True)
    return JSONResponse(content=body, status_code=exc.status_code)


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    issues = exc.errors()
    # Unknown keys and validation inputs can contain private user text.
    dependant = getattr(request.scope.get("route"), "dependant", None)
    fields = {name for route_field in getattr(dependant, "body_params", ())
              for name in getattr(getattr(route_field, "type_", None), "model_fields", {})}
    details = []
    for issue in issues[:10]:
        location = issue.get("loc", ())
        source = location[0] if location else "unknown"
        field = location[1] if len(location) > 1 and location[1] in fields else "*"
        details.append(f"{source}.{field}={issue['type']}")
    request_id = log_failure(request, 422, "VALIDATION_ERROR", f"issues={len(issues)} {','.join(details)}")
    return JSONResponse(
        content=error_body("VALIDATION_ERROR", "Check the request values.", request_id),
        status_code=422,
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    frames = [f"{Path(frame.f_code.co_filename).name}:{line}:{frame.f_code.co_name}"
              for frame, line in walk_tb(exc.__traceback__)] if exc.__traceback__ else []
    request_id = log_failure(request, 500, "INTERNAL_SERVER_ERROR",
                             f"exception={type(exc).__name__} frames={','.join(frames[-8:])}")
    return JSONResponse(
        content=error_body(
            "INTERNAL_SERVER_ERROR",
            "The server could not process the request.",
            request_id,
        ),
        status_code=500,
    )
