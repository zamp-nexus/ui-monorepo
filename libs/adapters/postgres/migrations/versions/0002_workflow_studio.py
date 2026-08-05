"""Record the absorbed Workflow Studio revision.

``0001_initial_schema`` was consolidated to create the complete current
schema, including the Workflow Studio tables. Keep this revision only so an
existing migration history can advance without attempting to create those
tables a second time.
"""

revision = "0002_workflow_studio"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
