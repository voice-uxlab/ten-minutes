def create_consultation(client):
    response = client.post("/api/v1/consultations", json={"consent_version": "2026-11"})
    assert response.status_code == 201, response.text
    return response.json()


def select_cards(client, consultation_id):
    response = client.post(
        f"/api/v1/consultations/{consultation_id}/card-selection",
        headers={"Idempotency-Key": "selection-1"},
        json={
            "question": "연락 없는 그 사람을 기다릴까?",
            "spread_type": "RELATIONSHIP",
            "picks": [7, 22, 51],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_consultation_cards_are_fixed_and_revealed_in_order(authenticated_client):
    client, _ = authenticated_client
    consultation = create_consultation(client)
    selected = select_cards(client, consultation["id"])
    assert [card["position"] for card in selected["cards"]] == ["나", "상대", "관계 흐름"]
    assert all(card["revealed"] is False for card in selected["cards"])
    assert all(card["card_id"] is None for card in selected["cards"])
    assert all(card["name"] is None for card in selected["cards"])
    assert all(card["direction"] is None for card in selected["cards"])

    retry = client.post(
        f"/api/v1/consultations/{consultation['id']}/card-selection",
        headers={"Idempotency-Key": "selection-1"},
        json={
            "question": "연락 없는 그 사람을 기다릴까?",
            "spread_type": "RELATIONSHIP",
            "picks": [7, 22, 51],
        },
    )
    assert retry.status_code == 200
    assert retry.json()["cards"] == selected["cards"]

    out_of_order = client.post(f"/api/v1/consultations/{consultation['id']}/cards/2/reveal")
    assert out_of_order.status_code == 409
    assert out_of_order.json()["error"]["code"] == "PREVIOUS_CARD_NOT_REVEALED"

    for slot in range(1, 4):
        reveal = client.post(f"/api/v1/consultations/{consultation['id']}/cards/{slot}/reveal")
        assert reveal.status_code == 200
        assert reveal.json()["card"]["slot"] == slot
        assert reveal.json()["card"]["revealed"] is True
        assert reveal.json()["card"]["card_code"].startswith("card-")
        assert reveal.json()["card"]["name"]


def test_report_is_private_and_share_response_contains_only_hook(authenticated_client):
    client, _ = authenticated_client
    consultation = create_consultation(client)
    select_cards(client, consultation["id"])
    for slot in range(1, 4):
        client.post(f"/api/v1/consultations/{consultation['id']}/cards/{slot}/reveal")
    report_payload = {
        "situation_summary": "관계를 기다리기보다 내 기준을 세울 때야.",
        "readings": [
            {"slot": 1, "text": "내 마음을 먼저 살펴봐."},
            {"slot": 2, "text": "상대를 단정하지 마."},
            {"slot": 3, "text": "관계의 흐름은 행동으로 확인해."},
        ],
        "queen_line": "선택받으려고 애쓰지 마. 선택하는 건 너야.",
    }
    report = client.put(
        f"/api/v1/consultations/{consultation['id']}/report", json=report_payload
    )
    assert report.status_code == 201, report.text
    assert report.json()["consulted_at"]
    assert report.json()["spread_type"] == "RELATIONSHIP"
    assert report.json()["cards"][0]["reading"] == "내 마음을 먼저 살펴봐."

    consultation_list = client.get("/api/v1/consultations")
    assert consultation_list.status_code == 200
    assert consultation_list.json()["items"][0]["situation_summary"] == report_payload["situation_summary"]
    assert consultation_list.json()["items"][0]["thumbnail_image_url"] is None

    shared = client.post(
        f"/api/v1/consultations/{consultation['id']}/share-links",
        json={"hook_text": "이번 크리스마스 솔탈 확률은?"},
    )
    assert shared.status_code == 201, shared.text
    public = client.get(f"/api/v1/shares/{shared.json()['token']}")
    assert public.status_code == 200
    assert shared.json()["share_url"].endswith(shared.json()["share_path"])
    assert public.json()["preview"]["title"] == "이번 크리스마스 솔탈 확률은?"
    assert set(public.json()) == {
        "hook_text",
        "cta_text",
        "cta_path",
        "cta_url",
        "preview",
        "created_at",
    }
    serialized = public.text
    assert "연락 없는" not in serialized
    assert "선택받으려고" not in serialized


def test_other_user_cannot_read_consultation(authenticated_client, db_session):
    import hashlib
    from datetime import datetime, timedelta, timezone

    from app.config import get_settings
    from app.models import ServiceSession, User

    client, _ = authenticated_client
    consultation = create_consultation(client)
    other = User(addressing_mode="DEFAULT", consent_version="2026-11")
    db_session.add(other)
    db_session.flush()
    raw_token = "other-user-token"
    db_session.add(
        ServiceSession(
            user_id=other.id,
            token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        )
    )
    db_session.commit()
    client.cookies.set(get_settings().session_cookie_name, raw_token)
    response = client.get(f"/api/v1/consultations/{consultation['id']}")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "CONSULTATION_NOT_FOUND"


def test_report_requires_all_cards_and_event_is_idempotent(authenticated_client):
    client, _ = authenticated_client
    consultation = create_consultation(client)
    select_cards(client, consultation["id"])
    report_payload = {
        "situation_summary": "한 줄 요약",
        "readings": [
            {"slot": 1, "text": "첫 카드"},
            {"slot": 2, "text": "둘째 카드"},
            {"slot": 3, "text": "셋째 카드"},
        ],
        "queen_line": "언니의 한마디",
    }
    early_report = client.put(
        f"/api/v1/consultations/{consultation['id']}/report", json=report_payload
    )
    assert early_report.status_code == 409
    assert early_report.json()["error"]["code"] == "CARDS_NOT_FULLY_REVEALED"

    event_payload = {
        "event": "PAGE_HIDDEN",
        "occurred_at": "2026-11-17T10:00:00Z",
    }
    first = client.post(
        f"/api/v1/consultations/{consultation['id']}/events",
        headers={"Idempotency-Key": "page-hidden-1"},
        json=event_payload,
    )
    retry = client.post(
        f"/api/v1/consultations/{consultation['id']}/events",
        headers={"Idempotency-Key": "page-hidden-1"},
        json=event_payload,
    )
    assert first.status_code == 201
    assert retry.status_code == 200
    assert retry.json() == first.json()


def test_openai_login_provider_is_not_available(authenticated_client):
    client, _ = authenticated_client
    response = client.get("/auth/openai/authorize")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "AUTH_PROVIDER_NOT_FOUND"


def test_oauth_authorize_uses_backend_origin(db_session):
    from urllib.parse import parse_qs, urlparse

    from fastapi.testclient import TestClient

    from app.config import Settings, get_settings
    from app.main import app

    settings = Settings(
        backend_origin="http://localhost:8000/",
        public_web_origin="http://localhost:5173/",
        kakao_client_id="test-client-id",
        database_url="sqlite://",
        auto_create_schema=False,
    )
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app, follow_redirects=False) as client:
            response = client.get("/auth/kakao/authorize")
    finally:
        app.dependency_overrides.pop(get_settings, None)

    assert response.status_code == 302
    query = parse_qs(urlparse(response.headers["location"]).query)
    assert query["redirect_uri"] == ["http://localhost:8000/auth/kakao/callback"]


def test_current_user_response_and_custom_nickname(authenticated_client, db_session):
    from app.models import AuthIdentity

    client, user = authenticated_client
    db_session.add(
        AuthIdentity(user_id=user.id, provider="kakao", provider_user_id="kakao-test-user")
    )
    db_session.commit()

    current = client.get("/api/v1/users/me")
    assert current.status_code == 200
    assert current.json()["provider"] == "kakao"
    assert current.json()["nickname"] is None
    assert current.json()["created_at"]

    updated = client.patch(
        "/api/v1/users/me",
        json={
            "addressing_mode": "CUSTOM",
            "nickname": "  대장  ",
            "consent_version": "2026-11",
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["nickname"] == "대장"
    assert updated.json()["onboarding_required"] is False
    assert user.nickname == "대장"
