# Changelog

All notable changes to sagellm-workstation will be documented in this file.

## [Unreleased]

### Fixed
- Workstation `/config.json` now returns `modelsDir` and `hfEndpoint`, so the frontend model hub shows the configured download directory and mirror endpoint instead of falling back to hardcoded defaults.

### Added
- **Left inference panel** — collapsible 🔭 side panel (left of chat) shows ⚙️ 处理流程, 🌐 搜索来源, 💭 思考过程 in dedicated sections; auto-opens on each request, closeable via tab or ✕ button; keeps chat area clean
- **Pipeline status steps** — real-time animated steps in left panel showing "正在检索 → 找到N条 → 正在生成 → ✅ 完成" regardless of model CoT support
- **Search citations in left panel** — all search results (title, snippet, URL) shown in 🌐 section with no size limit; removed citations card from chat bubble area
- **Think block in left panel** — CoT models' `<think>` content streamed into 💭 section; no max-height truncation
- **Gateway watchdog** (`watchdog.sh`) — daemon that checks every 20 s whether gateway has a healthy engine; auto-reconnects from engine pool (8901–8904) if disconnected
- **Web search state persistence** — 🌐 toggle state saved to `localStorage`; restored on page refresh

### Fixed
- Gateway returning `{"detail":"No healthy LLM engine..."}` now properly wrapped as SSE `⚠️` message; frontend shows error text instead of blank 0-token response
- Weather forecast date alignment: loop over `forecast[]` to find actual today by `ymd` field instead of assuming `forecast[0]` is today
- 3-day forecast now shows 今天/明天/后天 with wind info per day
- SSE chunk split buffer (`sseBuf`) prevents JSON events dropped when split across TCP chunks
- `asyncio.wait_for(timeout=10)` hard cap on web search prevents 40 s UI freeze when all search providers are rate-limited
- `time.monotonic()` replaces deprecated `asyncio.get_event_loop().time()`

### Added
- **Hardware backend selector** in header — calls `GET /api/backends`, switches via `PUT /api/backend` (effective on next Gateway restart)
- **System Prompt / Persona modal** with 6 presets (工作助手, 代码专家, 翻译助手, 数据分析师, 创意写作, 学术研究) plus custom textarea; shown as dismissable bar when active
- **Generation parameters** sidebar panel — temperature (0–2), max_tokens (256–8192), top_p (0.1–1.0) sliders with live value display; values passed directly to `POST /api/chat` (proxied natively to sagellm-gateway); reset-to-defaults button; persisted per session
- **Session history** (localStorage `sagellm_sessions`, max 20) — auto-create on first message, auto-title from first 28 chars of user message, restore/delete sessions from sidebar, params/sysPrompt saved per session
- **Enhanced Markdown renderer** — bold, italic, strikethrough, H1–H3 headers, unordered/ordered lists, blockquotes, horizontal rules, GitHub-style tables, fenced code blocks with language label and per-block copy button
- **File drag-and-drop** on chat area — supports `.txt .py .js .ts .json .yaml .yml .md .csv .sh .go .rs .cpp .c .java .rb .php .sql .xml .html .css .toml .ini .conf` (max 200 KB); content injected as code block into message; attach button (📎) also available
- **Export chat to Markdown** (⬇ button or `Ctrl+E`) — includes model, timestamp, system prompt, generation params, full conversation
- **Keyboard shortcuts**: `Ctrl+K` clear chat, `Ctrl+E` export, `Escape` close modals
- **Optional web search gateway** — 🌐 toggle button in input bar activates DuckDuckGo Lite search before LLM inference; search results injected as `<web_search_results>` system context; collapsible citations card rendered above AI response; `GET /api/search?q=...` explicit search endpoint; configurable via `[search]` section in `config.ini` (`enabled`, `max_results`, `timeout_sec`, `region`); no external packages required (uses stdlib `html.parser` + `httpx`)
- **Per-message copy button** and AI response TTFT (time-to-first-token) display in bubble meta
- **Token counter** during streaming (tokens · elapsed ms)
- **GPU memory bar** with `used / total GB` sub-label
- Total-requests-served and pending-queue dual stat cards

### Fixed
- `_dir_size()` excluded `.incomplete` files from size calculation, causing download progress to always show 0% — now only `.lock` files are excluded
- `_monitor()` now extracts current filename from `*.incomplete` rglob to show which file is downloading
- `snapshot_download` wrapped with `TypeError` fallback for huggingface_hub ≥ 0.23 (`local_dir_use_symlinks` parameter removed)
