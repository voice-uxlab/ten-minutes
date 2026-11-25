import json
from base64 import b64decode
from datetime import datetime, timezone
from unittest.mock import MagicMock, Mock

import pytest

from app.config import Settings
from app.errors import APIError
from app.voice_tasks import HANGUP_PATH, schedule_voice_hangup


def test_scheduled_task_payload_and_deduplication(monkeypatch):
    settings = Settings(
        backend_origin="https://backend.example.com/",
        voice_tasks_queue="projects/test/locations/us-central1/queues/hangup",
        voice_tasks_credentials_json="test-credentials",
        voice_tasks_invoker_email="hangup@example.iam.gserviceaccount.com",
        vercel_automation_bypass_secret="test-bypass",
    )
    monkeypatch.setattr("app.voice_tasks.task_credentials", Mock())
    authorized_session = MagicMock()
    post = authorized_session.return_value.__enter__.return_value.post
    post.side_effect = [
        Mock(status_code=200),
        Mock(status_code=409, **{"json.return_value": {"error": {"status": "ALREADY_EXISTS"}}}),
        Mock(status_code=200),
        Mock(status_code=403),
    ]
    monkeypatch.setattr("app.voice_tasks.AuthorizedSession", authorized_session)
    deadline = datetime(2026, 11, 25, 10, 0, tzinfo=timezone.utc)
    schedule_voice_hangup(settings, "consultation-1", deadline)
    schedule_voice_hangup(settings, "consultation-1", deadline)
    schedule_voice_hangup(settings, "consultation-1", deadline, early=True)
    with pytest.raises(APIError) as error:
        schedule_voice_hangup(settings, "consultation-2", deadline)
    assert error.value.code == "VOICE_SCHEDULER_UNAVAILABLE"
    first, duplicate, early, _ = [call.kwargs["json"]["task"] for call in post.call_args_list]
    assert first == duplicate and early["name"] != first["name"]
    target = first["httpRequest"]
    assert first["scheduleTime"] == deadline.isoformat()
    assert target["url"] == "https://backend.example.com" + HANGUP_PATH
    assert target["oidcToken"] == {
        "serviceAccountEmail": settings.voice_tasks_invoker_email,
        "audience": target["url"],
    }
    assert target["headers"]["x-vercel-protection-bypass"] == "test-bypass"
    assert json.loads(b64decode(target["body"])) == {"consultation_id": "consultation-1"}
