"""Schedule and authenticate Cloud Tasks callbacks for Realtime hangups."""
import hashlib
import json
import re
from base64 import b64encode
from datetime import datetime
from functools import lru_cache, partial

from fastapi import Depends, Header
from google.auth.exceptions import GoogleAuthError, TransportError
from google.auth.transport.requests import AuthorizedSession, Request
from google.oauth2 import id_token, service_account
from requests import RequestException

from .config import Settings, get_settings
from .errors import APIError

HANGUP_PATH = "/api/v1/internal/voice-hangup"
QUEUE_NAME = re.compile(r"projects/[\w-]+/locations/[\w-]+/queues/[\w-]+", re.ASCII)


@lru_cache(maxsize=1)
def task_credentials(service_account_json: str):
    return service_account.Credentials.from_service_account_info(
        json.loads(service_account_json),
        scopes=["https://www.googleapis.com/auth/cloud-platform"],
    )


def schedule_voice_hangup(
    settings: Settings, consultation_id: str, when: datetime, *, early: bool = False
) -> None:
    queue = settings.voice_tasks_queue
    credentials = settings.voice_tasks_credentials_json
    invoker = settings.voice_tasks_invoker_email
    origin = settings.backend_origin.rstrip("/")
    if not (
        queue and QUEUE_NAME.fullmatch(queue) and credentials and invoker and origin.startswith("https://")
    ):
        raise APIError(503, "VOICE_SCHEDULER_UNAVAILABLE", "The voice scheduler is not configured.")
    url = origin + HANGUP_PATH
    task_key = hashlib.sha256(f"{consultation_id}:{early}".encode()).hexdigest()
    headers = {"Content-Type": "application/json"}
    if settings.vercel_automation_bypass_secret:
        headers["x-vercel-protection-bypass"] = settings.vercel_automation_bypass_secret.get_secret_value()

    try:
        with AuthorizedSession(task_credentials(credentials.get_secret_value()), refresh_timeout=5) as client:
            response = client.post(
                f"https://cloudtasks.googleapis.com/v2/{queue}/tasks",
                json={"task": {
                    "name": f"{queue}/tasks/{task_key}",
                    "scheduleTime": when.isoformat(),
                    "httpRequest": {
                        "url": url,
                        "httpMethod": "POST",
                        "headers": headers,
                        "body": b64encode(json.dumps({"consultation_id": consultation_id}).encode()).decode(),
                        "oidcToken": {"serviceAccountEmail": invoker, "audience": url},
                    },
                }},
                timeout=5,
            )
            if 200 <= response.status_code < 300:
                return
            if response.status_code == 409 and response.json().get("error", {}).get("status") == "ALREADY_EXISTS":
                return
    except (GoogleAuthError, RequestException, ValueError) as exc:
        raise APIError(503, "VOICE_SCHEDULER_UNAVAILABLE", "Could not schedule the voice hangup.") from exc
    raise APIError(503, "VOICE_SCHEDULER_UNAVAILABLE", "Could not schedule the voice hangup.")


def authenticate_voice_task(
    authorization: str = Header(default=""),
    settings: Settings = Depends(get_settings),
) -> None:
    scheme, _, token = authorization.partition(" ")
    denied = APIError(401, "VOICE_TASK_UNAUTHORIZED", "A valid scheduler identity is required.")
    if scheme.lower() != "bearer" or not token or not settings.voice_tasks_invoker_email:
        raise denied
    try:
        claims = id_token.verify_oauth2_token(
            token,
            partial(Request(), timeout=5),
            audience=settings.backend_origin.rstrip("/") + HANGUP_PATH,
        )
    except TransportError as exc:
        raise APIError(503, "VOICE_TASK_AUTH_UNAVAILABLE", "Could not verify the scheduler identity.") from exc
    except (GoogleAuthError, ValueError) as exc:
        raise denied from exc
    if claims.get("email") != settings.voice_tasks_invoker_email or claims.get("email_verified") is not True:
        raise denied
