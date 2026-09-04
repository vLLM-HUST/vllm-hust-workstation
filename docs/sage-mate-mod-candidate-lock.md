# Sage Mate Mod candidate lock

This file records reviewed test candidates. It does not replace the public deployable
lock until the human review, disclosure and public-reachability gates below pass.

| Component | Candidate commit | Qualification state |
| --- | --- | --- |
| Core | `7362232895e0a38bb5ef4ac11fc4b2e2aa3026dd` (implementation parent `bbfddaa74c11622c7bb3f3e742f442faeb6f17e1`) on base `762f85b311fbab0bcf8921dd216f5093cd58b9b8` | 381 passed, 25 skipped; BidKV Qwen3.8 TP4 graph qualified |
| Ascend MoE seam | `2c8c722107a54127999a64c4eb0ec86139df8c26` on base `4e57439e58ed3d78e675f9fd7b4614fb183c5394` | LatchMoE Qwen3-30B-A3B TP4 PIECEWISE graph qualified functionally |
| Extension Manager | `24036c11c894c3fe0736e59efd17159c5e307783` | tests passed; used by the BidKV qualification artifact |
| BidKV | `463f798b209a33ff2d2f4e277b9aedb26d75fa29` | Qwen3.8-27B TP4 graph passed: 187 selector calls, 0 failures, output and rollback passed |
| DiffSpec | runtime `c78f55c7e4923da342f2fc52c2cb509c150e5363`; qualification metadata `998697897c0f854dc0fda8f0f28f07670196c411` | Qwen3.8-27B + VirVen/Qwen3.5-27B-EAGLE3-v2 passed TP4 FULL_DECODE_ONLY graph functional gates; 103/534 accepted (19.29%), performance degraded |
| LatchMoE | `63781f3dd0235f933735bfd8ce614d388093c0b5` | Qwen3-30B-A3B TP4 graph functional gates passed; throughput degraded to ~2.91 tok/s from ~23.57 tok/s baseline |

The DiffSpec runtime wheel is
`vllm_diffspec-0.3.0-py3-none-any.whl`, SHA256
`2028172d18ac978fcfdb78e7192ec794641a517222a95a3eba888175b3d6aeba`.
Its immutable qualification image is
`sha256:6dec9e68eaa61d5a3297abc5006d939d5644aa203c16ef1f9af65fb54d60722b`;
the required draft checkpoint SHA256 is
`a57cefc45874197a24dd2a092cfd0d0f7d6a2f2cca156d09f2d2f4a56dc4e5be`.

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
- DiffSpec: `Qwen3.8-27B` is functionally qualified only with the hashed
  `VirVen/Qwen3.5-27B-EAGLE3-v2` draft on TP4 FULL_DECODE_ONLY graph. The
  measured lane is performance degraded and is not an acceleration recommendation.
- LatchMoE: dense `Qwen3.8-27B` is Not Applicable. `Qwen3-30B-A3B` is
  functionally qualified on TP4 PIECEWISE graph with a performance-degraded label.
  `GLM-4.7-Flash` and `Qwen3-Next-80B-A3B-Instruct` remain historical single-NPU
  qualification rows and do not inherit the current TP4 result.
