# Host cleanup: `/bip` alias dropped, Codex skills in `~/.agents/skills`, missing shim counted

Date: 2026-11-05. Branch `worktree-agent-ada77821e2e4387e7`, based on `main` 8d7a721. Tests:
`node --test test/*.test.mjs` 321/321 (was 317). `sh scripts/test-installer.sh` passes. The `.ps1` was not run here.

## Outcome

1. **The `/bip` alias is gone on every host.** Each host gets only `momentry-bip`, `momentry-ui` and the `momentry`
   skill. Old alias files are now legacy entries in `target()` (`lib/hosts.mjs`):
   - Claude `commands/bip.md`, pi `prompts/bip.md`, omp `commands/bip.md`
   - Antigravity `config/skills/bip/` (the dir is pruned)
   - Codex `prompts/bip.md`, which already existed

   `connect`, `doctor --fix` and `update` (through `doctor --fix`, with no new consent) remove these in every connected
   profile, and so does uninstall. A file the user edited is kept, and connect lists it under "(bỏ qua)".
2. **Codex skills live in `~/.agents/skills`**, written once for all Codex profiles. They are `momentry-bip` and
   `momentry-ui`, each with `agents/openai.yaml` (`allow_implicit_invocation: false`), plus `momentry`. Our copies in
   `~/.codex/skills` and every `~/.codex-*/skills` are removed, together with their `openai.yaml`, and the emptied dirs
   are pruned.
3. **A missing shim counts as one problem** in the session-start line (`shimMissing` in `lib/reminder.mjs`). It counts
   only for an installed copy whose `momentry` shim (or, on Windows, `momentry.cmd`) is missing or not ours. The check
   reads files only and skips PATH. A source checkout never counts.

## Duplicate check: which host reads which skill dir

Sources: pi `docs/skills.md` ("Pi also supports the Agent Skills locations `~/.agents/skills/`", "Name collisions keep
the first discovered skill and produce a warning"), pi `configuration.md` (`<agent-dir>/skills/`), omp `docs/skills.md`
("Foreign user-level providers are opt-in through `enabledProviders`", and an identical later copy is dropped
silently), Antigravity docs (global skills in `~/.gemini/config/skills/`, not `~/.agents/skills`).

- **pi** reads both `<agentDir>/skills` and `~/.agents/skills`, and warns about a name it finds twice. So pi's
  `momentry` skill moved to `~/.agents/skills` (shared with Codex), and `~/.pi/agent/skills/momentry` is migrated away.
  pi also lists Codex's `momentry-bip` and `momentry-ui` under `/skill:`. They are explicit-only
  (`disable-model-invocation: true`), and their names differ from the pi prompts, so they are not duplicates.
- **omp** keeps its own `<agentDir>/skills/momentry`. It reads `~/.agents/skills` and `~/.claude/skills` only when the
  user opts in, and then drops an identical copy. Our skill text is byte-identical on every host, which a test checks.
- **Claude Code and Antigravity** do not read `~/.agents/skills`.
- **Shared ownership:** `connect codex --remove` keeps `~/.agents/skills/momentry` while pi is still connected. The last
  host to leave removes it. Uninstall and `connect --remove` of all hosts pass `removing`, so the shared file goes in
  the same run.
- **Edited copy left at the old place:** if a user-edited skill or the user's own `SKILL.md` sits in
  `~/.codex*/skills/momentry*` or `~/.pi/agent/skills/momentry`, `doctor` reports it as `foreign` with "host sẽ thấy
  skill này hai lần". The host would otherwise see that skill twice.

## Final file locations

| Host | Commands | `momentry` skill | Removed when still ours |
|---|---|---|---|
| Claude Code | `<profile>/commands/{momentry-bip,momentry-ui}.md` | `<profile>/skills/momentry/SKILL.md` | `commands/bip.md` |
| Codex | `~/.agents/skills/{momentry-bip,momentry-ui}/SKILL.md` + `agents/openai.yaml` (once for all profiles) | `~/.agents/skills/momentry/SKILL.md` | `prompts/bip.md`, `skills/{momentry-bip,momentry-ui,momentry}/` in `~/.codex` and each `~/.codex-*` |
| pi | `<profile>/prompts/{momentry-bip,momentry-ui}.md` | `~/.agents/skills/momentry/SKILL.md` (shared with Codex) | `prompts/bip.md`, `skills/momentry/` |
| omp | `<profile>/commands/{momentry-bip,momentry-ui}.md` | `<profile>/skills/momentry/SKILL.md` | `commands/bip.md` |
| Antigravity | `<profile>/config/skills/{momentry-bip,momentry-ui}/SKILL.md` | `<profile>/config/skills/momentry/SKILL.md` | `config/skills/bip/` |

## Changed files

- `lib/hosts.mjs`:
  - `agentSkills(env)`, and `target(name, root, env)` with `shared` files and `{file, stop, with, dup}` legacy entries
  - shared files are handled once per run
  - `sharedWith` and the `removing` option
  - edited legacy files are reported; `dup` legacy files are reported as `foreign`
- `lib/agent-files.mjs`: `NAMES.alias` removed.
- `lib/reminder.mjs`: `shimMissing`. The optional `install` parameter is used by tests.
- `lib/hook.mjs`: `hooks --print` shows `~/.agents/skills` for Codex and no alias line (two lines changed).
- `lib/cli.mjs` (minimal): `connect` passes `removing` and deduplicates plan lines; the `init` dry-run deduplicates.
- `lib/uninstall.mjs`: passes `removing: HOST_NAMES`.
- `lib/commands.mjs`: help text for `init`, `connect`, `hooks` and `uninstall`.
- `lib/sources/claude.mjs`: comment only.
- `prompts/bip.md`: template note only. The rendered text is unchanged.
- `docs/installation.md`, `README.md`, `README.vi.md`, `docs/development.md`, `docs/cli-reference.md` (regenerated).
- Tests:
  - `test/agent-commands.test.mjs` covers the layout, sharing across profiles, the no-duplicate check, migration through
    update and through connect, edited files kept, shared-file removal and uninstall.
  - `test/hosts.test.mjs`, `test/hook.test.mjs`, and `test/session-reminder.test.mjs` (missing shim).
- `scripts/test-installer.sh` and `.ps1` (mirrored) check:
  - the new layout, and that the alias and the old dirs are absent after init
  - that a missing shim is counted by `hook session-start` run from the installed copy, and that `doctor --fix` writes
    the shim back
  - that update removes the planted old files and keeps an edited one
  - that uninstall leaves nothing in `~/.agents`

## Windows checks (CI runs the `.ps1`; also worth a manual pass)

1. `scripts/test-installer.ps1` passes. These are the new parts, not run locally because there is no pwsh here:
   - `Move-Item` of `momentry.cmd`, then `node <app>\versions\v<V>\bin\momentry.mjs hook session-start` must print
     `systemMessage` = `momentry: 1 lỗi cần sửa (momentry doctor)`. The test builds the expected text from `[char]`
     code points so the code page cannot garble it.
   - `Copy-Item` of old skill dirs into `.codex\skills` and `.pi\agent\skills`, then `update --yes` removes them.
   - The edited `bip.md` (body changed, written as UTF-8 without BOM) is kept.
2. On a machine with the previous version: run `momentry update --yes`, then `momentry doctor` should be all ✓. These
   should be gone: `%USERPROFILE%\.claude\commands\bip.md`, `%USERPROFILE%\.codex\skills\momentry*`,
   `%USERPROFILE%\.pi\agent\skills\momentry`. These should exist: `%USERPROFILE%\.agents\skills\momentry-bip\SKILL.md`
   and `agents\openai.yaml`.
3. Codex `/skills` lists `momentry-bip`, `momentry-ui` and `momentry` once each. The model does not run `momentry-bip`
   on its own.
4. pi shows no "skill name collision" warning for `momentry`, and `/skill:momentry` works.
5. Delete `%LOCALAPPDATA%\momentry\bin\momentry.cmd`, then open a pi or omp session in an observed repo. The extension
   falls back to node + bin, and the notice should say "1 lỗi cần sửa". Claude and Codex hooks cannot run without the
   shim, so on those hosts the line never appears.

## Notes

- If a user deleted their Codex config dir but `~/.agents/skills/momentry-bip` is still there, uninstall does not see
  Codex and leaves those files. That needs a host that is gone but was connected before. It is not handled.
- When Codex and pi are removed together, the uninstall plan lists `~/.agents/skills/momentry/SKILL.md` once per host.
  The removal itself happens once. This is cosmetic.
