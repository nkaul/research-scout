"""Real Deep Agents graphs, exercised with an explicitly scripted offline model.

The fixture model verifies orchestration and the harness; it is not evidence of
live LLM reasoning, semantic quality or prompt-injection robustness of an LLM.
No live model provider is selected or instantiated by this module.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable, Sequence
from typing import Any
from urllib.parse import urlsplit

from deepagents import (
    GeneralPurposeSubagentProfile,
    HarnessProfile,
    create_deep_agent,
    register_harness_profile,
)
from langchain.agents.middleware import AgentMiddleware
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import BaseTool, tool
from langchain_core.utils.function_calling import convert_to_openai_tool
from langsmith import tracing_context
from pydantic import ConfigDict, Field

from .context import (
    DISCOVERY_POLICY,
    EXECUTE_MESSAGE,
    ContextError,
    build_task_context,
    compact_source_context,
    encoded,
    normalize_source_envelope,
    validate_agent_output,
)
from .harness import Harness, HarnessError, Limits

SearchCallback = Callable[[str], Awaitable[dict]]
TraceCallback = Callable[[dict], Awaitable[None]]


def fixture_input_units(messages: list[BaseMessage], catalog: list[dict]) -> int:
    """The same deterministic wire-content byte units used by admission/packing."""
    return len(
        encoded(
            [
                message.model_dump(include={"type", "content", "tool_calls", "tool_call_id"})
                for message in messages
            ]
        ).encode()
    ) + len(encoded(catalog).encode())


async def _notify(callback: TraceCallback | None, event: dict) -> None:
    if callback:
        await callback(dict(event))


class CapabilityMiddleware(AgentMiddleware):
    """Restrict both model-visible tools and actual execution of default tools.

    Deep Agents tools= is additive. This effective-catalog allowlist is deliberately
    enforced again at dispatch, so a malformed/adversarial model cannot execute a
    hidden filesystem, shell or general-purpose task tool.
    """

    def __init__(self, *, role: str, allowed: Sequence[BaseTool], prompt: str, harness: Harness):
        self.role = role
        self.allowed = {item.name: item for item in allowed}
        self.prompt = prompt
        self.harness = harness

    async def awrap_model_call(self, request, handler):
        return await handler(
            request.override(
                tools=list(self.allowed.values()), system_message=SystemMessage(content=self.prompt)
            )
        )

    def check_tool(self, name: str, args: dict) -> None:
        if name not in self.allowed or args:
            self.harness.trace.append(
                {
                    "event": "blocked_tool",
                    "role": self.role,
                    "tool": name,
                }
            )
            raise HarnessError("Tool or arguments exceed the bound role capability")

    async def awrap_tool_call(self, request, handler):
        self.check_tool(request.tool_call["name"], request.tool_call.get("args", {}))
        return await handler(request)


class NoFilesystemMiddleware(AgentMiddleware):
    """Replace the documented filesystem middleware slot with no filesystem tools.

    The stock FS middleware requires read_file even for an empty allowlist. This
    application needs none of its features (including offloading), so a named public
    middleware override removes that tool suite altogether rather than hiding it.
    """

    @property
    def name(self) -> str:
        return "FilesystemMiddleware"


class FixtureChatModel(BaseChatModel):
    """Scripted BaseChatModel injected into actual compiled Deep Agents graphs."""

    model_config = ConfigDict(arbitrary_types_allowed=True)
    model_name: str = "research_scout:fixture"
    role: str
    task: dict
    harness: Any = Field(exclude=True)
    final_override: dict | None = None
    bound_catalog: list[dict] = Field(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "research-scout-scripted-fixture"

    def bind_tools(self, tools: Sequence, *, tool_choice=None, **kwargs):
        catalog = [convert_to_openai_tool(item) for item in tools]
        names = sorted(item["function"]["name"] for item in catalog)
        expected = ["delegate_discovery"] if self.role == "coordinator" else ["search_papers"]
        if names != expected:
            raise HarnessError(f"Effective {self.role} tool catalog is not narrow: {names}")
        self.harness.trace.append({"event": "effective_catalog", "role": self.role, "tools": names})
        return self.model_copy(update={"bound_catalog": catalog})

    def _generate(self, messages: list[BaseMessage], stop=None, run_manager=None, **kwargs):
        # This fixture uses explicit UTF-8 byte units, not an invented provider token count.
        units = fixture_input_units(messages, self.bound_catalog)
        self.harness.admit_generation(role=self.role, input_units=units)
        returned = next((m for m in reversed(messages) if isinstance(m, ToolMessage)), None)
        if returned is None:
            name = "delegate_discovery" if self.role == "coordinator" else "search_papers"
            message = AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": name,
                        "args": {},
                        "id": f"fixture-{self.role}-1",
                        "type": "tool_call",
                    }
                ],
            )
        elif self.role == "coordinator":
            message = AIMessage(content=returned.content)
        else:
            result = json.loads(str(returned.content))
            output = (
                self.final_override
                if self.final_override is not None
                else {
                    "provider": self.task["provider"],
                    "candidate_refs": result["candidate_refs"],
                    "summary": (
                        f"{len(result['candidate_refs'])} saved {self.task['provider']} candidates; "
                        "provider metadata only, with recorded scope and limitations."
                    ),
                    "field_refs": [],
                }
            )
            message = AIMessage(content=encoded(output))
        # Count emitted model content/tool arguments, not unused LangChain metadata.
        output_units = len(str(message.content).encode())
        if message.tool_calls:
            output_units += len(encoded(message.tool_calls).encode())
        self.harness.settle_output(output_units)
        return ChatResult(generations=[ChatGeneration(message=message)])

    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        return self._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


def validate_mcp_url(url: str) -> None:
    parts = urlsplit(url)
    if (
        parts.scheme not in {"http", "https"}
        or parts.hostname not in {"127.0.0.1", "localhost", "::1"}
        or parts.username
        or parts.password
        or parts.query
        or parts.fragment
    ):
        raise ContextError("Agent application MCP must be a configured loopback endpoint")


async def call_application_mcp(*, url: str, run_id: str) -> dict:
    """One actual MCP ClientSession call; never calls a research provider directly."""
    import httpx
    from mcp import ClientSession
    from mcp.client.streamable_http import streamable_http_client

    validate_mcp_url(url)
    async with (
        httpx.AsyncClient(
            timeout=httpx.Timeout(180, connect=5),
            follow_redirects=False,
            trust_env=False,
        ) as http_client,
        streamable_http_client(url, http_client=http_client) as (read, write, _),
        ClientSession(read, write) as session,
    ):
        await session.initialize()
        response = await session.call_tool("search_papers", {"run_id": run_id})
        if response.isError:
            raise HarnessError("Application MCP search failed; no agent retry is admitted")
        payload = response.structuredContent
        if payload is None:
            texts = [
                block.text for block in response.content if getattr(block, "type", None) == "text"
            ]
            if len(texts) != 1:
                raise ContextError("Application MCP did not return one structured source envelope")
            payload = json.loads(texts[0])
        return payload


class DiscoveryExecution:
    """One-shot execution; the app core separately owns durable admission/receipts."""

    def __init__(
        self,
        *,
        run_id: str,
        question: str,
        provider: str,
        filters: dict,
        mcp_url: str,
        on_trace: TraceCallback | None = None,
        search_callback: SearchCallback | None = None,
        limits: Limits | None = None,
        specialist_final_override: dict | None = None,
    ):
        self.task = build_task_context(
            run_id=run_id, question=question, provider=provider, filters=filters
        )
        validate_mcp_url(mcp_url)
        self.harness = Harness(limits=limits or Limits())
        self.mcp_url = mcp_url
        self.callback = on_trace
        self.search_callback = search_callback
        self.envelope: dict | None = None
        self.specialist_final_override = specialist_final_override

    def _graph(self, *, role: str, tools: list[BaseTool]):
        prompt = DISCOVERY_POLICY + "\nBOUND_TASK_JSON:\n" + encoded(self.task)
        model = FixtureChatModel(
            role=role,
            task=self.task,
            harness=self.harness,
            final_override=self.specialist_final_override if role == "discovery" else None,
        )
        guard = CapabilityMiddleware(role=role, allowed=tools, prompt=prompt, harness=self.harness)
        # Exact private fixture-model profile, not global defaults for a real provider.
        # Public Deep Agents >=0.7 APIs remove the unused default capabilities.
        register_harness_profile(
            "research_scout:fixture",
            HarnessProfile(
                general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False),
                excluded_middleware=frozenset({"SummarizationMiddleware"}),
            ),
        )
        filesystem = NoFilesystemMiddleware()
        return create_deep_agent(
            model=model,
            tools=tools,
            middleware=[filesystem, guard],
            subagents=[],
            name=f"scout_{role}",
        )

    def _pack_discovery_context(self, tool: BaseTool) -> dict:
        """Budget complete identities and tool history before adding source previews."""
        packed = compact_source_context(self.envelope)
        catalog = [convert_to_openai_tool(tool)]

        def units():
            return fixture_input_units(
                [
                    SystemMessage(
                        content=DISCOVERY_POLICY + "\nBOUND_TASK_JSON:\n" + encoded(self.task)
                    ),
                    HumanMessage(content=EXECUTE_MESSAGE),
                    AIMessage(
                        content="",
                        tool_calls=[
                            {
                                "name": "search_papers",
                                "args": {},
                                "id": "fixture-discovery-1",
                                "type": "tool_call",
                            }
                        ],
                    ),
                    ToolMessage(content=encoded(packed), tool_call_id="fixture-discovery-1"),
                ],
                catalog,
            )

        while units() > self.harness.limits.input_units and packed["records"]:
            packed["records"].pop()
            packed["omitted_previews"] += 1
        if units() > self.harness.limits.input_units:
            raise ContextError(
                "Saved source identities exceed the remaining context envelope; no replay is admitted"
            )
        self.harness.trace.append(
            {
                "event": "source_context_packed",
                "preview_count": len(packed["records"]),
                "omitted_preview_count": packed["omitted_previews"],
                "input_units": units(),
            }
        )
        return packed

    async def run(self) -> dict:
        self.harness.start()
        execution = self

        @tool
        async def search_papers() -> str:
            """Search once through the bound Research Scout application MCP operation."""
            execution.harness.search()
            await _notify(execution.callback, execution.harness.trace[-1])
            payload = (
                await execution.search_callback(execution.task["run_id"])
                if execution.search_callback
                else await call_application_mcp(
                    url=execution.mcp_url, run_id=execution.task["run_id"]
                )
            )
            execution.envelope = normalize_source_envelope(
                payload, run_id=execution.task["run_id"], provider=execution.task["provider"]
            )
            event = {
                "event": "saved_sources_received",
                "count": len(execution.envelope["candidate_refs"]),
            }
            execution.harness.trace.append(event)
            await _notify(execution.callback, event)
            packed = execution._pack_discovery_context(search_papers)
            await _notify(execution.callback, execution.harness.trace[-1])
            return encoded(packed)

        specialist = self._graph(role="discovery", tools=[search_papers])

        @tool
        async def delegate_discovery() -> str:
            """Delegate once to the discovery graph bound to this provider and hard filters."""
            execution.harness.delegate()
            await _notify(execution.callback, execution.harness.trace[-1])
            with tracing_context(enabled=False):
                state = await specialist.ainvoke(
                    {"messages": [{"role": "user", "content": EXECUTE_MESSAGE}]},
                    config={"recursion_limit": 12},
                )
            if execution.envelope is None:
                raise HarnessError("Specialist returned without an application MCP result")
            final = json.loads(str(state["messages"][-1].content))
            return encoded(validate_agent_output(final, execution.envelope))

        coordinator = self._graph(role="coordinator", tools=[delegate_discovery])
        with tracing_context(enabled=False):
            state = await coordinator.ainvoke(
                {"messages": [{"role": "user", "content": EXECUTE_MESSAGE}]},
                config={"recursion_limit": 12},
            )
        if self.envelope is None or self.harness.delegations != 1 or self.harness.searches != 1:
            raise HarnessError("The required bounded delegation/MCP path did not execute")
        final = validate_agent_output(json.loads(str(state["messages"][-1].content)), self.envelope)
        result = {
            **final,
            "trace": self.harness.trace,
            "mode": "fixture",
            "framework": "deepagents",
            "usage": self.harness.usage(),
            "transport": "injected_callback" if self.search_callback else "application_mcp_http",
            "limitations": [
                "Scripted fixture model; no live LLM quality or injection-resistance claim.",
                "The application core owns durable no-replay admission across execution objects/restarts.",
            ],
        }
        await _notify(self.callback, {"event": "agent_completed", "mode": "fixture"})
        return result


async def run_discovery(
    *,
    run_id: str,
    question: str,
    provider: str,
    filters: dict,
    mcp_url: str,
    on_trace: TraceCallback | None = None,
    search_callback: SearchCallback | None = None,
    mode: str = "fixture",
) -> dict:
    if mode not in {"fixture", "disabled"}:
        raise HarnessError(
            "Live LLM execution is disabled: model, pricing and spending grant are unset"
        )
    result = await DiscoveryExecution(
        run_id=run_id,
        question=question,
        provider=provider,
        filters=filters,
        mcp_url=mcp_url,
        on_trace=on_trace,
        search_callback=search_callback,
    ).run()
    if mode == "disabled":
        result["mode"] = "deterministic-routing"
        result["model_mode"] = "disabled"
        result["limitations"][0] = (
            "Deterministic tool routing; no hosted model or generated research answer."
        )
    return result
