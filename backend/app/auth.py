import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Path, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
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
    "naver": {
        "authorize": "https://nid.naver.com/oauth2.0/authorize",
        "token": "https://nid.naver.com/oauth2.0/token",
        "profile": "https://openapi.naver.com/v1/nid/me",
    },
}


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def frontend_auth_error_url(settings: Settings) -> str:
    return f"{settings.public_web_origin.rstrip('/')}/login?auth_error=failed"


def provider_credentials(provider: str, settings: Settings) -> tuple[str, Optional[str]]:
    if provider == "kakao":
        client_id, client_secret = settings.kakao_client_id, settings.kakao_client_secret
    elif provider == "naver":
        client_id, client_secret = settings.naver_client_id, settings.naver_client_secret
    else:
        raise APIError(404, "AUTH_PROVIDER_NOT_FOUND", "The authentication provider is not supported.")
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


def current_user(user: Optional[User] = Depends(current_user_optional)) -> User:
    if not user:
        raise APIError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.")
    return user


@router.get(
    "/auth/{provider}/authorize",
    status_code=302,
    summary="Start social login",
    description=(
        "Stores a single-use OAuth `state` value and redirects to the Kakao or Naver authorization page. "
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
    provider: str = Path(description="OAuth provider: `kakao` or `naver`", examples=["kakao"]),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    if provider not in PROVIDERS:
        raise APIError(404, "AUTH_PROVIDER_NOT_FOUND", "The authentication provider is not supported.")
    try:
        client_id, _ = provider_credentials(provider, settings)
        raw_state = secrets.token_urlsafe(32)
        db.add(
            OAuthAttempt(
                provider=provider,
                state_hash=token_hash(raw_state),
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
        return RedirectResponse(
            f"{PROVIDERS[provider]['authorize']}?{urlencode(params)}", status_code=302
        )
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
        logger.error(
            "OAuth authorization start failed request_id=%s provider=%s exception_type=%s",
            request_id,
            provider,
            type(exc).__name__,
        )
        return RedirectResponse(frontend_auth_error_url(settings), status_code=302)


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
            raise APIError(502, "OAUTH_TOKEN_EXCHANGE_FAILED", "Failed to exchange the OAuth authorization code.")
        access_token = token_response.json().get("access_token")
        if not access_token:
            raise APIError(502, "OAUTH_INVALID_RESPONSE", "The OAuth provider returned an invalid response.")
        profile_response = await client.get(
            PROVIDERS[provider]["profile"], headers={"Authorization": f"Bearer {access_token}"}
        )
        if not profile_response.is_success:
            raise APIError(502, "OAUTH_PROFILE_FAILED", "Failed to retrieve the OAuth user profile.")
        payload = profile_response.json()
    if provider == "kakao":
        provider_user_id = str(payload.get("id", ""))
        nickname = (
            payload.get("kakao_account", {}).get("profile", {}).get("nickname")
            or payload.get("properties", {}).get("nickname")
        )
    else:
        provider_user_id = str(payload.get("response", {}).get("id", ""))
        nickname = payload.get("response", {}).get("nickname")
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
    provider: str = Path(description="OAuth provider: `kakao` or `naver`", examples=["kakao"]),
    state: str = Query(description="Single-use CSRF protection value issued when login started"),
    code: Optional[str] = Query(default=None, description="Authorization code issued by the OAuth provider"),
    error: Optional[str] = Query(default=None, description="Error code returned when the user cancels or the provider rejects the request"),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    client_id, client_secret = provider_credentials(provider, settings)
    attempt = db.scalar(select(OAuthAttempt).where(OAuthAttempt.state_hash == token_hash(state)))
    if (
        not attempt
        or attempt.provider != provider
        or attempt.consumed_at is not None
        or aware(attempt.expires_at) <= datetime.now(timezone.utc)
    ):
        raise APIError(400, "OAUTH_STATE_INVALID", "The OAuth state is invalid or has expired.")
    attempt.consumed_at = datetime.now(timezone.utc)
    db.commit()
    if error or not code:
        return RedirectResponse(
            f"{settings.public_web_origin.rstrip('/')}?auth_error=cancelled",
            status_code=302,
        )
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
    response = RedirectResponse(settings.public_web_origin.rstrip("/"), status_code=302)
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
