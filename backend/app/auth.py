import hashlib
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Path, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .database import get_db
from .errors import APIError
from .models import AuthIdentity, OAuthAttempt, ServiceSession, User
from .openapi import PUBLIC_RESPONSES, error_response


router = APIRouter(tags=["auth"], responses=PUBLIC_RESPONSES)
logger = logging.getLogger(__name__)

PROVIDERS = {
    "kakao": {
        "authorize": "https://kauth.kakao.com/oauth/authorize",
        "token": "https://kauth.kakao.com/oauth/token",
        "profile": "https://kapi.kakao.com/v2/user/me",
    },
}


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def oauth_cookie_name(provider: str, settings: Settings) -> str:
    prefix = "__Host-" if settings.session_cookie_secure else ""
    return f"{prefix}ten_minutes_oauth_{provider}"


def aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def frontend_auth_error_url(settings: Settings, request_id: str) -> str:
    params = {"auth_error": "failed"}
    if re.fullmatch(r"req_[a-f0-9]{32}", request_id):
        params["auth_request_id"] = request_id
    return f"{settings.public_web_origin.rstrip('/')}/login?{urlencode(params)}"


def classify_database_operational_error(exc: OperationalError) -> tuple[str, Optional[str], str]:
    """Return log-safe metadata without recording connection strings or credentials."""
    original = getattr(exc, "orig", None)
    message = str(original or exc).lower()
    patterns = (
        (("password authentication failed", "authentication failed"), "authentication_failed"),
        (("tenant or user not found",), "pooler_identity_invalid"),
        (("could not translate host name", "name or service not known"), "dns_resolution_failed"),
        (("connection refused",), "connection_refused"),
        (("timeout", "timed out"), "connection_timeout"),
        (("max client connections", "too many connections"), "connection_limit"),
        (("server closed the connection", "connection is closed"), "connection_closed"),
    )
    category = "unclassified"
    for fragments, candidate in patterns:
        if any(fragment in message for fragment in fragments):
            category = candidate
            break
    sqlstate = getattr(original, "sqlstate", None)
    return category, sqlstate, type(original).__name__ if original else "unknown"


def provider_credentials(provider: str, settings: Settings) -> tuple[str, Optional[str]]:
    if provider not in PROVIDERS:
        raise APIError(404, "AUTH_PROVIDER_NOT_FOUND", "The authentication provider is not supported.")
    client_id, client_secret = settings.kakao_client_id, settings.kakao_client_secret
    if not client_id:
        raise APIError(503, "AUTH_PROVIDER_NOT_CONFIGURED", "The authentication provider is not configured.")
    return client_id, client_secret


def current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Optional[User]:
    raw = request.cookies.get(settings.session_cookie_name)
    if not raw:
        return None
    service_session = db.scalar(
        select(ServiceSession).where(ServiceSession.token_hash == token_hash(raw))
    )
    if (
        not service_session
        or service_session.revoked_at is not None
        or aware(service_session.expires_at) <= datetime.now(timezone.utc)
    ):
        return None
    return db.get(User, service_session.user_id)


def current_user(
    request: Request,
    user: Optional[User] = Depends(current_user_optional),
    settings: Settings = Depends(get_settings),
) -> User:
    if not user:
        support_code = None
        if request.method == "GET" and request.url.path == "/api/v1/users/me":
            support_code = "LGN-004" if settings.session_cookie_name in request.cookies else "LGN-003"
        raise APIError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.", support_code=support_code)
    return user


@router.get(
    "/auth/{provider}/authorize",
    status_code=302,
    summary="Start social login",
    description=(
        "Stores a single-use OAuth `state` value and redirects to the Kakao authorization page. "
        "If login initialization fails, redirects to the frontend login page with `auth_error=failed`."
    ),
    responses={
        302: {
            "description": (
                "Redirects to the provider authorization page, or to the frontend login page when "
                "initialization fails"
            )
        },
        404: error_response(
            404,
            examples={"provider_not_found": ("AUTH_PROVIDER_NOT_FOUND", "The authentication provider is not supported.")},
        ),
        503: error_response(
            503,
            examples={
                "provider_not_configured": (
                    "AUTH_PROVIDER_NOT_CONFIGURED",
                    "The authentication provider is not configured.",
                )
            },
        ),
    },
)
def authorize(
    request: Request,
    provider: str = Path(description="OAuth provider: `kakao`", examples=["kakao"]),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    if provider not in PROVIDERS:
        raise APIError(404, "AUTH_PROVIDER_NOT_FOUND", "The authentication provider is not supported.")
    try:
        client_id, _ = provider_credentials(provider, settings)
        raw_state = secrets.token_urlsafe(32)
        binding = secrets.token_urlsafe(32)
        db.add(
            OAuthAttempt(
                provider=provider,
                state_hash=token_hash(raw_state),
                browser_binding_hash=token_hash(binding),
                expires_at=datetime.now(timezone.utc)
                + timedelta(seconds=settings.oauth_state_ttl_seconds),
            )
        )
        db.commit()
        redirect_uri = f"{settings.backend_origin.rstrip('/')}/auth/{provider}/callback"
        params = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "state": raw_state,
        }
        response = RedirectResponse(
            f"{PROVIDERS[provider]['authorize']}?{urlencode(params)}", status_code=302
        )
        response.set_cookie(
            oauth_cookie_name(provider, settings),
            binding,
            max_age=settings.oauth_state_ttl_seconds,
            secure=settings.session_cookie_secure,
            httponly=True,
            samesite="lax",
            path="/",
        )
        response.headers["Cache-Control"] = "no-store"
        return response
    except APIError:
        raise
    except Exception as exc:
        request_id = getattr(request.state, "request_id", "unknown")
        try:
            db.rollback()
        except Exception as rollback_exc:
            logger.error(
                "OAuth authorization rollback failed request_id=%s provider=%s exception_type=%s",
                request_id,
                provider,
                type(rollback_exc).__name__,
            )
        if isinstance(exc, OperationalError):
            category, sqlstate, dbapi_exception_type = classify_database_operational_error(exc)
            logger.error(
                "OAuth authorization start failed request_id=%s provider=%s exception_type=%s "
                "database_error_category=%s sqlstate=%s dbapi_exception_type=%s",
                request_id,
                provider,
                type(exc).__name__,
                category,
                sqlstate or "none",
                dbapi_exception_type,
            )
        else:
            logger.error(
                "OAuth authorization start failed request_id=%s provider=%s exception_type=%s",
                request_id,
                provider,
                type(exc).__name__,
            )
        return RedirectResponse(
            frontend_auth_error_url(settings, request_id), status_code=302,
            headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
        )


async def exchange_profile(
    provider: str, code: str, redirect_uri: str, client_id: str, client_secret: Optional[str]
) -> tuple[str, Optional[str]]:
    token_data = {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code": code,
    }
    if client_secret:
        token_data["client_secret"] = client_secret
    async with httpx.AsyncClient(timeout=15) as client:
        token_response = await client.post(PROVIDERS[provider]["token"], data=token_data)
        if not token_response.is_success:
            raise APIError(502, "OAUTH_TOKEN_EXCHANGE_FAILED", "Failed to exchange the OAuth authorization code.", upstream_status=token_response.status_code)
        access_token = token_response.json().get("access_token")
        if not access_token:
            raise APIError(502, "OAUTH_INVALID_RESPONSE", "The OAuth provider returned an invalid response.")
        profile_response = await client.get(
            PROVIDERS[provider]["profile"], headers={"Authorization": f"Bearer {access_token}"}
        )
        if not profile_response.is_success:
            raise APIError(502, "OAUTH_PROFILE_FAILED", "Failed to retrieve the OAuth user profile.", upstream_status=profile_response.status_code)
        payload = profile_response.json()
    provider_user_id = str(payload.get("id", ""))
    nickname = (
        payload.get("kakao_account", {}).get("profile", {}).get("nickname")
        or payload.get("properties", {}).get("nickname")
    )
    if not provider_user_id:
        raise APIError(502, "OAUTH_INVALID_PROFILE", "The OAuth profile does not contain a user identifier.")
    return provider_user_id, nickname


@router.get(
    "/auth/{provider}/callback",
    status_code=302,
    summary="Handle social login callback",
    description="Exchanges the authorization code for a provider profile, issues a service-session cookie, and redirects to the frontend.",
    responses={
        302: {"description": "Redirects to `PUBLIC_WEB_ORIGIN` after success or user cancellation"},
        400: error_response(
            400,
            examples={"invalid_state": ("OAUTH_STATE_INVALID", "The OAuth state is invalid or has expired.")},
        ),
        404: error_response(
            404,
            examples={"provider_not_found": ("AUTH_PROVIDER_NOT_FOUND", "The authentication provider is not supported.")},
        ),
        422: error_response(422),
        502: error_response(
            502,
            examples={
                "token_exchange_failed": ("OAUTH_TOKEN_EXCHANGE_FAILED", "Failed to exchange the OAuth authorization code."),
                "profile_failed": ("OAUTH_PROFILE_FAILED", "Failed to retrieve the OAuth user profile."),
            },
        ),
        503: error_response(
            503,
            examples={"provider_not_configured": ("AUTH_PROVIDER_NOT_CONFIGURED", "The authentication provider is not configured.")},
        ),
    },
)
async def callback(
    request: Request,
    provider: str = Path(description="OAuth provider: `kakao`", examples=["kakao"]),
    state: str = Query(description="Single-use CSRF protection value issued when login started"),
    code: Optional[str] = Query(default=None, description="Authorization code issued by the OAuth provider"),
    error: Optional[str] = Query(default=None, description="Error code returned when the user cancels or the provider rejects the request"),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    client_id, client_secret = provider_credentials(provider, settings)
    cookie_name = oauth_cookie_name(provider, settings)
    binding = request.cookies.get(cookie_name)
    now = datetime.now(timezone.utc)
    if not binding:
        logger.warning("OAuth attempt cookie missing request_id=%r", request.state.request_id)
        raise APIError(400, "OAUTH_STATE_INVALID", "The OAuth state is invalid or has expired.")
    if db.scalar(
        update(OAuthAttempt)
        .where(
            OAuthAttempt.state_hash == token_hash(state),
            OAuthAttempt.browser_binding_hash == token_hash(binding),
            OAuthAttempt.provider == provider,
            OAuthAttempt.consumed_at.is_(None),
            OAuthAttempt.expires_at > now,
        )
        .values(consumed_at=now)
        .returning(OAuthAttempt.id)
    ) is None:
        raise APIError(400, "OAUTH_STATE_INVALID", "The OAuth state is invalid or has expired.")
    db.commit()
    response = RedirectResponse(
        f"{settings.public_web_origin.rstrip('/')}?auth_error=cancelled"
        if error or not code else f"{settings.public_web_origin.rstrip('/')}/?auth_callback=session_issued",
        status_code=302,
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )
    response.delete_cookie(
        cookie_name, path="/", secure=settings.session_cookie_secure, httponly=True, samesite="lax"
    )
    if error or not code:
        return response
    redirect_uri = f"{settings.backend_origin.rstrip('/')}/auth/{provider}/callback"
    # Provider nickname is intentionally not used as the consultation nickname.
    # The user chooses that value explicitly during service onboarding.
    provider_user_id, _provider_nickname = await exchange_profile(
        provider, code, redirect_uri, client_id, client_secret
    )
    identity = db.scalar(
        select(AuthIdentity).where(
            AuthIdentity.provider == provider, AuthIdentity.provider_user_id == provider_user_id
        )
    )
    if identity:
        user = db.get(User, identity.user_id)
    else:
        user = User(addressing_mode="DEFAULT", nickname=None)
        db.add(user)
        db.flush()
        db.add(AuthIdentity(user_id=user.id, provider=provider, provider_user_id=provider_user_id))
    raw_session = secrets.token_urlsafe(48)
    db.add(
        ServiceSession(
            user_id=user.id,
            token_hash=token_hash(raw_session),
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.session_ttl_days),
        )
    )
    db.commit()
    response.set_cookie(
        settings.session_cookie_name,
        raw_session,
        max_age=settings.session_ttl_days * 86400,
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite=settings.session_cookie_samesite,
        path="/",
    )
    return response


@router.post(
    "/api/v1/auth/logout",
    status_code=204,
    summary="Log out",
    description="Revokes the current service session and deletes the browser session cookie. Returns 204 even when no cookie is present.",
    responses={204: {"description": "Logout completed with no response body"}},
)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    raw = request.cookies.get(settings.session_cookie_name)
    if raw:
        service_session = db.scalar(
            select(ServiceSession).where(ServiceSession.token_hash == token_hash(raw))
        )
        if service_session and service_session.revoked_at is None:
            service_session.revoked_at = datetime.now(timezone.utc)
            db.commit()
    response.delete_cookie(
        settings.session_cookie_name,
        path="/",
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite=settings.session_cookie_samesite,
    )
    response.status_code = 204
    return response
