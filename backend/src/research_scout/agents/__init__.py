"""Bounded Deep Agents discovery; live model execution remains disabled."""

from .context import validate_input_support
from .runtime import run_discovery

__all__ = ["run_discovery", "validate_input_support"]
