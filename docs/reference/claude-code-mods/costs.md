# What the inbox's model calls cost

Part of [Claude Code mods](../claude-code-mods.md).

No public doc mentions mods, `$.model.complete` or `$.model.fork` in its billing, usage or caching text. [COST; MC; PCACHE; DU; MU] Everything below about how a mod call is billed comes from the types or is labeled inference.

## How a mod call is made and billed

- `$.model.complete` "Runs one text completion through the session's own API client". It sends "No tools, no history, no system prompt beyond the CLI's identity block and `request.system`." [T: `model.complete`]
- Inference: it bills like the session. A subscriber's call draws on the five-hour and weekly windows, which are "shared with Claude chat and Cowork" on Team and Enterprise. An API or cloud user pays per token. [COST#claude-for-teams-and-enterprise] The README says "On a Claude plan, these count toward your usage limits" (`README.md:70-71`). No doc confirms it.
- Model-specific limits exist: "'You've hit your Opus limit' or 'You've hit your Sonnet limit'". [COST#when-a-developer-asks-about-a-limit] Inference: a person working on Opus can hit the Sonnet limit, so only the inbox's call fails. The types report that as `isAnswered: false` with `reason: 'api-error'` and an `error` such as `rate_limit`. [T: `ModelCompleteResult`]
- Claude Code's own prompt suggestions skip "while your account is close to or at its usage limit". [COST#background-token-usage] A mod can read `$.session.usage().rateLimits` (`percentUsed`). The list is "empty off a subscription". [T: `session.usage`]
- The inbox's two calls (the ledger call and the results call, each through `askInboxModel`): `MODEL = 'sonnet'` (`hooks/register.tsx:MODEL`); one cached `system` block, `maxTokens: 1600`, `effort: 'low'` (`hooks/register.tsx:askInboxModel`); a 45-second timeout (`hooks/register.tsx:runUpdate`). The catch-up uses `$.model.fork` (`hooks/register.tsx:catchUp`).

## `sonnet` is not one model

| Provider | `sonnet` resolves to | Price per million tokens (input / output) | Source |
|---|---|---|---|
| Anthropic API | Sonnet 5.5 (since 2.1.284) | $2 / $10; cache hit $0.10; 5-minute write $2.50 | [MC#model-aliases; PRICE#model-pricing] |
| Claude Platform on AWS | Sonnet 4.6 | $3 / $15 | [MC#model-aliases; PRICE] |
| Bedrock, Google Agent Platform, Foundry | Sonnet 4.5 | $3 / $15; regional endpoints add 10% | [MC#model-aliases; PRICE] |

- `ANTHROPIC_DEFAULT_SONNET_MODEL` redirects the alias. [MC#environment-variables]
- The model "is resolved and allowlist-checked like a `--model` value". [T: `ModelCompleteRequest.model`]
- Sonnet 4.5 is not in the effort table ("Models not listed here do not support effort"), so `effort: 'low'` is dropped there. [MC#adjust-effort-level; T: "dropped where it does not"]
- "You can't turn thinking off on Opus 5.5, Sonnet 5.5, Haiku 5.5, or the Fable models." "Thinking tokens are billed as output tokens". [MC#extended-thinking; COST#adjust-extended-thinking] Whether thinking counts against `maxTokens: 1600` is unknown.
- The mod cannot tell which model answered. `ModelCompleteResult` has no model field. A `model.complete` hook sees the model "as the request named it". [T]

## A blocked `sonnet` has three outcomes

| Source | What happens |
|---|---|
| Types | "Only a request the engine refuses to send (a blocked model, a bad cap) rejects." The promise throws. [T: `model.complete`] |
| `deniedModels` docs | "If a hook or background request names a model that `deniedModels` blocks … that request runs on the session's model instead." [MC#block-specific-models-or-versions] |
| Allowlist or Enterprise org restriction | Claude Code "substitutes the newest version of the family" that is permitted, for example Sonnet 5. [MC#restrict-model-selection; MC#organization-model-restrictions] |

Inference: the inbox must handle a thrown rejection, not only `isAnswered: false`. A silent switch to Opus 5.5 doubles the per-token price.

## Prompt caching

- Mod cache marks: "a call within five minutes that opens with the same text reads it there". [T: `ModelCompleteRequest`] That matches the docs' "everything else" bucket, which gets five minutes. [PCACHE#which-ttl-each-request-gets]
- The minimum cacheable length is 512 tokens for Sonnet 5.5 and 1,024 for Sonnet 5, 4.6 and 4.5. "Shorter prompts cannot be cached … no error is returned." [PCACHE-API#cache-limitations]
- Third-party providers and gateways: "text marked here is found again only while `prompt` opens the same: mark it there." [T] The inbox marks only `system`. Inference: on Bedrock, Vertex, Foundry or a gateway the inbox may pay full input price every call.
- "A gateway that converts block-form system content to a plain string drops the marker the same way." [PCACHE#where-the-cache-lives]
- `DISABLE_PROMPT_CACHING` and `DISABLE_PROMPT_CACHING_SONNET` in managed `env` turn caching off. [PCACHE#disable-prompt-caching] Both cache counts then read zero.
- "In Claude Code, the cache is effectively scoped to one machine and directory. The system prompt embeds your auto memory paths". [PCACHE#cache-scope] Whether the CLI identity block in front of the mod's `request.system` holds such paths is unknown. That decides whether open sessions share one cache entry.
- Tool lists: "the cache invalidates when the set of tool definitions in the request changes between turns." Plugin skills, hooks and monitors "never invalidate". Mods are not mentioned. [PCACHE#connecting-or-removing-an-mcp-server; PCACHE#plugin-components-that-keep-the-cache] Inference: registering the inbox's tools at `session.attach` or on hot reload may cost one uncached re-read of the main conversation.
- `$.model.fork` re-sends "The main thread's last request again (its model, system prompt, tools, messages) with `prompt` after it: every tool denied, its own tail never cached, the prefix billed afresh once the entry lapsed or after `/model`." [T: `model.fork`] A fork's "first request reads the parent's cache". [PCACHE#subagents-and-the-cache] So the catch-up runs on the session's model. Inference: a cold fork of a 200k-token Opus 5.5 conversation costs $0.80 to $1.60.

## The README figures

- README: "About 0.5¢ per reply, or 1¢ after 5 idle minutes"; instructions and tools "About 1,350, cached".
- Inference: a warm call (2k cached, 1.5k uncached, 100-250 out) at Sonnet 5.5 prices is 0.4-0.6¢. A cold call adds a 5-minute write, about 1¢. The figures match the Anthropic API. They are about 1.5 times low for Sonnet 4.5 or 4.6 on other providers.

## Where the cost shows up

- `claude plugin details inbox` (live): "Source: inbox@inline", Hooks (0), "Always-on: ~0 tok". It does not see the hooks module, its tools, its guidance text or its per-turn call. [PM#measure-what-a-plugin-costs]
- `/usage` attributes recent usage to "skills, subagents, plugins, and individual MCP servers". "An MCP server's share counts only the requests that consumed one of its tool results." [COST#plan-usage-breakdown] Whether the inbox's call appears is unknown.
- OTel `plugin.name` is set only for an active plugin skill or subagent. `query_source` is `main`, `subagent` or `auxiliary`. [MU#cost-counter] A mod call's category is unknown.
- `OTEL_LOG_RAW_API_BODIES=file:<dir>` writes `<dir>/index.jsonl` with `query_source` and `model` per response (2.1.274+). [MU] This is the cheapest way to see which model answered.
- `$.session.usage().cost` is "absent where the host keeps no ledger". [T: `session.usage`]
- "Claude Code doesn't report a plugin's usage back to its author." [PM#check-whether-a-plugin-is-used]

## Data handling

- Inference: the per-turn prompt re-sends Claude's reply and the ledger under the session's account terms: consumer training opt-in, 30-day or 5-year retention, commercial no-training, ZDR where enabled. [DU#data-training-policy; DU#data-retention]
- Telemetry "never include[s] your code, prompts, or file paths". [DU#telemetry-services] The opt-outs do not stop model calls.
- A survey "Yes" uploads "your conversation transcript, any subagent transcripts, and the raw session log file from disk". [DU#session-quality-surveys]
- Local transcripts are kept 30 days (`cleanupPeriodDays`). "Transcripts of sessions started or most recently continued in Claude Desktop or Cowork are exempt from that limit by default." [DU#data-retention]
