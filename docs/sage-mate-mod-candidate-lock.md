# Sage Mate Mod candidate lock

This file records reviewed test candidates. It does not replace the public deployable
lock until the human review, disclosure and public-reachability gates below pass.

| Component | Candidate commit | Qualification state |
| --- | --- | --- |
| Core | `7362232895e0a38bb5ef4ac11fc4b2e2aa3026dd` (implementation parent `bbfddaa74c11622c7bb3f3e742f442faeb6f17e1`) on base `762f85b311fbab0bcf8921dd216f5093cd58b9b8` | 381 passed, 25 skipped; BidKV Qwen3.8 TP4 graph qualified |
| Ascend MoE seam | `2c8c722107a54127999a64c4eb0ec86139df8c26` on base `4e57439e58ed3d78e675f9fd7b4614fb183c5394` | LatchMoE Qwen3-30B-A3B TP4 PIECEWISE graph qualified functionally |
| Extension Manager | `24036c11c894c3fe0736e59efd17159c5e307783` | tests passed; used by the BidKV qualification artifact |
| BidKV | `463f798b209a33ff2d2f4e277b9aedb26d75fa29` | Qwen3.8-27B TP4 graph passed: 187 selector calls, 0 failures, output and rollback passed |
| DiffSpec | `96188b9923928b3d51bbf7f81d38fcd1144e3fb9` | source suite passed; blocked on a Qwen3.8-compatible Eagle3 draft, so no compatible model is declared |
| LatchMoE | `63781f3dd0235f933735bfd8ce614d388093c0b5` | Qwen3-30B-A3B TP4 graph functional gates passed; throughput degraded to ~2.91 tok/s from ~23.57 tok/s baseline |

The public catalog's `sha` fields remain the last reviewed historical artifacts until
the candidates are reviewed and pushed. Candidate fields make this split
machine-readable. A candidate must not replace the deployable lock until all are true:

1. a human reviews every proposed upstream line and completes required contributor/AI disclosure;
2. the commits are reachable from the declared public repositories;
3. the authorized Ascend TP4 test allocation runs graph capture/replay without using
   reserved NPU4-7 (the 2026-09-04 campaign used NPU0-3 after explicit authorization);
4. logs, metrics, output checks, rollback/recovery evidence, and workload measurements are retained;
5. the Manager receives an exact matching runtime-qualification record.

`installed`, `configured`, `enabled`, and `runtimeEffective` are intentionally separate.
The first three never imply the fourth. `runtimeEffective` remains unknown without
observed worker and inference evidence from the owner adapter.

## Model boundary

- BidKV: `Qwen3.8-27B` is qualified only for the exact TP4 graph candidate lane.
- DiffSpec: `Qwen3.8-27B` is blocked; no compatible Eagle3 draft was available.
- LatchMoE: dense `Qwen3.8-27B` is Not Applicable. `Qwen3-30B-A3B` is
  functionally qualified on TP4 PIECEWISE graph with a performance-degraded label.
  `GLM-4.7-Flash` and `Qwen3-Next-80B-A3B-Instruct` remain historical single-NPU
  qualification rows and do not inherit the current TP4 result.
