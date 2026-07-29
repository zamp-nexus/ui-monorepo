from __future__ import annotations

import ast
from pathlib import Path


FORBIDDEN_ROOTS = {
    "alembic",
    "clickhouse_connect",
    "fastapi",
    "httpx",
    "opentelemetry",
    "psycopg",
    "sqlalchemy",
    "uvicorn",
}


def forbidden_imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(), filename=str(path))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name.split(".", maxsplit=1)[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module.split(".", maxsplit=1)[0])
    return found & FORBIDDEN_ROOTS


if __name__ == "__main__":
    fixture = Path(
        "libs/domain/agent-execution/tests/architecture_fixture/invalid_domain.py"
    )
    violations = forbidden_imports(fixture)
    if violations != {"fastapi"}:
        raise SystemExit(
            f"Boundary fixture did not produce the expected violation: {violations}"
        )
    print("Known-bad boundary fixture correctly rejected: fastapi")
