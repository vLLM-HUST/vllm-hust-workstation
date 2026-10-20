# CUDA host runtime provenance: repair and qualification

## Root cause

The live versions parser accepted only `workstation-runtime-provenance/v2`
Docker receipts, requiring a container image and Core/Ascend wheel evidence.
The configured deploy home instead held a host-source v3 receipt captured on
2026-10-02. It referred to the inactive Qwen3.8 unit, obsolete PID/source path,
dirty source and a rejected legacy repository. No refresh timer was active.
Neither accepting that schema nor refreshing its timestamp would prove the
current CUDA service. The warning was therefore legitimate, not a color problem.

The actual A100 deployment is the user-systemd Qwen3.5 service in the clean
canonical overlay, source commit `7c82451c03818d23746c962c173ffb1dbc78891b`.
The gateway routes the A100 alias to its loopback listener; A6000 is remote.

## Repair contract

Explicit host configuration selects live read-only observation, never a fallback
to Docker or the old host receipt. Configure all three values in the trusted
deployment env (examples are also in `.env.example`):

```dotenv
WORKSTATION_HOST_RUNTIME_SERVICE=vllm-hust-qwen35-engine.service
WORKSTATION_HOST_RUNTIME_ROUTER_SERVICE=sage-codex-router.service
WORKSTATION_HOST_RUNTIME_ROUTES_FILE=/absolute/path/router-config.json
```

Do not combine this mode with `WORKSTATION_RUNTIME_CONTAINER` or enable the Docker
receipt timer. The deployment entrypoint preflights the same host observer and
rejects ambiguous/incomplete configuration. An existing file is not a host proof.
The runtime user needs existing read-only access to its own units and `/proc`;
this repair grants no new sudo, Docker, SSH or filesystem privileges.

`inspect_host_runtime.py` checks:

- Configured active unit, PID, process start ticks, boot identity, executable and
  working directory before and after observation; listener ownership by that PID.
- Actual CLI served-model, live local model catalog and import origin resolved
  with the process interpreter/PYTHONPATH, without importing vLLM/torch/GPU code.
- Exact canonical Git origin/commit, clean serving-source tree, tracked source and
  native artifact bytes. Missing/symlinked/changed files and changes after process
  startup fail closed. The tested manifest contains3250 files and17 native files.
- Running gateway unit's actual route-config path, file predating gateway startup,
  stable file identity/content metadata and live router identity. Only aliases
  bound to the observed local listener/model are included in coverage.

The API validates fresh output (maximum30s age), keeps process-memory attestation
explicitly `not-attested`, and reuses an observation for at most5s to bound client
fan-out. There is no stale-on-error success. A measured full read took1.642s on
this host; no engine restart, GPU allocation or test prompt is needed for a check.

The UI exposes the actual source link, installed package version, engine/router
PIDs, route/source/native digest and check time. Raw details are folded by default.
Host evidence cannot manufacture an image/Ascend plugin or qualify a MOD. Selecting
A6000 or sage-auto retains an explicit uncovered-route warning. The A100 proof
must not be presented as proof of every backend behind the gateway.

## Main and runtime versions

Application changes: `e5cbe52`, `18c0eb8`, `b1aa407` on main.
Qualified deployed application: `b1aa407b3171ae92fe4a26d819528c078d52f7df`.
Subsequent example-env/deployment preflight/tests/docs commits do not change the
qualified application binary; distinguish those main HEADs from runtime SHA.

Application-only cutover completed2026-10-20 15:01:54 Asia/Shanghai after checking
zero in-flight WS chats. WS changed PID795463 →1042278. Engine3773449, gateway
1359620, Twin1058851 and GPU worker PIDs stayed unchanged.32768 output allowance,
model/upstream credentials and experiment settings were preserved. The old v3
receipt was retained unchanged as diagnostic evidence, not relabelled or trusted.

## Acceptance

- Linux candidate:278 Vitest tests, strict ESLint, TypeScript, production build,
  standalone helper-presence/catalog probes and10 Python observer tests passed.
- Later deployment-preflight checks bring Python coverage to13 passing tests,
  including explicit host invocation and rejection of dual/missing config.
- Real positive `/api/versions` checks yielded verified host evidence; a separate
  owned preview configured with the inactive Qwen3.8 service yielded unavailable,
  no source SHA and no stale receipt fallback. That preview was stopped.
- Default candidate SSE KV-cache question: Chinese final +stop+DONE,7.151s,
  unchanged A100 routing headers and thinking mode. No request interception.
- Real IAB candidate: default-thinking question completed a Chinese final
  (1206 upstream-reported tokens); source details/Escape/focus and A6000 uncovered
  warning passed. Rendered evidence card screenshots were inspected.
- After cutover, public `/api/versions` was fresh and `/` returned200. IAB public
  navigation/rebind timed out despite working local control; switched to a new
  native Chrome incognito window without modifying the independent reviewer's
  existing tabs. Public default-thinking KV question completed at15:07 with a
  separate Chinese final (1085 upstream-reported tokens). The real source drawer
  showed current IDs/digests,3250/17 file counts, timestamp and honest limitations.
- Public screenshot saved locally as
  `ws-runtime-provenance-public-20261020.png`, inspected after saving. No keys,
  complete env files or unrelated user conversations were logged.

These are source/identity and short-answer delivery checks, not a certificate of
model correctness, performance, every remote backend, or in-memory code identity.

## Rollback and remaining limits

The retained preceding application is5ac9ad4 (`-20261020-layout`). The private
deployment receipt records the exact prior symlink target and protected config
backup. Drain chats, restore that target and the prior config atomically, and
restart only `vllm-hust-workstation.service`; leave engines/router/Twin/user data
alone. The guarded cutover automatically restores those pointers/config on a
failed readiness/provenance check. A post-success rollback was not exercised,
to avoid a second unnecessary app interruption.

Remote A6000/auto and pooling routes still need their own evidence collectors if
they are to be labelled verified; this release intentionally does not grant new
remote access or borrow A100 identity. A separate independent long-answer check
reported reasoning exhausting32768 tokens without final body. That remains a
generation-quality/delivery issue, not resolved by this provenance-only change;
no model, thinking setting, output budget or engine experiment was changed here.

## Build-input inventory follow-up (2026-10-20)

The collector now also fingerprints Git-ignored build inputs below `vllm/`,
excluding generated bytecode caches. These include vendored FlashAttention Python
modules and headers, not just shared libraries. The real restored A100 tree has
5220 unique source/artifact files,17 native libraries and1987 ignored build
inputs (native libraries are included in both latter categories). This remains
on-disk identity, not process-memory attestation. Three added boundary tests cover
ignored Python bytes, changes after process start and bytecode-cache exclusion;
the Python observer suite now has16 passing tests.

Separately, native thinking-budget support is on engine main (`12bef35`, merged
release ancestry `0fe80bb`); the minimal runtime backport is `a68500d` on the
qualified7c baseline. Protocol tests on that baseline:16 passed. Latest-main tests:
19 passed,2 failed; unmodified latest main reproduces the same two custom-tool
format failures (5 passed,2 failed). No test expectation was weakened.

The first approved A100 cutover failed because the staged release copied native
libraries but omitted ignored FlashAttention Python packages. It was rolled back
to the original source/configuration; original engine health returned at
2026-10-20 16:34:28 Asia/Shanghai. A6000 remained untouched. The original unit's
automatic recovery made one retry before rollback; the revised cutover helper
disables automatic retries during candidate startup and aborts a failed startup.
All ignored build inputs are now staged and the complete worker imports without
loading a model. A second engine cutover requires explicit approval; this record
does not describe the native-budget candidate as deployed or accepted.

The extended collector was released separately as application `dd486bc` at
2026-10-20 16:42 Asia/Shanghai, after Linux278 Vitest +16 Python tests,
strict lint/type checks, production build and standalone probes passed. Positive
candidate observation and inactive-service negative observation both passed;
the negative preview was stopped. Only the WS app changed PID1042278 →1478667;
engine1432060, router1359620 and Twin1058851 stayed unchanged across this cutover.
No configuration/credential/model/output-budget env value was changed.

Public `/api/versions` and a real Chrome incognito session confirmed5220 files,
17 native artifacts, clean source7c82451c and the actual engine/router PIDs.
Default-thinking KV-cache chat returned an independent Chinese final answer;
refresh restored the answer and folded thinking separately. The real A6000 model
selection retained an explicit uncovered-route warning. Rendered screenshot
`ws-runtime-build-inputs-public-20261020.png` was saved through Chrome's native
capture command and reopened for visual verification. The preserved preceding
application for this follow-up is `b1aa407` (`-20261020-provenance`); the guarded
WS-only switch retains its exact symlink target for rollback. Engine-native
thinking-budget release remains staged, not active, pending renewed approval.
