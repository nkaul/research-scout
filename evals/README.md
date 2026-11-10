# Discovery context and harness evaluation

Run `python -m research_scout.agents.evaluate --output docs/validation/agent-harness.md`
from the installed project environment. Use a `.json` suffix for the structured
report. The evaluator uses authored synthetic source records and an injected,
scripted LangChain `BaseChatModel` in two real Deep Agents compiled graphs. It
does not call a hosted model or research provider.

The cases cover actual delegation, provider-bound capability catalogs, empty
results, source instructions treated as data, foreign/invented identities,
invented fields, forbidden human mutations, generation ceilings, same-execution
replay rejection and bounded previews with preserved hard constraints/IDs.
Reports name their denominator and package versions. The model token accounting
uses explicit fixture byte units; it is not a tokenizer or real provider bill.

`pytest tests/test_agents.py` also checks the actual compiled ToolNode has no
filesystem, shell or general-purpose `task` handler and exercises a real local
MCP `ClientSession` over Streamable HTTP. That protocol test requires loopback
socket permission. Other tests inject the application-search callback and label
that transport; they do not pretend to prove the HTTP protocol.

These checks establish structural context/harness behavior. A scripted response
cannot establish a live model's research quality, grounding or prompt-injection
resistance. Broader query relevance, hybrid retrieval and per-provider protocols
belong to their separate evaluation sets. Durable application admission across
new execution objects/restarts and persisted human choices belong to the core.

Live LLM execution is deliberately gated: the project has not selected its model,
credentials, pricing or finite spending grant. No environment secrets are read by
this agent implementation. Repository development skills/memory and arbitrary
filesystem tools are not loaded into end-user context.

The implementation uses the documented Deep Agents named-middleware override
and exact fixture-model harness profile, checked against installed `0.7.32`:
[customization](https://docs.langchain.com/oss/python/deepagents/customization),
[subagents](https://docs.langchain.com/oss/python/deepagents/subagents).
