# 问答生成预算与完成状态

普通网页保留默认深度思考，不需要手工填写预算。`.env.example` 和服务端未配置时均采用 32768 总生成 tokens（此前为 4096，现提高 8 倍）；上游原生思考同样消耗这份额度。它是上限而非强制生成长度，不是上下文窗口大小；输入与输出之和必须在后端上下文内，也不保证任意复杂问题一定能生成完。显式请求预算仍优先，部署时必须同步检查运行环境变量，旧值不会被源码 fallback 自动覆盖。

请求显式 `max_tokens` 或 `max_output_tokens` 优先于 `WORKSTATION_DEFAULT_MAX_TOKENS`。两个别名同时出现且不同、非正整数及无效环境配置均拒绝，不静默改预算。Responses 上游只收到规范化的 `max_output_tokens`；`enable_thinking` 转到原生 `chat_template_kwargs.enable_thinking`，不靠系统提示关闭思考。老部署 `.env` 不会因升级代码自动改值，发布时须核对实际 Node 进程中的单个预算配置。

Responses 内层 `response.status` 和 `incomplete_details.reason` 优先于外层事件名称：已观察到 vLLM 在 `response.completed` 事件里返回 `status=incomplete / max_output_tokens`。工作台将其转换为 `finish_reason=length`，不会吞掉后再用 `[DONE]` 冒充成功。非流式同样不再硬填 stop；无终态为未完整完成。

网页完成要求：非空最终正文、正常 stop 和流结束标记均存在。只有思考、额度耗尽、过滤、异常中断、缺失终态及主动停止分别显示说明，保留已收到的部分正文；思考只在独立默认折叠区保留，不填进正文或后续对话历史。页面字符数不是 token 用量；显示的 token 数仅取自上游 usage，并注明包含思考。HTTP 200 表示流已建立，不代表问答成功。

发布只需替换 Workstation standalone 产物与其默认预算配置，无需重启推理引擎或路由器。保留旧产物、活动符号链接目标和服务端私有环境备份；回滚应用链接与原预算配置后仅重启工作台。修复验收必须使用真实网页默认操作，不用请求拦截或模拟响应替代。
