"""Authentication uses disposable identity state and mocked identity/provider transports."""

import asyncio
import json
import sqlite3
import ssl
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from urllib.error import URLError
from urllib.parse import parse_qs, urlsplit

import httpx
import jwt
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import Response
from fastapi.testclient import TestClient

from research_scout.api import create_app
from research_scout.auth import (
    FLOW_COOKIE,
    FORGOT_MESSAGE,
    GOOGLE_KEYS,
    INTERNAL_HEADER,
    SESSION_COOKIE,
    AuthError,
    AuthMiddleware,
    AuthService,
    AuthStore,
    GoogleVerifier,
    csrf_token,
    password_hash,
    password_matches,
    token_hash,
)
from research_scout.core import Core, Settings
from research_scout.settings import AuthSettings, child_environment

ORIGIN = "http://localhost:3100"
PASSWORD = "A long fixture passphrase 2026"
NEW_PASSWORD = "A different fixture passphrase 2026"
INTERNAL = "fixture-internal-capability-" + "a" * 32


@pytest.fixture
def auth_api(tmp_path):
    attempts, credentials, clock = [], {}, [time.time()]

    async def offline(request):
        attempts.append(str(request.url))
        raise httpx.ConnectError("No provider request admitted by auth tests")

    settings = AuthSettings(
        enabled=True,
        db_path=tmp_path / "identity" / "auth.sqlite3",
        outbox_dir=tmp_path / "outbox",
        internal_token=INTERNAL,
        frontend_origins=(ORIGIN,),
        public_url=ORIGIN,
        google_client_id="scout-client.test",
    )

    def verify(credential):
        if credential not in credentials:
            raise AuthError("Google sign-in is invalid or expired.", 401)
        value = credentials[credential]
        return value() if callable(value) else value

    provider_client = httpx.AsyncClient(transport=httpx.MockTransport(offline))
    app = create_app(
        Settings(state_dir=tmp_path / "research"),
        core_factory=lambda config: Core(config, client=provider_client),
        auth_settings=settings,
        auth_clock=lambda: clock[0],
        google_verifier=verify,
    )
    with TestClient(app) as client:
        yield SimpleNamespace(
            app=app,
            client=client,
            settings=settings,
            store=app.state.auth.store,
            attempts=attempts,
            credentials=credentials,
            clock=clock,
        )
    asyncio.run(provider_client.aclose())


def config(case):
    response = case.client.get("/api/auth/config")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    return response.json()


def post(case, endpoint, body=None, *, form=None, origin=ORIGIN):
    form = form or config(case)
    return case.client.post(
        "/api/auth/" + endpoint,
        json=body or {},
        headers={"Origin": origin, "X-CSRF-Token": form["csrf_token"]},
    )


def setup(case):
    response = post(
        case,
        "setup",
        {
            "username": "Owner",
            "email": "owner@example.com",
            "password": PASSWORD,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def google(case, *, subject="google-owner", email="owner@gmail.com", claim_nonce=None):
    form = config(case)
    credential = "signed-test-credential-" + str(len(case.credentials))
    case.credentials[credential] = {
        "sub": subject,
        "email": email,
        "email_verified": True,
        "nonce": claim_nonce or form["google_nonce"],
    }
    return post(
        case, "google", {"credential": credential, "nonce": form["google_nonce"]}, form=form
    )


def test_public_configuration_and_session_do_not_expose_owner_or_cache(auth_api):
    case = auth_api
    value = config(case)
    assert set(value) == {
        "enabled",
        "setup_required",
        "google_client_id",
        "csrf_token",
        "google_nonce",
        "reset_delivery",
    }
    assert value["enabled"] and value["setup_required"]
    assert value["reset_delivery"] == "local_outbox"
    assert len(value["csrf_token"]) == 64
    assert case.client.get("/api/auth/session").json() == {
        "enabled": True,
        "authenticated": False,
        "user": None,
    }
    assert case.client.get("/api/auth/session").headers["cache-control"] == "no-store"
    cookie = case.client.cookies.get(FLOW_COOKIE)
    assert cookie and cookie not in json.dumps(value)
    assert case.attempts == []


@pytest.mark.parametrize(
    "path",
    [
        "/api/config",
        "/api/research-runs",
        "/api/projects",
        "/api/economics",
        "/api/admin/economics",
        "/api/dataset-searches",
        "/api/repository-searches",
        "/api/research-runs/missing/events",
        "/api/research-runs/missing/snapshot",
    ],
)
def test_direct_core_reads_require_session(auth_api, path):
    response = auth_api.client.get(path)
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}
    assert auth_api.attempts == []


def test_setup_session_rotation_logout_and_password_login(auth_api):
    case = auth_api
    before = config(case)
    result = setup(case)
    assert result["user"] == {
        "id": "owner",
        "username": "Owner",
        "email": "owner@example.com",
        "google_linked": False,
    }
    token = case.client.cookies.get(SESSION_COOKIE)
    assert result["csrf_token"] != before["csrf_token"]
    assert result["csrf_token"] == csrf_token(token)
    assert case.client.get("/api/research-runs").status_code == 200
    with sqlite3.connect(case.settings.db_path) as db:
        stored = db.execute("SELECT token_hash FROM auth_sessions").fetchone()[0]
        digest = db.execute("SELECT password_hash FROM auth_users").fetchone()[0]
    assert stored == token_hash(token) and token != stored
    assert digest.startswith("scrypt$v1$32768$8$3$") and PASSWORD not in digest
    response = post(case, "logout")
    assert response.status_code == 200 and response.json()["ok"]
    assert case.client.cookies.get(SESSION_COOKIE) is None
    assert case.store.session(token) is None
    assert case.client.get("/api/economics").status_code == 401
    login = post(case, "login", {"identifier": "OWNER@EXAMPLE.COM", "password": PASSWORD})
    assert login.status_code == 200
    assert case.client.cookies.get(SESSION_COOKIE) != token
    assert case.attempts == []


def test_password_salts_and_fixed_verification_cost():
    one, two = password_hash(PASSWORD), password_hash(PASSWORD)
    assert one != two
    assert password_matches(PASSWORD, one)
    assert not password_matches("incorrect", one)
    assert not password_matches(PASSWORD, None)
    assert not password_matches(PASSWORD, "scrypt$untrusted$malformed")


def test_owner_setup_is_atomic_and_cannot_replace_existing_workspace_owner(tmp_path):
    store = AuthStore(
        AuthSettings(enabled=True, db_path=tmp_path / "auth.db", internal_token=INTERNAL)
    )
    digest = password_hash(PASSWORD)

    def attempt(username):
        try:
            return store.setup(username, username + "@example.com", digest)["username"]
        except AuthError as error:
            return error.status

    with ThreadPoolExecutor(max_workers=2) as pool:
        values = list(pool.map(attempt, ["first", "second"]))
    assert sum(value == 409 for value in values) == 1
    assert store.owner()["username"] in {"first", "second"}


def test_second_setup_does_not_change_credentials(auth_api):
    setup(auth_api)
    before = dict(auth_api.store.owner())
    assert (
        post(
            auth_api,
            "setup",
            {
                "username": "attacker",
                "email": "different@example.com",
                "password": NEW_PASSWORD,
            },
        ).status_code
        == 409
    )
    assert dict(auth_api.store.owner()) == before


@pytest.mark.parametrize(
    "origin,token", [("https://attacker.example", "good"), ("", "good"), (ORIGIN, "wrong")]
)
def test_authentication_requires_both_origin_and_cookie_bound_csrf(auth_api, origin, token):
    form = config(auth_api)
    response = auth_api.client.post(
        "/api/auth/setup",
        json={
            "username": "owner",
            "email": "owner@example.com",
            "password": PASSWORD,
        },
        headers={
            "Origin": origin,
            "X-CSRF-Token": form["csrf_token"] if token == "good" else "f" * 64,
        },
    )
    assert response.status_code == 403
    assert auth_api.store.owner() is None


def test_anonymous_csrf_cannot_mutate_authenticated_api(auth_api):
    anonymous = config(auth_api)
    setup(auth_api)
    response = auth_api.client.post(
        "/api/economics/reset",
        json={},
        headers={
            "Origin": ORIGIN,
            "X-CSRF-Token": anonymous["csrf_token"],
        },
    )
    assert response.status_code == 403
    # A valid session/CSRF reaches the real endpoint's normal validation.
    form = config(auth_api)
    assert (
        auth_api.client.post(
            "/api/economics/reset",
            json={},
            headers={
                "Origin": ORIGIN,
                "X-CSRF-Token": form["csrf_token"],
            },
        ).status_code
        == 422
    )


def test_session_and_anonymous_flow_expire(auth_api):
    old = config(auth_api)
    auth_api.clock[0] += auth_api.settings.flow_seconds + 1
    assert (
        post(auth_api, "login", {"identifier": "owner", "password": PASSWORD}, form=old).status_code
        == 403
    )
    setup(auth_api)
    auth_api.clock[0] += auth_api.settings.session_seconds + 1
    assert auth_api.client.get("/api/auth/session").json()["authenticated"] is False
    assert auth_api.client.get("/api/economics").status_code == 401


def test_forgot_is_generic_outbox_is_private_and_reset_revokes_every_session(auth_api):
    case = auth_api
    setup(case)
    old = case.client.cookies.get(SESSION_COOKIE)
    second = case.store.new_session(case.store.owner())
    missing = post(case, "forgot-password", {"identifier": "unknown@example.com"})
    known = post(case, "forgot-password", {"identifier": "owner"})
    assert missing.json() == known.json() == {"ok": True, "message": FORGOT_MESSAGE}
    files = list(case.settings.outbox_dir.glob("*.json"))
    assert len(files) == 1 and files[0].stat().st_mode & 0o777 == 0o600
    mail = json.loads(files[0].read_text())
    assert mail["to"] == "owner@example.com"
    assert mail["reset_url"].startswith(ORIGIN + "/reset-password?")
    token = parse_qs(urlsplit(mail["reset_url"]).query)["token"][0]
    assert token not in known.text and "reset_url" not in known.text
    with sqlite3.connect(case.settings.db_path) as db:
        assert db.execute("SELECT token_hash FROM auth_resets").fetchone()[0] == token_hash(token)
    case.client.cookies.clear()
    assert (
        post(case, "reset-password", {"token": token, "password": NEW_PASSWORD}).status_code == 200
    )
    assert case.store.session(old) is None and case.store.session(second) is None
    assert post(case, "reset-password", {"token": token, "password": PASSWORD}).status_code == 400
    assert post(case, "login", {"identifier": "owner", "password": PASSWORD}).status_code == 401
    assert post(case, "login", {"identifier": "owner", "password": NEW_PASSWORD}).status_code == 200
    assert case.client.get("/api/auth/outbox").status_code == 404
    assert case.attempts == []


def test_new_reset_invalidates_old_and_expired_links_fail(auth_api):
    setup(auth_api)
    one = auth_api.store.reset_request("owner")
    two = auth_api.store.reset_request("owner")
    digest = password_hash(NEW_PASSWORD)
    with pytest.raises(AuthError):
        auth_api.store.reset_password(one["token"], digest)
    auth_api.clock[0] += auth_api.settings.reset_seconds + 1
    with pytest.raises(AuthError):
        auth_api.store.reset_password(two["token"], digest)


def test_credentials_are_not_echoed_by_validation_and_chunked_body_is_bounded(auth_api):
    form = config(auth_api)
    secret = "never-echo-this-password"
    response = auth_api.client.post(
        "/api/auth/login",
        json={"identifier": "owner", "password": secret, "unexpected": secret},
        headers={"Origin": ORIGIN, "X-CSRF-Token": form["csrf_token"]},
    )
    assert response.status_code == 422 and secret not in response.text

    def chunks():
        yield b'{"identifier":"owner","password":"'
        yield b"a" * 9000
        yield b"b" * 9000
        yield b'"}'

    response = auth_api.client.post(
        "/api/auth/login",
        content=chunks(),
        headers={
            "Origin": ORIGIN,
            "X-CSRF-Token": form["csrf_token"],
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 413
    assert auth_api.store.owner() is None


def test_login_rate_limit_applies_to_unknown_accounts(auth_api):
    for _ in range(10):
        assert (
            post(auth_api, "login", {"identifier": "missing", "password": PASSWORD}).status_code
            == 401
        )
    assert (
        post(auth_api, "login", {"identifier": "missing", "password": PASSWORD}).status_code == 429
    )
    auth_api.clock[0] += 901
    assert (
        post(auth_api, "login", {"identifier": "missing", "password": PASSWORD}).status_code == 401
    )


def test_google_first_setup_stable_subject_and_no_email_merging(auth_api):
    case = auth_api
    first = google(case)
    assert first.status_code == 200 and first.json()["user"]["google_linked"]
    post(case, "logout")
    assert google(case, subject="intruder", email="owner@gmail.com").status_code == 403
    # A Google subject is stable even when the provider changes its email.
    assert google(case, email="changed@gmail.com").status_code == 200
    assert case.store.owner()["email"] == "owner@gmail.com"


def test_unknown_google_requires_explicit_authenticated_owner_link(auth_api):
    case = auth_api
    setup(case)
    post(case, "logout")
    response = google(case, email="owner@example.com")
    assert response.status_code == 403 and "then link Google" in response.json()["detail"]
    assert case.store.owner()["google_sub"] is None
    assert post(case, "login", {"identifier": "owner", "password": PASSWORD}).status_code == 200
    assert google(case, email="other@gmail.com").status_code == 200
    assert case.store.owner()["email"] == "owner@example.com"
    post(case, "logout")
    assert google(case, email="other@gmail.com").status_code == 200


@pytest.mark.parametrize("change", ["logout", "reset"])
def test_google_link_revalidates_session_after_slow_verifier(auth_api, change):
    case = auth_api
    setup(case)
    old_session = case.client.cookies.get(SESSION_COOKIE)
    form = config(case)

    def verifier_hook():
        if change == "logout":
            case.store.revoke(old_session)
        else:
            reset = case.store.reset_request("owner")
            case.store.reset_password(reset["token"], password_hash(NEW_PASSWORD))
        return {"sub": "attacker-link", "email": "owner@gmail.com", "nonce": form["google_nonce"]}

    case.credentials["racing-token"] = verifier_hook
    result = post(
        case, "google", {"credential": "racing-token", "nonce": form["google_nonce"]}, form=form
    )
    assert result.status_code == 401
    assert case.store.owner()["google_sub"] is None
    assert case.store.session(old_session) is None
    assert case.client.get("/api/auth/session").json()["authenticated"] is False
    with sqlite3.connect(case.settings.db_path) as db:
        assert (
            db.execute("SELECT count(*) FROM auth_sessions WHERE revoked_at IS NULL").fetchone()[0]
            == 0
        )


def test_google_bootstrap_restricts_non_authoritative_email(auth_api):
    assert google(auth_api, email="thirdparty@example.com").status_code == 403
    assert auth_api.store.owner() is None
    auth_api.settings.owner_email = "approved@example.com"
    assert google(auth_api, email="wrong@gmail.com").status_code == 403
    assert google(auth_api, email="approved@example.com").status_code == 200


def test_google_nonce_is_bound_expiring_and_single_use(auth_api):
    case = auth_api
    form = config(case)
    flow = case.client.cookies.get(FLOW_COOKIE)
    case.credentials["valid"] = {
        "sub": "first",
        "email": "owner@gmail.com",
        "nonce": form["google_nonce"],
    }
    body = {"credential": "valid", "nonce": form["google_nonce"]}
    assert post(case, "google", body, form=form).status_code == 200
    case.client.cookies.clear()
    case.client.cookies.set(FLOW_COOKIE, flow)
    assert post(case, "google", body, form=form).status_code == 403
    fresh = config(case)
    case.credentials["wrong-nonce"] = {
        "sub": "first",
        "email": "owner@gmail.com",
        "nonce": "different",
    }
    assert (
        post(
            case,
            "google",
            {"credential": "wrong-nonce", "nonce": fresh["google_nonce"]},
            form=fresh,
        ).status_code
        == 403
    )
    expiring = config(case)
    case.clock[0] += case.settings.flow_seconds + 1
    assert post(case, "google", body, form=expiring).status_code == 403


@pytest.fixture(scope="module")
def rsa_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.mark.parametrize(
    "changes",
    [
        {"aud": "another-client"},
        {"iss": "https://attacker.example"},
        {"exp": 1},
        {"email_verified": False},
        {"email_verified": "true"},
        {"sub": ""},
        {"nonce": None},
        {"azp": "different-client"},
        {"email": 12},
        {"aud": ["scout-client.test", "other"]},
        {"exp": None},
        {"iss": None},
        {"nonce": 123},
        {"sub": 123},
        {"iat": int(time.time()) + 3600},
    ],
)
def test_google_real_rs256_claim_validation_never_uses_live_identity(rsa_key, monkeypatch, changes):
    verifier = GoogleVerifier("scout-client.test")
    assert verifier.keys.uri == GOOGLE_KEYS
    monkeypatch.setattr(
        verifier.keys,
        "get_signing_key_from_jwt",
        lambda _: SimpleNamespace(key=rsa_key.public_key()),
    )
    claims = {
        "sub": "stable-subject",
        "aud": "scout-client.test",
        "iss": "https://accounts.google.com",
        "iat": int(time.time()),
        "exp": int(time.time()) + 300,
        "nonce": "issued-nonce",
        "email": "owner@gmail.com",
        "email_verified": True,
        **changes,
    }
    if claims.get("iss") is None:
        # PyJWT also rejects non-string issuers at encoding; exercise missing
        # issuer validation with a correctly signed token instead.
        claims.pop("iss")
    credential = jwt.encode(claims, rsa_key, algorithm="RS256", headers={"kid": "test-key"})
    with pytest.raises(AuthError) as error:
        verifier(credential)
    assert error.value.status == 401


def test_google_valid_signature_and_algorithm_pin(rsa_key, monkeypatch):
    verifier = GoogleVerifier("scout-client.test")
    lookups = []

    def key(token):
        lookups.append(token)
        return SimpleNamespace(key=rsa_key.public_key())

    monkeypatch.setattr(verifier.keys, "get_signing_key_from_jwt", key)
    claims = {
        "sub": "stable",
        "aud": "scout-client.test",
        "iss": "accounts.google.com",
        "iat": int(time.time()),
        "exp": int(time.time()) + 300,
        "nonce": "issued",
        "email": "owner@gmail.com",
        "email_verified": True,
    }
    good = jwt.encode(claims, rsa_key, algorithm="RS256", headers={"kid": "local-key"})
    assert verifier(good)["sub"] == "stable"
    wrong_signature = jwt.encode(
        claims,
        rsa.generate_private_key(public_exponent=65537, key_size=2048),
        algorithm="RS256",
        headers={"kid": "local-key"},
    )
    with pytest.raises(AuthError):
        verifier(wrong_signature)
    bad = jwt.encode(
        claims,
        "untrusted-secret-" + "a" * 32,
        algorithm="HS256",
        headers={"kid": "evil", "jku": "https://attacker.example/keys"},
    )
    with pytest.raises(AuthError):
        verifier(bad)
    assert lookups == [good, wrong_signature]


def test_google_key_trust_exists_without_platform_certificate_files(tmp_path, monkeypatch):
    monkeypatch.setenv("SSL_CERT_FILE", str(tmp_path / "missing.pem"))
    monkeypatch.setenv("SSL_CERT_DIR", str(tmp_path / "missing-certs"))
    context = GoogleVerifier("scout-client.test").keys.ssl_context
    assert context is not None
    assert context.cert_store_stats()["x509_ca"] > 0
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True


def test_google_key_trust_rejects_untrusted_tls_certificate(tmp_path, rsa_key):
    # Exercise a real TLS handshake in memory, without an external request or socket.
    name = x509.Name([x509.NameAttribute(x509.NameOID.COMMON_NAME, "www.googleapis.com")])
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(rsa_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(UTC) - timedelta(minutes=1))
        .not_valid_after(datetime.now(UTC) + timedelta(days=1))
        .add_extension(x509.SubjectAlternativeName([x509.DNSName("www.googleapis.com")]), False)
        .sign(rsa_key, hashes.SHA256())
    )
    cert_path, key_path = tmp_path / "cert.pem", tmp_path / "key.pem"
    cert_path.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(
        rsa_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    server_context.load_cert_chain(cert_path, key_path)
    client_in, client_out, server_in, server_out = (ssl.MemoryBIO() for _ in range(4))
    client = GoogleVerifier("scout-client.test").keys.ssl_context.wrap_bio(
        client_in, client_out, server_hostname="www.googleapis.com"
    )
    server = server_context.wrap_bio(server_in, server_out, server_side=True)
    with pytest.raises(ssl.SSLCertVerificationError):
        for _ in range(20):
            for peer in (client, server):
                try:
                    peer.do_handshake()
                except ssl.SSLWantReadError:
                    pass
            if data := client_out.read():
                server_in.write(data)
            if data := server_out.read():
                client_in.write(data)
        pytest.fail("Untrusted signing-key server certificate was not rejected.")


def test_google_key_failure_is_private_and_fresh_flow_can_recover(
    auth_api, rsa_key, monkeypatch, caplog
):
    case = auth_api
    verifier = GoogleVerifier(case.settings.google_client_id)
    case.app.state.auth.google_verifier = verifier
    attempts = []

    def signing_key(credential):
        attempts.append(credential)
        if len(attempts) == 1:
            try:
                raise URLError(ssl.SSLCertVerificationError(1, "private transport diagnostic"))
            except URLError as cause:
                raise jwt.PyJWKClientConnectionError("private transport diagnostic") from cause
        return SimpleNamespace(key=rsa_key.public_key())

    monkeypatch.setattr(verifier.keys, "get_signing_key_from_jwt", signing_key)

    def submit(form):
        credential = jwt.encode(
            {
                "sub": "fixture-google-owner",
                "aud": case.settings.google_client_id,
                "iss": "https://accounts.google.com",
                "iat": int(time.time()),
                "exp": int(time.time()) + 300,
                "nonce": form["google_nonce"],
                "email": "owner@gmail.com",
                "email_verified": True,
            },
            rsa_key,
            algorithm="RS256",
            headers={"kid": "fixture-key"},
        )
        return post(
            case, "google", {"credential": credential, "nonce": form["google_nonce"]}, form=form
        )

    with caplog.at_level("WARNING", logger="research_scout.auth"):
        failed = submit(config(case))
    assert failed.status_code == 503
    assert failed.json() == {"detail": "Google sign-in is temporarily unavailable."}
    assert case.store.owner() is None
    assert "SSLCertVerificationError" in caplog.text
    assert "private transport diagnostic" not in caplog.text + failed.text
    assert attempts[0] not in caplog.text + failed.text

    # The failed nonce is consumed; a new browser config/flow permits an explicit retry.
    recovered = submit(config(case))
    assert recovered.status_code == 200
    assert recovered.json()["user"]["google_linked"] is True
    assert case.client.get("/api/auth/session").json()["authenticated"] is True
    assert len(attempts) == 2
    assert not case.attempts


def test_mcp_requires_server_only_key_and_browser_cookies_do_not_bypass(auth_api):
    case = auth_api
    setup(case)
    assert case.client.get("/mcp/").status_code == 401
    assert case.client.get("/mcp/", headers={INTERNAL_HEADER: "incorrect"}).status_code == 401
    assert (
        case.client.get("/mcp/", headers={INTERNAL_HEADER: INTERNAL, "Origin": ORIGIN}).status_code
        == 403
    )
    response = case.client.post(
        "/mcp/",
        headers={
            INTERNAL_HEADER: INTERNAL,
            "Accept": "application/json, text/event-stream",
            "Host": "127.0.0.1:8100",
        },
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "auth-test", "version": "1"},
            },
        },
    )
    assert response.status_code == 200
    assert "serverInfo" in response.json()["result"]
    assert case.attempts == []


def test_auth_credentials_are_core_only_and_cookie_flags_are_explicit(tmp_path):
    environment = {
        "SCOUT_AUTH_ENABLED": "true",
        "SCOUT_AUTH_INTERNAL_TOKEN": INTERNAL,
        "SCOUT_AUTH_SMTP_PASSWORD": "smtp-test-secret",
        "SCOUT_API_URL": "http://127.0.0.1:8100",
    }
    assert child_environment("core", environment)["SCOUT_AUTH_INTERNAL_TOKEN"] == INTERNAL
    for service in ["frontend", "openalex", "github", "hugging_face", "youtube", "datacite"]:
        assert not any(
            key.startswith("SCOUT_AUTH_") for key in child_environment(service, environment)
        )
    settings = AuthSettings(
        enabled=True, db_path=tmp_path / "auth.db", internal_token=INTERNAL, cookie_secure=True
    )
    response = Response()
    AuthService(settings).set_cookie(response, SESSION_COOKIE, "opaque", 300)
    cookie = response.headers["set-cookie"].lower()
    assert all(part in cookie for part in ["httponly", "samesite=lax", "secure", "path=/"])
    assert "domain=" not in cookie
    assert INTERNAL not in repr(settings)
    assert not settings.db_path.exists()


def test_remote_origins_cannot_use_insecure_cookies_or_local_outbox(tmp_path):
    base = {
        "enabled": True,
        "db_path": tmp_path / "auth.db",
        "internal_token": INTERNAL,
        "frontend_origins": ("https://scout.example",),
        "public_url": "https://scout.example",
    }
    with pytest.raises(ValueError, match="Secure cookies"):
        AuthSettings(**base)
    with pytest.raises(ValueError, match="localhost"):
        AuthSettings(**base, cookie_secure=True)


def test_auth_disabled_fixture_behavior_has_no_identity_database(tmp_path):
    identity = tmp_path / "never-created-auth.db"
    settings = Settings(state_dir=tmp_path / "fixture")
    app = create_app(settings, auth_settings=AuthSettings(db_path=identity))
    with TestClient(app) as client:
        assert client.get("/api/auth/config").json()["enabled"] is False
        assert client.get("/api/research-runs").status_code == 200
    assert not identity.exists()


def test_revocation_closes_an_already_open_protected_event_stream(tmp_path):
    service = AuthService(
        AuthSettings(enabled=True, db_path=tmp_path / "auth.db", internal_token=INTERNAL)
    )
    service.start()
    user = service.store.setup("owner", "owner@example.com", password_hash(PASSWORD))
    token = service.store.new_session(user)
    messages, closed = [], []

    async def downstream(scope, receive, send):
        try:
            await send(
                {
                    "type": "http.response.start",
                    "status": 200,
                    "headers": [(b"content-type", b"text/event-stream")],
                }
            )
            await send(
                {"type": "http.response.body", "body": b"data: allowed\n\n", "more_body": True}
            )
            service.store.revoke(token)
            await send(
                {
                    "type": "http.response.body",
                    "body": b"data: revoked-secret\n\n",
                    "more_body": True,
                }
            )
        finally:
            closed.append(True)

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/events",
        "headers": [(b"cookie", (SESSION_COOKIE + "=" + token).encode())],
        "query_string": b"",
        "server": ("localhost", 8100),
        "client": ("127.0.0.1", 1),
        "scheme": "http",
    }
    asyncio.run(AuthMiddleware(downstream, service)(scope, receive, send))
    bodies = b"".join(message.get("body", b"") for message in messages)
    assert b"allowed" in bodies and b"revoked-secret" not in bodies
    assert messages[-1]["more_body"] is False and closed == [True]


@pytest.mark.asyncio
async def test_all_three_real_mcp_transports_receive_internal_header(monkeypatch):
    from research_scout.agents.datasets import call_dataset_mcp
    from research_scout.agents.repos import call_repository_mcp
    from research_scout.agents.runtime import call_application_mcp

    class StopBeforeNetwork(Exception):
        pass

    seen = []

    class Client:
        def __init__(self, **kwargs):
            seen.append(kwargs)

        async def __aenter__(self):
            raise StopBeforeNetwork()

        async def __aexit__(self, *args):
            pass

    monkeypatch.setenv("SCOUT_AUTH_INTERNAL_TOKEN", INTERNAL)
    monkeypatch.setattr(httpx, "AsyncClient", Client)
    calls = [
        lambda: call_application_mcp(url="http://127.0.0.1:8100/mcp/", run_id="test"),
        lambda: call_dataset_mcp("http://127.0.0.1:8100/mcp/", "test", "datacite"),
        lambda: call_repository_mcp("http://127.0.0.1:8100/mcp/", "test", "github"),
    ]
    for call in calls:
        with pytest.raises(StopBeforeNetwork):
            await call()
    assert len(seen) == 3
    assert all(
        row["headers"] == {INTERNAL_HEADER: INTERNAL} and row["trust_env"] is False for row in seen
    )
