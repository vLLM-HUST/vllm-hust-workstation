# Sage Mate Mod candidate lock

This file records qualified candidates published to organization `main`. It does
not automatically replace an instance's deployable lock or runtime-effective witness.

| Component | Candidate commit | Qualification state |
| --- | --- | --- |
| Core | exact tested current-main artifact `a4d6aa022fb1885a25a802a6e29372c81eac6c9f` on requested base `762f85b3`; generic API published at organization-main `88cca78bbc92e9113067cb62252c5d8ae2bbdd06` | bounded preemption-policy API; BidKV Qwen3.8 TP4 graph qualified |
| Ascend MoE seam | exact tested current-main artifact `2c8c722107a54127999a64c4eb0ec86139df8c26` on base `4e57439e58ed3d78e675f9fd7b4614fb183c5394`; generic ABI published at organization-main `d0433ba3aeb3b6643787177d7b1fefe4c742ef6e` | LatchMoE Qwen3-30B-A3B TP4 PIECEWISE graph qualified functionally |
| Extension Manager | `6e9a477f30b3399dda06733de03a78814dc28ca6` | organization main; tests passed; activation implementation parent `24036c11` was used by the qualification artifact |
| BidKV | organization-main `ba700cb69ed5c84f012e5103eb115aa22cdbc1f5`; exact tested runtime tree `199e0bdc6fc38fc9b14b626515efdcbf81de0b62` | Current Core a4d6aa02 / Ascend 2c8c7221 Qwen3.8-27B TP4 graph is functionally compatible. Ascending mixed is inconclusive; interactive c=8 is not beneficial in the tested cell. |
| DiffSpec | runtime `c78f55c7e4923da342f2fc52c2cb509c150e5363`; qualification metadata `998697897c0f854dc0fda8f0f28f07670196c411` | Qwen3.8-27B + VirVen/Qwen3.5-27B-EAGLE3-v2 passed TP4 FULL_DECODE_ONLY graph functional gates; 103/534 accepted (19.29%), performance degraded |
| LatchMoE | `63781f3dd0235f933735bfd8ce614d388093c0b5` | Qwen3-30B-A3B TP4 graph functional gates passed; throughput degraded to ~2.91 tok/s from ~23.57 tok/s baseline |

The DiffSpec runtime wheel is
`vllm_diffspec-0.3.0-py3-none-any.whl`, SHA256
`2028172d18ac978fcfdb78e7192ec794641a517222a95a3eba888175b3d6aeba`.
Its immutable qualification image is
`sha256:6dec9e68eaa61d5a3297abc5006d939d5644aa203c16ef1f9af65fb54d60722b`;
the required draft checkpoint SHA256 is
`a57cefc45874197a24dd2a092cfd0d0f7d6a2f2cca156d09f2d2f4a56dc4e5be`.

The public catalog's `sha` fields remain the last deployable locks; candidate fields
now point to organization-main-reachable revisions. A candidate must not replace an
instance's deployable lock until all are true:

1. the operator accepts the model-specific functional and performance verdict;
2. the commits and exact artifacts are reachable from the declared repositories;
3. the authorized Ascend TP4 test allocation runs graph capture/replay without using
   reserved NPU4-7 (the 2026-09-04 campaign used NPU0-3 after explicit authorization);
4. logs, metrics, output checks, rollback/recovery evidence, and workload measurements are retained;
5. the Manager receives an exact matching runtime-qualification record.

`installed`, `configured`, `enabled`, and `runtimeEffective` are intentionally separate.
The first three never imply the fourth. `runtimeEffective` remains unknown without
observed worker and inference evidence from the owner adapter.

## Model boundary

- BidKV: `Qwen3.8-27B` is functionally qualified on current Core a4d6aa02 /
  Ascend 2c8c7221 TP4 FULL_DECODE_ONLY graph. Effectiveness is reported per
  configuration/workload cell. Ascending mixed is inconclusive because the policy
  did not trigger in every repeat. Interactive c=8 is not beneficial in the tested
  cell (throughput -25.31%, P95 latency +34.57%); no whole-Mod label follows.
- DiffSpec: `Qwen3.8-27B` is functionally qualified only with the hashed
  `VirVen/Qwen3.5-27B-EAGLE3-v2` draft on TP4 FULL_DECODE_ONLY graph. The
  measured lane is performance degraded and is not an acceleration recommendation.
- LatchMoE: dense `Qwen3.8-27B` is Not Applicable. `Qwen3-30B-A3B` is
  functionally qualified on TP4 PIECEWISE graph with a performance-degraded label.
  `GLM-4.7-Flash` and `Qwen3-Next-80B-A3B-Instruct` remain historical single-NPU
  qualification rows and do not inherit the current TP4 result.
