# 2026-10-19：思考内容不再冒充最终答案

状态：**代码已提交 main 并部署；自动化与真实接口验收通过；最终浏览器三轮问答及截图尚未完成。** 不用接口成功替代网页验收。

## 根因与请求链

现场运行的是已构建的 `f2405cdf`，不是排查引用的 `19125c66` 或当时最新 main。线上 Node 的 `WORKSTATION_DEFAULT_MAX_TOKENS=128` 覆盖源码的 4096 fallback；仓库 `.env.example` 同样是 128。独立、带唯一合成验收标记的请求记录证明：

1. 网页 → Workstation `/api/chat` → Control Plane `/v1/responses` → 实际 Qwen3.5 后端。Workstation 将 128 转为 `max_output_tokens=128`；网关不裁剪预算，只规范化后端模型名称。
2. 默认请求的上游 `output_tokens=128`、`reasoning_tokens=128`，没有最终正文；显式 4096 的对照正常给出中文答案。A100 公开别名确实路由至双卡 A100；规范化后的模型名称不等于换了机器。后端公布的上下文上限为 131072，不是本次 128 生成额度的来源。
3. vLLM 发出的事件名为 `response.completed`，但内层为 `status=incomplete`、`incomplete_details.reason=max_output_tokens`。旧适配器丢弃所有终止事件，EOF 后直接补 `[DONE]` 并记成功；非流式硬填 stop。
4. 浏览器在缺正文时把 reasoning 当正文，并把无传输错误、无主动停止的结束一律标 done；旧“73 tokens”是按空格分词的界面估计，不是上游 usage。

状态契约参考 [Responses streaming events](https://developers.openai.com/api/reference/resources/responses/streaming-events)。本次兼容事件名称与内层状态不一致的实际后端行为，不重启或修改推理引擎。

## 修复

- `2b13a2e185de95d0578ffcc4025ba2ea3e92c410`：预算校验与优先级、模板 4096 默认值、原生思考参数、完整 SSE 帧解析、终止状态/用量转换、正文与思考隔离及回归测试。
- `91df8f38c201ab36b4875282c82d8f8ebedba88d`：真实浏览器发现模型目录首次未得到有效结果后无法恢复，健康轮询却标在线，可能发出空模型请求。增加目录重试、目录确认后的发送保护和服务端空模型拒绝。首次目录故障的具体 HTTP 原因未捕获，不把它断言为某种网络错误。
- 部署分支原有 Responses 路由和流量功能先合入 main（`b86eb11`），保留最新 main 的目录改动，没有创建临时 PR。
- 主要文件：`.env.example`；`src/app/api/chat/route.ts`；`src/lib/chatRequest.ts`、`chatStream.ts`、`responsesAdapter.ts`；`src/components/WorkstationClient.tsx`、`ChatPanel.tsx`；`src/types/index.ts` 及对应测试。协议见 [chat-completion-contract.md](../chat-completion-contract.md)。

只有非空正文、stop 和正常流结束证据齐全才标完成；长度耗尽、只有思考、缺失终态、过滤、异常中断及主动停止分开处理。部分正文保留，思考独立默认折叠，不放入后续对话正文。token 显示仅取上游 usage 并注明包含思考；没有 usage 时不编造 token 数。默认深度思考保持开启。

## 自动化与上线

最终实现 `91df8f3` 在 macOS 与 A100 各通过 **215 项测试、0 失败**；类型检查、严格 lint、Linux production build 和 standalone 启动/只读目录/favicon 检查通过。

覆盖默认预算到实际 fetch、显式预算/冲突/非法值、原生思考开关、reasoning→content、reasoning-only、带部分正文的 length、completed 事件内嵌 incomplete、缺终态、流中断、用户取消、EOF 尾帧、CRLF、多行 SSE、多个输出项、真实 usage 和 UI 分层状态、首次模型探测失败后的恢复。

首次本机全量的 11 个 MOD 测试失败来自 macOS `/var` 到 `/private/var` 的规范路径保护，使用真实的 `TMPDIR=/private/tmp` 重跑通过，没有弱化生产校验。首次类型检查因子模块尚未初始化而失败；补齐锁定的 dev-hub 子模块后通过。构建仍有既有 Browserslist 数据过期提示，未改变依赖版本。

最终代码于 **2026-10-19 22:31:25（Asia/Shanghai）**切到 `vllm-hust-workstation.service` 的不可变产物。实际 Node PID 为 `1081994`，目录以 `91df8f38c201ab36b4875282c82d8f8ebedba88d-20261019-final-answer` 结尾。预算为 4096，密钥/上游/模型配置内存比对不变；路由器和 A100 GPU 进程 PID 比对不变。仅重启工作台，未切换模型部署、重启共享引擎或调整实验。旧发布及服务器私有配置备份保留。

## 最终版本真实接口范围

以下为单次合成烟测，默认 4096、深度思考开启，均未在客户端补生成预算；验收 metadata 只用于在网关精确定位自己的记录。时间含模型思考，不是受控性能比较。

| 请求模型 / 场景 | 开始时间（10-19 CST） | 结果 | 用时 |
| --- | --- | --- | --- |
| Qwen3.5-35B-A3B-A100 / 流式 KV 缓存原题 | 22:37:00 | 中文最终正文、stop、DONE | 7.731s |
| 同上 / 非流式原题 | 22:32:35 | 中文正文、stop、completed；上游 output 1949，其中 reasoning 1912 | 12.927s |
| Qwen3.5-35B-A3B / A6000 流式原题 | 22:31:50 | 中文正文、stop、DONE | 55.071s |
| sage-auto / 流式原题 | 22:32:08 | 实际选 A6000；中文正文、stop、DONE | 26.763s |

实际负例：显式 128、深度思考开启时只返回思考，准确映射 length；显式 16、仅为制造正文截断的关闭思考对照，返回部分正文且 length。主动读到首个增量后断开，网关记录 499/client_disconnected，工作台在途数回到 0。负例不是对网页默认参数的修改。Embedding-8B 与 Reranker-0.6B 没有按聊天模型调用或验收。

## 尚未通过的发布验收

第一次 Chrome 无痕真实问答暴露上述空模型竞态，不计通过；修复后，原生 Chrome 控制持续超时，重建控制会话仍超时，内置浏览器新标签页也超时。已请求操作者保持 Mac 解锁并点开 Chrome；不能在未观察结果时称网页已验收。

仍需：全新会话保持默认深度思考完成 KV 原题、普通中文问答与上下文追问；检查折叠思考/最终正文、截断与停止提示；保存真实截图或录像。没有请求拦截、模拟响应或手工修改网页来替代此门槛。也不承诺 4096 足够回答任意复杂问题，耗尽时必须如实提示。

## 回滚

服务器保留原始 `f2405cdf` 及中间 `2b13a2e` 产物、活动链接原目标和仅在服务器保存的私有环境备份。运维可将活动 standalone 符号链接切回选定旧产物，只重启工作台，不回滚对话或模型数据，不重启路由/引擎。建议保留已修正的 4096 预算；恢复 128 等于恢复本次已确认的额度故障。原始与本次切换的具体路径、PID 和脱敏接口回执保留于操作者交接文件，不在公开仓库发布环境文件或用户内容。
