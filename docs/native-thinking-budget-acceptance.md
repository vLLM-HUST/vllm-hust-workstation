# A100 native reasoning transition: release and acceptance

## Root cause and implementation

The exact original two-turn Workstation request exhausted32768 output tokens in
reasoning, producing no final body. Its native Responses terminal was named
`response.completed`, but its nested status was `incomplete`, reason
`max_output_tokens`. HTTP200 or an event name alone did not establish success.

The deployed engine already supported a native `thinking_token_budget` decoder
control in Chat Completions. Responses omitted its field/mapping; model generation
defaults also filtered it out. The fix adds Responses forwarding and model-default
propagation to Chat/Responses, preserving explicit0, null and native-1/unlimited
semantics. No prompt instruction, model switch, thinking disablement or total
output allowance increase is used.

Engine main implementation: `12bef35`; minimal qualified7c runtime backport:
`a68500df188a2cdee29f82cce4df63ae191d146f`; main ancestry merge: `0fe80bb`.
The old CUDA/native artifacts are reused; unrelated latest-main engine changes
are not deployed. All runtime ignored build inputs, not just17 shared libraries,
are staged. The source observer fingerprints5220 files, including1987 ignored
build inputs, excluding bytecode caches. Package installation metadata still
reports its original7c build version; the running Python source commit is shown
separately and must not be confused with rebuilt CUDA artifacts.

## Authorized cutover

The first attempt failed on omitted FlashAttention Python build inputs and was
rolled back. The human explicitly approved one further reversible A100 cutover.
Second cutover:2026-10-20 17:06:17–17:09:45 Asia/Shanghai. Engine PID1581154;
no automatic retry or rollback on this second attempt. The original
`Restart=on-failure` policy was restored after readiness without another restart.
All69 A6000 health samples during the cutover returned200.

Only `vllm-hust-qwen35-engine.service` changed. Gateway1359620,
Workstation1478667 and Twin1058851 stayed unchanged. The deployed working directory
is `/home/shuhao/vllm-hust-releases/native-thinking-a68500d`, using the original
interpreter, model, TP2, GPU allocation,131072 context and other launch settings.
The single generation override is `{"thinking_token_budget":16384}`. WS total
output default remains32768. A6000 is unchanged and is outside this release scope.

## Exact public-browser acceptance

A new Chrome incognito window used the actual public website, A100 alias,
default thinking ON and search OFF. No interception, simulated response, webpage
patch or manually supplied generation parameter was used. Questions:

1. 请用一句中文解释KV缓存的作用。
2. 请接着刚才的KV缓存解释，写一份中文教学笔记：列出12条编号要点，每条约80字，最后用Markdown表格对比缓存、重计算、迁移三种策略，并给一个简单公式。不要使用联网工具。

Both returned separate Chinese final bodies. The second displayed12 numbered
points, a real Markdown table and rendered math; reasoning remained separately
folded. Scrolling upward exposed the return-to-latest control; this is a focused
interaction check, not a comprehensive long-history/scroll regression result.

Read-only inspection of only the matching synthetic gateway trace confirmed:

| Field | Actual value |
| --- | --- |
| Requested model | `Qwen/Qwen3.5-35B-A3B-A100` |
| Thinking / total output | true /32768 |
| Request thinking budget | absent; engine model default applies |
| Roles | system,user,assistant,user |
| Upstream HTTP / terminal |200 /`response.completed`, nested `completed` |
| Incomplete details | null |
| Final body |1461 characters |
| Output / reasoning tokens |6401 /5592 |
| Elapsed gateway request |39.183 seconds |

Native Chrome capture `ws-native-thinking-long-answer-20261020.png` was saved
and reopened to verify the actual final table, math and new source footer.
Its1584ms UI number is not reported as full-response duration.

## Controls and automated coverage

- Runtime protocol tests:16 passed. Both main/backport applicable pre-commit
  hooks, including type checks, passed. Latest-main protocol suite:19 passed,
  two pre-existing custom-tool cases failed identically on unmodified main
  (five passed,two failed). Those unrelated assertions were not weakened.
- Native Responses boundary control with explicit128 thinking/2048 total tokens:
  reasoning127 tokens, final body, nested `completed`,1.255s. This diagnostic
  proves the native transition;128 is not a production setting or quality test.
- Additional default two-turn repeat against the same live WS loopback endpoint:
  no budget parameters; both HTTP200, final body, `finish_reason=stop`, `[DONE]`.
  Long turn37.547s,6161 output/5382 reasoning tokens. Public Python POST returned
  403; no edge controls were weakened. Public acceptance is the real Chrome
  session above, not a claim that the loopback probe crossed Cloudflare.
- Source verification remains positive for the actual new A100 commit and PID.
  It still does not attest process memory, A6000/auto or MOD effectiveness.

## Quality limits and rollback

Delivery and rendering passed this exact test; scientific correctness did not
fully pass. The browser answer's KV memory formula omits sequence length and
defines head dimension ambiguously. This is preserved as a model-quality failure,
not corrected in the renderer, silently replaced or relabelled as accepted.
These finite checks do not guarantee final-answer completeness for every prompt.

Retain the original clean source and engine environment. To roll back, first
obtain maintenance authority, drain A100 requests, recoverably move
`~/.config/systemd/user/vllm-hust-qwen35-engine.service.d/90-native-thinking.conf`
to the private cutover audit directory, daemon-reload and restart only that engine.
The original unit then uses `/home/shuhao/vllm-hust-canonical-overlay` at7c82451c.
Do not reset source, modify credentials, restart the gateway or touch A6000.
Rollback to the original engine was exercised after the first failure; a further
post-success rollback was not run merely to generate a second interruption.
