# Mod control plane / plugin author guide alignment

Audit date: 2026-09-03. This is a source/isolated-test review, not runtime
qualification or approval to operate an inference instance.

## Authoritative inputs

- [BidKV packaging and release guide](https://github.com/vLLM-HUST/vllm-hust-docs/blob/e70e4234c56512d312ac58cd39080411a13667f1/operations/bidkv-packaging-and-release-guide.md),
  read in full, plus the extension-author and Core/Host Provider architecture
  guides from the same documentation commit.
- Sage Mate `d310686`: committed owner-entry proposal, handoff, consumer and tests.
- Catalog: Manager `9fb467447e95d753f7002b28575d6802f4347181`, BidKV
  `6007abbd667502367eabe981604c2e5216085202`, DiffSpec
  `762959978514cdd01407b58f1015a75f2ae2c936`. These are reviewed pins, not latest
  compatibility claims. No pin or upstream manifest was changed in this audit.

## Division of responsibility

| Layer | Owns | Must not own |
| --- | --- | --- |
| Extension Manager / Host Provider | `0.2-experimental` discovery, manifest validation, compatibility, enabled intent, conflict checking, launch rendering | Shared service takeover or operator approval |
| dev-hub instance controller | Complete frozen deployment, registry, authorization, approval, fencing, journal, approved apply/disable/rollback | Another manifest schema, plugin registry, loader or algorithm |
| Workstation | Reviewed artifact preparation, evidence projection, approval UI and thin client | Direct Mod registration, host-authority assertions, independent lifecycle coordinator |
| Sage Mate | Default-off owner-entry binding through pinned dev-hub | A duplicate coordinator or unfenced recovery writer |
| vLLM host / Mod | Actual declared scheduler/worker component execution | Treating installation or intent as execution evidence |

The `vllm-hust.instance-owner-entry/v1` transport is a service ownership protocol,
not a competing plugin API. It does not replace Manifest `0.2-experimental`.
Likewise `optimization.json` is a profile input, not a substitute bundle manifest.

## Audit results and correction

1. **Canonical BidKV packaging matches.** At the fixed source its discovery group
   is `vllm_hust.extension_bundles`, ID `org.vllm-hust.bidkv`, schema
   `0.2-experimental`, component `victim-selector`, contract
   `vllm.scheduler.policy.v1`, execution plane `scheduler`. There is no legacy
   `vllm.victim_selector` entrypoint in its pyproject. The catalog's historical
   range remains unchanged; this does not qualify the current target.
2. **The library is staging.** `mod_worker.py` installs fixed-source wheels into a
   library environment and delegates intent to the canonical Manager CLI.
   `prepare_mod_image.py` copies hash-checked wheels into a derivative of the exact
   target image, using the target serving Python. It does not install into the
   live service, rewrite plugin wheels, or report runtime activation. Package
   namespace and Core/Ascend preservation checks remain required.
3. **Corrected a second activation path.** The previous observer explicitly called
   `diffspec.plugin.register()`, which could bypass the host's selection of the
   canonical `diffspec` entrypoint. Observer version `0.1.1` removes this call and
   requires both the canonical and observer entries in the explicit host
   allowlist. It only attaches an observation hook; Manager/host admission and
   loading remain mandatory. Tests reject observer-only allowlists and assert
   that the canonical registration function is never called by the observer.
   Old `0.1.0` images/receipts remain historical; they are not silently upgraded or
   eligible evidence for this corrected observer.
4. **Do not force BidKV's mechanism onto other Mods.** DiffSpec's pinned manifest
   intentionally declares the existing `vllm.general_plugins` interface, with
   unversioned patch surfaces. It is not a typed BidKV manifest. The author guide
   explicitly permits this distinction. The separate observer is diagnostic
   instrumentation, not another public optimization bundle or a compatibility
   adapter. Its wrapping of load/draft methods still needs real ordering and
   behavioral qualification before use on a serving target.
5. **Execution evidence is domain-specific.** BidKV needs scheduler identity,
   typed component materialization and an exercised victim-selection path;
   DiffSpec needs worker identity and exercised draft execution. HTTP health or
   a loaded package is insufficient for either. Do not require a fictitious
   BidKV worker callback, or reuse DiffSpec proof for other Mods.

## Required producer integration gates (not delivered by this audit)

- Freeze exact Manager/Provider source and wheels, original manifests, complete
  resolved Manager config, rendered output and hashes inside `DeploymentSpec`.
  Preserve model/revision, devices, TP4, graph, mounts, ports, all launch options
  and versioned secret references. Never re-read mutable user config after approval.
- Run canonical `check/plan/render/run --dry-run` against the candidate's serving
  environment, not the staging venv. Unknown/incompatible evidence rejects the
  plan; copying an environment variable cannot bypass admission. Do not broaden
  a range or change `import_only` to `active` without implementation and evidence.
- Manager owns `VLLM_EXTENSION_MANIFESTS` / `VLLM_EXTENSION_BUNDLES`; dev-hub must
  not independently generate those native manifests. Resolve how rendered files
  remain pinned across launch/recovery without bypassing Manager ownership.
- Freeze and test host entrypoint allowlists. The inspected Manager pin produces
  the enabled-bundle marker but does not itself merge `VLLM_PLUGINS`. The controller
  must not compensate by calling plugin registration functions. A generic
  allowlist/render contract requires validation before enabling any deployment.
- `disable` is a separately approved no-Mod deployment, not just Manager intent.
  Rollback must keep its original owner fence. Artifact removal must account for
  current, pending and retained rollback references in the future dev-hub registry.
  The current library-only removal path is not sufficient once real deployments
  exist; keep deployment enablement closed until reference protection is wired.
- All owner entries, monitors, recovery and external writers must share the same
  authoritative fence. Consumer IDs and UI authentication alone are not authority.
  This audit does not implement those controls or prove production fencing.

## Verification boundary

Only source reads and CPU fixture tests are permitted for this change. No NPU
commands, image builds, inference probes, runtime enablement, service restarts,
plugin publication, source-range edits or Sage Mate gitlink updates were performed.
The work follows the optimization repository workflow's ownership separation and
evidence labeling; no canonical runtime or plugin source was changed.

Verified locally: 81 Mod unit tests plus 14 image-preparation fixture tests,
100 Vitest tests, zero-warning ESLint and `git diff --check` passed. These prove
the scoped source correction and control-plane regression behavior, not real
plugin execution, compatibility, takeover or rollback.
