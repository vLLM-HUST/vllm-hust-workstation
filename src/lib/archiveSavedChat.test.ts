// @vitest-environment node
import { it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

it("archives legacy DOM without joining the minute and token count or executing page scripts", () => {
  const dir = mkdtempSync(join(tmpdir(), 'ws-legacy-archive-'));
  try {
    const source = join(dir, 'saved.html'), destination = join(dir, 'session.json');
    writeFileSync(source, '<script>throw new Error("must not run")</script><div class="animate-slide-up flex-row"><details><div data-reasoning-text class="whitespace-pre-wrap">原思考</div></details><div class="whitespace-pre-wrap">## 旧标题\n\n$$x^2$$</div><div><span>09:43</span><span>4803 tokens（含思考，上游统计）</span></div></div>');
    execFileSync(process.execPath,['scripts/archive_saved_chat.mjs',source,destination,'2026-10-20']);
    const record=JSON.parse(readFileSync(destination,'utf8')).messages[0];
    expect(record.tokensUsed).toBe(4803); expect(record.reasoning).toBe('原思考');
    expect(record.content).toBe('## 旧标题\n\n$$x^2$$'); expect(record.completionStatus).toBeUndefined();
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
