# Global project list: implementation report

Date: 2026-11-05. Branch `worktree-agent-a94511a66fa5d672d`, commit `1a3b271` (on top of `main` at `3b06184`; the worktree started at `078c5ea` and was fast-forwarded to `main` first, because `lib/ui-api.mjs` only exists there).

## Outcome

The UI now finds projects in a machine-wide list (`<config dir>/projects.json`) instead of the session ledger. `init`, the UI's turn-on button and every command the hook starts add observed repos to it. Older installs get their list filled once from the ledger and `MOMENTRY_REPOS`. A story folder chosen outside the repo is kept in the list and read by `loadConfig`, so `init`, `scan` and the hook-run commands all use it. Tests: 279/279 pass (270 before, plus 9 new).

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Location | `paths(env).projects` = `<config dir>/projects.json` (`~/.config/momentry`, `%APPDATA%\momentry`), mode 0600 | Durable user data, like `names.txt`; not inside a repo. The cache can be wiped. `uninstall --purge` removes it with the config dir. |
| Format | `{"version":1,"projects":{"<abs repo root>":{"name","added","box"?}}}` | Keyed by repo root, the same key as `budget.projects` and `privacy.privateProjects`, so those keep working unchanged. `name` is kept so a missing folder still shows a name. |
| Writes | `writeAtomic` (temp file, then rename); write only when the entry changed | Reuses the existing helper. There is no lock: a lost update from two concurrent registrations heals on the repo's next command run. This is documented in the module header. |
| Observation | Unchanged: `.momentry.json` or `MOMENTRY_REPOS` | Making list membership mean "on" would silently re-enable repos whose `.momentry.json` the user deleted to turn them off. It would also need an explicit off switch, which nothing in scope sets. |
| When a project is added | `init` (after its checks, even when not fully ready), `turnOn` in the UI, and `observedConfig` in `lib/cli.mjs` (scan, harvest, rescore, add; these are what the hook spawns). `--dry-run` never writes. | Registering in the spawned command keeps the hook process itself fast and side-effect free. An already observed repo joins on its next session. |
| Old installs | On the first `load()` with no file: every ledger `repoRoot` that still exists (mapped to its git root), plus `MOMENTRY_REPOS`. The file is then written, even if empty, so this runs once. | A project removed later is not brought back from the ledger. The old UI skipped gone folders too. |
| Story folder per project | Optional `box` in the entry, written only by an explicit choice. `loadConfig` order: flags > env `MOMENTRY_BOX` > list `box` > repo file > user config > defaults. `config show` labels it `dự án trên máy này`. | Always storing the resolved box would shadow later edits to `.momentry.json`. Keeping it to explicit choices avoids that. |
| Setting the folder (UI) | `saveSetting` with `box` at project scope now goes through `setProjectBox` (`lib/config-cmd.mjs`). A path inside the repo is written relative to `.momentry.json` and clears the machine choice. An absolute path outside the repo is stored in the list only. Relative `..` and the repo itself or a folder above it are refused. Reset removes the machine choice first, then the repo-file value. | A path specific to this machine never ends up in a committed file. The existing review rule refusing `..` is kept. `settingsView` maps the machine source to `repo`, so the current UI shows "Set for this project" and its Reset button. |
| Moved or deleted folder | It stays listed with `missing: true`, `observed: false` and an English `error` ("The folder of this project is gone (...). If you moved it, open momentry in the new place to add it again."). It is sorted last. Health and export refuse it with 409. `deleteProject` can remove it, cleaning up the list entry, a story folder outside the repo, held stories and ledger history. | It is never pruned automatically, because an unmounted drive would otherwise lose its entry. A moved repo registers again at its new root on its next init, UI turn-on or session. |
| Candidates not on the list | The repo the UI started in and `MOMENTRY_REPOS` roots are shown but not saved. | They can still be turned on from the wizard. Env-observed repos stay visible. |
| Broken list file | `loadConfig` fails with `danh sách dự án hỏng <file>` (the doctor's `config.valid` check reports it). `remember` refuses to overwrite it. `listProjects` falls back to the candidates, each showing the error. | Silently ignoring it could send stories into the repo when the user chose a folder outside it. |

## Files

- `lib/projects.mjs` (new): `listFile`, `read`, `load` (fills the list once), `find`, `boxOf`, `remember`, `setBox`, `forget`.
- `lib/paths.mjs`: adds the `projects` path, which `momentry paths` also prints.
- `lib/config.mjs`: adds the machine `box` layer.
- `lib/config-cmd.mjs`: `MACHINE` source word, `show` source for the machine box, and `setProjectBox`.
- `lib/cli.mjs`: `remember` in `init` and `observedConfig`.
- `lib/commands.mjs`: the `changes` text of `init` and `scan`. `docs/cli-reference.md` was regenerated.
- `lib/ui-api.mjs`: `listProjects`, `projectInfo` (`missing`), `findProject`, `healthView`, `turnOn`, `deleteProject`, `saveSetting`, `settingsView`.
- `test/projects.test.mjs` (new, 9 tests) and `test/paths.test.mjs`.
- `docs/installation.md`: the path row, a paragraph on the list, and the `box` key note.
- `lib/hosts.mjs` and `lib/install.mjs` were not modified (`writeAtomic` is only imported).

## Tests

`node --test test/*.test.mjs`: 279/279 pass. The new tests cover:
- the list's location;
- filling the list once from the ledger and `MOMENTRY_REPOS`, and not restoring a removed project;
- `remember` writing only on change, and a broken file being reported but not replaced;
- the order of precedence for the machine box;
- `init` registering a project and creating the machine box, with `--dry-run` writing nothing;
- the hook's first run, through the real scan it spawns, plus unobserved repos and dry runs;
- `listProjects` reading from the list, the start repo and `MOMENTRY_REPOS`;
- `turnOn` registering, a missing folder shown and deleted, and deleting a live project;
- settings box routing and reset.

Every test uses temp `HOME` and `XDG_CONFIG_HOME`; `~/.config/momentry/projects.json` was checked and does not exist.

## Open questions

1. `ui/app.js` hides projects with `error`, so a missing project does not appear on screen and the UI has no delete button for it, although the API supports deleting it. Should the Settings project list show missing projects with a Remove action? That is a frontend change outside this task's files.
2. On/off in the list (the original plan mentions "bật/tắt"): not built, because observation stays with `.momentry.json` and `MOMENTRY_REPOS`. Should a list-level off switch (stop gathering without deleting the repo file) be a separate item?
3. `docs/development.md` "Hợp đồng giữa các module" does not list `lib/projects.mjs`, and that file was outside my allowed files. Suggested row: `lib/projects.mjs` | Danh sách dự án trên máy (`projects.json`): UI đọc, init và lệnh hook thêm vào, hộp ngoài repo theo dự án.
4. There is no CLI flag to choose a story folder outside the repo for a project (only the UI sets it). Is an `init --box DIR` wanted?
