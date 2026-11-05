# Reminder line when an agent session opens

Date: 2026-11-05. Branch `worktree-agent-afda3c85c27d04aa3`, fast-forwarded to `main` dd4760e first.
Tests: `node --test test/*.test.mjs` 305/305 (was 291; 14 new). `sh scripts/test-installer.sh` passes, using its own
temp HOME. `scripts/test-installer.ps1` was updated but not run, because there is no PowerShell on this machine.

## Outcome

When an agent session opens in an observed repo, `momentry hook session-start` prints one line, in the format the
host injects. It prints nothing when there is nothing to say.

```text
momentry: 3 chuyện mới (/momentry-ui) · 2 phiên chờ ngân sách ngày (momentry scan) · 1 lỗi cần sửa (momentry doctor)
```

The three counts:

- **chuyện mới** counts stories in the repo's box with status `raw` that have never been opened. This is the UI's
  "unread": `ui-state.json` has no `seen` entry for them.
- **phiên chờ ngân sách** is today's entry for this repo in `<cache>/budget-wait.json`, read with `Ledger.waiting`.
  Waits recorded on an earlier day are ignored, because that day's budget is already spent.
- **lỗi cần sửa** counts the quick doctor checks that fail or warn and have a fix: `config.valid`,
  `privacy.sources`, `box.exists`, `cache.private`, and `host.<this host>`. These checks only read files. The
  `node`, `git` and `claude` checks are left out because they start a child process. `repo` is left out because only
  observed repos get this far. `install.path` is left out because its PATH test would judge the host's PATH, not the
  user's.

Each part appears only when its count is above 0. The line is skipped after `compact` (Claude, Codex) and `reload`
(pi, omp), because that session already got it. It only covers the session's own repo: an unobserved repo gets
nothing, even when another repo has news. There is no network call, no model call and no child process. The whole
hook process takes about 45 to 55 ms with a box of 300 stories (`node -e 0` alone takes about 14 ms). Errors are
caught, logged as `hook.reminder-error` in `hook.log`, and the hook still exits 0. Antigravity still gets `{}`.

## Host by host

| Host | Hook | Output | Who sees it | Command in the line |
|---|---|---|---|---|
| Claude Code | `SessionStart` in `settings.json` (already there) | `{"systemMessage": L, "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": L}}` | the user (systemMessage) and the model (additionalContext, one line) | `/momentry-ui` |
| Codex | `SessionStart` in `hooks.json` (already there) | same JSON (Codex's session-start output schema has the same fields) | the user and the model | `$momentry-ui` |
| pi | extension `session_start` | plain line; the extension reads the hook's stdout and calls `ctx.ui.notify(line, "info")` | the user only, so no tokens are spent | `/momentry-ui` |
| omp | same as pi | same as pi | the user only | `/momentry-ui` |
| Antigravity | `SessionStart` in the `"momentry"` group (already there) | `{"injectSteps":[{"systemMessage":{"systemMessage": L, "metadata":{"user_markdown": L}}}]}`, or `{}` | the user (UI markdown) and the model | `/momentry-ui` |

All JSON is printed ASCII-only, with `\uXXXX` escapes, so a Windows console code page cannot garble the Vietnamese
text. The Antigravity contract comes from the docs embedded in the agy 1.4.x binary ("SessionStart Contract:
injectSteps"). The Claude contract comes from code.claude.com/docs/en/hooks. The Codex fields come from its generated
`session-start.command.output.schema.json`.

Every host already had a session-start hook, so no host needed a fallback. Already-connected profiles migrate as
follows:

- **Claude, Codex, Antigravity:** the hook command is unchanged, so they get the reminder as soon as the new version
  is active. A profile from an older install that lacks `SessionStart` was already reported `stale` by
  `inspectHookFile`, and `doctor --fix`, which `update` runs, adds it without asking. A test covers this and checks
  that the user's own hooks are kept.
- **pi, omp:** the extension text changed. It now passes `source` (the `session_start` reason), pipes stdout only at
  session start, and adds `remind()`. Because the text changed, the extension is `stale`, and `doctor --fix` or
  `update` rewrites it.
- **Uninstall and `connect --remove`:** they remove the hook as before. Tests cover this for every host.

## Rename leftovers fixed

- `momentry hooks --print` no longer prints `/bip` or `~/.codex/prompts/bip.md`.
  - Claude: it prints the `momentry-bip` and `momentry-ui` command texts with their paths, and mentions the `/bip`
    alias.
  - Codex: it prints the `momentry-bip` and `momentry-ui` skills, the `agents/openai.yaml` policy, and the
    `$momentry-…` names.
  - Both: they mention the reminder line.
- `scripts/test-installer.sh` and `.ps1` now:
  - create `.codex`;
  - check every new command and skill file, for all five hosts;
  - check the SessionStart hook for Claude, Codex and Antigravity, and the notify call in the pi extension;
  - run the hook for Claude and Codex with one raw story and check the line and the command name;
  - check that the hook is silent after `compact`;
  - after uninstall, check that no `momentry*`, `bip.md` or `skills/bip` file is left (`.momentry-bak-*` backups
    excluded).
- The per-host command name is now `hosts.commandName(host, name)`. `connect` uses it in place of the old
  `COMMAND_HINT` table in `cli.mjs`.

## Files

- New: `lib/reminder.mjs` (`reminderLine`, `hookOutput`), `test/session-reminder.test.mjs`.
- Changed:
  - `lib/cli.mjs`: `runHook` prints the line; `connect` uses `commandName`.
  - `lib/hook.mjs`: `handleHook` returns `root`, `runtime` and `source`; `printHookConfig` was rewritten.
  - `lib/hosts.mjs`: `commandName` and the extension text.
  - `lib/commands.mjs`: the hidden `hook` summary.
  - `lib/ui-api.mjs`: only `export` added to `projectId` and `loadState`, to keep the conflict with the parallel
    usage work small.
  - `test/hook.test.mjs`, `scripts/test-installer.{sh,ps1}`, `docs/installation.md` (new section "Dòng nhắc lúc mở
    phiên").
- `docs/cli-reference.md`: regenerated, no change, because `hook` is hidden.

## Windows checks for the user

1. Run `momentry update --yes`, or `momentry doctor --fix --yes`, then `momentry doctor`: every `host.*` line should
   be ✓. The pi and omp extensions are rewritten at this step.
2. Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-installer.ps1`. It should end with
   `OK: installer lifecycle (Windows)`. It has not been run yet.
3. Claude Code, in an observed repo that has an unread story: open a new session. The line
   `momentry: 1 chuyện mới (/momentry-ui)` should be visible, with readable Vietnamese text. Ask "momentry vừa nhắc
   gì?": the agent should know. Run `/compact`: the line should not repeat.
4. Codex, which runs hooks through PowerShell: same check. The line should say `$momentry-ui`, and Codex should not
   report a JSON-parse error for the hook.
5. pi and omp: a notification with the line should appear at startup. `/reload` should not show it again.
6. Antigravity, IDE and CLI: the line should appear once at the start of the conversation, as markdown.
7. In a repo with nothing new, there should be no line in any host. Antigravity should show no error for the hook.
8. Timing: in `hook.log`, nothing should be slow. Opening a session should feel no slower than before.

## Open questions

1. Claude Code's docs do not say where `systemMessage` from SessionStart is shown. If it does not show, the user only
   sees the line through the agent; `additionalContext` still reaches the model. Check 3 above settles this.
2. Should the model get the line at all (Claude, Codex, Antigravity)? It costs about 40 tokens, and only when there
   is something to say. pi and omp are user-only by design. Dropping `additionalContext` is a one-line change in
   `hookOutput`.
3. `install.path` (shim missing, or the bin dir not on PATH) is not part of the reminder. If it should be, it should
   only count the missing shim or `current` mismatch, not PATH.
