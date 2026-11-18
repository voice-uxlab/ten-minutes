from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api import public_router, router
from .auth import router as auth_router
from .config import get_settings
from .errors import APIError, api_error_handler, unhandled_error_handler, validation_error_handler


settings = get_settings()

tags_metadata = [
    {"name": "auth", "description": "Kakao and Naver OAuth login, session issuance, and logout"},
    {"name": "users", "description": "Current user profile and consultation display-name settings"},
    {"name": "consultations", "description": "Consultation creation, recovery, listing, and termination"},
    {"name": "cards", "description": "Server-side deck selection and sequential card reveal"},
    {"name": "voice", "description": "OpenAI Realtime credentials and Typecast audio streaming"},
    {"name": "reports", "description": "Private report creation and retrieval"},
    {"name": "shares", "description": "Public share previews without private report content"},
    {"name": "events", "description": "Client UX events for connection, playback, and page lifecycle"},
    {"name": "system", "description": "Service health checks"},
]


app = FastAPI(
    title="Ten Minutes API",
    version="0.1.0",
    description=(
        "API for voice-based tarot consultations, authentication, card selection, reports, and sharing. "
        "All endpoints except authentication require an HttpOnly service-session cookie. "
        "Each endpoint documents its success response and the error responses it may return."
    ),
    openapi_tags=tags_metadata,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.public_web_origin.rstrip("/")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Idempotency-Key"],
)
app.add_exception_handler(APIError, api_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(Exception, unhandled_error_handler)
app.mount(
    "/static/cards",
    StaticFiles(directory=Path(__file__).parent / "static" / "cards"),
    name="tarot-card-assets",
)


@app.middleware("http")
async def request_id(request: Request, call_next):
    request.state.request_id = request.headers.get("X-Request-Id", f"req_{uuid4().hex}")
    response = await call_next(request)
    response.headers["X-Request-Id"] = request.state.request_id
    return response


@app.get(
    "/health",
    tags=["system"],
    summary="Check service health",
    description="Checks whether the FastAPI process can accept requests without authentication or a database query.",
)
def health():
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(router)
app.include_router(public_router)
