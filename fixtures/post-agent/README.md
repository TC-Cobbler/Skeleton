# Post-agent fixtures

Projects as they stood after real agent passes in the Phase 0 loop test (T0.9, see `docs/spike-log.md`).

- `loop-01/`: the base fixture after 5 hand off / agent pass / take back rounds. It's a complete, buildable project (`pnpm install --ignore-workspace && pnpm build`).
- `loop-01.bundle`: that project's full git history (`skeleton: handoff #N`, `agent: pass #N` and `skeleton: edits after pass #N` commits). To replay it, run `git clone loop-01.bundle`, then `pnpm spike analyse <handoff> <pass>`.
