# Authentication, Accounts and Data Access

Our own FastAPI authentication (no Supabase Auth). Code: `backend/app/core/security.py`,
`backend/app/services/auth.py`, `backend/app/api/auth.py`, `backend/app/api/deps.py`.

## 1. Passwords

**Hashing: Argon2id via `pwdlib`.** A password is never stored. We store a *hash*: a
one-way fingerprint that can check a password but cannot be turned back into it.
Argon2id won the Password Hashing Competition and is OWASP's first recommendation:
it is deliberately slow *and* memory-hungry, so an attacker who steals the table
cannot try billions of guesses per second on GPUs. bcrypt would also be acceptable,
but it silently ignores everything after 72 bytes and is not memory-hard; Argon2
has neither problem. `pwdlib` uses Argon2id with safe default parameters and
can re-hash old hashes when the parameters are raised later.

**Policy (open item M4)**, following NIST SP 800-63B:

| Rule | Value |
|---|---|
| Length | 10 to 128 characters |
| Composition rules ("one digit, one symbol...") | **none**: they make passwords harder to remember, not stronger |
| Common passwords | a small built-in list of very common passwords is rejected (case-insensitive) |
| Same as email | rejected |

## 2. Tokens

```
login ──► access token (JWT, 30 min)  ── sent as  Authorization: Bearer <token>
      └─► refresh token (random, 7 days) ── httpOnly cookie, path /auth
```

- **Access token**: a signed JWT (HS256, secret `JWT_SECRET_KEY`, ≥ 32 characters)
  with `sub` (user id), `type=access`, `iat`, `exp` (30 min), `jti`, `iss`. Short-lived,
  so a stolen token is useful only briefly. Stateless: the server verifies the
  signature and expiry and loads the user (a deleted user's token stops working).
  The algorithm is fixed in code (no `alg` negotiation).
- **Refresh token**: 48 random bytes (`secrets.token_urlsafe`), sent only as a cookie
  that JavaScript cannot read (`HttpOnly`), limited to `/auth` paths, `SameSite=Lax`
  by default (not sent on cross-site POSTs), `Secure` configurable (must be on in
  production / HTTPS).
- **Stored hashed**: the database keeps only the SHA-256 of a refresh token
  (`refresh_tokens.token_hash`). A fast hash is fine here because the token is long
  and random (unlike a password); a database leak does not reveal usable tokens.
- **Rotation**: every `POST /auth/refresh` revokes the presented token and issues a
  new one in the same **family** (all tokens descending from one login).
- **Reuse detection**: presenting a token that was already rotated or revoked means
  it was probably stolen, so **the whole family is revoked** (both the thief and the
  real user must log in again). The token row is locked (`SELECT … FOR UPDATE`) so two
  simultaneous refreshes cannot both succeed.
- **Logout** revokes the token's family and clears the cookie. The access token
  stays valid until it expires (max 30 min): the accepted trade-off of stateless JWTs.

## 3. Login rate limiting

In-process sliding windows (`backend/app/core/ratelimit.py`):

| Key | Limit (default) | Counted |
|---|---|---|
| email | 5 failed logins / 15 min | failures only; reset on success |
| client IP | 20 login attempts / 15 min | every attempt |

Exceeding a limit returns **429** with `Retry-After`. **Limitation:** the counters live
in one process's memory: they reset on restart and are not shared between several
workers or servers; behind a proxy the client IP must come from a trusted
`X-Forwarded-For` (not handled yet). A shared store (e.g. the database) is needed
before production.

Login failures always return the same message (`Incorrect email or password`), and a
dummy hash is verified for unknown emails so response times don't reveal which
emails exist. (Registration does reveal an existing email with 409: accepted for now.)

## 4. Ownership and data access

- Every protected route depends on `get_current_user` (valid access token → user).
- **A user can only access their own data.** Members and routines are always loaded
  with the owner in the query (`WHERE member.user_id = :current_user`), so another
  user's member or routine returns **404**, exactly like a non-existent id: knowing
  or guessing a UUID reveals nothing (IDOR protection, design.md §5).
- Client-supplied ownership fields (`user_id`, `member_id`) are never accepted in
  bodies (schemas use `extra="forbid"`); they come from the token and the URL.
- The backend connects as the database owner (bypasses RLS), so these checks in the
  application are what protect the data. RLS (enabled, no policies) only blocks
  Supabase's public Data API.

## 5. API

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | name, email, password, optional timezone/home location, `consent: true` required (sets `consent_at`) → 201 user |
| POST | `/auth/login` | email + password → access token; sets refresh cookie |
| POST | `/auth/refresh` | refresh cookie → new access token; rotates the cookie |
| POST | `/auth/logout` | revokes the refresh-token family; clears the cookie → 204 |
| GET | `/me` | the current user (never the password hash) |
| PATCH | `/me` | name, timezone, home location (rounded to 2 decimals, ~1 km) |
| DELETE | `/me` | deletes the user and **all** their data (members, routines, tokens) → 204 |
| GET | `/me/export` | all their data as JSON (profile, members, routines) |
| CRUD | `/members`, `/members/{id}` | max **10** members per user |
| CRUD | `/members/{id}/routines`, `/members/{id}/routines/{rid}` | max **20** routines per member |
| GET | `/members/{id}/risk`, `/members/{id}/risk/hourly`, `/family/risk` | risk read APIs (see docs/risk-engine.md); 409 if no home location |

## 6. Error responses

- **422 validation errors never echo submitted values**: the custom handler returns
  only the field location, message and error type (Pydantic's default would include
  the `input`, e.g. a submitted password).
- Unexpected errors return a generic 500 with a request id (details only in logs).
- 401 responses carry `WWW-Authenticate: Bearer`.

## 7. Configuration (`backend/.env`)

| Setting | Default | Meaning |
|---|---|---|
| `JWT_SECRET_KEY` | none (required for auth) | ≥ 32 random characters; never commit |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 30 | access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | 7 | refresh token lifetime |
| `REFRESH_COOKIE_SECURE` | false | set **true** in production (HTTPS) |
| `REFRESH_COOKIE_SAMESITE` | lax | `lax`, `strict` or `none` (`none` requires Secure) |
| `CORS_ORIGINS` | `http://localhost:3000` | comma-separated allowed browser origins |
| `LOGIN_MAX_FAILURES_PER_EMAIL` / `LOGIN_MAX_ATTEMPTS_PER_IP` / `LOGIN_WINDOW_MINUTES` | 5 / 20 / 15 | rate limiting |

Generate a secret: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
