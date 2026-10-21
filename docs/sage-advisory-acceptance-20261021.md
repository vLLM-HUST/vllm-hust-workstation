# SAGE non-blocking advisory acceptance — 2026-10-21

## Scope and root-cause boundary

Raw answers still come from the same Qwen3.5 model with thinking enabled. No
sampling, model, template or budget changes were made for advisory integration.
The earlier independent CPU/eager versus native GPU diagnostics are recorded in
`native-thinking-budget-acceptance.md`: finite conditional checks support a
contextual model derivation/symbol-definition error, not a Markdown alteration
or SAGE rewrite. They do not prove every kernel or free-generation path correct.
This release adds evidence-backed warnings, not a claim to have repaired model
weights or all formula/factual quality.

The original failing expression omitted sequence length while defining a factor
as hidden width. SAGE now flags the missing dependency under its cited ordinary
full-attention payload assumptions. Composite dimensions remain conditional:
hidden width can combine heads and per-head width for ordinary MHA, but not
unconditionally for GQA/MQA, nor for the entire Qwen3.5 hybrid-state allocation.
Nothing is silently replaced with a corrected answer.

## Published and deployed versions

- SAGE main: `247da22194dfc8a1b8c00f2eafe4d4825c10b215`, then
  `7e74e8454935e4314671abc6921b9c29c798a7d8` (Chinese/composite scope).
- Workstation main: `842a23df829c77ec3dd56eeb06a1c2de831ec15a`, then
  `fe2cb687079c2d1d9ba862874eaa76d56724cfd4` (manual historical re-audit).
- Production web release: `fe2cb687...-20261021-advisory-v2`, switched
  2026-10-21 10:05:44 CST; PID1776159, zero automatic restarts.
- CPU-only loopback SAGE sidecar: `7e74e845`, PID1759698, port55109.
- Protected engine3559431/f180e0a, router1359620 and Twin1058851 unchanged.
  No inference-engine restart, model switch, thinking disable or GPU allocation.

## Tests and fault isolation

- SAGE: 14 focused tests on Mac and A100; full local suite668 passed, one existing
  CI-only skip. Subprocess tests require explicit `PYTHONPATH=src`; the first
  misconfigured run is not counted as passing. Relevant Ruff checks pass.
- Workstation:294 tests/47 files pass in the clean A100 build;18 host-helper
  tests pass; lint, TypeScript, production build and standalone checks pass.
  Mac full runs initially hit the existing EvoScientist import-probe five-second
  timeout (isolated probe4.932s); subsequent full run294 passed. No timeout or
  acceptance standard was relaxed. A100 independently passed all294.
- Native frontend test holds advisory indefinitely pending while raw completion
  and next-turn controls become available; no reasoning is submitted. Manual
  historical auditing uses only nearest user question and unchanged answer,
  without a second `/api/chat` request. Partial/cancelled answers do not auto-audit.
- Malformed/stale digest/source/quote and unavailable-sidecar checks fail closed
  only for advisory status. Actual isolated preview with unreachable sidecar
  returned advisory503 while a real thinking-enabled native chat completed with
  nonempty final content and stop. Preview was terminated after qualification.
- Legacy build helper's stage record hardcodes16 Python tests. The qualification
  report parses the build log and records the actually executed18; do not cite16.
- Google Fonts DNS failed twice during isolated build, then resolved; build
  completed without a font mock, source patch or production environment change.

## Original-question public browser acceptance

New Chrome incognito session; actual `https://ws.sage.org.ai/`, no interception,
simulated responses or request-parameter edits. Default thinking on, search off.

1. 09:49 CST: `请用一句中文解释KV缓存的作用。` completed with a Chinese final
   answer, separate collapsed reasoning,1064 upstream output tokens including
   reasoning. No formula => explicitly unchecked, never a correctness pass.
2. 09:51 CST: original12-point teaching-note/table/formula follow-up, unchanged.
   Gateway trace `b258d119e7e87596412c6f82fed07d72`: locked A100 alias,
   `enable_thinking=true`, `max_output_tokens=32768`;41.438s to upstream end,
   `response.completed`,1505 final characters,6810 output tokens including5965
   reasoning tokens. First-output1410ms is not full-response latency.
3. First catalog correctly said unchecked but missed the Chinese quantity. This
   coverage failure was retained and repaired, not bypassed with another prompt.
   New catalog identifies the same Chinese expression's batch-one assumption and
   MHA/GQA composite-width ambiguity, without calling the simplified formula
   categorically wrong. Dependency-only checks do not cover its separate prose
   assertion that cached decode complexity is constant.
4. After app-only release, refresh restored the exact same two answers. Clicked
   “核验此回答”, observed pending then “2项待核对”, expanded exact formula quote,
   source link, assumptions and limitations. Raw formula/table remained rendered;
   advisory quotes intentionally preserve literal source text. No regeneration.
   Narrow exact-question/time query found only the original single long request.

Original raw-answer SHA256:
`4f6bffcd1197c9aadb3b72e8c75a9d8a5d7c2a61eddc8b6649d4ad3b37e89e6d`.
Loopback SAGE, Workstation proxy and browser accepted the same question/answer
digest binding. No hidden reasoning or unrelated user conversations exported.

Real screenshot saved and reopened:
`/Users/shuhao/Downloads/ws-sage-advisory-original-20261021.png`.
During refresh, native Chrome briefly showed a gray content surface despite
public HTTP200. Opening its own DevTools restored the page with zero console
messages; the final normal-view screenshot and disclosure were verified. This
is not evidence that advisory repaired Chrome's rendering infrastructure.

## Deployment evidence and rollback

Private operator evidence: `/home/shuhao/ws-advisory-qa.CioLh2/` contains build,
qualification, deployment, SAGE stage and original-advisory records. Earlier
first-release and negative evidence remains under `ws-advisory-qa.ICnpKh`.
No complete environment, credentials or hidden thoughts are included.

Web rollback: atomically point
`/home/shuhao/vllm-hust-workstation-release-19125c66/.workstation-deploy/current`
to the retained release
`/home/shuhao/vllm-hust-workstation/.workstation-deploy/releases/842a23df829c77ec3dd56eeb06a1c2de831ec15a-20261021-advisory`
and restart only `vllm-hust-workstation.service` after active chats drain.
For full pre-advisory web rollback, the retained prior release is
`362ccc3e18ce987884c9d063d5219335450dfd9b-20261020-loop-ui` in the same directory.
Sidecar rollback: restore `sage-advisory-unit.rollback` from the QA directory to
the same user unit, daemon-reload and restart only `sage-answer-advisory.service`.
Stopping only the sidecar leaves chat functional and advisories unavailable.
Do not restart inference engines, router or Twin for either rollback.
