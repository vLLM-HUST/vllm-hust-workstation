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

### Updating compatibility declarations

The catalog presents the pinned manifest as a **historical declaration baseline**,
not as a negative verdict on a newer runtime. Current-instance qualification is
separate and remains pending. Detailed baseline dependencies are collapsed in the
UI; changing this presentation does not change the executable manifest or bypass
any admission check.

For an update, record the exact Mod source/wheel, Core and Ascend source/wheels,
immutable image, model/draft model, hardware topology and launch options. Review
the required interfaces and port the Mod or host integration when they changed.
Keep each level of evidence distinct:

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| Manifest / AST inspection | Declared assumptions and candidate interfaces | Working registration or algorithm behavior |
| Same-image preparation / import | Reproducible artifacts and exercised import paths | Worker materialization or successful inference |
| Selected-instance acceptance | Actual load, bounded inference and tested rollback for the exact tuple | All intervening releases, models or device layouts |

Only the last level, together with interface/behavior regression checks, supports
a new qualified tuple. Update the source manifest and adaptation documentation
together with the relevant code and evidence. A single successful tuple does not
justify an open-ended version range. Preserve older evidence as historical and
keep runtime activation separate: a previously qualified Mod may not be active in
the current process.

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

## Implemented preparation and transaction primitives

`scripts/prepare_mod_image.py` moves reviewed library wheels into a derived
runtime image, using the explicitly specified serving interpreter. It does not
use the library venv as the inference environment. It verifies wheel hashes and
distribution names before building, disables Docker build/probe network and pip dependency resolution,
checks base-layer ancestry and unchanged Core/Ascend wheel metadata afterwards,
and validates installed bundle registration in the same interpreter. Prepared
images default the Manager enable list to empty; activation belongs to the
approved launch configuration. No model/device/port is used by these checks.

```bash
python3 scripts/prepare_mod_image.py --sudo \
  --library /absolute/operator-owned/mod-library \
  --output-root /absolute/private/prepared-images \
  --mod diffspec --source-sha <reviewed-40-character-sha> \
  --manager-sha <reviewed-40-character-manager-sha> \
  --base-image-id sha256:<full-local-image-id> \
  --python-bin /absolute/serving/interpreter/python
```

Build contexts contain only the Dockerfile and reviewed wheel archives. A missing
Manager `platformdirs` dependency is downloaded separately from a fixed official
PyPI wheel URL and verified against its pinned SHA256 before entering the build.
Existing `packaging` and `platformdirs` packages are preserved when supported;
unsupported installed versions fail instead of being silently upgraded/downgraded.
Receipts
record source pins, image IDs, serving Python and verified package hashes, and
always retain `runtimeActivationVerified: false`. Failed preparation keeps a
failed receipt and its context. Tags are local preparation handles; deployments
must consume the resulting immutable image ID, never the tag.

`scripts/mod_deployment.py` implements the target-scoped transaction coordinator:

- Pure preparation issues an expiring, one-use approval for a complete plan hash.
- Apply rechecks target identity, baseline health and admission, then durably
  consumes approval before the first adapter mutation.
- Only fresh target-specific activation and inference observations produce an
  effective result. Historical transaction success is not a live status API.
- `ownerGeneration` must identify the actual supervisor/process launch generation,
  not a configuration file hash. A changed revision with an unchanged process
  identity is rejected, even when the adapter claims successful verification.
- Failure attempts restoration only while the adapter proves transition ownership.
  A foreign takeover never authorizes stopping or overwriting that target.
- Crash recovery is explicit rollback, not automatic retry/re-application.
- Disable and manual rollback are revision transitions with their own approvals;
  neither is a package-removal shortcut.

Adapters are supplied by trusted server code and must implement the real owner
launcher, exact transition ownership and bounded observation/verification. The
coordinator's fake-adapter tests prove transaction behavior, **not** a production
restart, rollback or Mod inference. Production adapter enrollment, HTTP/UI wiring,
runtime proof collection and selected-instance acceptance remain unfinished.

### Preparation evidence, 2026-09-03

The full real DiffSpec image preparation passed on the selected baseline:

- Base image: `sha256:5e7f82c78a3b0bc786e0e994e71d012af2f667bff3dc3380c77353dd7493a1f9`.
- Prepared image: `sha256:a8ba4d9270d52d3e0217ad734e8d7bdecceafe2e0ac49e7a2bf5d1e4f0a92bfd`.
- Serving interpreter: `/usr/local/python3.12.13/bin/python` (from owner launch configuration).
- DiffSpec wheel SHA256: `298509ae3376ba711e3ad2732a0595338702d3c2db2ff5ab2a56cce2c995178f`.
- Manager wheel SHA256: `ab5da81c7612045d459ad7cd29df5155efa622573fd0670dbfb6e4eabe4983d2`.
- Missing support dependency: `platformdirs==4.3.6`, wheel SHA256
  `73e575e1408ab8103900836b97580d5307456908a03e92031bab39e4554cc3fb`.
- Core/Ascend wheel metadata unchanged; existing `packaging==26.3` preserved;
  installed bundle validation passed without loading the engine or a model.
- Receipt and build context:
  `/data/vllm-hust-workstation-shuhao/mod-image-preparation.aXwQHQ/prepared/prepare-diffspec-s0o6g1dp/receipt.json`.

An earlier metadata-only preparation and the failed missing-dependency preparation
remain preserved under the same private output root. The prepared image was not
applied to the shared instance. No inference, accelerator access or actual service
rollback is claimed by this preparation evidence.

Verification: 82 Vitest tests, 62 Python tests and zero-warning ESLint passed.
The 25 deployment-transaction tests use a fake adapter; the image preparation
above is real Docker execution with no devices or published ports.
