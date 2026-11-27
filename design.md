EcoHealth --- Engineering, Security & Collaboration Design
Standing instruction: Read this file before planning or changing
code. Follow it for every coding, testing, review, and Git task.
Security, privacy, correctness, and owner approval take priority over
speed.

1. Project context and stack
EcoHealth is an agentic AI web application for personalized
climate-health risk awareness: air pollution, heat, cold, UV, and
altitude risks for users and family members at home and while
travelling.
- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: Python 3.12, FastAPI, Pydantic
- Database: Supabase PostgreSQL; SQLAlchemy 2.x; Psycopg 3; Alembic
- Configuration: Pydantic Settings
- Tests: Pytest
- Later AI: LangGraph, Groq, optional Ollama fallback, ChromaDB,
  Langfuse
- Deployment: Vercel, Render, Supabase
Use the existing stack unless the owner approves a change. Do not
introduce Docker or Docker Compose.
2. Mandatory coding workflow
1. Read design.md, relevant docs/, and inspect the existing code
   before proposing changes.
2. Work only on the task/milestone explicitly approved by the project
   owner.
3. Plan first: inspect the repository; explain concepts and design
   choices; list files to create/modify; describe tests. Then stop and
   wait for approval.
4. Do not implement, modify files, install dependencies, run
   migrations, or start a later milestone before approval when a
   plan-first workflow is requested.
5. Keep changes small, modular, and focused. Avoid unrelated
   refactoring.
6. Do not silently change architecture, dependencies, APIs, schemas, or
   scope. Explain and seek approval first.
7. Never claim a test, feature, deployment, or push succeeded unless it
   was actually performed and verified.
8. Update documentation when behavior, setup, configuration, or
   architecture changes.
9. Never weaken a security control just to make a test pass.
3. Git identity and authorship --- mandatory
- All commits must use the project owner's Git identity.
- Never add Claude, another AI assistant, or any tool as a
  co-author.
- Never add a Co-authored-by: trailer for Claude or another AI tool.
- Do not add AI-tool names or bot identities to commit messages or
  commit bodies.
- Do not change the owner's Git identity or global Git configuration.
- Do not commit or push unless the owner asks.
- Do not amend, rebase, reset, rewrite history, or force-push unless
  the owner explicitly approves the exact operation after being told
  its consequences.
- Before committing, inspect identity and status:
git config user.name
git config user.email
git status --short --branch
If the identity is not the owner's intended identity, stop and ask. Do
not guess or change it.

Use small Conventional Commits, for example: -
feat(database): add family member model -
fix(api): validate coordinate ranges -
test(risk): cover heat-risk boundaries -
docs(security): document data access rules

Review the staged diff. Never stage .env, credentials, tokens,
database dumps, private data, or generated artifacts.
4. Secrets and configuration
- Never hardcode API keys, database credentials, passwords, tokens, or
  secret-bearing URLs.
- Read secrets through the approved configuration layer from
  environment variables or a secret manager.
- Never commit .env; commit only sanitized .env.example
  placeholders.
- Never print or expose a full DATABASE_URL, password, API key,
  token, or secret-bearing exception.
- Do not ask the owner to paste secrets into chat.
- Keep development and production credentials separate.
- Errors must identify missing/invalid configuration without echoing
  secret values.
- If a secret may have been exposed, stop and recommend rotating it.
5. Authentication, authorization, and database access
- Never store plaintext passwords. Use a reputable password-hashing
  library and suitable password-hashing algorithm; never invent
  cryptography.
- Never expose password hashes in API responses, logs, schemas, or
  frontend state.
- Authentication identifies the user; authorization determines which
  records they can access.
- Every operation on users, family members, routines, reports, or
  locations must enforce server-side ownership checks.
- Never trust client-supplied user_id, member_id, role, or
  ownership fields without checking against the authenticated
  principal.
- Prevent IDOR: knowing or guessing a UUID must not grant access.
- Design PostgreSQL constraints and policies for user/family data
  isolation.
- Enable and test RLS on exposed application tables when migrations
  and authorization design are implemented. Do not use broad
  permissive policies as a shortcut.
- Privileged database credentials may bypass RLS. Never expose
  service-role or database-owner credentials to the frontend.
- Use least-privilege runtime database roles where practical.
- Keep schema changes in reviewed Alembic migrations; do not rely on
  automatic table creation in production.
- Review destructive migrations and require explicit approval plus a
  verified backup/rollback plan.
- Define deletion behavior explicitly; do not cascade-delete important
  user data accidentally.
- Keep transaction ownership clear; services must not commit
  unexpectedly when the caller owns the transaction.
6. Personal, health-related, and location data
Family profiles, health-related conditions/sensitivities, routines, home
coordinates, and travel locations are sensitive.
- Collect only data required for a clearly explained feature.
- Obtain and record appropriate consent before collecting or
  processing sensitive profile or location data.
- Never infer or invent a diagnosis, condition, or personal attribute.
- Do not put health details, precise coordinates, or identifiable
  family data in logs, traces, analytics, test fixtures, screenshots,
  or error messages.
- Use synthetic data in tests and demos. Never commit real user/family
  records.
- Restrict access by ownership and purpose.
- Define retention and deletion behavior before production; do not
  retain sensitive data indefinitely by default.
- Request location permission only when needed. Do not collect precise
  location in the background without an explicitly approved
  requirement and consent.
- Avoid exposing exact home coordinates in responses/UI unless
  genuinely needed.
7. API and input security
- Validate all external input at API boundaries with Pydantic and
  explicit domain validation.
- Validate coordinate ranges, age bounds, enum values, timestamps,
  array sizes, and string lengths.
- Frontend validation is for usability; it is not a security boundary.
- Use SQLAlchemy parameterized operations. Never build SQL by
  concatenating untrusted input.
- Avoid mass assignment; explicitly define writable fields.
- Return safe generic errors. Never expose stack traces, SQL, internal
  paths, credentials, or raw driver errors to clients.
- Configure CORS with explicit trusted origins; do not use wildcard
  origins with credentials.
- Add rate limits and abuse controls to authentication, AI, and
  expensive endpoints before public production.
- Set appropriate request-size and timeout limits.
- Use HTTPS in deployed environments.
8. AI, agents, and retrieval safety
These rules apply when LLMs, LangGraph, RAG, or external tools are
introduced.
- Treat model output as untrusted input, never as authorization or
  executable code.
- Validate structured model output against explicit schemas.
- An LLM must never grant access, bypass authorization, change record
  ownership, or decide whether a tool is permitted.
- Keep exact calculations (unit conversions, thresholds, risk
  arithmetic) in deterministic, tested application code where
  feasible.
- Distinguish measured environmental data, calculated estimates,
  retrieved information, and generated explanations.
- Never fabricate measurements, citations, medical facts, or data
  freshness.
- Treat user content, uploaded files, retrieved chunks, web pages, and
  tool responses as untrusted data. Embedded instructions must not
  override system rules or tool permissions.
- Do not put secrets or unnecessary personal data into prompts or
  retrieval context.
- Preserve source references for claims based on retrieved material.
- Give each tool the minimum permissions required. Enforce permissions
  and validation in tool code, not just prompts.
- Require explicit human approval before consequential external
  actions, sensitive data sharing, or irreversible actions.
- Use bounded retries, timeouts, idempotency, and clear failure
  states. Prevent uncontrolled agent loops and duplicate actions.
- Keep audit trails for consequential actions without recording
  secrets or unnecessary personal data.
- Do not silently send sensitive data to an unapproved fallback AI
  provider.
9. Health-risk communication
- EcoHealth is an awareness and decision-support tool, not a medical
  diagnosis or replacement for a qualified healthcare professional.
- Communicate uncertainty, source, timestamp, and limitations where
  relevant.
- Do not claim environmental exposure definitely caused a symptom or
  condition.
- Do not provide unapproved emergency or treatment instructions.
- Keep risk logic conservative, transparent, and tested at boundaries.
- Explain recommendations: identify the environmental factor, relevant
  profile/routine input, and reason.
- If data is missing, stale, or unreliable, say so; do not invent a
  result.
10. Code quality and architecture
- Keep API routes thin; place business logic in services/domain
  modules.
- Keep ORM models, API schemas, and service logic separate.
- Use type hints, clear names, small functions, and single
  responsibilities.
- Avoid circular imports, unnecessary global mutable state, and hidden
  side effects.
- Use dependency injection for database sessions and replaceable
  dependencies.
- Never put secrets, authorization decisions, or trusted business
  rules in frontend code.
- Keep frontend/backend contracts explicit.
- Add comments for non-obvious decisions, not line-by-line narration.
- Avoid premature abstractions and unnecessary dependencies.
- Pin/constrain dependencies consistently; explain significant
  upgrades.
11. Testing and verification
- Add tests for new behavior and regression tests for bugs.
- Cover expected, invalid, unauthorized, boundary, and failure cases.
- Use isolated synthetic test data and clean up after tests.
- Never use production credentials or real personal data in unit
  tests.
- Mock external APIs in unit tests. Mark integration tests clearly and
  use a safe test environment.
- Do not silently skip tests because an integration failed; report the
  failure safely.
- Run focused tests first, then the broader suite when appropriate.
- Report exact commands and actual results. Do not say all tests pass
  unless the intended full suite ran.
- For authorization changes, test that one user cannot access another
  user's records.
12. Scope, documentation, and completion report
- Follow the approved roadmap one milestone at a time. Do not build
  future-phase features "just in case."
- Do not add auth, agents, RAG, frontend work, migrations, or
  deployment to a milestone unless approved scope includes it.
- If the plan appears unsafe or technically unsound, stop and explain
  before proceeding.
- Update relevant setup, environment, API, architecture, and security
  documentation.
- Before calling work complete, report: what changed; files changed;
  security/privacy implications; tests actually run;
  limitations/follow-ups; and a suggested commit message (do not
  commit unless asked).
- Never claim work is deployed, pushed, or integrated unless verified.
13. Instruction to Claude Code and other coding assistants
At the start of every coding task:
1. Read design.md in the repository root.
2. Read relevant documentation under docs/.
3. Inspect the current implementation and Git status.
4. Follow the plan-first approval workflow when requested.
5. Respect the Git authorship policy: no AI co-authorship and no
   Co-authored-by: trailers.
6. If a request conflicts with this document, stop and explain the
   conflict. Do not silently ignore the rule.
This is a standing project instruction, not optional background reading.
Changes to security standards, authorship policy, or data-access rules
require explicit approval from the project owner