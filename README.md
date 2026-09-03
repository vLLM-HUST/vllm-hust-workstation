# vllm-hust-workstation

Runtime receipt verification, freshness policy, and independent UI audit:
[2026-09-03 audit](docs/workstation-audit-20260903.md).

模型库权限、数据盘配置与清理验收：[治理记录](docs/model-hub-governance-20260903.md)。

私有化 AI 工作站 — 基于 Next.js + `vllm-hust-gateway` 的统一 Web 工作台。

🛡️ 数据不出境 · 完全本地推理 · 零编程门槛

---

## ✨ 功能

- **实时流式对话** — 接入任意 `vllm-hust-gateway`（OpenAI 兼容接口）
- **实时监控面板** — TPS、延迟、GPU 利用率、显存趋势图
- **EvoScientist Embedded Chat** — 直接在工作站里调用 EvoScientist CLI，会话化执行自动科研任务
- **Prometheus 监控端点** — 内置 `/metrics`，可直接接入 Prometheus 抓取
- **白牌化** — 品牌名 / Logo / 主题色可通过 `.env` 配置
- **Node 单运行时** — 前后端统一收敛到 Next.js Route Handlers，避免 Python + Node 双依赖栈

---

## 🚀 快速开始

### 启动脚本说明

- `./quickstart.sh`：统一入口；本地终端默认进入交互式演示菜单
- `./quickstart.sh demo`：后台一键拉起“本地后端 + 工作站 UI”
- `./quickstart.sh backend`：仅启动 / 修复本地 `vllm-hust`
- `./quickstart.sh restart-backend`：强制重启本地 `vllm-hust`
- `./quickstart.sh ui`：仅后台启动工作站前端
- `./quickstart.sh status`：查看本地演示栈状态
- `./quickstart.sh stop`：停止本地演示栈
- `./quickstart.sh auto|docker|dev`：保留原有模式入口
- `start.bat`：Windows 下的本地 `dev` 快捷入口

### 前提

- Node.js 20+
- 本机已安装 `ivllm-hust`，或当前 shell 已激活可运行 `vllm-hust` 的 Python 环境
- 本地 quickstart 默认会尝试自启动“完整栈（gateway + engine）”，无需再手动补 `VLLM_HUST_CP_ENGINE_*`

### Linux / macOS

```bash
./quickstart.sh
```

默认行为：

- 若当前 shell 连接的是本地终端，脚本会先进入交互式“演示启动菜单”，默认第一项就是“一键启动全部”
- 若 `VLLM_HUST_BASE_URL` 指向本机地址（如 `localhost:8080`），脚本会先检查本地服务是否真的可推理；若不可推理，则自动拉起 `vllm-hust serve` 完整栈
- 若本地已有健康可推理服务，即使 `.env` 中写的是另一套模型，默认也会优先复用当前服务；只有显式执行 `restart-backend`、开启交互式模型菜单确认切换，或设置 `WORKSTATION_ENFORCE_BOOTSTRAP_MODEL_ON_START=true` 时，才会按 `.env` 模型重建
- 若本地目标端口（默认 `8080` / `3000`）已被其他进程占用且当前用户无法安全接管，脚本会 fail-fast 并提示应释放端口，或改用新的 `VLLM_HUST_BASE_URL` / `APP_PORT`
- Ascend 场景下，`quickstart.sh` 会优先复用 `hust-ascend-manager` 环境，并默认以 `COMPILE_CUSTOM_KERNELS=0` 启动本地后端，避免在工作站启动前触发 custom kernels 编译
- 若本机没有 `node/npm`，且当前 shell 已激活 conda，`quickstart.sh` 默认会尝试把 Node.js 20 自动安装到当前 conda 环境，再继续走 `dev` 模式启动
- 若未显式配置 `HF_ENDPOINT`，workstation 会默认走 `https://hf-mirror.com`；若镜像也不可达且当前所选模型未缓存，才会回退到本机已有缓存模型继续启动
- 若检测到当前 Python / `vllm-hust` 运行时不完整，quickstart 与 backend deploy 会优先调用 `ascend-runtime-manager runtime repair` 自动修复当前环境，而不是只提示手工 `pip install`
- 若前端 `.next` 构建缓存来自其他机器路径或当前前端已返回 500，`quickstart.sh` 会自动清理旧缓存并重启前端
- 若在本地终端执行 `./quickstart.sh`，启动前会出现交互式模型菜单；脚本会优先按实际硬件自动识别后端（如 `nvidia-smi -> cuda`），并在 CUDA 场景下按 8GB / 12GB / 16GB / 24GB+ 显存档位给推荐模型，选择结果会同步写回 `.env` 的 `WORKSTATION_BOOTSTRAP_MODEL` / `DEFAULT_MODEL`
- 若本地已有 gateway 但未注册健康 engine，脚本可自动重建本地服务，避免“UI 已启动但 chat 一直报 No healthy LLM engine”
- 若 `VLLM_HUST_BASE_URL` 指向远端地址，脚本会 fail-fast，而不是假装启动成功
- 本地完整栈日志默认写入 `.logs/vllm-hust-serve.log`
- 工作站监控栏新增“演示控制台”，可直接在 UI 内执行“一键拉起 / 修复后端”“重启本地后端”“停止本地演示栈”

### Windows

双击 `start.bat`

### 手动启动

```bash
cp .env.example .env
npm install
npm run dev
```

浏览器访问 `http://localhost:3000`

---

## ⚙️ 配置

复制 `.env.example` 为 `.env` 后编辑：

```dotenv
# 若本机 8080 已被占用，可改成例如 http://localhost:18080
VLLM_HUST_BASE_URL=http://localhost:8080
VLLM_HUST_API_KEY=not-required
WORKSTATION_BACKEND_MODE=local
WORKSTATION_LOCAL_BACKEND_CONTROL_ENABLED=true
WORKSTATION_AUTO_START_GATEWAY=true
WORKSTATION_AUTO_HEAL_GATEWAY=true
WORKSTATION_ENFORCE_BOOTSTRAP_MODEL_ON_START=false
WORKSTATION_BOOTSTRAP_MODEL=Qwen/Qwen2.5-7B-Instruct
WORKSTATION_INTERACTIVE_LAUNCHER=true
WORKSTATION_INTERACTIVE_MODEL_MENU=true
WORKSTATION_BOOTSTRAP_BACKEND=auto
WORKSTATION_AUTO_DETECT_BACKEND=true
WORKSTATION_ASCEND_COMPILE_CUSTOM_KERNELS=0
WORKSTATION_AUTO_INSTALL_NODE_WITH_CONDA=true
WORKSTATION_NODEJS_CONDA_SPEC="nodejs>=20,<21"
WORKSTATION_AUTO_FALLBACK_TO_LOCAL_CACHE=true
# 默认是 gateway port + 1；若冲突可改成其他空闲端口
WORKSTATION_ENGINE_PORT=8902
DEFAULT_MODEL=Qwen2.5-7B-Instruct
BACKEND_TYPE=AUTO

HF_ENDPOINT=https://hf-mirror.com

# 若 3000 已被占用，可改成例如 3300
APP_PORT=3000
APP_BRAND_NAME="vLLM-HUST 工作站"
APP_BRAND_LOGO=
APP_ACCENT_COLOR=#6366f1
# 若需要让 website 以 iframe 嵌入此页面，可限制允许嵌入的来源域名
# APP_FRAME_ANCESTORS=https://vllm-hust.sage.org.ai https://vllm-hust.example.com
```

### 复用平台共享后端

当 workstation 只作为 UI/API 代理，复用另一套已由 systemd 管理的
OpenAI-compatible 推理服务时，应明确使用 external 模式：

```dotenv
VLLM_HUST_BASE_URL=http://127.0.0.1:18001
VLLM_HUST_API_KEY_FILE=/path/to/workstation-backend-api-key
# 若共享平台已有受保护 env，也可改用：
# VLLM_HUST_API_KEY_ENV_FILE=/path/to/shared-runtime.env
# VLLM_HUST_API_KEY_ENV_NAME=VLLM_HUST_API_KEY
WORKSTATION_BACKEND_MODE=external
WORKSTATION_LOCAL_BACKEND_CONTROL_ENABLED=false
WORKSTATION_AUTO_START_GATEWAY=false
WORKSTATION_AUTO_HEAL_GATEWAY=false
# 可选：启用独立的 Workstation 管理员模式
# WORKSTATION_ADMIN_TOKEN_FILE=/path/to/workstation-admin-token
# WORKSTATION_EXTERNAL_BACKEND_SYSTEMD_SERVICE=inference-engine.service
```

密钥文件应仅包含一行 token，并设置为 `0600`。external 模式仍允许
`/api/chat`、`/api/models` 和监控探测访问共享后端，但普通访客不能启动、
停止或重启共享引擎。若同时配置独立管理员 token 和固定 systemd user unit，
管理员可以在页面中显式进入管理员模式后执行重启；令牌只保留在当前页面内存，
不会持久化。后端 URL
和 API key 不再通过 `next.config.mjs` 固化到构建结果；它们只在 Node 服务端
运行时读取，因此切换机器或后端无需重新硬编码代码，也不会把 key 打进浏览器
静态资源。

`VLLM_HUST_API_KEY_ENV_FILE` 适用于同一宿主机上已经存在受保护运行时
配置的情况。启动脚本在 subshell 中读取 `VLLM_HUST_API_KEY_ENV_NAME` 指定的
单个变量，不会把源文件中的其它 token 或部署参数导入 workstation。
管理员 token 也支持对应的 `WORKSTATION_ADMIN_TOKEN_ENV_FILE` 和
`WORKSTATION_ADMIN_TOKEN_ENV_NAME`，但建议使用与推理 API key 不同的凭据。

### 模型库权限与存储

模型目录默认只读。普通用户可以浏览模型和权重状态，不会收到服务器绝对路径或低层下载错误。
模型库内的“管理员登录”使用现有 `WORKSTATION_ADMIN_TOKEN`，输入框为密码类型；
令牌仅保存在弹窗内存，退出管理或关闭弹窗后清除，不写入浏览器持久化存储。
下载 POST、取消 DELETE 和旧激活 POST 均在服务端鉴权，未授权返回 401。

必须在部署 `.env` 中显式配置 `MODEL_HUB_DIR` 为已创建、可写的绝对目录；不再回退到
账号 Downloads。目录留空、相对路径、文件系统根目录、不可用目录均禁用下载。
本机使用 `/data/vllm-hust-workstation-shuhao/models`，与共享推理容器现有权重隔离。
路径与剩余空间仅向验证后的管理员显示。

下载前检查目录白名单、磁盘容量（模型预估大小 + 10% 余量 + 5 GiB 保留空间）和受限仓库
授权；单个 standalone Workstation 一次只运行一个下载，含预检查并发保护。
下载依赖服务环境中的 `python3` 和 `huggingface_hub`，受限仓库另需 `HF_TOKEN`。
取消先发送 SIGTERM，最多等待 5 秒后 SIGKILL，保留已下载文件用于续传。
权重就绪检测要求 config.json 和全部索引分片，不能因为出现第一个权重文件就标为完成。
这不是权重内容哈希认证，也不代表模型已经适配或部署到 NPU。

**下载不等于部署。** 已移除“设为当前”和修改 DEFAULT_MODEL 的伪激活逻辑；旧激活接口
即使管理员调用也返回 409，不写配置、不重启服务。实际模型以在线推理接口为准，模型上线、
切换和回滚由平台运维管理。

### 可信运行来源与 receipt v2

生产 Workstation 不应以单一 `v0.23.0` 标签概括共享后端。部署脚本会从
`WORKSTATION_RUNTIME_CONTAINER` 指定的实际容器生成
`.workstation-deploy/runtime-provenance.json`，`/api/versions` 和页面“可信运行来源”
分别展示：

- 官方稳定兼容基线（当前为 `v0.23.0`）及其“仅提供文件系统/CANN”的角色；
- 活跃源码通道（`latest-main-snapshot`），不能与稳定兼容基线混为一个版本；
- core/plugin 的仓库、完整 commit、源码版本、实际安装 package version 和可点击链接；
- 运行镜像 reference、不可变 image ID/digest 与构建时间；
- production runtime lock schema 和采集时间。

采集器只接受 production runtime lock v2 的新分层 OCI labels；旧 v1 receipt、
缺少活跃 package 标签或只给出单一 `v0.23.0` 的镜像会 fail closed，而不会在 UI
中冒充当前源码。这里仍是 Workstation runtime-provenance schema v2。镜像 tag 只用于阅读，回滚和
复现必须使用 image ID/digest、core/plugin SHA 与对应 production lock。推荐部署：

```bash
WORKSTATION_RUNTIME_CONTAINER=managed-vllm-container \
  ./scripts/deploy_workstation.sh ci-deploy
curl -fsS http://127.0.0.1:${APP_PORT:-3000}/api/versions
```

切换前保留上一份 receipt 和旧 image ID。若新版本的 models/chat 或 UI 来源展示
失败，恢复旧容器/镜像合同后重新执行 `ci-deploy`；不要手工修改生成的 JSON，也
不要只改前端显示来掩盖后端身份不一致。

#### 每小时自动刷新与失败检查

将 `WORKSTATION_RUNTIME_CONTAINER`（以及自定义 receipt 路径，如有）持久化在
Workstation 的 `.env` 中。配置运行容器的 `ci-deploy` 会自动安装并启用
`vllm-hust-workstation-provenance.timer`；已有部署也可单独安装，无需重启应用或推理服务：

```bash
bash scripts/install_runtime_provenance_timer.sh
systemctl list-timers vllm-hust-workstation-provenance.timer
systemctl show vllm-hust-workstation-provenance.service -p Result -p ExecMainStatus
sudo journalctl -u vllm-hust-workstation-provenance.service --since today
```

这是系统级 timer，由部署账号（本机为 `shuhao`）执行，只需安装和 Docker 读取所需的
非交互式 sudo。它不依赖用户登录或 linger，不启停 Docker、推理容器或其他任务。
每小时采集一次，随机延迟不超过 120 秒（另有 30 秒调度精度），启动后约两分钟也会触发；
`Persistent=true` 会补执行关机期间错过的日历触发。安装时立即采集一次。

采集命令限时 60 秒，超时后最多等待 5 秒强制结束，systemd 另设 90 秒上限。
同一路径的采集用文件锁串行化，成功才原子替换 receipt。失败不刷新旧凭据的时间：
`/api/versions` 仍拒绝超过 24 小时的 receipt，并继续核验当前容器身份。
失败退出码写入 systemd/journal，另外原子记录在 receipt 旁的
`runtime-provenance.refresh-status.json`，保留 `lastSuccessAt` 供监控读取。
这里提供本机可观测的失败状态，未配置邮件或聊天推送渠道。

暂停自动采集只需 `sudo systemctl disable --now vllm-hust-workstation-provenance.timer`；
不会停止正在运行的推理容器。恢复可重跑安装脚本。定时器停用后 receipt 仍会正常过期，
不得通过手改时间规避验证。

#### Lint 与回归门禁

`npm run lint` 使用仓库内的 ESLint flat config，检查 Next.js Core Web Vitals 和
TypeScript 规则，非交互运行且不允许 warning。CI 和部署构建都执行此门禁。
本地验收命令：

```bash
npm run lint
npm test
python3 -m unittest discover -s scripts/tests -v
npx tsc --noEmit
npm run build
```

采集集成测试只使用临时目录中的 fake Docker，覆盖成功、失败保留旧凭据、容器更换或停止、
锁与标签不一致、超时、非法容器名和并发原子写入，不访问真实推理服务。

### EvoScientist 运行环境

EvoScientist 要求 Python 3.11 或更高版本。建议在其仓库中使用锁文件创建独立
环境，Workstation 会自动优先选择该项目的 `.venv/bin/python`：

```bash
cd /path/to/EvoScientist
uv sync --frozen --no-dev
```

也可通过 `WORKSTATION_EVOSCI_PYTHON_BIN` 指定其它完整环境。状态探测会真实
导入 sessions 与 CLI 模块，解释器版本或依赖不兼容时不会再误报 ready。

如不希望每次启动都弹出模型选择菜单，可在 `.env` 中设置：

```dotenv
WORKSTATION_INTERACTIVE_LAUNCHER=false
WORKSTATION_INTERACTIVE_MODEL_MENU=false
```

如需强制指定后端而不是自动识别，可在 `.env` 中设置：

```dotenv
WORKSTATION_BOOTSTRAP_BACKEND=cuda
# 或 cpu / ascend / rocm
WORKSTATION_AUTO_DETECT_BACKEND=false
```

如需手动覆盖本地 `vllm-hust serve` 的工具解析器，可在 `.env` 中设置：

```dotenv
WORKSTATION_TOOL_CALL_PARSER=hermes
```

未显式设置时，quickstart 会按模型自动选择默认 parser：Qwen2.5 / QwQ 使用 `hermes`，Qwen3-Coder 使用 `qwen3_xml`，Llama 3.2 使用 `pythonic`，Llama 4 使用 `llama4_pythonic`，其余模型默认 `openai`。

工作站内嵌 EvoScientist 现在会自动通过后端调用 EvoSci CLI，并为每次请求临时注入一份 EvoScientist 配置：

- provider 固定为 `custom-openai`
- `base_url` 默认继承 `VLLM_HUST_BASE_URL` 并自动补齐 `/v1`
- `api_key` 默认继承 `VLLM_HUST_API_KEY`，未设置时使用 `not-required`
- `model` 优先使用当前工作站模型，并自动对齐到后端真实 served model id（例如把 `Qwen2.5-7B-Instruct` 解析为 `Qwen/Qwen2.5-7B-Instruct`）

如需覆盖这些默认值，可在 `.env` 中追加：

```dotenv
WORKSTATION_EVOSCI_BASE_URL=http://localhost:8080/v1
WORKSTATION_EVOSCI_API_KEY=not-required
WORKSTATION_EVOSCI_MODEL=Qwen/Qwen2.5-7B-Instruct
```

如需单独启动本地 vllm-hust OpenAI 服务，请在 vllm-hust 仓库中直接执行原生 `vllm-hust serve` 命令。

## 🌐 挂到加速器后台并呈现到 website

如果目标是“workstation 部署在一台加速器机器上，然后在 `vllm-hust-website` 首页中展示”，推荐按下面的方式做：

1. 在目标主机上部署 `vllm-hust` OpenAI 兼容服务，例如 `http://ACCELERATOR_HOST:8080`
2. 在同一台机器或同一内网可达机器上部署 `vllm-hust-workstation`
3. 给 workstation 配置远端后端地址：

```dotenv
VLLM_HUST_BASE_URL=https://ACCELERATOR_HOST:8080
APP_BRAND_NAME=vLLM-HUST Accelerator Workstation
APP_FRAME_ANCESTORS=https://vllm-hust.sage.org.ai https://your-website-domain
```

4. 确保 workstation 以 HTTPS 对外暴露，再把该 URL 写入 `vllm-hust-website/data/workstation_embed.json`

说明：

- `website` 当前是静态站点，适合做 iframe 展示或外链跳转，不负责给 workstation 反向代理 API。
- 如果 `website` 走 HTTPS，而 workstation 还是 HTTP，浏览器会拦截混合内容，无法嵌入。
- `APP_FRAME_ANCESTORS` 留空时不会额外下发 `frame-ancestors` 限制；生产部署建议显式填写 website 域名。

```bash
# 必需：确保本机 8080 上有可用的 vllm-hust OpenAI 接口
curl http://127.0.0.1:8080/v1/models

# 必需：EvoScientist 侧已配置好 provider/model（在 EvoScientist 配置文件中）
cat ~/.config/evoscientist/config.yaml
```

可在 `.env` 中调整嵌入调用参数：

```bash
WORKSTATION_EVOSCI_BIN=EvoSci
# 可选：若 EvoSci 不在 PATH，或需切换到独立 Python 环境
# WORKSTATION_EVOSCI_PYTHON_BIN=/path/to/EvoSci/bin/python
WORKSTATION_EVOSCI_WORKDIR=/path/to/EvoScientist
WORKSTATION_EVOSCI_TIMEOUT_MS=180000
# 后端未在 /v1/models 返回上下文能力时才需要显式配置：
# WORKSTATION_EVOSCI_CONTEXT_WINDOW_TOKENS=32768
```

---

## 🔌 与 vllm-hust-gateway 对接

| 前端路由 | 上游接口 | 说明 |
| -------- | -------- | ---- |
| `POST /api/chat` | `POST /v1/chat/completions` | 流式对话（SSE 透传） |
| `GET  /api/models` | `GET /v1/models` | 模型列表下拉（上游离线时返回兜底模型并显式标记离线） |
| `GET  /api/metrics` | `GET /v1/stats` + `GET /metrics` | 监控面板 JSON 聚合 |
| `POST /api/evoscientist/chat` | `EvoSci -p ...` | 内嵌 EvoScientist 对话调用（CLI 桥接） |
| `GET  /metrics` | Workstation internal registry | Prometheus 抓取端点 |

> `quickstart.sh` 会先做一次真实推理探测，而不是只看 `/health`。因此本地若只有空 gateway、没有健康 engine，也会被判定为“未就绪”并自动修复。

> 工作站会优先聚合 gateway 指标；当上游未暴露 `/metrics` 或 `/v1/stats` 时，才回退到 `.env` 中的展示字段。请把 `DEFAULT_MODEL` 和 `BACKEND_TYPE` 改成你机器上的真实值，不要保留示例值。

---

## 📈 Prometheus 接入

工作站原生暴露 Prometheus 文本格式端点：

- UI / API: `http://localhost:3000`
- Prometheus metrics: `http://localhost:3000/metrics`

内置指标包括：

- `vllm_hust_workstation_api_requests_total`
- `vllm_hust_workstation_api_request_duration_seconds`
- `vllm_hust_workstation_upstream_request_duration_seconds`
- `vllm_hust_workstation_active_chat_requests`
- `vllm_hust_workstation_chat_stream_duration_seconds`
- `vllm_hust_workstation_chat_approx_tokens_total`

---

## 📁 文件结构

```text
vllm-hust-workstation/
├── src/app/           # Next.js App Router + API Route Handlers
├── src/components/    # 聊天与监控 UI 组件
├── src/lib/metrics.ts # prom-client 指标注册与聚合
├── package.json       # Node 依赖与脚本
├── .env.example       # 运行时配置模板
├── start.bat          # Windows 开发启动
└── quickstart.sh      # Linux/macOS/WSL 统一启动入口
```

---

## 🏗️ 生产运行

```bash
npm run build
npm run start
```

### systemd --user 部署

如果目标主机不能直接暴露公网入口，直接在主机本地用脚本安装和更新 `systemd --user` 常驻服务即可，不需要把 deployment 绑定到 GitHub Actions workflow。

这套仓库内置了最小部署骨架：

- backend deploy 脚本: `scripts/deploy_backend_service.sh`
- backend systemd 启动脚本: `scripts/run_backend_systemd.sh`
- backend unit 模板: `deploy/systemd/vllm-hust-backend.service.template`
- website deploy 脚本: `../vllm-hust-website/scripts/deploy_website_service.sh`
- deploy 脚本: `scripts/deploy_workstation.sh`
- systemd 启动脚本: `scripts/run_workstation_systemd.sh`
- unit 模板: `deploy/systemd/vllm-hust-workstation.service.template`
- 统一运维入口: `scripts/manage_public_stack.sh`

建议流程：

```bash
# 1) 首次准备 .env
cp .env.example .env

# 2) 填好后端地址、端口、品牌信息
#    至少确认这些变量：
#    VLLM_HUST_BASE_URL / APP_PORT / APP_BRAND_NAME / APP_FRAME_ANCESTORS

# 3) 本机一次性安装 backend / workstation / website 的 systemd 用户服务
./scripts/deploy_backend_service.sh install-service
./scripts/deploy_workstation.sh install-service
../vllm-hust-website/scripts/deploy_website_service.sh install-service

# 4) 先接管 backend，再构建并切换 workstation / website 到常驻服务
./scripts/deploy_backend_service.sh deploy
./scripts/deploy_workstation.sh deploy
../vllm-hust-website/scripts/deploy_website_service.sh deploy

# 5) 查看服务状态 / 日志
./scripts/deploy_backend_service.sh status
./scripts/deploy_backend_service.sh logs
./scripts/deploy_workstation.sh status
./scripts/deploy_workstation.sh logs
../vllm-hust-website/scripts/deploy_website_service.sh status
../vllm-hust-website/scripts/deploy_website_service.sh logs
```

说明：

- deploy 脚本不会跑 `npm run dev`，而是执行 `next build`，然后把 `.next/standalone`、`.next/static`、`public/` 组装到固定 runtime 目录。
- systemd 常驻服务只负责运行这个 runtime，避免把交互式 quickstart、本地 demo 控制逻辑带进生产服务。
- 一旦服务由 `systemd --user` 拉起，后续生命周期就归 systemd 管，不会因为你关闭 shell、退出 VS Code，或结束某个外部调用而自动停止。

### 以后直接用这组命令

当前状态：

- `workstation` 是 `systemd --user` 常驻
- `vllm-hust` backend 现在也可以由 `systemd --user` 常驻接管
- `website` 也可以本地以 `systemd --user` 常驻挂在 `127.0.0.1:8000`

以后日常优先只记这一个入口：

```bash
./ops.sh
```

它默认会直接打开中文分组菜单。若你不想进菜单，再用下面这些子命令：

```bash
# 查看本地与公网状态
./ops.sh status

# 打开统一交互菜单
./ops.sh menu

# 安装 / 更新并重启本地 vllm-hust backend systemd 服务
./ops.sh deploy-backend

# 重启本地 vllm-hust backend systemd 服务
./ops.sh restart-backend

# 仅重启 workstation systemd 服务
./ops.sh restart-workstation

# 仅重启 website systemd 服务
./ops.sh restart-website

# 同时安装 / 更新两个 UI 服务
./ops.sh deploy-ui

# 若你改了前端代码或 .env，重新构建并部署 workstation
./ops.sh deploy-workstation

# 一次性重启 backend + workstation
./ops.sh restart-all

# 看日志
./ops.sh logs
```

如果你还想保留原始脚本入口，`./scripts/manage_public_stack.sh` 仍然可用；`./ops.sh` 只是更短的顶层包装器。

推荐顺序：

- 首次切到常驻服务：`deploy-backend`，然后 `deploy-ui`
- 只换模型、修 backend：`deploy-backend` 或 `restart-backend`
- 只改页面或 UI：`deploy-ui`、`deploy-workstation` 或 `deploy-website`
- 两边都想重新拉起：`restart-all`

运行时修复的单一入口：

```bash
cd /path/to/vllm-hust-dev-hub/ascend-runtime-manager
PYTHONPATH=src python -m hust_ascend_manager.cli runtime check --repo /path/to/vllm-hust
PYTHONPATH=src python -m hust_ascend_manager.cli runtime repair --repo /path/to/vllm-hust
```

`workstation` 自身不会再维护另一套手工 Python 修复步骤；当 quickstart / backend deploy 检测到 `vllm-hust` 运行时不完整时，会优先走这套 manager 流程。

这套命令会保持当前挂载关系：

- 本地 backend: `http://127.0.0.1:8080`
- 本地 workstation: `http://127.0.0.1:3001`
- 公网 workstation: `https://<your-workstation-domain>`
- 公网 backend: `https://<your-api-domain>`

可选环境变量：

```dotenv
# backend 的 systemd --user 常驻服务名
WORKSTATION_BACKEND_SYSTEMD_SERVICE_NAME=vllm-hust-backend

# website 仓库路径与 website 的 systemd --user 常驻服务名
WORKSTATION_WEBSITE_REPO_DIR=/path/to/vllm-hust-website
WEBSITE_SYSTEMD_SERVICE_NAME=vllm-hust-website

# website 本地检查地址
WEBSITE_URL=http://127.0.0.1:8000

# 后端运行时不完整时，是否自动调用 ascend-runtime-manager 做修复
WORKSTATION_AUTO_REPAIR_BACKEND_RUNTIME=true
```

### 多模型 Fleet 自动部署

如果你想在这台机器上同时挂多条 `vllm-hust serve` 实例，可以直接用仓库里的 fleet 清单：

- manifest: `deploy/model-fleet.json`
- 本地部署脚本: `scripts/deploy_model_fleet.sh`

默认策略：

- 默认把 `32B` 固定到第二张卡，把 `0.5B / 1.5B / 3B / 7B / 14B` 放到第一张卡。
- 若第一张卡还有余量，会继续尝试 `DeepSeek-R1-Distill-Qwen-7B` 和 `Llama-3.1-8B-Instruct` 这类补位模型。
- `only_cached=true`，所以本机未完整缓存的模型会自动跳过；存在 `.incomplete` 分片的下载中模型不会被误判为可启动。
- 调度时会读取当前 `nvidia-smi` 的实时空闲显存，不主动打断已有实例。

本机先看规划：

```bash
./scripts/deploy_model_fleet.sh plan
```

本机直接部署：

```bash
./scripts/deploy_model_fleet.sh deploy
```

查看状态：

```bash
./scripts/deploy_model_fleet.sh status
```

如果你后面补齐了更大的模型：

1. 先把权重放进本机 Hugging Face cache，或把 `only_cached` 改成 `false`
2. 再把 `deploy/model-fleet.json` 里对应模型的 `enabled` 打开
3. 本地再次执行 `./scripts/deploy_model_fleet.sh deploy`

### Workspace 检索脚本

如果 VS Code / Copilot 当前会话里的 semantic workspace search 不可用，可以直接用仓库内置脚本替代：

```bash
# 查看默认会搜索哪些本地仓库
./scripts/workspace_search.sh repos

# 搜索文本
./scripts/workspace_search.sh text "deploy-backend"

# 把 upstream 参考仓也一起搜
./scripts/workspace_search.sh text --scope all "Qwen/Qwen2.5-7B-Instruct"

# 按文件名筛选
./scripts/workspace_search.sh files "systemd|deploy"
```

说明：

- 默认 scope 是 `local`，覆盖当前这套采购/交付相关仓库：`vllm-hust`、`vllm-hust-workstation`、`vllm-hust-website`、`vllm-hust-docs`、`vllm-ascend-hust`、`vllm-hust-dev-hub`、`vllm-hust-benchmark`、`EvoScientist`
- 如果要把 `reference-repos/` 里的 upstream 仓库一起搜，用 `--scope upstream` 或 `--scope all`
- 底层直接使用 `rg`，不依赖 semantic index

### Cloudflare Tunnel 需要什么凭据

推荐你优先用 Cloudflare Dashboard 的 token 模式，它最省事：

1. 你的域名已经托管在 Cloudflare
2. 在 Zero Trust / Access / Tunnels 里创建一个 tunnel
3. 给这个 tunnel 绑定公开 hostname，例如 `workstation.your-domain.com`
4. 把该 tunnel 的 `token` 放到主机上，用 `cloudflared tunnel run --token ...` 启动

这种模式下，主机上真正需要的敏感信息只有：

- `Tunnel Token`

不需要预先放 `cert.pem`。

如果你要用 CLI 管理型 named tunnel，那么主机上需要的是另一套凭据：

- `~/.cloudflared/cert.pem`：Cloudflare 账户级 origin cert，用于 `cloudflared tunnel create/list` 等管理命令
- 对应 tunnel 的 `credentials-file` JSON：运行该 tunnel 时使用

前面 `cloudflared tunnel list` 报错缺少 `cert.pem`，说的是这种“CLI 管理型”模式，不是 token 模式本身不可用。

或继续使用 Docker：

```bash
docker compose build
docker compose up -d
docker compose logs -f
```

## 📦 PyPI 发布（vllm-hust）

如需发布 vllm-hust 基座包，请在基座仓库执行：

```bash
python -m pip install -U build twine
python -m build
python -m twine upload dist/*
```

---

## License

MIT
