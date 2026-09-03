# Workstation independent audit — 2026-09-03

Scope: `https://ws.sage.org.ai/`, Workstation only. No inference restart,
model activation/download, real chat, research run, core/plugin edit, or
statecentric mutation is part of this audit.

## Runtime findings

The public endpoint initially returned a Sep 1 receipt for container
`66f82728ee416a59b290b6d71ec51f079b2df3854284ac093fa66e29876b6217`, image
`sha256:243cb61839db523c0f1cb69347df0373956279bda3f33d0e97899cea241759ae`,
core `ba07e4a48fc951300d97eb506217dd530583dea3`, plugin
`6f4c701573cc45c744aac136b524bd1742964deb`. It was not the serving container.

Read-only Docker inspection and container-local Python standard-library
metadata checks found:

| Identity | Observed value |
| --- | --- |
| Container | `sage-mate-vllm-shuhao-sage-mate` |
| Container ID | `c82ec990eafbffa19a1c92f3cc100799c181313a89f55344f9271fafadd3bc10` |
| StartedAt | `2026-09-02T12:25:43.59205152Z` |
| Image ID | `sha256:e37db6660c24c9cde10b3076c1146fdaa4366b6426130555643d1c5b2c3e68f9` |
| Image reference | `sage-mate/vllm-ascend-hust:core-762f85b3-plugin-124826b8-native6-cann9.1` |
| Docker image creation | `2026-09-02T20:24:35.359159014+08:00` |
| Build label timestamp | `2026-09-02T12:10:47Z` |
| Core source SHA | `762f85b311fbab0bcf8921dd216f5093cd58b9b8` |
| Core installed version | `0.28.1rc1.dev319+g762f85b31.empty` |
| Plugin source SHA | `124826b8c649e5680aa1c57d5504922c68c28ad3` |
| Plugin installed version | `0.25.1rc1+hust.20260902.9` |
| Runtime lock / source mode | `vllm-hust.production-runtime-lock/v2` / `immutable-wheels` |
| Model, public `/api/models` | `zai-org/GLM-4-32B-0414` |

Docker 29.1.3 reports a RepoDigest
`sage-mate/vllm-ascend-hust@sha256:e37db6660c24c9cde10b3076c1146fdaa4366b6426130555643d1c5b2c3e68f9`
(equal to the reported image ID). The API preserves that Docker RepoDigest;
registry pullability was not tested and is not claimed. Its `digestKind`
distinguishes a Docker RepoDigest from the fallback image-config ID, and the
actual Docker creation time from the OCI build timestamp. Reproduction requires
the matching lock, wheel archives and image build recipe (or an exported image);
a descriptive tag is insufficient.

Installed wheel archive hashes (from `direct_url.json`) matched the embedded
`/opt/vllm-hust-runtime/production-lock.json` and source labels:

- Core: `ac0c941e6c076198f9c97c45f878188030f7319cb3d5b1d20b60e8f7168eb51d`
- Plugin: `2a83aef9bf81ef659338b82ba5ffbb570886e8c8238867352b58d4a05fd01e04`

Module resolution points to installed `site-packages`, not host Conda. No
vLLM/torch import or NPU operation was used. Docker mounts do not overlay these
installed package paths. This is artifact provenance, **not an in-memory
attestation of already loaded engine modules**; the API explicitly reports
`verification.processSource: not-attested`.

`v0.23.0` is the compatibility-filesystem baseline, not the installed core or
plugin version. `latest-main-snapshot` names a frozen build profile, not current
remote main. At the Sep 3 01:55 UTC comparison, core main was
`86ffadbd8d27d6b17c7053420254caa239158774`, plugin main was
`1d2f1f87a7449cd86fd6c2946174224ee81def52`; GitHub compare returned the respective
runtime pin as merge base, with each main 33 commits ahead and zero behind.
No runtime update was performed.

The historical `0.0.dev20260901` was the previous image's source label, not the
current plugin package. Runtime governance documents explain that unconstrained
plugin `git describe` can reach v0.19 because newer release branches are not
ancestors of upstream main; the current lock uses an explicit HUST source tag.
Workstation does not rewrite a version string to pretend a different runtime.

Hardware API and host inspection agree: eight 910B2 devices, Kunpeng-920 with
192 CPUs (4 sockets, 48 cores/socket, 1 thread/core), MemTotal 2109313348 KiB
(rounded to 2.0 TiB). This describes the host, **not eight devices available to
the displayed model**. Missing accelerator telemetry is now shown as unavailable,
not a measured 0% utilization or 0 GB device.

## Freshness and operational contract

Capture with `scripts/capture_runtime_provenance.sh <serving-container>`.
The collector checks installed wheel metadata/hash against the embedded lock
and OCI labels, pins inspections to the container/image ID, and rejects a name
swap during capture. It never reads host Python package versions.

`/api/versions` reads the receipt and checks current container ID, image ID,
StartedAt and Running with read-only Docker inspection (cache at most 15 seconds).
The client refreshes every 30 seconds; version responses use `no-store`.
An older-than-24-hour receipt, a timestamp more than five minutes in the future,
changed/stopped container, inaccessible Docker, missing artifact evidence or
untrusted schema/repository fails closed with `available: false` and a visible
reason. A captured receipt alone is no longer live proof.

Operators must recapture at least every 24 hours while the Workstation remains
deployed. The initial audit did not install a timer; the explicitly requested
follow-up below now installs hourly refresh. Expiry still intentionally degrades
provenance display without affecting inference.

## UI and verification

- Current model badge uses the online model, not the catalog's default flag.
- Theme-specific chart/icon colors, readable catalog badges and buttons,
  explicit disabled controls, solid provenance popover and visible focus rings.
- Model/task overlays and mobile monitoring keep keyboard focus inside, close
  with Escape, and restore the opener. Theme keyboard toggle persists on reload;
  the existing pre-paint initializer is retained.
- Mobile catalog wraps long identifiers and keeps close/refresh controls usable.
- Removed unsupported end-to-end-encryption/zero-reporting claims; requests are
  accurately described as forwarded through Workstation.
- Backend control APIs, streaming semantics and task lifecycle remain unchanged.

Evidence directory: `output/playwright/audit-20260903/` (ignored local artifacts).
`before-{desktop,mobile}-{light,dark}.png` (desktop light is `before-desktop.png`),
`candidate-*`, and post-release `after-*` cover homepage, model catalog,
tasks/logs empty state, monitoring and provenance.
`scripts/audit/workstation-browser-20260903.js` performs real
browser navigation and keyboard checks at 1440x1000 and 390x844.
`scripts/audit/workstation-states-20260903.js`
captures empty/error/loading/offline/stale states with browser-only intercepted
requests, never forwarding a chat or task mutation to inference.

Run these through the Playwright CLI `run-code --filename=...` against an
already opened public Workstation session; create the evidence directory first.
The fixture runner always restores normal routing when it succeeds. Close its
browser session after a failure so simulated responses cannot affect inspection.

Computed-style evidence composites foreground alpha over ancestor backgrounds;
gradient/group-opacity cases are flagged for visual review, not blindly counted
as proven. Baseline light thinking text was 1.48:1; stat icons 1.70–2.35:1.
Candidate normal controls are 9.21:1, disabled controls 5.32:1 and body-muted
text 5.98:1 on the sampled light surfaces. Final measured results and release
verification are appended after public regression.

## Website ownership / upstream PR verification

Workstation has no contributions or release-history page. Those records live in
the separate `vllm-hust-website` repository (`vllm-hust.sage.org.ai`). It was
inspected read-only and left unchanged. Full sampled PR API records are in
`upstream-pr-checks.json` in the evidence directory.

Of 17 unique PR links in its achievements script, GitHub REST showed:

- Qwen Code #7701 and #5185 merged; #5185's head repository is deleted/null.
- Core #49035 open, personal fork `ShuhaoZhangTony/vllm`.
- Ascend #12316/#12343 draft open; #12317/#12342/#12344/#15585 open,
  personal fork `ShuhaoZhangTony/vllm-ascend`.
- Ascend #15543/#15544/#15545 open, organization fork
  `vLLM-HUST/vllm-ascend-hust`.
- Triton Ascend #918/#919/#920/#922/#923 open, organization fork
  `vLLM-HUST/triton-ascend-hust`.

The two organization repositories have `fork: true` with the corresponding
upstream parent. Open/draft submissions are not merged upstream achievements;
an organization-owned internal PR is not itself an upstream contribution.
Website changes/migrations require its owner. The task-message handoff tool
was unavailable, so no handoff delivery is claimed.

## Scope preservation

Started from main `17e2cc5` with six existing modified files (README, capture
script, MetricsDashboard, WorkstationClient, provenance implementation/test).
Their v2 immutable-wheel/stable-profile work was preserved and completed in
the same scoped files; no unrelated dirty file was discarded. Runtime and UI
changes are committed separately. The separate website and all serving-runtime
repositories are read-only throughout this task.

Pre-release protected statecentric identity:
`040c81e60426a02e308487d363136977c4a6f3f2d3978a8675a267e695ef5215`, StartedAt
`2026-09-03T01:44:19.377754274Z`; image
`sha256:94247ad0c33d98561637f201f3a499c07e9eb60b270cb66b4d6e73b4ef98e30f`.

## Release acceptance

- Runtime verification commit: `aff6a90`.
- UI and keyboard contract commit: `21bf441` (deployed application code).
- `npm test`: 47 passed across 8 files, including stale/mismatch/unverifiable
  provenance and focus/Tab/Escape/restoration tests.
- `npx tsc --noEmit`, collector `bash -n`, both browser scripts `node --check`,
  and `git diff --check`: passed.
- Standalone streaming fallback contract: 16 passed, 0 failed.
- Production `next build`: passed. Only Workstation was restarted by its
  existing `scripts/deploy_workstation.sh ci-deploy` workflow at
  `2026-09-03 10:18:17 CST`, new MainPID `3174360`.
- Public `/api/versions`: `available: true`, `verification.status: verified`,
  fresh receipt `2026-09-03T02:16:36.736727Z`, canonical exact commit links,
  current image/package identities above; HTTP `Cache-Control: no-store`.
  The response is saved as `online-versions.json` in the evidence directory.
- Public browser regression: 22 normal-state captures, both themes and both
  viewport sizes; no page errors or horizontal overflow. Theme persistence,
  modal focus restriction, Escape and return-to-trigger assertions passed.
- Public browser-only fixtures: 10 captures (empty catalog, catalog error,
  intercepted chat loading/error, offline/stale) across both themes; actual
  theme matched requested theme, scroll width 390, zero forwarded inference
  requests. Results are in `after-states.log`. Expected fixture HTTP errors
  are not classified as normal-page failures.
- Computed text/icon checks found no sampled in-viewport text below 4.5:1 or
  SVG icon below 3:1. Visible icon minimum: 3.30:1 dark / 3.63:1 light.
  This is targeted acceptance, not a claim of complete WCAG certification.

Rendered-background pixel samples (foreground alpha composited over actual PNG
background pixels away from glyphs) confirm:

| Element | Light | Dark |
| --- | ---: | ---: |
| Model-library control | 9.21:1 | 10.72:1 |
| Disabled model selector | 5.32:1 | 6.92:1 |
| Main explanatory text | 6.02:1 | 6.49:1 |
| Thinking-enabled caption | 6.32:1 | 7.04:1 |

Both themes expose a solid 2px keyboard focus outline. Read-only post-release
Docker checks confirm the Sage Mate and statecentric container IDs and StartedAt
values above are unchanged. The old Workstation build and receipt remain
recoverable at `.workstation-deploy/rollback-20260903.7yLNa4/`.

### Initial audit limitations (before the follow-up below)

- Standalone `npm run lint` is **not passed**: this repository has no ESLint
  configuration/dependency, so deprecated `next lint` opens its first-run
  interactive configurator. The production build's label “Linting” is not
  represented as successful standalone lint. No unrelated lint migration was
  introduced.
- Registry pullability and in-memory engine-module attestation were not tested.
- Website upstream-PR status/ownership changes were not made. Task handoff
  delivery remains unavailable even though a read-only peer status check worked.
- Provenance refresh scheduling is an operational follow-up: without recapture,
  the 24-hour expiry deliberately hides unverified version claims. No inference
  service will be restarted by expiry or the read-only collector.

## Requested lint and receipt-scheduling closure — 2026-09-03

The two operational follow-ups above are now closed:

- ESLint flat configuration uses Next.js Core Web Vitals and TypeScript rules.
  `npm run lint` is noninteractive and exits on any warning. Removed unused
  declarations, stabilized React callback dependencies, and narrowly documented
  the two Playwright CLI function-expression files. No broad rule suppression.
  Lint code/config commit: `42659de`. Existing runtime dependency versions did
  not change; ESLint 9 matches the current Next 15 configuration's peer range.
- CI checks lint, 50 Vitest tests, 16 streaming fallback assertions, eight
  fake-Docker collector integration tests, shell syntax and production build.
  The existing deployment workflow also gates builds on lint and ensures the
  receipt timer is installed before replacing the Web runtime.
- System-level `vllm-hust-workstation-provenance.timer` is enabled and active.
  Its oneshot service runs as `shuhao`; no linger change was made. Hourly
  calendar, boot trigger, persistent catch-up and up-to-120-second jitter keep
  receipts inside the existing 24-hour freshness limit while the host is up.
- Actual timer trigger: `2026-09-03 10:45:09 CST`; journal records successful
  collection, `Result=success`, `ExecMainStatus=0`. Reinstallation during deploy
  also passed immediate collection at `10:50:13 CST`. Next calendar trigger at
  acceptance was `11:01:03 CST` (jitter may change on timer reload).
- Collector captures serialize through a file lock; verified receipt replacement
  is atomic. The wrapper applies a 60-second timeout (5-second kill grace), with
  a separate 90-second systemd limit. Failure preserves the previous receipt and
  last-success timestamp. Expired receipts are still rejected by the public API.
  Failure visibility is local systemd/journal plus the atomic refresh-status
  JSON; no email/chat delivery is configured or claimed.
- Local acceptance: lint zero errors/warnings; 50/50 Vitest, 16/16 fallback and
  8/8 collector checks; `tsc --noEmit`, shell syntax, `git diff --check` and
  production build passed. Failure tests used temporary fake Docker binaries,
  including replaced/stopped containers, artifact failure, conflicting commit,
  timeout, invalid name and concurrent receipt writers; no production fault was
  injected.
- Existing `ci-deploy` restarted only Workstation at `10:50:16 CST`, PID
  `3296090`. Rollback Web build is retained at
  `.workstation-deploy/rollback-lint-timer.irWfYG/runtime/`.
- Public `/api/versions` at `02:51:33 UTC`: `available=true`, `verified`, receipt
  captured `02:50:13.935173 UTC`, age 80 seconds. Serving container/image/core/
  plugin identities match the earlier runtime findings; both Sage Mate and
  statecentric IDs and StartedAt values remain unchanged.
- Public Playwright regression: 1440x1000 and 390x844, light/dark, homepage and
  research/control views, keyboard theme persistence, Escape/focus restoration;
  eight screenshots in `output/playwright/lint-receipt-20260903/`. No page
  errors or horizontal overflow, zero mutation requests. Each modal bootstrap
  made two context and two admin GETs, with no request loop during observation.
  A font-preload warning was the only browser console warning.

Operational commands and pause/resume behavior are documented in README's
“每小时自动刷新与失败检查”. The registry-pullability and in-memory attestation
limitations above are unchanged; this follow-up does not modify the inference
runtime or the separate website.
