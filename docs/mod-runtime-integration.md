# Instance-oriented Mod integration

Status: implementation in progress. This document is an acceptance contract, not
a claim that runtime application is delivered.

## Product goal

An administrator selects an inference instance, prepares a compatible deployment,
reviews the exact restart impact, applies it, and can restore the preceding
deployment. The UI reports effective Mods from fresh process-specific evidence,
not package installation or saved enable intent.

## Ownership and supported scope

- The artifact library builds and hashes reviewed wheels. It is a staging area,
  not the environment that serves inference.
- The runtime owner enrolls a target explicitly with an immutable base image,
  model identity, device reservation, port, launch configuration and permitted
  lifecycle adapter. Discovery alone never grants mutation authority.
- Web clients select registered IDs; they cannot submit executable paths, shell
  commands, Docker flags, device lists, arbitrary image URLs or health evidence.
- The target's serving Python must load the prepared extension artifacts. Do not
  install into a live environment. Produce a new immutable deployment revision.
- Start with one reviewed Mod per instance. Multi-Mod composition requires a
  separate domain-conflict and merge policy; this is not an ecosystem limitation.
- External systems such as PegaFlow retain their own lifecycle owner.

## State and lifecycle

Maintain artifact state, desired deployment and observed runtime separately.

1. **Inspect target:** collect current immutable image, core/Ascend SHAs and
   installed versions. A compatibility-baseline label is not an installed version.
2. **Preflight:** check the pinned Mod manifest against actual versions, domain
   contracts, model, architecture, memory/resource admission and required options.
   Unknown evidence is not compatible. Host-range matching alone is not sufficient.
3. **Prepare:** build a candidate from the exact base image and verified wheel
   hashes; render host-provider activation into a revision-specific configuration.
   Do not execute a workload, restart a service or allocate devices in this phase.
4. **Review:** show target, current/candidate revisions, selected Mod and version,
   model, device/port impact, restart requirement and rollback revision. The server
   issues a short-lived, single-use approval bound to the complete plan hash and
   current target identity. Changing any input invalidates it.
5. **Apply:** lock the target, revalidate identity and reservation, persist recovery
   state, then invoke only the registered lifecycle adapter. Reject concurrent or
   replayed changes. Record the old revision before stopping anything.
6. **Verify:** inspect the newly launched process and workers, confirm the exact
   extension/component was materialized, and pass model health and bounded
   inference checks. Bind evidence to deployment ID, container ID, process start,
   source/artifact hashes and configuration hash. Installation, environment
   variables, package import and a healthy HTTP endpoint alone do not prove this.
7. **Rollback:** failed verification restores the previous revision and verifies
   its identity and health. Failed rollback is an actionable failure, never a
   successful apply. A Web restart must not lose the recovery journal.

Disable is an application of a revision without the Mod and has the same approval,
restart, verification and rollback requirements. Artifact removal is blocked while
any current, pending or retained rollback revision references it. Removing an
artifact does not deactivate a running process.

## UX

The primary context is the selected inference instance. Show compatible choices
and concise reasons for unavailable ones. Put artifact preparation in version
details, not a standalone misleading “enable” action. Main states are prepared,
pending application, verifying, effective, rolling back and failed. Unknown or
stale observation must never show effective. Detailed engineering diagnostics live
in expandable checks and task logs, not a persistent warning wall.

## Current evidence and first admission gate (2026-09-03)

The workstation currently points at the shared Sage Mate backend on loopback
port 18001. It is not an independent workstation-owned serving instance.
Identity-bound inspection at 05:27 UTC observed image ID:
`sha256:5e7f82c78a3b0bc786e0e994e71d012af2f667bff3dc3380c77353dd7493a1f9`.
Core package: `0.28.1rc1.dev319+g762f85b31.empty`; Ascend package:
`0.25.1rc1+hust.20260903.2`, commit
`164860f3095362efe5ccab9ed3486bd665c00baa`. The `v0.23.0` compatibility label must not substitute
for either package version.

The reviewed manifests currently require:

| Mod | Host package range | Additional admission requirements |
| --- | --- | --- |
| BidKV | vllm >=0.23,<0.24 | scheduler-policy v1 and scheduler materialization evidence |
| DiffSpec | vllm-ascend >=0.23,<0.24 | draft model and acceptance of unversioned patch surfaces |
| LatchMoE | vllm ==0.21.0 | MoE offload seam v1, supported MoE model and documented launch limits |

All three are outside this shared image's historical declared ranges. These ranges
are reviewable declarations, not permanent prohibitions. The user selected the
existing workstation instance and authorized revisiting compatibility descriptions.
Requalify exact versions and update declarations with the adaptation code and
acceptance evidence; never widen ranges just to bypass validation or silently
downgrade the shared service. Restart approval is a separate gate.

The static inventory found no `vllm/plugins/contracts.py` for BidKV. Seven sampled
DiffSpec patch targets are present, which warrants further signature and behavior
review but is not proof of compatibility. Latest reviewed-source candidates:
BidKV `9f2428aaf45ae25c3ad44b199a6401f8d59f1f3d`, DiffSpec
`762959978514cdd01407b58f1015a75f2ae2c936`, LatchMoE
`3b9d8ba225794dbccb6fb3160401035e64ae6823`. Library pins remain unchanged until
the newer revisions have been qualified.

Reproduce the read-only inventory with:

```bash
python3 scripts/inspect_mod_runtime.py --sudo <selected-container-name>
```

It reads installed metadata, the embedded artifact lock and selected source ASTs
without importing vLLM, Torch or device code. Collection uses immutable container
ID and rejects replacement/restart during inspection. It never reports a Mod
active or compatible from static observations alone.

### Preliminary DiffSpec software check

With the reviewed `vllm_diffspec-0.2.0` wheel on the same immutable image,
`diffspec.plugin.register()` returned successfully in a fresh diagnostic container.
The container had no accelerator devices, model mounts, published ports, network
or credentials. Its root filesystem and wheel/driver-library mounts were read-only;
only temporary storage was writable. Core patch registration succeeded despite the
old declared 0.23 range. Ascend runner hooks are lazy, so this result does not prove
their execution or any real inference. The first attempt omitted host driver
libraries and failed at Torch-NPU import; that was a diagnostic-environment issue,
not a negative Mod compatibility result.

Directly importing `vllm_ascend.worker.model_runner_v1` then failed with a
`DeviceOperator` circular import. The identical baseline import **without
DiffSpec** failed the same way. Therefore this probe does not establish a
DiffSpec regression; worker-path validation must reproduce the normal launcher
import order before drawing a compatibility conclusion.

## Acceptance checklist

- Unit tests: unknown/stale provenance, prereleases, mismatched SHAs, missing
  contracts, invalid configuration, plan changes, expired/replayed approvals,
  foreign target/device ownership and anonymous mutations all fail closed.
- Adapter integration: prepare never restarts; apply loads the artifact in the
  serving environment; crash recovery and verified rollback work. Fake adapters
  prove control logic only and are labelled as such.
- Real target: successful load plus bounded inference and an observed rollback,
  with resource ownership and immutable evidence captured before and after.
- Browser: public read-only and administrator flows, keyboard confirmation,
  mobile/light/dark, errors/loading, no false effective state.
- Delivery: separate reviewed commits, Web/control-plane-only release until a
  particular serving-instance transition has been explicitly approved.
