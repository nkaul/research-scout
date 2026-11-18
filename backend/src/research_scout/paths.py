"""Stable monorepo paths for the local backend, independent of the launch cwd."""

from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPOSITORY_ROOT = BACKEND_ROOT.parent


def repository_path(value: str | Path) -> Path:
    """Resolve relative local configuration beside the repository's shared env/state."""
    path = Path(value).expanduser()
    return path if path.is_absolute() else REPOSITORY_ROOT / path
