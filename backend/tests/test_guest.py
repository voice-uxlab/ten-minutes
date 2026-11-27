from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.models import Consultation


def test_guest_pass_without_cookies(db_session, monkeypatch):
    monkeypatch.setattr(get_settings(), "guest_sessions_per_day", 2)
    with TestClient(app) as client:
        def issue():
            response = client.post("/api/v1/auth/guest")
            assert response.status_code == 200
            assert response.headers["cache-control"] == "no-store"
            return {"Authorization": "Bearer " + response.json()["token"]}

        guest = issue()
        path = "/api/v1/consultations"
        consent = {"consent_version": "2026-11"}
        assert client.get("/api/v1/users/me", headers=guest).json()["onboarding_required"]
        assert client.post(path, headers=guest, json=consent).status_code == 409
        response = client.patch("/api/v1/users/me", headers=guest, json={
            **consent, "addressing_mode": "DEFAULT", "nickname": None,
        })
        assert response.status_code == 200
        original = client.post(path, headers=guest, json=consent).json()
        assert datetime.fromisoformat(original["call_ends_at"].replace("Z", "+00:00")) - datetime.fromisoformat(original["created_at"].replace("Z", "+00:00")) == timedelta(minutes=10)
        assert client.post(path, headers=guest, json=consent).json()["id"] == original["id"]
        assert client.post("/api/v1/auth/guest", headers=guest).json() == {"token": None}
        another = issue()
        assert client.get(f"{path}/{original['id']}", headers=another).status_code == 404
        assert client.post("/api/v1/auth/guest").status_code == 429
        session = db_session.get(Consultation, original["id"])
        session.created_at -= timedelta(minutes=11)
        db_session.commit()
        assert client.post(path, headers=guest, json=consent).json()["error"]["code"] == "GUEST_PASS_USED"
        assert client.post("/api/v1/auth/logout", headers=guest).status_code == 204
        assert client.get("/api/v1/users/me", headers=guest).status_code == 401
