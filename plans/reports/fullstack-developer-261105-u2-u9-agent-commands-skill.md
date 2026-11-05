# Agent commands `momentry-bip` / `momentry-ui` and the `momentry` skill

Date: 2026-11-05. Branch `worktree-agent-a96bab42ba3c05a3d` (fast-forwarded to `main` 3b06184 first, since the UI and
`lib/ui-api.mjs` were not on the worktree's base). Tests: `node --test test/*.test.mjs` 282/282 (was 270; 12 new).

## Outcome

- Every host gets `momentry-bip` and `momentry-ui`. `/bip` stays as an alias wherever it was a real command (Claude, pi,
  omp, Antigravity). `momentry-ui` runs `momentry ui`, which opens the browser or prints the launcher file URL. The
  command text tells the agent never to open or print that file, because it holds the token.
- Every host gets one `momentry` skill. Its text is identical across hosts, it can be invoked by the model, and its
  description is 287 characters (about 70 tokens). The skill only drives `list --rank --json`, `show <id> --json` and
  `mark <id> use|later|drop --json`. The user's own agent writes the draft, so momentry spends no LLM cost.
- New CLI commands are `momentry show <id> [--json]` (read-only, does not mark the story seen) and
  `momentry mark <id> use|later|drop [--json] [--dry-run]`. Both go through `getStory`/`markStory` in `lib/ui-api.mjs`
  and validate the id with `ID_RE` from `box.mjs`. `lib/ui-api.mjs` is unchanged; the project key comes from the
  exported `listProjects`.
- Migration: a profile counts as connected when its hook (pi/omp: its extension) is present. In a connected profile, a
  file added by a newer version is reported `stale` rather than `missing`. So `doctor --fix`, which `update` runs in the
  new version, adds the new names without asking for consent again. A profile that was never connected still needs
  `connect --yes`. Our files under old names (Codex `prompts/bip.md`) are removed on connect, update and uninstall; a
  user's own file with that name is left alone.
- Uninstall and `connect --remove` delete the new names, the alias and the old names, then prune the emptied skill dirs.
  User skills and edited files are kept.
- Transcript `/bip` detection now also matches `/momentry-bip` (Claude `<command-name>`, Antigravity user input).

## Host by host

| Host | What the user types | Files (per profile) | Skill support | Fallback |
|---|---|---|---|---|
| Claude Code | `/momentry-bip`, `/momentry-ui`, `/bip` | `commands/{momentry-bip,momentry-ui,bip}.md` | yes: `skills/momentry/SKILL.md` | none needed |
| Codex | `$momentry-bip`, `$momentry-ui` (or pick from `/skills`) | `skills/{momentry-bip,momentry-ui}/SKILL.md` + `agents/openai.yaml` (`allow_implicit_invocation: false`) | yes: `skills/momentry/SKILL.md` | Commands **are** skills. Custom prompts (`/prompts:bip`) were removed in Codex 0.117 (openai/codex#15972, closed "intended"). The old `prompts/bip.md` is removed as a legacy name. There is no `/bip` alias, because `/bip` never existed on Codex. |
| pi | `/momentry-bip`, `/momentry-ui`, `/bip`; skill: `/skill:momentry` | `prompts/{momentry-bip,momentry-ui,bip}.md` | yes: `<agentDir>/skills/momentry/SKILL.md` (pi docs: configuration.md, skills.md) | none needed |
| omp | `/momentry-bip`, `/momentry-ui`, `/bip` | `commands/{momentry-bip,momentry-ui,bip}.md` | yes: `<agentDir>/skills/momentry/SKILL.md` (omp `src/discovery/builtin.ts`, profile-scoped) | none needed |
| Antigravity | `/momentry-bip`, `/momentry-ui`, `/bip` | `config/skills/{momentry-bip,momentry-ui,bip}/SKILL.md` (`disable-model-invocation: true`) | yes: `config/skills/momentry/SKILL.md` | Commands are skills, as `/bip` already was |

All five hosts support skills, so no host needed a non-skill fallback for `momentry`.

On Codex, skills go in `$CODEX_HOME/skills`, so each `~/.codex-*` profile gets its own copy, the same as with hooks.
Codex still reads that directory (`codex-rs/ext/skills/src/host_roots.rs`), but marks it "deprecated, kept for backward
compatibility" next to `~/.agents/skills`.

## Files

- New: `lib/agent-files.mjs` (texts of the commands and skills), `test/agent-commands.test.mjs`.
- Changed: `lib/hosts.mjs` (targets, legacy names, companion files, prune, connected/stale logic), `lib/cli.mjs`
  (`show`, `mark`, connect hint per host), `lib/commands.mjs` (`show`, `mark`, wording), `lib/checks.mjs` (title),
  `lib/sources/claude.mjs`, `lib/sources/agy.mjs`, `test/hosts.test.mjs`, `docs/installation.md`, `README.md`,
  `README.vi.md`, `docs/cli-reference.md` (generated).
- No change to install.sh, install.ps1 or package-release. The texts are generated from `lib/`, which already ships.

## Windows check list

1. On a machine that has the old install, run `momentry update --yes` (or `momentry doctor --fix --yes`). Then run
   `momentry doctor`: every `host.*` line should be ✓, and `%USERPROFILE%\.codex\prompts\bip.md` should be gone.
2. Open `%USERPROFILE%\.claude\commands\momentry-ui.md` and `skills\momentry\SKILL.md`. They should call `momentry` by
   name, not `"C:/…/momentry.cmd"`.
3. Claude Code:
   - `/momentry-bip thử` writes a story.
   - `/momentry-ui` opens the browser, or prints a `file:///…/ui-open.html` URL, and the agent does not print that
     file's contents.
   - `/bip thử` still works.
   - Asking "tuần này có chuyện gì hay?" loads the skill, and the agent runs `momentry list --rank --json` without a
     shell error in Git Bash.
4. Codex:
   - `/skills` lists `momentry-bip`, `momentry-ui` and `momentry`.
   - `$momentry-bip thử` works.
   - The model never runs momentry-bip or momentry-ui on its own; the `agents/openai.yaml` policy is honoured.
   - Asking about stories triggers `momentry` implicitly.
   - PowerShell runs `momentry show <id> --json`, and the Vietnamese text in the JSON is readable.
5. pi:
   - `/momentry-bip`, `/momentry-ui` and `/skill:momentry` work.
   - The bash tool (Git Bash) resolves `momentry` (the `.cmd` shim). This is still an open item from the host research.
6. omp: `/momentry-bip` and `/momentry-ui` work. The `momentry` skill appears once and is not listed twice next to the
   copy in `~/.claude/skills`.
7. Antigravity:
   - `/momentry-bip hello` passes "hello" to the agent. Argument passing is still unverified.
   - `/momentry-ui` works.
8. `momentry ui` started by an agent keeps running after the agent's shell command returns, because the detached server
   survives on Windows.
9. `momentry uninstall --yes` leaves no `momentry*` or `bip` command or skill files, and no empty `skills\momentry*`
   dirs.

## Open questions

1. When should the `/bip` alias be dropped? The mechanism is ready: move the alias entries from `files` to `legacy` in
   `target()`.
2. Codex `$CODEX_HOME/skills` is a deprecated location. If Codex drops it, the fallback is `~/.agents/skills`. That
   location is shared by all profiles, and pi and omp read it too, so momentry would stop installing the skill per
   profile on those hosts.
3. `momentry hooks --print` (`printHookConfig` in `lib/hook.mjs`) still shows `/bip` and `~/.codex/prompts/bip.md`.
   I did not edit `lib/hook.mjs`, because the parallel global-project-list work owns it. It should be fixed once that
   work merges.
4. `scripts/test-installer.sh` and `.ps1` only check the `bip` files. They still pass, because the alias is kept, but
   they should also check the new names. They were not in this task's file list.
5. `show` and `mark` find the repo through `listProjects({cwd})`. If the global project list changes `listProjects` so
   it no longer includes `cwd` or initialised repos, those two commands must follow.
6. The per-host command hint (`COMMAND_HINT` in `lib/cli.mjs`) is also what the session-start reminder needs. It may
   belong in `lib/hosts.mjs` when that work starts.
