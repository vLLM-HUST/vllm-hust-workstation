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

### Native repetition-path candidate, not yet production-qualified

Further read-only checks found matching config, generation config, tokenizer
config and weight-index hashes on A100/A6000. Full weight blobs were not rehashed.
A100 is BF16/no quantization/no MTP, Triton/FLA GDN prefill, CUDA decode, and
FlashInfer sampling disabled. Its qwen3 parser matches the official recipe.
Native packed-recurrent kernel tests8 passed. No observed kernel defect is claimed
from these finite checks. Identical seed42 Chat/Responses sampling emitted the
same5720 output/4824 reasoning tokens. A6000's matched Chat replay still produced
technical/formula errors (7205 output/6345 reasoning tokens,126.025s,stop/DONE).
Temperature0.6 did not reliably resolve repetition/formula quality either.

Tokenizing only the exact synthetic failed trace showed6,675 occurrences of one
32-token n-gram within16,383 reasoning tokens. A new **opt-in native** processor
suppresses repeatedly traversed n-gram continuations inside reasoning, not the
final body. It never forces a reasoning-end token or changes any token budget.
It derives boundaries from the configured tokenizer, preserves stop/boundary
tokens, expires old history, and keeps a valid distribution if other constraints
leave no alternative. This is lexical de-looping, not a scientific-fact verifier;
legitimate repetition may trigger it and paraphrased loops may escape it.

Core main implementation `9ac8c50`, qualified minimal backport `2d7e9d6`, main
ancestry merge `5985c50`; all pushed. Main sampling/thinking suite65 passed;
focused main/runtime guard tests14 passed each; applicable pre-commit hooks
including mypy passed. Exact failure-path offline replay first suppresses an
original continuation at token3,040, before the16K guard; replay cost0.0885s for
16,383 tokens and final-body logits unchanged. This counterfactual replay is not
live model-quality acceptance.

Candidate `/home/shuhao/vllm-hust-releases/reasoning-guard-2d7e9d6` contains17
unchanged native artifacts and all1,987 ignored build inputs. Worker import,
actual tokenizer reasoning markers and the native custom-processor loader passed
without loading another model instance. An incremental bundle initially failed
on incomplete shallow-history dependencies; a full bundle fixed staging. The
failed directory was retained in the private QA area; production was untouched.

`scripts/deploy_native_thinking_budget.sh` accepts an optional fourth argument
`reasoning-repetition`. That mode installs a separate95 drop-in, preserving the
active90 drop-in for rollback. Its original default mode is unchanged. It retains
idle guards, no automatic candidate retries, A6000 health checks and unchanged
other-service PID assertions. Candidate settings are32-token n-grams, at most3
occurrences in512 tokens; existing sampling defaults, thinking16K/total32K,
model,TP2 and131K context are unchanged. Further inference maintenance requires
fresh human approval. Formula correctness and original-question browser
acceptance remain pending; no production deployment of this candidate is claimed.

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
The human subsequently approved a Workstation-app-only restart. After fresh
positive/negative preview qualification and active-chat drain, code362ccc3 was
published at2026-10-20 20:26:16CST. App PID changed1478667→2436575; engine1581154,
router1359620 and Twin1058851 stayed unchanged. Stable environment values matched;
only systemd invocation variables differed. Runtime immutable directory suffix:
`362ccc3e18ce987884c9d063d5219335450dfd9b-20261020-loop-ui`. The prior immutable
dd486bc build remains available for an authorized app-only symlink rollback.

Public discovery/source API checks passed. The browser-tab control bridge timed
out for both IAB and named Chrome tab creation; native Chrome control worked.
A separate fresh incognito window preserved the independent reviewer's windows.
Default A100/thinking ON one-sentence KV question returned a Chinese final body,
separate folded reasoning,1513 upstream total tokens and explicit `首次输出827ms`
label. This is not full-response latency or a scientific-correctness claim.
Native DevTools390×844 light-mode inspection showed the entire long release/log
path wrapping inside the runtime card, without a horizontal drawer scrollbar.
`ws-release-mobile-drawer-fixed-20261020.png` was downloaded and reopened to check
the actual page pixels. Dark-mode answer and first-output label were readable.
The original complex follow-up was sent at20:34CST and returned12 points, rendered
table/math and a separate folded reasoning section. Its exact synthetic trace
`ed93ec53999f54551e084877cb4e5356` confirmed32.136s,32768 total allowance,
thinking true, cached0,5207 output/4538 reasoning tokens and nested completed with
no incomplete details. The visible1549ms label is first output, not32.136s total.
`ws-release-dark-final-20261020.png` was downloaded and reopened. Address-bar
reload restored both questions and complete answers with table/math/usage.
The formula remains an underspecified asymptotic growth expression and other
technical claims remain inaccurate; this is delivery/UI acceptance only, not
clearance of the outstanding scientific-quality/loop-elimination gates.

During inspection Chrome logged transient ERR_SSL_PROTOCOL_ERROR for three
polling requests (local-service/versions/metrics). A subsequent versions poll
restored verified provenance; separate public curl also succeeded. This observed
transport fault is retained rather than attributed to the layout patch, hidden,
or presented as proof of a restarted inference engine.

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

### Native repetition-guard maintenance result (2026-10-20)

The human explicitly authorized continuing same-scope, reversible A100
maintenance without repeated approval requests. This does not authorize other
hosts, model changes or unrelated workloads. Candidate runtime `2d7e9d6` (feature
reachable from core main `5985c50`) was staged with the byte-identical existing
native build inputs. The committed deployment helper's `reasoning-repetition`
mode enabled only the experimental reasoning-only 32-token continuation guard
(three occurrences within512 tokens). Model, thinking ON,32768 total allowance,
16384 native thinking budget and sampling defaults remained unchanged.

Candidate became ready at21:17:06CST, PID2647063, NRestarts0. Router1359620,
Twin1058851 and Workstation2436575 were unchanged; every A6000 health sample in
the cutover watch returned200. Private audit: `ws-thinking-cutover.AuMbmx`.

Exact original synthetic-context, cold-cache Responses controls completed:

| Seed | Presence | Reasoning tokens | Output tokens | Terminal |
| --- | --- | --- | --- | --- |
|0|0|9012|9777|completed|
|1|0|5397|6320|completed|
|42|0|5480|6350|completed|

No incomplete details were reported. The guard logged an actual repeated-path
detection at output token1528 for seed0. This is live activation evidence, not
proof that all semantic loops are eliminated. Seed0 used more reasoning tokens
than its6670-token guard-OFF control; the result is mixed, not a universal gain.
Later controls overlapped the browser QA, so elapsed times are not an isolated
throughput comparison. No raw hidden reasoning was exported.

Scientific quality **failed**: seed0 claimed cached decoding becomes constant
time; seed1 claimed the query interacts only with the latest KV; seed42's memory
formula multiplied hidden size by another per-head dimension. Exact-n-gram
blocking cannot establish factual correctness, and shorter thought is not a
quality metric. These results reject promoting this mitigation as the fix.

In a separate fourth Chrome incognito window, ordinary public default controls
sent the original one-sentence question at21:18CST and the unmodified12-point
follow-up at21:19. A100 alias and thinking ON remained selected. Both returned
Chinese final bodies, separate folded reasoning, a real Markdown table and
rendered math. Exact owned trace `705e3da8825361638c9f3635e2261928` confirmed:
HTTP200;32768 max_output_tokens; enable_thinking true; cached0;6325 output tokens,
5438 reasoning tokens;1577 final-body characters; nested completed with no
incomplete details; elapsed51.669s. The visible1332ms is first output, not total.
Screenshot `ws-native-guard-original-formula-20261020.png` was downloaded through
Chrome and reopened. Its formula is the MHA/single-sequence special case without
stating those assumptions; rendering passed, scientific qualification did not.

After three idle samples, only95-native-reasoning-repetition.conf was recoverably
moved into the audit as `rejected-quality-candidate.conf`. The original90 override
remained. Rollback started21:22:27CST and a68500d was healthy at21:24:07CST,
PID2689125, NRestarts0. A6000 remained200. Public browser provenance returned to
a68500df18; an address-bar reload preserved both turns and the rendered table/math.
The experimental guard is **not enabled in production**. Main contains the
opt-in implementation/tests and this negative qualification; no renderer rewrite,
replacement question, disabled thinking or model switch was used to manufacture
a pass. Loop elimination and original-question scientific quality remain open.

Read-only follow-up hashed all14 safetensors shards (about72GB) on A100 and
A6000 at low CPU/I/O priority. Every per-file SHA256 matched across the two
deployments, as did their recorded model revision
`59d61f3ce65a6d9863b86d2e96597125219dc754`. This excludes a host-specific weight
file difference, **not** shared corruption or numerical implementation errors.
Independent official upstream blob-hash validation was unavailable: A100 direct
DNS failed, Mac direct HTTPS timed out, and the web reader could not open the
metadata/raw-pointer endpoints. No service proxy or routing was changed.

An additional isolated Transformers5.18.0 CPU BF16/eager teacher-forced reference
used the same local weights and tokenizer, offline mode, CUDA hidden, four CPU
threads, nice19/idle I/O priority and a900s deadline. No missing/unexpected model
keys were reported. Reference convolution and GDN used PyTorch implementations,
not the live CUDA/FLA kernels. No service/environment installation was changed.
Initial diagnostic setup errors (the tokenizer's new return_dict default and
absent accelerate for device_map) were repaired in the isolated diagnostic by
requesting token IDs explicitly and using ordinary default CPU placement; no
production package was installed or modified.

On the exact127-token original synthetic prompt,126 teacher-forced positions had
mean absolute log-probability error0.07451, maximum0.99723 and top1 agreement96.83%
between CPU and native prefill. On that prompt plus the first3000 reasoning tokens
from the owned original failing trace, native generated32 tokens with seed42 and
the existing sampling. CPU teacher-forced comparison of those32 **decode**
positions gave mean absolute log-probability error0.01947, maximum0.10233, top1
agreement90.625%, in168.687 CPU-reference seconds. No raw reasoning/token IDs were
exported. Both services remained healthy and the CPU process exited normally.

These are finite numerical diagnostics, not an accuracy tolerance qualification
or proof that all long recurrent states are correct. They do not show a gross
kernel probability divergence at the sampled original-loop-prefix positions.
Together with matched Chat/Responses and cross-host evidence, they narrow the
investigation; they do not justify blaming the renderer, declaring all engine
kernels correct, or claiming that formula hallucinations have been fixed.

Retain the original clean source and engine environment. To roll back, first
obtain maintenance authority, drain A100 requests, recoverably move
`~/.config/systemd/user/vllm-hust-qwen35-engine.service.d/90-native-thinking.conf`
to the private cutover audit directory, daemon-reload and restart only that engine.
The original unit then uses `/home/shuhao/vllm-hust-canonical-overlay` at7c82451c.
Do not reset source, modify credentials, restart the gateway or touch A6000.
Rollback to the original engine was exercised after the first failure; a further
post-success rollback was not run merely to generate a second interruption.

## Engine-first qualification update, 2026-10-20 late evening

This section supersedes earlier candidate/authority statements, not historical
observations. The human authorized continuing reversible A100 maintenance and
required SAGE verification to remain a separate side channel: no rewriting or
replacement of raw model output, no model/thinking/budget change.

The old custom repetition processor changed Model Runner V2 to V1. Its ON/OFF
results therefore cannot establish the isolated effect of repetition masking.
The new native V2 implementation is main `a4c2404`, with exact qualified runtime
backport `f7cea8c` retained in main ancestry. It uses only additional configuration,
not the legacy custom-processor flag. Runtime trace replay is OFF. Main GPU and
loader regression:53 passed; minimal runtime GPU regression:34 passed. Applicable
pre-commit/type checks passed. Workstation cutover helper main `cfa9673`,18 tests.
These are implementation checks, not yet model-quality acceptance.

The original two-turn synthetic question with unchanged request sampling defaults,
seeds0/1/42 and cold cache salts completed in45.080/52.285/50.601seconds, reasoning
6670/7996/7733tokens, largest repeated24-character fragment10/15/9 times. This batch
did not reproduce severe looping and cannot prove a guard works. A separate
known-loop stress control retains the original question and explicitly fixes
temperature0.6/presence0.5/seed42. OFF reproduced103.380seconds, reasoning16383tokens
and largest24-character repeat6322 times. These are stress parameters, not a claim
that the website defaults use them. Matched ON and fresh-browser qualification
remain pending at this checkpoint.

Further numerical qualification replayed8192 tokens from only the owned original
failure trace through sequential decode and teacher-forced prefill. Top1 agreement
was99.4751%, mean absolute logprob difference0.00701934; the final193 positions
agreed100%, with mean difference0.0000111014. In that tail, the original repeated
token had geometric mean probability0.9999698. This supports model-distribution
collapse on the tested path, not a universal proof of kernel correctness. Actual
fused CUDA GDN head-ratio tests22 passed. All14 A100/A6000 weight shard hashes and
tokenizer.json matched the official checkpoint revision
`59d61f3ce65a6d9863b86d2e96597125219dc754`; official small-config/template hashes
were not independently qualified by that check.

Increasing global presence penalty or removing it only from the final stage did
not reliably fix formulas. No tested sampling combination was promoted as a fact
repair. The V2 guard does not validate semantics or guarantee correct formulas.
