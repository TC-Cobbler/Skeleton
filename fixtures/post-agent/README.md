# Post-agent fixtures

Projects as they stood after real agent passes in the Phase 0 loop test (T0.9, see `docs/spike-log.md`).

- `loop-01/`: the base fixture after 5 hand off / agent pass / take back rounds. It's a complete, buildable project (`pnpm install --ignore-workspace && pnpm build`).
- `loop-01.bundle`: that project's full git history (`skeleton: handoff #N`, `agent: pass #N` and `skeleton: edits after pass #N` commits). To replay it, run `git clone loop-01.bundle`, then `pnpm spike analyse <handoff> <pass>`.
- `loop-02/` and `loop-02.bundle`: the Gate 0 run, 5 more rounds on a fresh copy of the base fixture using the tooling as fixed in T0.10.
