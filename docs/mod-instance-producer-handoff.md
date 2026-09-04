# Sage Mate handoff: dev-hub default-off transaction milestone

Current producer main: `39521108c79a2c6217d44d1ed4189ebf6b87e308`.
Initial transaction milestone: `b6e56e1f7f1ae58ea15aa9994852f48290827a55`.
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

The coordinating task delivered the initial handoff. Sage Mate `405ff08` has now
accepted/pinned `b6e56e1`, with 168 Sage checks and39 producer checks reported in its
committed `docs/mod-producer-acceptance.md`. This task read that document and did
not edit Sage files. Newer `bfcc0d5` consumer acceptance is not yet claimed.

## Follow-up: generic foreground helper (`bfcc0d5`)

- Added a structural Python Backend protocol using the existing six method
  signatures and closed/redacted failure codes. No product adapter or registry.
- Added opt-in direct-child supervision with explicit frozen command/environment,
  TERM/INT/HUP forwarding, bounded escalation, reaping and handler restoration.
  Every spawn/signal re-enters a trusted owner guard; loss of the guard reports
  unconfirmed cleanup and never permits an emergency kill bypass. No restart.
- Linux non-reaping wait prevents ordinary PID reuse during signalling; caller
  must exclusively own child waiting. This is not descendant/cgroup isolation,
  authenticated transport or daemon fencing. Neither production CLI imports it.
- Full producer checks: **52 passed,37 subtests passed**, Ruff passed. The13 new
  foreground tests/15 subtests passed in two additional consecutive repetitions.
  Only disposable Python child processes were signalled, never shared services.
- Workstation source-lock now includes all eight packaged producer files and
  the exact new gitlink. No UI lifecycle availability or deployment gates changed.
- Workstation follow-up regression: **76 Python tests/13 subtests**, **100 Vitest**,
  zero-warning ESLint and focused Ruff passed. The client test now requires the
  lock to cover every packaged control module. No new browser/build/deployment
  acceptance is claimed for this dependency-only change; prior build results
  above belong to the initial extraction milestone.

Contract and fixture details: `deps/vllm-hust-dev-hub/docs/instance-backend-contract-proposal.md`.
Sage feedback agrees with existing signatures but confirms no trusted executor
identity, qualified synchronous deployment or old-writer exclusion proof. A
generic authenticated broker/durable launch grant still needs a separate reviewed
contract. Product adapter remains Sage-owned; generic producer remains this task's.

Cross-task send of this follow-up again returned the decommissioned-tool error;
it was **not delivered** by this task. This committed artifact is available to the
coordinating task for delivery; the user is not asked to forward messages.
No online deployment, permissions installation, service restart, NPU use, model/
TP4/graph change or Sage gitlink edit was performed by this task.

## Follow-up: durable host launch grants (`3952110`)

The generic producer now contains a default-off `LaunchGrantAuthority`: one-use
hashed launch grants bind the existing operation/fence/executor, target generation/
spec, registered owner UID and frozen command hash. Claims derive UID/PID from
Linux AF_UNIX `SO_PEERCRED` plus `/proc` start ticks and persist an exact lease.
Reopening the private Store after broker failure preserves replay protection;
generation/fence/PID drift prevents later critical sections.

This commit also validates the shape and exact inventory digest of host fencing
receipts, but deliberately does not assert OS enforcement. Full architecture,
threat cases and the separately approved installation checklist are in
`deps/vllm-hust-dev-hub/docs/host-integration-v1.md`. Producer result: **59 tests,
40 subtests**, Ruff and diff checks pass using CPU/AF_UNIX fixtures only.

No current wire schema changed; no socket server, product adapter, writer ACL,
unit, group, enrollment or gate was installed. Sage must review and repin this
producer independently. Production remains unqualified until every external
writer is broker-only and the product adapter proves cgroup/daemon quiescence.

## Extension authoring source of truth

Workstation was checked against canonical `vllm-hust-docs` main commit
`e70e4234c56512d312ac58cd39080411a13667f1`, specifically
`operations/bidkv-packaging-and-release-guide.md`. The catalog preserves BidKV's
`0.2-experimental` bundle ID, `>=0.23,<0.24` host range, API/contract boundary,
and install/enable/effective separation; it does not widen that manifest.

The library worker's virtual environment is now described only as an isolated
artifact-validation environment. It is not presented as a serving installation.
An approved deployment must install Extension Manager and the plugin into the
same environment that executes `vllm`, render activation through
`vllm-hust-ext run`, and require actual startup/health evidence before claiming
effective. This documentation alignment does not alter a shared API or enable a
production execution path.
