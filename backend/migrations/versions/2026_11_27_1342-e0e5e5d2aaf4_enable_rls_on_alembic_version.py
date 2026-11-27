"""enable rls on alembic_version

Revision ID: e0e5e5d2aaf4
Revises: 86951b641db7
Create Date: 2026-11-27 13:42:00

alembic_version lives in the public schema, which Supabase exposes through its
Data API. RLS with no policies hides it from the anon/authenticated roles.
Alembic itself connects as the table owner, which RLS does not restrict.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "e0e5e5d2aaf4"
down_revision: str | Sequence[str] | None = "86951b641db7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE public.alembic_version ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.execute("ALTER TABLE public.alembic_version DISABLE ROW LEVEL SECURITY")
