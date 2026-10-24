# Research mode

Research mode is a separate authenticated workbench, not another chat preset.
The UI at `/research` and raw `POST /v1/completions` relay to a fixed loopback
research service owned by `sage-control-plane`. Configure its origin with
`WORKSTATION_RESEARCH_URL` (default `http://127.0.0.1:18013`). Do not point the
normal chat upstream at it, change existing models, or expose engine control
endpoints. The control-plane guide is `docs/controlled-research.md` in that repo.

The research registry grants individual digest-based `read`/`complete` scopes
and physical-target access. No chat credential is silently upgraded. The initial
operator qualification can use the existing workstation owner credential, kept
only in memory; give students separate research credentials, not admin access.
Neither browser storage nor URLs contain those credentials. Logs never include
authorization values or raw prompts. The relay never falls back to the public
server chat key. It accepts no arbitrary backend address or executable command.

## Raw prompts

Text is passed verbatim as `prompt`; JSON token-ID arrays are passed unchanged.
There is no `messages` conversion, template, system prefix, search or SAGE answer
revision. The request preview shows every actual sampler/budget/seed parameter.
`add_special_tokens:false` is explicit in the UI by default, so native BOS rules
are not confused with a chat template. Users may explicitly request special
tokens. Raw outputs retain control tokens and are displayed as plain text.

The raw stream is preserved, including upstream finish reasons and `[DONE]`.
Generated usage is actual engine usage, not a UI character estimate. The
metadata receipt separates normal completion, length, incomplete EOF, failure
and client disconnect without pretending that cancellation has been confirmed.

## Metrics and timing

`/api/research/metrics?model=<physical-model>` exposes the authorized engine's
vllm metrics; the pre-existing workstation `/metrics` remains workstation metrics.
These are shared-engine aggregates and cannot be attributed to one request.
Startup configuration comes from identity-bound runtime evidence; an unknown
value is not shown as disabled. Speculative configuration, actual draft activity,
accepted tokens and measured speedup are separate facts.

Browser wall time includes Cloudflare, WS, network, queuing and inference.
`Server-Timing` distinguishes WS relay header latency from the research service's
engine HTTP header latency; the receipt also reports first raw text and total
engine-path HTTP time. Echoed prompt text/control tokens are still raw text, not
necessarily first answer content. No measurement is labelled GPU-only latency.
For the gateway-free path use control-plane `sage-research-benchmark` on the
engine host or a documented localhost SSH forward; it verifies native `/version`
and calls native `/v1/completions`, without Cloudflare, WS or research relay.

## Controlled APC / SuffixDecoding

The UI shows the actual mirrored factorial plan and its resource boundary.
It never flips shared production flags or clears shared caches. Execution is
operator-local through `sage-research-experiment`, with an explicit exclusive
GPU lease, clean pinned source, verified checkpoint/tokenizer manifests and
matched raw token-ID workload. Occupied cards are refused, not reclaimed.
The isolated process uses local multiprocessing, not the production Ray cluster.

Dependencies must be prepared in a separate environment, never installed into
the live engine to make a test pass. A startup failure, absent draft activity,
output mismatch or incomplete answer fails qualification; the runner cannot
silently choose another model or disable SuffixDecoding. Result artifacts belong
outside source control and should contain only authorized benchmark material.

## Qualification and release gate (2026-10-24)

- Workstation: 300 tests passed, lint/type checks and isolated standalone build
  passed. macOS fixture aliases were corrected to canonical temp paths without
  relaxing production private-file/symlink checks.
- Both real Qwen3.5 A100/A6000 backends accepted raw text and a token-ID array;
  five supplied IDs remained five prompt tokens. Streams completed with stop and
  `[DONE]`, and selected physical targets were retained with no fallback.
- The built WS relay also passed these actual engine requests, scoped access,
  native metrics and runtime configuration checks. Native A100 direct benchmark
  completed without CF/WS/gateway. These were synthetic smoke requests, not
  throughput/latency gain evidence.
- Both current engine instances were observed APC-on and speculation-disabled.
  The A6000 capture is checked against live API process start and served model;
  a restart invalidates it rather than retaining a stale enabled state.
- Authenticated browser checks on both physical targets covered real raw text
  and token-ID input, native metrics/configuration, normal stop, length and
  explicit local stop. They are separate from mocked unit tests.
- Release also requires the full mirrored eight-phase APC/Suffix factorial on
  explicitly leased GPUs. A configured switch or a safe occupied-GPU refusal is
  not execution evidence. Actual streamed token-ID and text hashes must agree;
  APC reuse and real speculative draft/accept counters must be observed.
- Qwen GDN numerical paths and hybrid cache geometry must be held fixed across
  groups. A native fused-CUDA versus standard-recurrence near-tie divergence is
  retained as negative evidence, not silently relabelled a speedup. Do not bypass
  unsupported batch-invariant capability checks. See the control-plane guide for
  the pinned runtime, common-path controls, current qualification and limits.
- This guide does not by itself claim production cutover, universal determinism,
  model accuracy equivalence or a performance improvement. Those require matching
  deployed versions and the retained real-experiment/browser records.

## Timing boundaries

The receipt panel separates engine-native scheduled-to-last-token time, initial
queue time, research-service-to-engine HTTP time and browser-to-stream-end time.
Native timings come from engine per-request metrics, never latency subtraction;
they include internal scheduling/CPU/distributed waits, not just GPU kernels.
Missing/invalid or incomplete native samples are not displayed as successful
inference latency. Browser stream time excludes the subsequent receipt fetch,
which is reported separately. Public browser time includes WS and the public
network path; HTTP timing does not isolate Cloudflare or gateway overhead.
