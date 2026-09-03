# Mod center

`/mods` provides an administrator-controlled **package library**, not authority
over the existing shared inference service. Public access is read-only.

## Delivered operations

- Curated official catalog; full reviewed Git commits in `src/lib/modCatalog.ts`.
- Install each extension and pinned Extension Manager in a separate venv, using
  GitHub codeload archives addressed by full commit SHA (not Git branch tips).
  Build only the reviewed sources; record resulting wheel SHA256 values. Build
  isolation dependencies are resolved from PyPI, so this is source-pinned, not a
  claim of bit-identical rebuilds. No vLLM/Ascend dependencies are installed.
- Validate installed manifests through Extension Manager without loading the
  plugin. Save configuration, enable/disable **intent**, and persistent task logs.
- Failed configure/enable restores the preceding Manager state. Failed install
  leaves a private `.install-*` directory for diagnosis, never a valid install.
- Uninstall refuses enabled intent and moves the entire isolated installation
  into `archive/<mod>-<task>` after forgetting Manager configuration. Archive
  remains recoverable and consumes storage; nothing shared is deleted.

The venv is packaging isolation, **not a security sandbox**: trusted build code
runs as the workstation user. No credentials or host Python/pip environment are
forwarded. Source changes require code review and a new explicit SHA. There is
no arbitrary URL, shell command, package name or source-ref API.

## Deployment

Create an operator-owned mode-0700 directory on an appropriately sized disk:

```dotenv
WORKSTATION_MOD_DIR=/absolute/operator-owned/mod-library
# Optional: defaults to /usr/bin/python3; requires Python 3.10+ with venv/pip.
WORKSTATION_MOD_PYTHON=/usr/bin/python3
# Optional: default scripts/mod_worker.py is included in standalone output.
# WORKSTATION_MOD_WORKER=/absolute/path/scripts/mod_worker.py
```

Use the existing private administrator password. All POSTs require the shared
admin header; invalid supplied credentials also fail on GET. Passwords remain
page-memory-only. The Python worker holds a process-wide filesystem lock across
each operation, bounds individual subprocesses to five minutes and the task to
15 minutes. Stale jobs project interrupted after 20 minutes. This service uses
a single host-local store; do not share it between multiple uncoordinated hosts.

## Explicitly not delivered: inference run/apply

`POST /api/mods` with `action: run` returns **409**, even for administrators.
No Docker, device, systemd, engine launch, restart or external-service delete
command is reachable through the worker. Installed and enabled never mean active.
The page displays runtime as **unverified**, not inactive or healthy.

Closing this gate requires a separately owned target instance, exact core/plugin
compatibility evidence, resource admission, operator-confirmed restart, runtime
loading evidence and an observed rollback. Current shared Sage Mate/statecentric
instances are explicitly outside this feature's mutation scope. External KV
services remain separately operated. Multi-Mod composition needs provider/domain
conflict checks; separate library venvs are not a combination compatibility claim.

Manager configure accepts only `launch_options` here, not caller-supplied
compatibility or health assertions. DiffSpec needs
`launch_options.speculative_config.model`; model existence is a later target
admission check. Empty configuration is permitted for BidKV/LatchMoE and does not
mean that runtime-specific offload/model parameters have been validated.

## Verification

```bash
npm run lint
npm test
python3 -m unittest discover -s scripts/tests -v
npm run build
node scripts/check_standalone.mjs
# Opt-in real package lifecycle, in a dedicated empty directory; no NPU use:
node scripts/test_mod_lifecycle.mjs /absolute/empty/test-directory
```

Browser audit: `scripts/audit/mod-center.js` through Playwright CLI `run-code`.
Admin browser fixtures intercept every mutation; real package lifecycle is
tested separately. Neither is evidence of real plugin inference.
