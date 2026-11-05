# `momentry config --project`: per-project settings through the config command

Date: 2026-11-05. Branch `worktree-agent-aefd62d6c55487f8d`, commit `de173ef` on top of `main` 8a6a8e0.

## Outcome

`momentry config show|get|set|unset --project` (current repo, or `--repo DIR`) reads and changes every per-project
setting. Each key goes through the writer the web UI already calls, so there is no second implementation.
`pause`/`resume` are kept as shortcuts and now call the same writer as `config set paused true|false --project`.
No `init --box` was added.

## Keys

| Key (`--project`) | Writer (shared with UI) | Stored in | Rules |
|---|---|---|---|
| `box` | `setProjectBox` | inside repo: `.momentry.json` (relative); outside: `projects.json` | `.`, `..`, `../x`, repo itself, folders containing it refused; leading `~` expanded; unset removes the machine folder first, then the repo file's |
| `repo` | `write({scope:'project'})` | `.momentry.json` | needs an observed repo |
| `budget.dailyUsd` | `setProjectBudget` | user config `budget.projects[root]` | number >= 0; unset falls back to the general budget (shown as `…, chung mọi dự án`) |
| `private` | `setPrivateProject` | user config `privacy.privateProjects` | true/false (1/0) |
| `paused` | `Projects.setPaused` | `projects.json` | `true` needs an observed repo (same rule as `pause`) |

Sources shown by `show --project`: `repo`, `dự án trên máy này`, `người dùng`, `mặc định`, `env MOMENTRY_BOX`.
Writes into `.momentry.json` (box inside, repo) are refused for a repo that is not on (`not-observed`, fix
`momentry init`), so config never turns a repo on by side effect. A machine folder for `box` can be set before init.

Other errors: a shared key with `--project` gives `config-not-project`; a typo gives `config-unknown-key` with a
suggestion; a project key without `--project` gives `config-project-only`; `path`, `default` and `privacy-add` with
`--project` exit 2. Writers got an optional `dryRun` so `--dry-run` validates and reports the target file without
writing.

## Examples

```sh
momentry config set box ~/Documents/momentry-chuyen --project
momentry config set budget.dailyUsd 1 --project --repo ~/code/du-an
momentry config show --project --json
momentry config unset box --project --dry-run
momentry config set paused true --project      # same as: momentry pause
```

## One behaviour change beyond the CLI

`budget.dailyUsd` was added to `USER_ONLY` in `lib/config.mjs`. Before, a cloned repo's `.momentry.json` could set
`budget.dailyUsd` and raise the general daily cap while working in that repo, which contradicts the existing rule
that a repo cannot raise what it may spend. It is now dropped from the repo file and reported in `cfg.ignored`. The UI
only ever wrote it to the user config, so nothing that the UI produced is affected.

## Files

- `lib/config-cmd.mjs`: `PROJECT_KEYS`, `showProject`, `writeProject`, `--project` routing in `runConfig`, a `dryRun` option on the three writers, and a hint on project-only keys.
- `lib/cli.mjs`: `config` passes `--project`; `pause`/`resume` call `writeProject`.
- `lib/commands.mjs`: `--project` flag, help, examples, exit codes; the pause/resume summaries name the config key.
- `lib/config.mjs`: `budget.dailyUsd` user-only.
- `docs/cli-reference.md` (regenerated), `docs/installation.md` (per-project table and examples under "Khoá cấu hình"), `docs/development.md` (new "Cài đặt" rule: every setting goes through `momentry config`, and the UI uses the same writers).
- `test/config-project.test.mjs`: 9 tests. They cover each key (set/get/unset/show, source), box inside and outside the repo, refusals, dry run, the repo file being unable to set machine-only keys, the pause shortcut matching the config key, and the UI and CLI seeing each other's writes.

## Verification

`node --test test/*.test.mjs` passes 335 of 335 (326 existing and 9 new).
