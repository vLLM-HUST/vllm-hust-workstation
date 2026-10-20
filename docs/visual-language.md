# Twin / Workstation visual refinement

The two products share a calm neutral foundation and teal focus treatment, not
the same information density. Twin prioritizes reading and source boundaries;
Workstation keeps operational telemetry and model controls available.

This pass removes the decorative outer welcome card and boxed toolbar buttons,
softens dark surfaces, and makes composer text/placeholder colors explicit.
Warning, offline, success and native execution states retain semantic colors and
labels. Existing configured brand accents remain respected; the unconfigured
default is now teal. No endpoint, routing, permissions, model or metric changes.

Validation: 247 Vitest tests pass with a real short macOS temporary directory;
ESLint and production build pass. Default macOS symlinked temporary directories
fail existing private-store checks; an excessively long replacement exceeds the
AF_UNIX socket limit. Neither assertion was relaxed. Contrast tests require 4.5:1
for primary/secondary/muted text across both themes and four surfaces.

Local browser previews were inspected in light and dark. Preview has no upstream
and correctly says offline; it is not a production outage or live-serving test.
Production deployment and post-deployment visual acceptance are separate gates.

## Qualified production release, 2026-10-20

Application `6894839868a979de972ffd1ce1939da51100bb14` is deployed.
Follow-up changes use theme-token answer surfaces, a named keyboard-visible copy
action, wrapping narrow-screen toolbar, and readable light-theme amber notices.
Linux qualification:248 tests pass, strict lint, type check, production build and
standalone probes pass. No backend/model/routing or output-budget change.

Real Chrome candidate questions showed streamed thinking separately from final
Chinese content, GFM tables, inline/display math and Python code in both themes.
The initial pale amber opacity variant failed visual inspection; the final
revision fixes it. Default API generation ended with body + stop + DONE; explicit
128-token control ended with empty body + length + DONE. These are delivery and
presentation checks, not a claim of general model factual correctness.

App-only cutover at05:05:53Z preserved gateway/engine PIDs and protected settings;
default output allowance remains32768. Public Chrome restored the existing three
question/answer pairs without re-asking, using the new theme and renderer. A new
default-thinking KV-cache question returned a separate Chinese final answer.

Rollback: restore the previous application link recorded in the private deployment
receipt and restart only the Workstation unit after draining active chats. The
previous2519349 artifact is retained; no model, gateway or user data rollback.
Pre-existing runtime-provenance schema warning remains visible and unresolved by
this visual-only release. Mobile visual acceptance is not asserted for this final
follow-up; the responsive wrapping rule is covered by regression checks.
