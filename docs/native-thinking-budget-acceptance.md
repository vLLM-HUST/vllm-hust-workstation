# A100 native reasoning transition: release and acceptance

## Root cause and implementation

The exact original two-turn Workstation request exhausted32768 output tokens in
reasoning, producing no final body. Its native Responses terminal was named
`response.completed`, but its nested status was `incomplete`, reason
`max_output_tokens`. HTTP200 or an event name alone did not establish success.

The deployed engine already supported a native `thinking_token_budget` decoder
control in Chat Completions. Responses omitted its field/mapping; model generation
defaults also filtered it out. The fix adds Responses forwarding and model-default
propagation to Chat/Responses, preserving explicit0, null and native-1/unlimited
semantics. No prompt instruction, model switch, thinking disablement or total
output allowance increase is used.

Engine main implementation: `12bef35`; minimal qualified7c runtime backport:
`a68500df188a2cdee29f82cce4df63ae191d146f`; main ancestry merge: `0fe80bb`.
The old CUDA/native artifacts are reused; unrelated latest-main engine changes
are not deployed. All runtime ignored build inputs, not just17 shared libraries,
are staged. The source observer fingerprints5220 files, including1987 ignored
build inputs, excluding bytecode caches. Package installation metadata still
reports its original7c build version; the running Python source commit is shown
separately and must not be confused with rebuilt CUDA artifacts.

## Authorized cutover

The first attempt failed on omitted FlashAttention Python build inputs and was
rolled back. The human explicitly approved one further reversible A100 cutover.
Second cutover:2026-10-20 17:06:17–17:09:45 Asia/Shanghai. Engine PID1581154;
no automatic retry or rollback on this second attempt. The original
`Restart=on-failure` policy was restored after readiness without another restart.
All69 A6000 health samples during the cutover returned200.

Only `vllm-hust-qwen35-engine.service` changed. Gateway1359620,
Workstation1478667 and Twin1058851 stayed unchanged. The deployed working directory
is `/home/shuhao/vllm-hust-releases/native-thinking-a68500d`, using the original
interpreter, model, TP2, GPU allocation,131072 context and other launch settings.
The single generation override is `{"thinking_token_budget":16384}`. WS total
output default remains32768. A6000 is unchanged and is outside this release scope.

## Exact public-browser acceptance

A new Chrome incognito window used the actual public website, A100 alias,
default thinking ON and search OFF. No interception, simulated response, webpage
patch or manually supplied generation parameter was used. Questions:

1. 请用一句中文解释KV缓存的作用。
2. 请接着刚才的KV缓存解释，写一份中文教学笔记：列出12条编号要点，每条约80字，最后用Markdown表格对比缓存、重计算、迁移三种策略，并给一个简单公式。不要使用联网工具。

Both returned separate Chinese final bodies. The second displayed12 numbered
points, a real Markdown table and rendered math; reasoning remained separately
folded. Scrolling upward exposed the return-to-latest control; this is a focused
interaction check, not a comprehensive long-history/scroll regression result.

Read-only inspection of only the matching synthetic gateway trace confirmed:

| Field | Actual value |
| --- | --- |
| Requested model | `Qwen/Qwen3.5-35B-A3B-A100` |
| Thinking / total output | true /32768 |
| Request thinking budget | absent; engine model default applies |
| Roles | system,user,assistant,user |
| Upstream HTTP / terminal |200 /`response.completed`, nested `completed` |
| Incomplete details | null |
| Final body |1461 characters |
| Output / reasoning tokens |6401 /5592 |
| Elapsed gateway request |39.183 seconds |

Native Chrome capture `ws-native-thinking-long-answer-20261020.png` was saved
and reopened to verify the actual final table, math and new source footer.
Its1584ms UI number is not reported as full-response duration.

## Controls and automated coverage

- Runtime protocol tests:16 passed. Both main/backport applicable pre-commit
  hooks, including type checks, passed. Latest-main protocol suite:19 passed,
  two pre-existing custom-tool cases failed identically on unmodified main
  (five passed,two failed). Those unrelated assertions were not weakened.
- Native Responses boundary control with explicit128 thinking/2048 total tokens:
  reasoning127 tokens, final body, nested `completed`,1.255s. This diagnostic
  proves the native transition;128 is not a production setting or quality test.
- Additional default two-turn repeat against the same live WS loopback endpoint:
  no budget parameters; both HTTP200, final body, `finish_reason=stop`, `[DONE]`.
  Long turn37.547s,6161 output/5382 reasoning tokens. Public Python POST returned
  403; no edge controls were weakened. Public acceptance is the real Chrome
  session above, not a claim that the loopback probe crossed Cloudflare.
- Source verification remains positive for the actual new A100 commit and PID.
  It still does not attest process memory, A6000/auto or MOD effectiveness.

## Quality limits and rollback

Delivery and rendering passed this exact test; scientific correctness did not
fully pass. The browser answer's KV memory formula omits sequence length and
defines head dimension ambiguously. This is preserved as a model-quality failure,
not corrected in the renderer, silently replaced or relabelled as accepted.
These finite checks do not guarantee final-answer completeness for every prompt.

### Independent repeat: the loop is bounded, not eliminated

A subsequent independent public-browser original-question repeat at17:26CST
took105.409 seconds, not the39.183-second observation above. Read-only inspection
of only that exact synthetic trace confirmed the same A100 alias, thinking ON,
32768 total allowance, system/user/assistant/user roles, HTTP200 and nested
`completed` with no incomplete details. It emitted1725 final-body characters and
17362 output tokens, of which16383 were reasoning tokens. The independent
browser reviewer observed repetitive arithmetic in the thinking display until
near the native limit. This is evidence that the boundary preserves a final
answer after pathological thinking, not that it eliminates reasoning loops or
establishes stable37–39-second latency. Reasoning efficiency remains unresolved.

Independent390×844 streaming inspection observed user-controlled upward history
scrolling and retained latest/unread indicators until completion without a forced
jump. After the human foregrounded Chrome, the reviewer confirmed the visible
landing, light/dark readability, keyboard table scrolling, actual copy into an
unsent draft, four-message JSON download and exact refresh recovery. This clears
those previously pending checks, not the remaining layout defects below or all
experience acceptance. No further engine maintenance is authorized by the
reviewer message.

### Follow-up: native sampling defaults and matched controls

The qualified runtime has two additional parameter propagation defects:
`ModelConfig.get_diff_sampling_param()` filters out model-level presence/frequency
penalties, and Chat's request defaults/forwarding override model defaults with0.
Latest main already fixes this code. The qualified-runtime backport `9544b29`
repairs both without importing unrelated engine changes; main `71ae858` adds
Chat/Responses parity and unset/null/explicit0/explicit-value precedence coverage.
Main merge `a25348c` retains the backport ancestry. Runtime focused tests:20 passed;
latest-main suite:23 passed, two unchanged pre-existing custom-tool failures.
Applicable pre-commit hooks passed. These commits are **not yet deployed**.

Official Qwen3.5 recommendations distinguish general thinking (presence1.5) from
precise coding (presence0). The shared engine cannot blindly adopt the general
setting for every Codex request. No production sampling change or restart was
performed in this follow-up.

Direct native Responses controls replayed the exact synthetic two-turn context,
same weights, stream/thinking enabled,32768 total and unchanged native16384 guard.
Only seed and explicit presence penalty varied; each used a unique cold cache
salt, with cached_tokens0. The original question was not replaced.

| Seed | Presence | Seconds | Reasoning tokens | Repeated `1+1` occurrences |
| --- | --- | --- | --- | --- |
|0|0|44.921|6670|4|
|0|1.5|33.148|4642|0|
|1|0|52.663|7996|9|
|1|1.5|26.719|3520|0|
|42|0|51.063|7733|1|
|42|1.5|34.230|4824|0|

All six emitted final bodies and nested completed/no-incomplete status. None hit
the reasoning guard: this is evidence for a sampling contribution, **not proof
that the independently observed16383-token pathological loop is eliminated**.
Reasoning repetition metrics were retained, not raw hidden reasoning text.
Formula/technical errors persist in these below-cap answers, including omitted
KV factors/dtype and a dimensionally inconsistent latency expression. Those are
generated source-text errors, not broken KaTeX or a reason to silently rewrite
the answer in the renderer. Scientific quality remains an open release gate.
A separate explicit GQA-formula diagnostic at the same recommended sampling
returned the correct theoretical factorization and256MiB numerical result in
33.172s (3708 reasoning/5436 output tokens, nested completed). Its ancillary
claims about allocation/quantization still need qualification. This diagnostic
does not replace or clear the failed original long-question acceptance.

### Browser defects repaired in main, pending deployment/retest

Workstation `362ccc3` fixes full release/log-path wrapping and minimum widths in
the390px runtime drawer; it does not mask the problem with horizontal clipping.
It also labels the footer duration as first output, explicitly including thought
increments, rather than implying total response latency. Focused tests10 passed;
Linux full suite280 passed, Python host-observer tests16 passed, lint/type checks,
production build and standalone check passed. The isolated3006 preview passed
positive/negative source-observer qualification, without production mutation.
Production Workstation remains the prior immutable build until approved cutover.

Twin frontend `5f683ad` gives the unified advanced workflow its computed drawing
width, enabling real local horizontal scrolling instead of shrinking40 nodes into
260px. Its15 JavaScript test scripts passed. Only `app.js` and `styles.css` were
hash-guarded and atomically replaced on2026-10-20 19:38CST, preserving the existing
backend112e924, other frontend overlays and service PID1058851. The public app.js
hash matches the deployed main artifact. Independent Chrome retest confirmed the
390×844 graph legibility, actual keyboard horizontal scrolling and no page-wide
overflow on the reviewer's own old session. Screenshot:
`twin-independent-mobile-graph-fixed-20261020.png`.

The reviewer's feedback GET404 is also the API's documented no-current-feedback
result, intentionally indistinguishable from an unavailable/foreign exchange;
restoration catches404. `/local-code/config`403 is expected on the faculty/public
deployment. Neither observation alone proves lost ownership, and no legacy
records were claimed or access checks weakened. Exact-record diagnosis would
require the reviewer's own exchange identifiers.

Retain the original clean source and engine environment. To roll back, first
obtain maintenance authority, drain A100 requests, recoverably move
`~/.config/systemd/user/vllm-hust-qwen35-engine.service.d/90-native-thinking.conf`
to the private cutover audit directory, daemon-reload and restart only that engine.
The original unit then uses `/home/shuhao/vllm-hust-canonical-overlay` at7c82451c.
Do not reset source, modify credentials, restart the gateway or touch A6000.
Rollback to the original engine was exercised after the first failure; a further
post-success rollback was not run merely to generate a second interruption.
