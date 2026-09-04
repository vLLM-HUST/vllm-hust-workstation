# Sage Mate Mod candidate lock

This file records review candidates, not deployable or runtime-qualified artifacts.

| Component | Candidate commit | Qualification state |
| --- | --- | --- |
| Core | `bbfddaa74c11622c7bb3f3e742f442faeb6f17e1` on base `762f85b311fbab0bcf8921dd216f5093cd58b9b8` | unit-tested; independent Ascend TP4 graph pending |
| Ascend MoE seam | `2c8c722107a54127999a64c4eb0ec86139df8c26` on base `4e57439e58ed3d78e675f9fd7b4614fb183c5394` | static checks only; NPU test pending |
| Extension Manager | `a8586ab17adab3b76e53b4abaf668564275e0fcb` | tests passed; runtime qualification pending |
| BidKV | `9fc611b19ee7a1bb22c3304843ddc5aa0d587dc7` | source/API tests passed; runtime qualification pending |
| DiffSpec | `af00892c8858f28f672e5812f32ed70eaaaafe27` | blocked on compatible Eagle3 draft and runtime qualification |
| LatchMoE | `39259709227ee962c3b838b60279dc7335224dee` | source tests partly environment-limited; separate MoE qualification pending |

The public catalog's `sha` fields remain the last reviewed historical artifacts until
the candidates are reviewed and pushed. Candidate fields make this split
machine-readable. A candidate must not replace the deployable lock until all are true:

1. a human reviews every proposed upstream line and completes required contributor/AI disclosure;
2. the commits are reachable from the declared public repositories;
3. an independently allocated Ascend TP4 environment runs graph capture/replay without using NPU0-3 or NPU4-7;
4. logs, metrics, output checks, rollback/recovery evidence, and workload measurements are retained;
5. the Manager receives an exact matching runtime-qualification record.

`installed`, `configured`, `enabled`, and `runtimeEffective` are intentionally separate.
The first three never imply the fourth. `runtimeEffective` remains unknown without
observed worker and inference evidence from the owner adapter.
