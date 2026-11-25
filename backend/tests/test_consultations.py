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


def test_tarot_card_taxonomy_covers_the_full_deck():
    from collections import Counter

    from app.deck import (
        DECK,
        MINOR_RANKS,
        MINOR_SUITS,
        card_code,
        card_taxonomy,
    )

    taxonomy = [card_taxonomy(card_id) for card_id, *_ in DECK]
    codes = [card_code(card_id) for card_id, *_ in DECK]
    assert len(taxonomy) == 78
    assert len(set(codes)) == 78
    assert Counter(card.arcana for card in taxonomy) == {"MAJOR": 22, "MINOR": 56}
    assert Counter(card.suit for card in taxonomy if card.suit) == {
        suit: len(MINOR_RANKS) for suit in MINOR_SUITS
    }
    assert [(card.suit, card.rank) for card in taxonomy[22:]] == [
        (suit, rank) for suit in MINOR_SUITS for rank in MINOR_RANKS
    ]


def test_shuffled_deck_contains_only_card_ids(db_session):
    from app.api import shuffled_deck

    deck = shuffled_deck(db_session)

    assert len(deck) == 78
    assert all(set(card) == {"card_id"} for card in deck)
    assert len({card["card_id"] for card in deck}) == 78


def test_consultation_cards_are_fixed_and_revealed_in_order(authenticated_client):
    client, _ = authenticated_client
    consultation = create_consultation(client)
    selected = select_cards(client, consultation["id"])
    assert [card["position"] for card in selected["cards"]] == ["나", "상대", "관계 흐름"]
    assert all(card["revealed"] is False for card in selected["cards"])
    assert all(card["card_id"] is None for card in selected["cards"])
    assert all(card["name"] is None for card in selected["cards"])
    assert all(card["arcana"] is None for card in selected["cards"])
    assert all(card["suit"] is None for card in selected["cards"])
    assert all(card["rank"] is None for card in selected["cards"])
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
        assert not reveal.json()["card"]["card_code"].startswith("card-")
        assert reveal.json()["card"]["name"]
        assert reveal.json()["card"]["arcana"] in {"MAJOR", "MINOR"}
        if reveal.json()["card"]["arcana"] == "MAJOR":
            assert reveal.json()["card"]["suit"] is None
        else:
            assert reveal.json()["card"]["suit"] in {
                "WANDS",
                "CUPS",
                "SWORDS",
                "PENTACLES",
            }
        assert reveal.json()["card"]["rank"]
        assert reveal.json()["card"]["direction"] == "UPRIGHT"
        assert reveal.json()["card"]["keywords"]
        assert "image_url" not in reveal.json()["card"]


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
    assert consultation_list.json()["items"][0]["thumbnail_card_code"] == (
        report.json()["cards"][0]["card_code"]
    )

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
    assert response.json()["error"]["message"] == "The authentication provider is not supported."


def test_oauth_authorize_uses_backend_origin(db_session):
    from urllib.parse import parse_qs, urlparse

    from fastapi.testclient import TestClient

    from app.config import Settings, get_settings
    from app.main import app

    settings = Settings(
        backend_origin="http://localhost:8000/",
        public_web_origin="http://localhost:5173/",
        kakao_client_id="test-client-id",
        database_url="postgresql+psycopg://postgres:postgres@localhost:5432/ten_minutes_test",
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


def test_oauth_authorize_returns_503_when_provider_is_not_configured(db_session):
    from fastapi.testclient import TestClient

    from app.config import Settings, get_settings
    from app.main import app

    settings = Settings(
        naver_client_id=None,
        database_url="postgresql+psycopg://postgres:postgres@localhost:5432/ten_minutes_test",
    )
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app, follow_redirects=False) as client:
            response = client.get("/auth/naver/authorize")
    finally:
        app.dependency_overrides.pop(get_settings, None)

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AUTH_PROVIDER_NOT_CONFIGURED"


def test_oauth_authorize_redirects_to_frontend_when_database_fails(
    db_session, monkeypatch, caplog
):
    from fastapi.testclient import TestClient
    from sqlalchemy.exc import OperationalError

    from app.config import Settings, get_settings
    from app.main import app

    settings = Settings(
        public_web_origin="https://web.example.com/",
        naver_client_id="test-client-id",
        database_url="postgresql+psycopg://postgres:postgres@localhost:5432/ten_minutes_test",
    )

    def fail_commit():
        raise OperationalError("INSERT", {}, RuntimeError("database unavailable"))

    monkeypatch.setattr(db_session, "commit", fail_commit)
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app, follow_redirects=False) as client:
            response = client.get("/auth/naver/authorize")
    finally:
        app.dependency_overrides.pop(get_settings, None)

    assert response.status_code == 302
    assert response.headers["location"] == "https://web.example.com/login?auth_error=failed"
    assert "database_error_category=unclassified" in caplog.text
    assert "dbapi_exception_type=RuntimeError" in caplog.text


def test_database_operational_errors_are_classified_without_logging_details():
    from sqlalchemy.exc import OperationalError

    from app.auth import classify_database_operational_error

    cases = {
        "password authentication failed for user": "authentication_failed",
        "Tenant or user not found": "pooler_identity_invalid",
        "connection timed out": "connection_timeout",
        "connection refused": "connection_refused",
        "max client connections reached": "connection_limit",
    }
    for message, expected in cases.items():
        error = OperationalError("CONNECT", {}, RuntimeError(message))
        category, sqlstate, dbapi_exception_type = classify_database_operational_error(error)
        assert category == expected
        assert sqlstate is None
        assert dbapi_exception_type == "RuntimeError"


def test_logout_uses_cross_site_cookie_settings(authenticated_client):
    from app.config import Settings, get_settings
    from app.main import app

    client, _ = authenticated_client
    settings = Settings(
        session_cookie_secure=True,
        session_cookie_samesite="none",
        database_url="postgresql+psycopg://postgres:postgres@localhost:5432/ten_minutes_test",
    )
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        response = client.post("/api/v1/auth/logout")
    finally:
        app.dependency_overrides.pop(get_settings, None)

    assert response.status_code == 204
    set_cookie = response.headers["set-cookie"].lower()
    assert "samesite=none" in set_cookie
    assert "secure" in set_cookie
    assert "httponly" in set_cookie


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


def test_openapi_documents_parameters_response_fields_and_actual_errors():
    import re

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        schema = client.get("/openapi.json").json()

    selection = schema["paths"]["/api/v1/consultations/{consultation_id}/card-selection"]["post"]
    assert selection["summary"] == "Confirm card selection"
    assert set(selection["responses"]) >= {"201", "401", "404", "409", "422", "500"}
    assert "CARD_SELECTION_LOCKED" == selection["responses"]["409"]["content"][
        "application/json"
    ]["examples"]["selection_locked"]["value"]["error"]["code"]

    id_parameter = next(
        parameter for parameter in selection["parameters"] if parameter["name"] == "consultation_id"
    )
    idempotency_parameter = next(
        parameter for parameter in selection["parameters"] if parameter["name"] == "Idempotency-Key"
    )
    assert id_parameter["description"]
    assert idempotency_parameter["description"]

    get_me = schema["paths"]["/api/v1/users/me"]["get"]
    assert "409" not in get_me["responses"]
    assert "422" not in get_me["responses"]
    assert "500" in get_me["responses"]

    card_schema = schema["components"]["schemas"]["CardResponse"]
    assert "image_url" not in card_schema["properties"]
    assert set(card_schema["properties"]) >= {"arcana", "suit", "rank"}
    error_schema = schema["components"]["schemas"]["ErrorResponse"]
    assert error_schema["properties"]["error"]["description"]

    def openapi_text_values(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key in {"description", "summary", "message"} and isinstance(item, str):
                    yield item
                yield from openapi_text_values(item)
        elif isinstance(value, list):
            for item in value:
                yield from openapi_text_values(item)

    assert not [
        text for text in openapi_text_values(schema) if re.search(r"[가-힣]", text)
    ]


def test_unhandled_error_response_hides_internal_exception_details():
    import asyncio
    import json

    from starlette.requests import Request

    from app.errors import unhandled_error_handler

    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/example",
            "headers": [],
            "query_string": b"",
            "server": ("testserver", 80),
            "client": ("testclient", 50000),
            "scheme": "http",
        }
    )
    request.state.request_id = "req_test_500"
    response = asyncio.run(unhandled_error_handler(request, RuntimeError("database-password")))
    payload = json.loads(response.body)

    assert response.status_code == 500
    assert payload == {
        "error": {
            "code": "INTERNAL_SERVER_ERROR",
            "message": "The server could not process the request.",
            "request_id": "req_test_500",
        }
    }
    assert b"database-password" not in response.body


def test_voice_connection_and_typecast_limits(authenticated_client, db_session, monkeypatch):
    import json

    import httpx

    from app.config import get_settings
    from app.models import RealtimeCall
    from app.voice import TOOLS

    client, _ = authenticated_client
    settings = get_settings()
    for field, value in {
        "openai_api_key": "test-openai-key",
        "typecast_api_key": "test-typecast-key",
        "typecast_voice_id": "test-voice",
        "typecast_model": "ssfm-v30",
        "voice_connections_per_consultation": 2,
        "voice_connections_per_account_day": 2,
        "tts_characters_per_consultation": 10,
        "tts_characters_per_account_day": 12,
        "tts_parallel_requests": 1,
    }.items():
        monkeypatch.setattr(settings, field, value)
    calls = []
    tts = []
    def provider_response(self, url, **kwargs):
        calls.append((url, kwargs))
        if url.endswith("/hangup"):
            return httpx.Response(200)
        return httpx.Response(
            201, text="v=0\r\nanswer",
            headers={"Location": f"/v1/realtime/calls/rtc_test_{len(calls)}"},
        )

    async def tts_response(self, request, **kwargs):
        tts.append(json.loads(request.content))
        return httpx.Response(200, content=b"wav-test", headers={"content-type": "audio/wav"})

    monkeypatch.setattr(httpx.Client, "post", provider_response)
    # Only the voice provider uses HTTPX Client.post here, so use request() for TestClient POSTs.
    monkeypatch.setattr(httpx.AsyncClient, "send", tts_response)
    consultation = client.request("POST", "/api/v1/consultations", json={"consent_version": "2026-11"}).json()
    path = f"/api/v1/consultations/{consultation['id']}"
    offer = {"sdp": "v=0\r\noffer"}
    connection = f"{path}/realtime-connection"
    speech = {"text": "첫 인사", "response_id": "resp_test", "segment_index": 0}
    assert client.request("POST", f"{path}/tts/stream", json=speech).status_code == 409
    assert calls == []

    answer = client.request("POST", connection, json=offer)
    assert answer.status_code == 201 and answer.text == "v=0\r\nanswer"
    assert answer.headers["cache-control"] == "no-store"
    model_config = json.loads(calls[0][1]["files"]["session"][1])
    assert model_config["output_modalities"] == ["text"] and model_config["tools"] == TOOLS

    second = client.request("POST", "/api/v1/consultations", json={"consent_version": "2026-11"}).json()
    second_path = f"/api/v1/consultations/{second['id']}"
    assert client.request("POST", f"{second_path}/realtime-connection", json=offer).status_code == 409
    assert client.request("POST", connection, json=offer).status_code == 201
    assert calls[1][0].endswith("/rtc_test_1/hangup")
    assert client.get(path).json()["call_ends_at"] == consultation["call_ends_at"]
    assert client.request("POST", connection, json=offer).status_code == 429

    audio = client.request("POST", f"{path}/tts/stream", json=speech)
    assert audio.status_code == 200 and audio.content == b"wav-test"
    assert tts[0]["output"] == {"audio_format": "wav", "audio_tempo": 1.3, "audio_pitch": 0}
    assert client.request("POST", f"{path}/tts/stream", json=speech).status_code == 200
    assert client.request("POST", f"{path}/tts/stream", json=speech).status_code == 429
    assert len(tts) == 2

    ended = client.request("POST", f"{path}/end", json={"reason": "USER"})
    assert ended.status_code == 200
    db_session.expire_all()
    assert db_session.get(RealtimeCall, "rtc_test_3").closed_at is not None
    assert client.request("POST", connection, json=offer).status_code == 409


def test_deadline_caps_heartbeat_and_rejects_reconnect_but_allows_hangup_retry(authenticated_client, db_session, monkeypatch):
    from datetime import datetime, timedelta, timezone
    from unittest.mock import Mock

    import httpx

    from app.config import get_settings
    from app.models import Consultation, RealtimeCall

    client, _ = authenticated_client
    settings = get_settings()
    monkeypatch.setattr(settings, "app_env", "preview")
    monkeypatch.setattr(settings, "backend_origin", "https://preview.example.com")
    monkeypatch.setattr(settings, "openai_api_key", "test-key")
    monkeypatch.setattr(settings, "typecast_api_key", "test-key")
    monkeypatch.setattr(settings, "typecast_voice_id", "test-voice")
    provider = Mock(side_effect=[
        httpx.Response(
            201,
            text="v=0\r\nanswer",
            headers={"Location": "/v1/realtime/calls/rtc_local"},
        ),
        httpx.Response(502),
        httpx.Response(200),
    ])
    monkeypatch.setattr(httpx.Client, "post", provider)
    consultation = client.request(
        "POST", "/api/v1/consultations", json={"consent_version": "2026-11"},
    ).json()
    assert datetime.fromisoformat(consultation["call_ends_at"].replace("Z", "+00:00")) - datetime.fromisoformat(consultation["created_at"].replace("Z", "+00:00")) == timedelta(minutes=10)

    stored = db_session.get(Consultation, consultation["id"])
    stored.created_at = datetime.now(timezone.utc) - timedelta(minutes=9, seconds=10)
    db_session.commit()
    path = f"/api/v1/consultations/{stored.id}"
    assert client.request("POST", f"{path}/realtime-connection", json={"sdp": "v=0\r\noffer"}).status_code == 201
    from app.voice import connection_token
    assert client.request("POST", f"{path}/voice-heartbeat", json={"connection_token": connection_token("rtc_local")}).status_code == 204
    from app.models import ensure_utc
    assert ensure_utc(db_session.get(RealtimeCall, "rtc_local").hangup_at) == stored.call_ends_at
    stored.created_at -= timedelta(minutes=1)
    db_session.commit()
    assert client.request("POST", f"{path}/realtime-connection", json={"sdp": "v=0\r\noffer"}).status_code == 409
    assert client.request("POST", f"{path}/end", json={"reason": "USER"}).status_code == 503
    assert db_session.get(RealtimeCall, "rtc_local").closed_at is None
    assert client.request("POST", f"{path}/end", json={"reason": "USER"}).status_code == 200
    assert client.request("POST", f"{path}/end", json={"reason": "USER"}).status_code == 200
    assert provider.call_count == 3
    assert db_session.get(RealtimeCall, "rtc_local").closed_at is not None
    assert provider.call_args.args[0].endswith("/rtc_local/hangup")


def test_oauth_only_accepts_callback_from_login_browser(db_session, monkeypatch):
    from datetime import datetime, timedelta, timezone
    from urllib.parse import parse_qs, urlsplit

    from fastapi.testclient import TestClient
    from sqlalchemy import select
    from app import auth
    from app.config import get_settings
    from app.main import app
    from app.models import OAuthAttempt

    settings = get_settings()
    monkeypatch.setattr(settings, "kakao_client_id", "test-kakao")
    monkeypatch.setattr(settings, "naver_client_id", "test-naver")
    async def profile(provider, *args):
        return f"{provider}-test-account", None
    monkeypatch.setattr(auth, "exchange_profile", profile)
    with TestClient(app) as browser, TestClient(app) as other:
        for provider in ("kakao", "naver"):
            start = browser.get(f"/auth/{provider}/authorize", follow_redirects=False)
            state = parse_qs(urlsplit(start.headers["location"]).query)["state"][0]
            assert "HttpOnly" in start.headers["set-cookie"] and "SameSite=lax" in start.headers["set-cookie"]
            path = f"/auth/{provider}/callback"
            params = {"state": state, "code": "test-code"}
            assert other.get(path, params=params, follow_redirects=False).status_code == 400
            cookie_name = auth.oauth_cookie_name(provider, settings)
            binding = browser.cookies.get(cookie_name)
            assert browser.get(path, params=params, follow_redirects=False).status_code == 302
            assert browser.get("/api/v1/users/me").status_code == 200
            browser.cookies.set(cookie_name, binding)
            assert browser.get(path, params=params, follow_redirects=False).status_code == 400
            browser.cookies.delete(cookie_name)

            expired = browser.get(f"/auth/{provider}/authorize", follow_redirects=False)
            expired_state = parse_qs(urlsplit(expired.headers["location"]).query)["state"][0]
            attempt = db_session.scalar(select(OAuthAttempt).where(
                OAuthAttempt.state_hash == auth.token_hash(expired_state)
            ))
            attempt.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            db_session.commit()
            assert browser.get(path, params={**params, "state": expired_state},
                               follow_redirects=False).status_code == 400


def test_ended_call_can_save_and_retry_partial_or_empty_report(authenticated_client):
    client, _ = authenticated_client
    for revealed_slots in ([], [1]):
        consultation = create_consultation(client)
        path = f"/api/v1/consultations/{consultation['id']}"
        if revealed_slots:
            select_cards(client, consultation["id"])
            assert client.post(f"{path}/cards/1/reveal").status_code == 200
        assert client.post(f"{path}/end", json={"reason": "USER"}).status_code == 200
        if revealed_slots:
            assert client.post(f"{path}/cards/2/reveal").status_code == 409
        body = {
            "situation_summary": "상담을 일찍 마쳤어요.",
            "queen_line": "다음에 이야기해요.",
            "readings": [{"slot": slot, "text": "한 장 해석"} for slot in revealed_slots],
        }
        assert client.put(f"{path}/report", json=body).status_code == 201
        assert client.put(f"{path}/report", json=body).status_code == 200
        report = client.get(f"{path}/report").json()
        assert [card["slot"] for card in report["cards"]] == revealed_slots
        assert report["readings"] == body["readings"]


def test_voice_heartbeat_and_cleanup_leave_live_calls_open(authenticated_client, db_session, monkeypatch):
    from datetime import datetime, timedelta, timezone
    from unittest.mock import Mock

    import httpx
    from fastapi.testclient import TestClient
    from pydantic import SecretStr

    from app.config import get_settings
    from app.main import app
    from app.models import RealtimeCall

    client, _ = authenticated_client
    settings = get_settings()
    for key in ("openai_api_key", "typecast_api_key", "typecast_voice_id"):
        monkeypatch.setattr(settings, key, "test-provider")
    monkeypatch.setattr(settings, "voice_cleanup_secret", SecretStr("test-cleanup-secret"))
    provider = Mock(side_effect=[
        httpx.Response(201, text="v=0\r\nanswer", headers={"Location": "/v1/realtime/calls/rtc_heartbeat"}),
        httpx.Response(502),
        httpx.Response(200),
    ])
    monkeypatch.setattr(httpx.Client, "post", provider)
    consultation = client.request(
        "POST", "/api/v1/consultations", json={"consent_version": "2026-11"},
    ).json()
    path = f"/api/v1/consultations/{consultation['id']}"
    connection = client.request(
        "POST", path + "/realtime-connection",
        json={"sdp": "v=0\r\noffer"}, headers={"Origin": settings.public_web_origin},
    )
    assert connection.status_code == 201
    token = connection.headers["X-Voice-Connection"]
    assert len(token) == 64 and "rtc_heartbeat" not in token
    assert connection.headers["access-control-expose-headers"] == "X-Voice-Connection"
    with TestClient(app) as anonymous:
        assert anonymous.request("POST", path + "/voice-heartbeat", json={"connection_token": token}).status_code == 401
    assert client.request("POST", path + "/voice-heartbeat", json={"connection_token": "0" * 64}).status_code == 409

    call = db_session.get(RealtimeCall, "rtc_heartbeat")
    call.hangup_at = datetime.now(timezone.utc) + timedelta(seconds=5)
    soon = call.hangup_at.replace(tzinfo=None)
    db_session.commit()
    assert client.request("POST", path + "/voice-heartbeat", json={"connection_token": token}).status_code == 204
    db_session.refresh(call)
    assert call.hangup_at > soon

    cleanup = "/api/v1/internal/voice-cleanup"
    assert client.request("POST", cleanup).status_code == 401
    assert client.request("POST", cleanup, headers={"Authorization": "Bearer invalid"}).status_code == 401
    auth = {"Authorization": "Bearer test-cleanup-secret"}
    assert client.request("POST", cleanup, headers=auth).status_code == 204
    assert provider.call_count == 1

    call.hangup_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    assert client.request("POST", path + "/voice-heartbeat", json={"connection_token": token}).status_code == 409
    assert client.request("POST", cleanup, headers=auth).status_code == 503
    assert call.closed_at is None
    assert client.request("POST", cleanup, headers=auth).status_code == 204
    assert call.closed_at is not None
    assert client.request("POST", cleanup, headers=auth).status_code == 204
    assert provider.call_count == 3
