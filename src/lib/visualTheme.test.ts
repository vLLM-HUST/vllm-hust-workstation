import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
function luminance(hex: string) {
  const channels = hex.match(/\w\w/g)!.map(value => {
    const n = parseInt(value, 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

describe("shared visual language", () => {
  for (const theme of ["light", "dark"]) {
    it(`${theme} retains readable text on every primary surface`, () => {
      const block = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]+)\\}`))![1];
      const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*#([\da-f]{6});/gi)].map(m => [m[1], m[2]]));
      for (const background of ["app-bg", "surface", "surface-raised", "surface-muted"]) {
        for (const foreground of ["text-primary", "text-secondary", "text-muted"]) {
          const levels = [luminance(tokens[background]), luminance(tokens[foreground])].sort((a, b) => b - a);
          expect((levels[0] + 0.05) / (levels[1] + 0.05), `${theme} ${foreground}/${background}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
  it("keeps focus, reduced motion and readable input placeholders", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".workspace-composer textarea::placeholder { color: var(--text-muted)");
    expect(css).toContain(".workspace-welcome");
    expect(css).toContain(".workspace-message-assistant { background: var(--surface); border: 1px solid var(--border)");
    expect(css).toContain(".workspace-message-user { background: var(--control)");
    expect(css).toContain(".workspace-copy:focus-visible { opacity: 1");
    expect(css).toContain(".workspace-header-actions { width: 100%; justify-content: flex-end");
  });
});
