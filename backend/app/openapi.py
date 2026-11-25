from typing import Mapping, Optional

from .schemas import ErrorResponse


ERROR_DEFAULTS = {
    400: ("Bad Request", "BAD_REQUEST", "Check the request values."),
    401: ("Authentication Required", "AUTHENTICATION_REQUIRED", "Authentication is required."),
    404: ("Resource Not Found", "RESOURCE_NOT_FOUND", "The requested resource was not found."),
    409: ("State Conflict", "STATE_CONFLICT", "The request conflicts with the current resource state."),
    422: ("Validation Error", "VALIDATION_ERROR", "Check the request values."),
    429: ("Usage Limit", "USAGE_LIMIT", "The request exceeds the applicable usage limit."),
    500: ("Internal Server Error", "INTERNAL_SERVER_ERROR", "The server could not process the request."),
    502: ("Upstream Service Error", "UPSTREAM_SERVICE_ERROR", "The upstream service request failed."),
    503: ("Service Unavailable", "SERVICE_NOT_CONFIGURED", "The service is not ready."),
    504: ("Upstream Timeout", "UPSTREAM_TIMEOUT", "The upstream service timed out."),
}


def error_response(
    status_code: int,
    *,
    description: Optional[str] = None,
    examples: Optional[Mapping[str, tuple[str, str]]] = None,
) -> dict:
    default_description, default_code, default_message = ERROR_DEFAULTS[status_code]
    values = examples or {"default": (default_code, default_message)}
    return {
        "model": ErrorResponse,
        "description": description or default_description,
        "content": {
            "application/json": {
                "examples": {
                    name: {
                        "summary": code,
                        "value": {
                            "error": {
                                "code": code,
                                "message": message,
                                "request_id": "req_7f42d2b5f0e34cf8a7e47419b14f1980",
                            }
                        },
                    }
                    for name, (code, message) in values.items()
                }
            }
        },
    }


AUTHENTICATED_RESPONSES = {
    401: error_response(401),
    500: error_response(500),
}

PUBLIC_RESPONSES = {
    500: error_response(500),
}
