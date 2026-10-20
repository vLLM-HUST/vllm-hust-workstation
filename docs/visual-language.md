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
