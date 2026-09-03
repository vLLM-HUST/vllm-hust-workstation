# Sage Mate handoff: dev-hub default-off transaction milestone

Producer main: `b6e56e1f7f1ae58ea15aa9994852f48290827a55`.
Workstation explicitly accepts Sage Mate `d310686`'s single-writer division and
exact owner-entry/v1 request/manifest. No consumer schema change is requested.

## Delivered

- `scripts/instance_control/`: complete immutable DeploymentSpec, private SQLite
  authority, instance registration, exact plan-bound one-use approval consumption,
  generation/CAS/fence, append-only events, apply/disable/rollback/recovery library.
- `scripts/instance_owner_entry.py` and `config/instance-owner-contract.json`:
  exact consumer transport. All production lifecycle effects remain rejected.
- Separate `instance-control/v1` thin-client wire contract, default-off status.
- Workstation consumes the committed submodule/source lock and removes its old
  local coordinator; artifact writes remain separate. Old approvals are not migrated.
- Focused dev-hub tests: 39 passed +22 subtests, Ruff passed; includes actual
  concurrent Python processes and deterministic phase/crash fixtures. No NPU runs.
- Workstation extraction: 76 Python checks (6 thin-client, 56 remaining Mod,
  14 preparation), 100 Vitest, zero-warning ESLint, production build, isolated
  standalone read-only startup and packaged producer source-lock check passed.
  The build's pre-existing Browserslist data-age warning remains informational.

## Not delivered / must not infer

No production backend or owner registry was installed. The library's synchronous
adapter/fence contract cannot by itself fence external Docker/systemctl/root
writers. No foreground serving/signal supervision or authenticated owner broker is
qualified. No real apply, disable, rollback or TP4/graph Mod qualification occurred.
The CLI's `lifecycleAvailable=false` / `authorityAvailable=false` is deliberate.
No current model, runtime config, live `.env`, service or Sage Mate gitlink changed.

## Requested Sage Mate-side review

Read producer `docs/instance-control-v1.md` and test the consumer against this
fixed commit in an isolated checkout. Recognized requests must return closed-gate
errors without legacy fallback, even when the consumer enable preference is true.
If accepted, Sage Mate's owner task can update its gitlink with both keys still
default-off. Pinning is not enrollment or authorization to restart any service.

Next protocol work needs agreement on direct non-recursive backend primitives,
OS-authenticated owner/administrator transport, all-writer exclusion, foreground
PID/signal supervision, ExecStart/ExecStopPost re-entry and crash/in-flight daemon
fencing. Do not use blocking `systemctl start` while holding a lock that its
ExecStart tries to acquire. Do not implement a second coordinator in Sage Mate.
Changing runtime-manager needs explicit shared file ownership before edits.

Manager/Provider still own discovery, compatibility and rendering; do not inject
native manifests or call Mod registration directly. Keep model, TP4 and graph
unchanged. No plugin range widening without adaptation/evidence.

Cross-task send was attempted after producer push, but the app returned its
decommissioned-tool error; the message was **not delivered**. This document is the
handoff artifact, not an assertion that Sage Mate has reviewed or repinned it.
