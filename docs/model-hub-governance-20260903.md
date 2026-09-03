# Model hub governance and scoped cleanup — 2026-09-03

## Delivered behavior

- Public catalog is read-only: no `modelsDir`, absolute storage paths or low-level
  download errors. Admin responses use no-store and vary on the admin header.
- Existing admin token protects download POST, cancellation DELETE and legacy
  activation at the server boundary. The masked input keeps the token in modal
  memory only and clears it on close.
- Removed fake activation (writing .env / changing client selection without
  switching the engine). Authorized activation returns 409; anonymous returns
  401. No serving-model switch is offered.
- MODEL_HUB_DIR must explicitly name an existing writable absolute directory;
  empty/relative/root/unavailable paths disable downloads. Production uses
  `/data/vllm-hust-workstation-shuhao/models` (shuhao, 0750), isolated from serving
  weights. No weights were migrated or downloaded.
- Downloads require estimated weight size + 10% margin + 5 GiB reserve and allow
  one active download per standalone server, including serialized preflight.
  Symlink targets are rejected; gated repositories require HF authorization.
- Completion checks config.json and all indexed shards, not just the first file.
  This is not cryptographic integrity verification or NPU compatibility proof.
  Cancellation retains partial files, sends SIGTERM then SIGKILL after 5 seconds.
  Downloader processes do not inherit administrator/upstream API keys.

## Cleanup and recoverability

No shared Sage Mate/statecentric/vLLM cache, image, weight or task data was deleted.
Original .env and receipts remain intact. Three old root-disk rollback directories
were moved, retaining their names:

| Previous .workstation-deploy directory | Allocated bytes moved |
| --- | ---: |
| rollback-20260903.7yLNa4 | 102,694,912 |
| rollback-compact.Kv9hnC | 130,371,584 |
| rollback-lint-timer.irWfYG | 209,854,464 |

Recover them under `/data/vllm-hust-workstation-shuhao/archive/`. The immediate
pre-change Web runtime is also preserved at `archive/pre-model-hub-783189b/runtime/`.
Old versions have the old permission gap and are not a permanent public solution.

Next tracing recursively bundled prior deployments. Specific exclusions prevent
this. Root deployment directory shrank from about 825 MiB to **83,177,472 bytes
(79.3 MiB)**; .next shrank from about 519 MiB to **202,285,056 bytes (192.9 MiB)**.
About 1 GiB of this workstation's root footprint was reclaimed by archival and
rebuilding. Root free space changed from 2 to 11 GiB, but the larger change also
includes external filesystem activity and is not attributed to this cleanup.

Removed only generated standalone/runtime .env copies, after verifying the runtime
copy matched the original. Next copies dotenv outside tracing; the smoke script
now strips generated dotenv before boot. The trusted launcher still loads original
credentials. Screenshot evidence was retained.

## Release incident and prevention

First candidate failed Web startup at 11:46 CST: Next 15's contains-glob matching
made broad output/**/* exclude its own next/dist/build/output/log.js. Immediately
restored the previous Web backup and checked availability; no inference restart.
Narrowed the exclusion to output/playwright/**/* and added a deployment/CI gate
that boots the candidate on a temporary loopback port, probes only GET catalog,
then terminates it before replacing active runtime. Corrected candidate passed;
Web released at **11:50:03 CST**, PID **3514727**. Sanitized-bundle boot passed too.

## Acceptance

- Feature commit: e7e9d4f.
- 75 Vitest tests (25 new auth/store/UI cases), eight Python collector tests and
  16 streaming assertions passed. Lint zero warnings/errors, TypeScript, build
  and standalone boot passed.
- Sanitized candidate/current runtime contain no nested .workstation-deploy or
  dotenv copy.
- Public anonymous download/cancel/activate and wrong-token download return 401.
  Admin unknown-model download/cancel return 404; admin activation returns 409
  without config writes. Actual admin GET verified data storage and permissions;
  no token was printed.
- Public browser: 1440x1000 and 390x844, light/dark, read-only controls, hidden
  paths, refresh, invalid login and Escape passed. Explicit browser-only admin
  fixtures tested download/cancel, progress, mobile themes and clearing admin
  state on close. Zero page errors/overflow/forwarded browser mutations.
  Screenshots visually inspected; no new full-site WCAG certification claimed.
- No real large-model download or activation. Downloader lifecycle exercised with
  isolated mocks, not an actual model transfer. Serving Python can locate
  huggingface_hub. Public provenance remains verified and hourly timer active.
- Sage Mate unchanged: c82ec990eafbffa19a1c92f3cc100799c181313a89f55344f9271fafadd3bc10,
  StartedAt 2026-09-02T12:25:43.59205152Z.
- This turn's statecentric baseline/final both match
  4e443673716b22245cce26bd59e0591edbeee456cf3793f2ad83f79e10fab794,
  StartedAt 2026-09-03T03:31:04.103366645Z. Its change since the earlier audit was
  external; this task did not control or restart it.

Evidence: output/playwright/model-hub-fix/ (before, four public, two explicitly
labelled admin-fixture captures). Run scripts/audit/model-hub-governance.js through
Playwright CLI run-code --filename in an isolated session; close it afterward.
