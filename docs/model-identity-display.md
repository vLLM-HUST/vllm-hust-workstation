# Current model display acceptance (2026-09-03)

The public model selector returned `Qwen/Qwen3.8-27B`, while the right-side
metrics card reported `zai-org/GLM-4-32B-0414`. `/api/metrics` previously preferred
merged internal/default, Prometheus and stats labels over current discovery.

Web revision `159f909` resolves the display identity from healthy engine discovery,
then live model discovery when engine management does not report unhealthy.
Historical metric labels and configured defaults cannot become the current model.
An empty/unavailable discovery is `未核验`; multiple observed models are listed.
Numeric metric merging and inference configuration are unchanged. The sidebar
wraps long model identifiers and exposes the full identifier in its title.

- Seven route regressions; 100 Vitest tests, zero-warning lint, production build
  and standalone startup/helper checks passed.
- Local candidate and real public Playwright checks passed at1440 and390×844,
  light/dark. Both model APIs agreed, the full sidebar label was unclipped, no
  horizontal overflow or JavaScript page errors occurred. The unavailable-model
  display was checked with a browser-only response fixture, not a service outage.
- Reproduction: `scripts/audit/model-identity.js` with Playwright CLI on an opened
  candidate/public page. Browser mutations and inference requests are blocked.
- Before: `output/playwright/model-sidebar-before.png` and the initial API mismatch.
- After: `output/playwright/model-sidebar-public-1440-light.png`,
  `model-sidebar-public-1440-dark.png`, `model-sidebar-public-390-light.png`,
  `model-sidebar-public-390-dark.png`; local equivalents use `-local-`.
- Only the Web service was restarted. The selected Sage Mate container retained
  `5f3cae57a2c54e3645892b72a0cf91c0c86a1d1594d368bcab205fe88971f80f`, started
  `2026-09-03T05:23:58.405394962Z`. No model switch, inference restart or
  statecentric control command was performed.
- Previous Web bundle is recoverable at
  `/data/vllm-hust-workstation-shuhao/archive/pre-model-identity-180518c`.

This correction is independent of the Mod lifecycle owner integration. No
permission to modify or take over the Sage Mate launcher was inferred.
