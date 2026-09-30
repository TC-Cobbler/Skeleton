# Post-agent fixtures

Projects as they stood after real agent passes in the Phase 0 loop test (T0.9, see `docs/spike-log.md`).

- `loop-01/`: the base fixture after 5 hand off / agent pass / take back rounds. It's a complete, buildable project (`pnpm install --ignore-workspace && pnpm build`).
- `loop-01.bundle`: that project's full git history (`skeleton: handoff #N`, `agent: pass #N` and `skeleton: edits after pass #N` commits). To replay it, run `git clone loop-01.bundle`, then `pnpm spike analyse <handoff> <pass>`.
- `loop-02/` and `loop-02.bundle`: the Gate 0 run, 5 more rounds on a fresh copy of the base fixture using the tooling as fixed in T0.10.
- `dogfood-01/` and `dogfood-01.bundle`: the Phase 6 dogfood project ("Game Library"), after 5 real loops driven through the app's UI (see `docs/dogfood-log.md`). Its history has `skeleton: scaffold`, then `skeleton: handoff #N` and `agent: pass #N` for N = 1–6 (the sixth is the closing session). `dogfood-01.tokens.json` is the ledger of token values Skeleton set. To re-check a loop, clone the bundle and run `DOGFOOD_ROOT=<clone> DOGFOOD_LEDGER=dogfood-01.tokens.json node packages/app-main/e2e/dogfood-verify.mjs pass|edits <N>`.
