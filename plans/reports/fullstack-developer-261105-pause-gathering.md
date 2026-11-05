# Pause gathering per project: implementation report

Date: 2026-11-05. Branch `worktree-agent-a9205c7166fea0133`, on top of `main` at `8d7a721`.

## Outcome

A project can now stop gathering stories on this machine without deleting `.momentry.json`: `momentry pause` / `momentry resume`, or the "Gather stories" switch on each project card in Settings. While paused, the hooks start no `scan` or `harvest` for the repo, `scan --auto` skips it, and the session-start reminder says nothing. Stories stay readable in the UI and CLI. Tests: 326/326 pass (317 before, plus 9 new in `test/pause.test.mjs`).

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Where the state lives | `paused: true` on the project's entry in `<config>/projects.json`; resuming removes it and writes `resumed: <ISO>` | The list is per machine and user-owned, so a cloned repo cannot pause or resume. `loadConfig` reads `paused`/`resumedAt` only from the list. A `paused` key in `.momentry.json` has no effect, and a list value that is not exactly `true` is not a pause. |
| Hook | `handleHook` returns `{spawned: false, reason: 'paused'}` right after the observed check, without `root` | Without `root`, `runHook` prints no reminder, so `lib/reminder.mjs` needed no change. `Projects.isPaused` never throws. A broken list counts as not paused, and the command started next reports the broken list, as it did before this change. |
| `scan --auto` | Returns early with exit 0, `paused: true` and a message, before it marks a first-run start | This is a second guard after the hook. A paused repo gets no `autoSince` mark. |
| Sessions from the pause | After resume, hook-run scans skip transcripts last modified before `resumed`. A manual `momentry scan` still reads them. | Pausing means "do not gather what I do now". Without this, the first scans after resume would gather the whole pause backlog. The old-session message now says "cũ hơn lần quét tự động đầu tiên hoặc lần bật lại gom chuyện". |
| Manual `scan` / `add` / `harvest` in a paused repo | They run and print a stderr line: the project is paused, and `momentry resume` turns it back on | Pause stops automatic gathering only. A command the user types is explicit intent, and `add` is what the agent's `/momentry-bip` calls when the user asks to note a story. Refusing would force a resume-then-pause round trip. The UI's "Find new stories" is manual too, so it also runs. |
| `pause` on a repo that is not observed | Refused: exit 1, `not-observed`, fix `momentry init` | There is nothing to pause. `resume` only needs a git repo and writes nothing when the repo is not paused, so it never adds a repo to the list. |
| Consent | No `--yes`; `--dry-run` supported | Same as `mark` and `config set`: a direct, reversible user setting. |
| Doctor/health | New check `project.paused` (non-critical) with a new status `info`. `doctor` shows it with the mark `i` and no "sửa" line. It never counts as a failure, a reminder problem or a `next` command. | `status` adds one line and `data.paused`. `status`'s `next` never suggests `momentry resume`, so an agent that runs `next` cannot undo the user's pause. |
| UI | Settings card: a "Gather stories" switch as the card's first row (same `.switch` as Private mode) plus a "Paused" tag next to the name. Wall: a hint with the "Paused" tag naming the paused projects in view, linking to Settings. Project selects (wall filter, health): "name · Paused", because `<option>` cannot hold markup. Health: a tag in the Checks header, a banner line, a blue `info` light, and a Settings button. | API: `PUT /api/projects/gather {project, on: boolean}` → `saveGathering`. It rejects a value that is not a boolean, and a project that is not on the list. |

## Files

- `lib/projects.mjs`: `paused` and `resumed` fields, `isPaused`, `setPaused`.
- `lib/config.mjs`: `paused` and `resumedAt` come from the list. The list is read once, for both the box and the pause.
- `lib/hook.mjs`: a one-line skip.
- `lib/pipeline.mjs`: the `scan --auto` skip and the `resumed` cutoff.
- `lib/checks.mjs`: the `project.paused` check (one localized block).
- `lib/doctor.mjs`: the `info` status.
- `lib/commands.mjs`, `lib/cli.mjs`: `pause`, `resume`, the `status` line, and the warning in `observedConfig`.
- `lib/ui-api.mjs`, `lib/ui-server.mjs`, `ui/app.js`, `ui/app.css`: the UI changes above.
- `docs/cli-reference.md` (regenerated), `docs/installation.md` (a paragraph on pausing), `docs/development.md` (the module row).
- `test/pause.test.mjs` (new).

`lib/reminder.mjs`, `lib/hosts.mjs`, `lib/agent-files.mjs` and the installer scripts are untouched.

## Verification

- `node --test test/*.test.mjs`: 326/326 pass. The new tests cover pause and resume from the CLI (`--json`, `--dry-run`, `--repo`, idempotent, the repo file unchanged); refusing to pause a repo that is not observed; all three hook events skipping a paused repo and spawning again after resume; the real `hook session-start` staying silent with new stories (Claude and Antigravity output); the repo file not being able to pause; `scan --auto` skipping without a start mark while manual `scan` and `add` still work; the `resumed` cutoff; `status` and `doctor` showing the pause as `info` with `ok` still true; the UI API toggle and its validation, with the state in the overview, settings and health.
- Rendered in headless Chrome against `momentry ui --serve --no-open --port 4911` with a temp HOME, config and cache: the Settings card, the wall hint and the health select look consistent with the existing switches and tags. The server was stopped afterwards.

## Unresolved questions

1. The "Find new stories" button already wraps under the title on the wall at 1280px, with or without the paused hint. This existed before this change and was not touched.
2. Should `momentry scan` (manual) in a paused repo also leave sessions from the pause alone unless asked? Right now a manual scan reads everything, which matches "manual commands still work".
