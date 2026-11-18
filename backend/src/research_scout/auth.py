"""One workspace owner, opaque revocable sessions and explicit identity linking.

Authentication state never shares a database with research or model accounting.
Google's browser callback supplies an ID token, not an authorization code or secret.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import time
from collections.abc import Callable
from contextlib import contextmanager
from email.message import EmailMessage
from urllib.parse import urlencode

import certifi
import jwt
from fastapi import APIRouter, BackgroundTasks, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.responses import JSONResponse

from .settings import AuthSettings

SESSION_COOKIE = "scout_session"
FLOW_COOKIE = "scout_auth_flow"
INTERNAL_HEADER = "X-Scout-Internal-Token"
GOOGLE_KEYS = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")
FORGOT_MESSAGE = "If this account exists, password reset instructions have been sent."
LINK_MESSAGE = "Sign in with your password, then link Google from Account."


class AuthError(Exception):
    def __init__(self, detail: str, status: int = 400):
        super().__init__(detail)
        self.status = status


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def csrf_token(value: str) -> str:
    return hmac.new(value.encode(), b"research-scout/csrf/v1", hashlib.sha256).hexdigest()


def password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=32768, r=8, p=3, dklen=32, maxmem=64 * 1024 * 1024
    )
    return f"scrypt$v1$32768$8$3${salt.hex()}${digest.hex()}"


def password_matches(password: str, stored: str | None) -> bool:
    # Unknown identifiers and Google-only accounts still perform the same KDF.
    salt, expected = bytes(16), bytes(32)
    valid = False
    if stored:
        try:
            kind, version, n, r, p, salt_hex, digest_hex = stored.split("$")
            salt, expected = bytes.fromhex(salt_hex), bytes.fromhex(digest_hex)
            valid = (
                kind == "scrypt"
                and version == "v1"
                and (n, r, p) == ("32768", "8", "3")
                and len(salt) == 16
                and len(expected) == 32
            )
        except (ValueError, TypeError):
            pass
    if not valid:
        salt, expected = bytes(16), bytes(32)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=32768, r=8, p=3, dklen=32, maxmem=64 * 1024 * 1024
    )
    return hmac.compare_digest(digest, expected) and valid


def email_address(value: str) -> str:
    value = value.strip().casefold()
    if len(value) > 254 or not re.fullmatch(
        r"[^\s@\x00-\x1f]+@[^\s@\x00-\x1f]+\.[^\s@\x00-\x1f]+", value
    ):
        raise AuthError("Enter a valid email address.")
    return value


def public_user(row) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "email": row["email"],
        "google_linked": bool(row["google_sub"]),
    }


def internal_mcp_headers() -> dict[str, str]:
    """Only core processes receive this setting; it is never a browser credential."""
    value = os.environ.get("SCOUT_AUTH_INTERNAL_TOKEN", "")
    return {INTERNAL_HEADER: value} if value else {}


class AuthStore:
    def __init__(self, settings: AuthSettings, *, clock: Callable[[], float] = time.time):
        self.settings, self.clock = settings, clock
        path = settings.db_path
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.is_symlink():
            raise ValueError("Authentication database must not be a symbolic link.")
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            pass
        else:
            os.close(fd)
        os.chmod(path, 0o600)
        with self.connection() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS auth_users (
                    id TEXT PRIMARY KEY CHECK(id = 'owner'),
                    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
                    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
                    password_hash TEXT,
                    google_sub TEXT UNIQUE,
                    credential_version INTEGER NOT NULL DEFAULT 1,
                    created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS auth_sessions (
                    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES auth_users(id),
                    credential_version INTEGER NOT NULL, expires_at REAL NOT NULL,
                    revoked_at REAL, created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS auth_flows (
                    token_hash TEXT PRIMARY KEY, session_binding TEXT NOT NULL,
                    nonce_hash TEXT NOT NULL, nonce_used_at REAL, expires_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS auth_resets (
                    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES auth_users(id),
                    expires_at REAL NOT NULL, used_at REAL
                );
                CREATE TABLE IF NOT EXISTS auth_limits (
                    bucket TEXT PRIMARY KEY, started_at REAL NOT NULL, attempts INTEGER NOT NULL
                );
            """)

    @contextmanager
    def connection(self, *, write=False):
        db = sqlite3.connect(self.settings.db_path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            if write:
                db.execute("BEGIN IMMEDIATE")
            yield db
            if write:
                db.commit()
        except BaseException:
            if write:
                db.rollback()
            raise
        finally:
            db.close()

    def owner(self):
        with self.connection() as db:
            return db.execute("SELECT * FROM auth_users WHERE id='owner'").fetchone()

    def setup(self, username: str, email: str, digest: str | None, google_sub=None):
        with self.connection(write=True) as db:
            if db.execute("SELECT 1 FROM auth_users").fetchone():
                raise AuthError("The workspace owner has already been created.", 409)
            db.execute(
                "INSERT INTO auth_users(id,username,email,password_hash,google_sub,created_at) "
                "VALUES('owner',?,?,?,?,?)",
                (username, email, digest, google_sub, self.clock()),
            )
            return db.execute("SELECT * FROM auth_users WHERE id='owner'").fetchone()

    def session(self, token: str):
        if not token or len(token) > 256:
            return None
        with self.connection() as db:
            return db.execute(
                "SELECT u.* FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id "
                "WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? "
                "AND s.credential_version=u.credential_version",
                (token_hash(token), self.clock()),
            ).fetchone()

    def new_session(self, user, previous=""):
        token, now = secrets.token_urlsafe(32), self.clock()
        with self.connection(write=True) as db:
            current = db.execute("SELECT * FROM auth_users WHERE id=?", (user["id"],)).fetchone()
            if current["credential_version"] != user["credential_version"]:
                raise AuthError("Authentication changed. Sign in again.", 401)
            if previous:
                db.execute(
                    "UPDATE auth_sessions SET revoked_at=? WHERE token_hash=?",
                    (now, token_hash(previous)),
                )
            db.execute("DELETE FROM auth_sessions WHERE expires_at<=?", (now,))
            db.execute(
                "INSERT INTO auth_sessions VALUES(?,?,?,?,NULL,?)",
                (
                    token_hash(token),
                    user["id"],
                    user["credential_version"],
                    now + self.settings.session_seconds,
                    now,
                ),
            )
        return token

    def revoke(self, token):
        with self.connection(write=True) as db:
            db.execute(
                "UPDATE auth_sessions SET revoked_at=? WHERE token_hash=?",
                (self.clock(), token_hash(token)),
            )

    def new_flow(self, previous: str, binding: str):
        now, nonce = self.clock(), secrets.token_urlsafe(32)
        with self.connection(write=True) as db:
            row = (
                db.execute(
                    "SELECT * FROM auth_flows WHERE token_hash=? AND expires_at>? AND session_binding=?",
                    (token_hash(previous), now, binding),
                ).fetchone()
                if previous
                else None
            )
            token = previous if row else secrets.token_urlsafe(32)
            db.execute("DELETE FROM auth_flows WHERE expires_at<=?", (now,))
            db.execute(
                "INSERT OR REPLACE INTO auth_flows VALUES(?,?,?,NULL,?)",
                (token_hash(token), binding, token_hash(nonce), now + self.settings.flow_seconds),
            )
        return token, nonce

    def valid_flow(self, token, binding=""):
        if not token or len(token) > 256:
            return False
        with self.connection() as db:
            return bool(
                db.execute(
                    "SELECT 1 FROM auth_flows WHERE token_hash=? AND session_binding=? AND expires_at>?",
                    (token_hash(token), binding, self.clock()),
                ).fetchone()
            )

    def consume_nonce(self, flow, binding, nonce):
        with self.connection(write=True) as db:
            updated = db.execute(
                "UPDATE auth_flows SET nonce_used_at=? WHERE token_hash=? AND session_binding=? "
                "AND nonce_hash=? AND nonce_used_at IS NULL AND expires_at>?",
                (self.clock(), token_hash(flow), binding, token_hash(nonce), self.clock()),
            ).rowcount
        if updated != 1:
            raise AuthError("Sign-in request expired. Refresh and try again.", 403)

    def rate_limit(self, scope, key, *, limit=10, window=900):
        bucket, now = token_hash(f"{scope}:{key}"), self.clock()
        with self.connection(write=True) as db:
            row = db.execute("SELECT * FROM auth_limits WHERE bucket=?", (bucket,)).fetchone()
            if row and row["started_at"] + window > now:
                if row["attempts"] >= limit:
                    raise AuthError("Too many attempts. Try again later.", 429)
                db.execute("UPDATE auth_limits SET attempts=attempts+1 WHERE bucket=?", (bucket,))
            else:
                db.execute("INSERT OR REPLACE INTO auth_limits VALUES(?,?,1)", (bucket, now))
            db.execute("DELETE FROM auth_limits WHERE started_at<?", (now - 86400,))

    def reset_request(self, identifier):
        user = self.owner()
        if not user or identifier.casefold().strip() not in {
            user["username"].casefold(),
            user["email"],
        }:
            return None
        token, now = secrets.token_urlsafe(32), self.clock()
        with self.connection(write=True) as db:
            db.execute("DELETE FROM auth_resets WHERE user_id=?", (user["id"],))
            db.execute(
                "INSERT INTO auth_resets VALUES(?,?,?,NULL)",
                (token_hash(token), user["id"], now + self.settings.reset_seconds),
            )
        return {
            "email": user["email"],
            "token": token,
            "expires_at": now + self.settings.reset_seconds,
        }

    def reset_password(self, token, digest):
        now = self.clock()
        with self.connection(write=True) as db:
            row = db.execute(
                "SELECT * FROM auth_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
                (token_hash(token), now),
            ).fetchone()
            if not row:
                raise AuthError("Reset link is invalid or expired.")
            db.execute("UPDATE auth_resets SET used_at=? WHERE user_id=?", (now, row["user_id"]))
            db.execute(
                "UPDATE auth_users SET password_hash=?,credential_version=credential_version+1 WHERE id=?",
                (digest, row["user_id"]),
            )
            db.execute(
                "UPDATE auth_sessions SET revoked_at=? WHERE user_id=?", (now, row["user_id"])
            )

    def link_google(self, subject, initiating_session):
        with self.connection(write=True) as db:
            active = db.execute(
                "SELECT 1 FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id "
                "WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? "
                "AND s.credential_version=u.credential_version",
                (token_hash(initiating_session), self.clock()),
            ).fetchone()
            if not active:
                raise AuthError("Authentication changed. Sign in again.", 401)
            row = db.execute("SELECT * FROM auth_users WHERE id='owner'").fetchone()
            if not row or (row["google_sub"] and row["google_sub"] != subject):
                raise AuthError("This workspace is already linked to another Google account.", 409)
            db.execute("UPDATE auth_users SET google_sub=? WHERE id='owner'", (subject,))
            return db.execute("SELECT * FROM auth_users WHERE id='owner'").fetchone()


class GoogleVerifier:
    def __init__(self, client_id):
        self.client_id = client_id
        # Python framework installs can lack their default CA files. Preserve
        # configured platform trust and supplement it with the pinned CA bundle.
        context = ssl.create_default_context()
        context.load_verify_locations(cafile=certifi.where())
        self.keys = jwt.PyJWKClient(
            GOOGLE_KEYS, cache_keys=False, lifespan=3600, timeout=5, ssl_context=context
        )

    def __call__(self, credential):
        try:
            header = jwt.get_unverified_header(credential)
            if (
                header.get("alg") != "RS256"
                or not isinstance(header.get("kid"), str)
                or not header["kid"]
                or len(header["kid"]) > 128
            ):
                raise ValueError("Unsupported signing key")
            claims = jwt.decode(
                credential,
                self.keys.get_signing_key_from_jwt(credential).key,
                algorithms=["RS256"],
                audience=self.client_id,
                issuer=GOOGLE_ISSUERS,
                options={
                    "require": [
                        "exp",
                        "iat",
                        "iss",
                        "sub",
                        "aud",
                        "nonce",
                        "email",
                        "email_verified",
                    ],
                    "strict_aud": True,
                },
            )
            if (
                claims.get("email_verified") is not True
                or not isinstance(claims["email"], str)
                or not isinstance(claims["sub"], str)
                or not 1 <= len(claims["sub"]) <= 255
                or not isinstance(claims["nonce"], str)
                or claims.get("azp", self.client_id) != self.client_id
            ):
                raise ValueError("Invalid identity claims")
            claims["email"] = email_address(claims["email"])
            return claims
        except jwt.PyJWKClientConnectionError as error:
            cause = error.__cause__
            reason = getattr(cause, "reason", cause)
            # Log only the failure class, never identity tokens or error payloads.
            logging.getLogger(__name__).warning(
                "Google signing-key retrieval failed (%s).", type(reason).__name__
            )
            raise AuthError("Google sign-in is temporarily unavailable.", 503) from error
        except (jwt.PyJWTError, ValueError, TypeError, KeyError, AuthError) as error:
            raise AuthError("Google sign-in is invalid or expired.", 401) from error


class AuthBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SetupBody(AuthBody):
    username: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{2,63}$")
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=256)


class LoginBody(AuthBody):
    identifier: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class ForgotBody(AuthBody):
    identifier: str = Field(min_length=1, max_length=254)


class ResetBody(AuthBody):
    token: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=12, max_length=256)


class GoogleBody(AuthBody):
    credential: str = Field(min_length=1, max_length=12000)
    nonce: str = Field(min_length=1, max_length=256)


class AuthService:
    def __init__(self, settings: AuthSettings, *, clock=time.time, google_verifier=None):
        self.settings, self.clock = settings, clock
        self._store = None
        self.google_verifier = google_verifier

    def start(self):
        if self.settings.enabled:
            self._store = AuthStore(self.settings, clock=self.clock)

    @property
    def store(self) -> AuthStore:
        if not self._store:
            raise AuthError("Authentication is not enabled.", 503)
        return self._store

    def session(self, request):
        return self.store.session(request.cookies.get(SESSION_COOKIE, ""))

    def set_cookie(self, response, name, value, max_age):
        response.set_cookie(
            name,
            value,
            max_age=max_age,
            httponly=True,
            secure=self.settings.cookie_secure,
            samesite="lax",
            path="/",
        )

    def check_csrf(self, request, user):
        origin = request.headers.get("origin", "")
        if (
            origin not in self.settings.frontend_origins
            or request.headers.get("sec-fetch-site") == "cross-site"
        ):
            raise AuthError("Request origin is not allowed.", 403)
        if user:
            secret = request.cookies.get(SESSION_COOKIE, "")
        else:
            secret = request.cookies.get(FLOW_COOKIE, "")
            if not self.store.valid_flow(secret):
                raise AuthError("Authentication form expired. Refresh and try again.", 403)
        supplied = request.headers.get("x-csrf-token", "")
        if len(supplied) != 64 or not hmac.compare_digest(
            supplied.encode(), csrf_token(secret).encode()
        ):
            raise AuthError("Authentication request could not be verified.", 403)

    def config(self, request, response):
        if not self.settings.enabled:
            return {
                "enabled": False,
                "setup_required": False,
                "google_client_id": None,
                "csrf_token": "",
                "google_nonce": "",
                "reset_delivery": self.settings.reset_delivery,
            }
        user = self.session(request)
        session = request.cookies.get(SESSION_COOKIE, "") if user else ""
        flow, nonce = self.store.new_flow(
            request.cookies.get(FLOW_COOKIE, ""), token_hash(session) if session else ""
        )
        self.set_cookie(response, FLOW_COOKIE, flow, self.settings.flow_seconds)
        return {
            "enabled": True,
            "setup_required": self.store.owner() is None,
            "google_client_id": self.settings.google_client_id or None,
            "csrf_token": csrf_token(session or flow),
            "google_nonce": nonce,
            "reset_delivery": self.settings.reset_delivery,
        }

    def success(self, user, request, response):
        token = self.store.new_session(user, request.cookies.get(SESSION_COOKIE, ""))
        self.set_cookie(response, SESSION_COOKIE, token, self.settings.session_seconds)
        flow, _ = self.store.new_flow("", token_hash(token))
        self.set_cookie(response, FLOW_COOKIE, flow, self.settings.flow_seconds)
        return {"authenticated": True, "user": public_user(user), "csrf_token": csrf_token(token)}

    def anonymous(self, response):
        response.delete_cookie(
            SESSION_COOKIE,
            path="/",
            secure=self.settings.cookie_secure,
            httponly=True,
            samesite="lax",
        )
        flow, _ = self.store.new_flow("", "")
        self.set_cookie(response, FLOW_COOKIE, flow, self.settings.flow_seconds)
        return {"ok": True, "csrf_token": csrf_token(flow)}

    def rate(self, request, operation, identifier=""):
        ip = request.client.host if request.client else "unknown"
        self.store.rate_limit("auth-ip", ip, limit=60)
        self.store.rate_limit(operation, ip, limit=5 if operation in {"setup", "forgot"} else 15)
        if identifier:
            self.store.rate_limit(
                operation + "-identifier",
                identifier.strip().casefold(),
                limit=5 if operation == "forgot" else 10,
            )

    def deliver_reset(self, reset):
        url = self.settings.public_url + "/reset-password?" + urlencode({"token": reset["token"]})
        try:
            if self.settings.reset_delivery == "local_outbox":
                folder = self.settings.outbox_dir
                folder.mkdir(parents=True, exist_ok=True, mode=0o700)
                os.chmod(folder, 0o700)
                path = folder / (secrets.token_hex(16) + ".json")
                fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                with os.fdopen(fd, "w") as output:
                    json.dump(
                        {
                            "to": reset["email"],
                            "subject": "Reset your Research Scout password",
                            "reset_url": url,
                            "expires_at": reset["expires_at"],
                        },
                        output,
                    )
            else:
                message = EmailMessage()
                message["From"], message["To"] = self.settings.smtp_from, reset["email"]
                message["Subject"] = "Reset your Research Scout password"
                message.set_content(
                    "Use this single-use link to reset your password:\n\n"
                    + url
                    + "\n\nIf you did not request this, ignore this email."
                )
                transport = smtplib.SMTP_SSL if self.settings.smtp_tls == "ssl" else smtplib.SMTP
                kwargs = {"timeout": 10}
                if self.settings.smtp_tls == "ssl":
                    kwargs["context"] = ssl.create_default_context()
                with transport(
                    self.settings.smtp_host, self.settings.smtp_port, **kwargs
                ) as client:
                    if self.settings.smtp_tls == "starttls":
                        client.starttls(context=ssl.create_default_context())
                    if self.settings.smtp_username:
                        client.login(self.settings.smtp_username, self.settings.smtp_password)
                    client.send_message(message)
        except (OSError, smtplib.SMTPException):
            # Neither tokens, mail bodies, recipient addresses nor credentials enter logs.
            logging.getLogger(__name__).error("Password reset delivery failed.")

    def router(self):
        router = APIRouter(prefix="/api/auth")

        @router.get("/config")
        def config(request: Request, response: Response):
            return self.config(request, response)

        @router.get("/session")
        def session(request: Request):
            user = self.session(request) if self.settings.enabled else None
            return {
                "enabled": self.settings.enabled,
                "authenticated": user is not None,
                "user": public_user(user) if user else None,
            }

        @router.post("/setup")
        def setup(body: SetupBody, request: Request, response: Response):
            self.rate(request, "setup")
            email = email_address(body.email)
            if self.settings.owner_email and email != self.settings.owner_email:
                raise AuthError("Use the configured workspace owner email.", 403)
            if not body.password.strip():
                raise AuthError("Choose a non-blank password.")
            if self.store.owner():
                raise AuthError("The workspace owner has already been created.", 409)
            user = self.store.setup(body.username, email, password_hash(body.password))
            return self.success(user, request, response)

        @router.post("/login")
        def login(body: LoginBody, request: Request, response: Response):
            self.rate(request, "login", body.identifier)
            user = self.store.owner()
            matches = password_matches(body.password, user["password_hash"] if user else None)
            if (
                not user
                or body.identifier.strip().casefold()
                not in {user["username"].casefold(), user["email"]}
                or not matches
            ):
                raise AuthError("Incorrect username or password.", 401)
            return self.success(user, request, response)

        @router.post("/logout")
        def logout(request: Request, response: Response):
            self.store.revoke(request.cookies.get(SESSION_COOKIE, ""))
            return self.anonymous(response)

        @router.post("/forgot-password")
        def forgot(body: ForgotBody, request: Request, background: BackgroundTasks):
            self.rate(request, "forgot", body.identifier)
            reset = self.store.reset_request(body.identifier)
            if reset:
                background.add_task(self.deliver_reset, reset)
            return {"ok": True, "message": FORGOT_MESSAGE}

        @router.post("/reset-password")
        def reset(body: ResetBody, request: Request, response: Response):
            self.rate(request, "reset")
            if not body.password.strip():
                raise AuthError("Choose a non-blank password.")
            self.store.reset_password(body.token, password_hash(body.password))
            return self.anonymous(response)

        @router.post("/google")
        def google(body: GoogleBody, request: Request, response: Response):
            self.rate(request, "google")
            if not self.settings.google_client_id:
                raise AuthError("Google sign-in is not configured.", 503)
            active = self.session(request)
            session = request.cookies.get(SESSION_COOKIE, "") if active else ""
            self.store.consume_nonce(
                request.cookies.get(FLOW_COOKIE, ""),
                token_hash(session) if session else "",
                body.nonce,
            )
            if self.google_verifier is None:
                self.google_verifier = GoogleVerifier(self.settings.google_client_id)
            claims = self.google_verifier(body.credential)
            if not hmac.compare_digest(str(claims.get("nonce", "")).encode(), body.nonce.encode()):
                raise AuthError("Google sign-in request did not match.", 403)
            owner = self.store.owner()
            if owner is None:
                approved = self.settings.owner_email
                authoritative = claims["email"].endswith("@gmail.com") or bool(claims.get("hd"))
                if (approved and claims["email"] != approved) or (
                    not approved and not authoritative
                ):
                    raise AuthError(
                        "Create the owner with a password first, then link Google.", 403
                    )
                username = re.sub(r"[^A-Za-z0-9_.-]", "", claims["email"].split("@")[0])[:48]
                if len(username) < 3 or not username[0].isalnum():
                    username = "workspace-owner"
                owner = self.store.setup(username, claims["email"], None, claims["sub"])
            elif owner["google_sub"] == claims["sub"]:
                pass
            elif active and not owner["google_sub"]:
                owner = self.store.link_google(claims["sub"], session)
            else:
                raise AuthError(LINK_MESSAGE, 403)
            return self.success(owner, request, response)

        return router


class AuthStreamClosed(Exception):
    pass


class AuthMiddleware:
    """Gate the real API/MCP boundary, including direct core requests and SSE."""

    def __init__(self, app, auth: AuthService):
        self.app, self.auth = app, auth

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope["path"]
        auth_path = path.startswith("/api/auth/")
        protected = path == "/api" or path.startswith("/api/")
        mcp = path == "/mcp" or path.startswith("/mcp/")
        request = Request(scope)
        user = None
        try:
            if self.auth.settings.enabled and scope["method"] != "OPTIONS":
                if mcp:
                    supplied = request.headers.get(INTERNAL_HEADER, "")
                    if request.headers.get("origin") or request.headers.get("sec-fetch-site"):
                        raise AuthError("Browser access to application MCP is not allowed.", 403)
                    if not hmac.compare_digest(
                        supplied.encode(), self.auth.settings.internal_token.encode()
                    ):
                        raise AuthError("Authentication required.", 401)
                elif protected:
                    user = self.auth.session(request)
                    if not auth_path and not user:
                        raise AuthError("Authentication required.", 401)
                    if scope["method"] not in {"GET", "HEAD"}:
                        if auth_path:
                            try:
                                length = int(request.headers.get("content-length", "0"))
                            except ValueError:
                                raise AuthError("Invalid request length.") from None
                            if length < 0:
                                raise AuthError("Invalid request length.")
                            if length > 16384:
                                raise AuthError("Authentication request is too large.", 413)
                        self.auth.check_csrf(request, user)
                        if auth_path:
                            # Enforce the limit on actual chunks, including requests without
                            # Content-Length. Never hand an unbounded auth body to the parser.
                            chunks, size = [], 0
                            while True:
                                event = await receive()
                                if event["type"] == "http.disconnect":
                                    raise AuthError("Authentication request disconnected.")
                                chunk = event.get("body", b"")
                                size += len(chunk)
                                if size > 16384:
                                    raise AuthError("Authentication request is too large.", 413)
                                chunks.append(chunk)
                                if not event.get("more_body", False):
                                    break
                            body = b"".join(chunks)
                            original_receive, delivered = receive, False

                            async def bounded_receive():
                                nonlocal delivered
                                if not delivered:
                                    delivered = True
                                    return {
                                        "type": "http.request",
                                        "body": body,
                                        "more_body": False,
                                    }
                                return await original_receive()

                            receive = bounded_receive
        except AuthError as error:
            await JSONResponse(
                {"detail": str(error)},
                status_code=error.status,
                headers={"Cache-Control": "no-store"},
            )(scope, receive, send)
            return

        is_stream = False

        async def guarded_send(message):
            nonlocal is_stream
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                is_stream = any(
                    k.lower() == b"content-type" and b"text/event-stream" in v for k, v in headers
                )
                if auth_path:
                    headers = [(k, v) for k, v in headers if k.lower() != b"cache-control"]
                    headers.extend(
                        [(b"cache-control", b"no-store"), (b"referrer-policy", b"no-referrer")]
                    )
                message = {**message, "headers": headers}
            elif is_stream and user and message["type"] == "http.response.body":
                if not self.auth.store.session(request.cookies.get(SESSION_COOKIE, "")):
                    await send({"type": "http.response.body", "body": b"", "more_body": False})
                    raise AuthStreamClosed()
            await send(message)

        try:
            await self.app(scope, receive, guarded_send)
        except AuthStreamClosed:
            pass
        except ExceptionGroup as errors:
            _, remaining = errors.split(AuthStreamClosed)
            if remaining:
                raise remaining from None
