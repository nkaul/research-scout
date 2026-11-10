"""Finite fixture-model admission and one-shot discovery authority."""

from __future__ import annotations

from dataclasses import dataclass, field


class HarnessError(RuntimeError):
    pass


@dataclass(frozen=True)
class Limits:
    generations: int = 6
    model_http_attempts: int = 12
    input_units: int = 6_000
    output_units: int = 1_500


@dataclass
class Harness:
    limits: Limits = field(default_factory=Limits)
    trace: list[dict] = field(default_factory=list)
    generations: int = 0
    delegations: int = 0
    searches: int = 0
    started: bool = False
    input_units: int = 0
    output_units: int = 0

    def start(self) -> None:
        if self.started:
            raise HarnessError("A discovery execution cannot automatically replay")
        self.started = True

    def delegate(self) -> None:
        if self.delegations:
            raise HarnessError("Only one provider-bound delegation is admitted")
        self.delegations += 1
        self.trace.append({"event": "delegation", "role": "discovery", "attempt": 1})

    def search(self) -> None:
        if self.searches:
            raise HarnessError("Application search cannot automatically replay or expand")
        self.searches += 1
        self.trace.append({"event": "application_mcp_search", "attempt": 1})

    def admit_generation(self, *, role: str, input_units: int) -> None:
        if self.generations >= self.limits.generations:
            raise HarnessError("Model generation allowance exhausted")
        if input_units > self.limits.input_units:
            raise HarnessError("Model context envelope exceeded")
        self.generations += 1
        self.input_units += input_units
        self.trace.append(
            {
                "event": "model_generation",
                "role": role,
                "number": self.generations,
                "input_units": input_units,
            }
        )

    def settle_output(self, units: int) -> None:
        if units > self.limits.output_units:
            raise HarnessError("Model output envelope exceeded")
        self.output_units += units

    def usage(self) -> dict:
        return {
            "generations": self.generations,
            "model_http_attempts": 0,
            "model_cost_usd": 0,
            "input_units": self.input_units,
            "output_units": self.output_units,
            "unit_definition": "fixture UTF-8 byte upper-bound units; not provider token usage",
            "delegations": self.delegations,
            "application_mcp_calls": self.searches,
            "limits": {
                "generations": self.limits.generations,
                "model_http_attempts": self.limits.model_http_attempts,
                "input_units_per_generation": self.limits.input_units,
                "output_units_per_generation": self.limits.output_units,
            },
        }
