# Code review: local web UI (uncommitted changes)

Date: 2026-11-04. Scope: `git diff` plus untracked `lib/ui-server.mjs`, `lib/ui-api.mjs`, `lib/config-schema.mjs`, `ui/`, `test/ui.test.mjs`.
Tests: `node --test test/*.test.mjs` passes 261/261. No test covers `deleteProject`, `turnOn`, `setGitignore(off)` or `saveSetting`.

## Critical

### C1. `deleteProject` deletes whatever `box` points at, and a repo file controls `box`
`lib/ui-api.mjs:547`. `fs.rmSync(cfg.box, { recursive: true, force: true })`. `cfg.box` comes from `loadConfig`, which merges `<repo>/.momentry.json`. `box` is not in USER_ONLY, and `path.resolve(anchor, cfg.box)` (`lib/config.mjs:172`) accepts `"."`, `".."` and absolute paths. `validate()` only rejects an empty string.
- **Reproduced:** a git repo with `.momentry.json` = `{"box":"."}`. `deleteProject({project, confirm: name})` removed the whole repo, including `.git` and the uncommitted `important.txt`. `projectInfo().boxInRepo` reports `true` for box == root (`path.relative` returns `''`), so the UI shows nothing unusual.
- Other ways to reach the same delete: a cloned repo that ships `{"box":".."}` or `{"box":"/home/u"}`; a user who types `.` into the "Story folder" setting (`PUT /api/settings`, project scope); a user-config `box` set to an absolute path, or `MOMENTRY_BOX`. In those last two cases every project shares one box, so deleting "one project" wipes the stories of all of them.
- Confidence: high (reproduced).
- Fix:
  - Refuse unless `box` is strictly inside `project.root`, is not the root itself, and has no `.git` inside it. Also refuse when another listed project resolves to the same box.
  - Better: delete only `ID_RE` story files plus known momentry artefacts, then `rmdir` the folder only if it is empty.
  - Validate `box` in `config-schema` too (relative, no `..` segments).

## High

### H1. The access token leaks to other local users through the browser's process arguments
`lib/ui-server.mjs:64` puts the token in the URL (`/#t=TOKEN`). `openBrowser` (`:235-248`) runs `xdg-open URL` / `open URL`. On Linux, `xdg-open` and usually the browser it launches (a cold-started Firefox or Chrome keeps the URL in its argv) expose the token in `/proc/<pid>/cmdline`. Any local user can read that unless `/proc` is mounted with `hidepid`. macOS `ps` also shows other users' argv.
- With the token, another local user (in the threat model) can call every API from their own process. The Host check passes because they control the header. They can read stories and the private-name list, edit stories, release held items, turn on arbitrary repos, and use `deleteProject` (see C1).
- Confidence: high on Linux, medium on macOS. Windows is mostly safe.
- Fix: the Jupyter approach. Open a 0600 launcher HTML file in the private cache dir that redirects or POSTs the token. Alternatively, open the URL with a one-time code that expires in about 30 seconds and is exchanged for the session token on first use.
- Related, lower risk: `momentry ui --no-open --json` (an example meant for agents) prints the token into the agent's transcript, which momentry itself later harvests.

### H2. Story ids reach `path.join` unvalidated (traversal on Windows; arbitrary `.md` reads through `links`)
- `lib/ui-api.mjs:212-214`: `storyFile` splits the key on `/` and passes `id` to `readStory(cfg.box, id)` → `path.join(dir, `${id}.md`)` (`lib/box.mjs:65`). There is no `ID_RE` check.
  - On Linux the split stops `../`, so `id` can only be `..`, which gives the harmless `box/...md`.
  - On Windows, `..\..\..\Users\x\notes` (sent as `%5C`, then decoded by the router at `ui-server.mjs:176`) resolves outside the box. `editStory` and `markStory` then `writeAtomic` back to that path, overwriting any parseable `.md` file the user can write.
- `lib/ui-api.mjs:226-229`: `getStory` passes frontmatter `links` (repo content) straight to `readStory`. `links: ["../../../../some/other/file"]` reads any `.md` on disk and shows its title, on every OS.
- Confidence: high that the code allows it. The Windows write needs the token, so this is defense in depth.
- Fix: `if (!ID_RE.test(id)) throw new UiError('Unknown story.', 404)` in `storyFile`, and filter `links` with `ID_RE`. Validate `pid` as `/^[0-9a-f]{10}$/` as well.

## Medium

### M1. Editing a section drops the blank line between sections
`lib/ui-api.mjs:192-208`. The replacement `raw` is `**label:** text\n`. The original `raw` ran up to the next marker and so included the `\n\n` separator.
- **Reproduced:** editing "Bối cảnh" turns `...ctx line\n\n**Chuyện gì xảy ra:**` into `...new ctx\n**Chuyện gì xảy ra:**`. Markdown then renders the two sections as one paragraph. The existing test passes because it only checks that the other sections' bytes are kept.
- Related: if a user types a line starting with `**Something:**` inside a section, the next split turns it into its own part. That text then disappears from the UI (`sectionsOf` ignores unknown labels) and can never be removed through the UI. Reproduced with `**Note:** x`.
- Confidence: high.
- Fix: keep the original trailing whitespace of `parts[at].raw` (for example `raw.match(/\s*$/)[0]`, with a minimum of `\n\n` when another part follows). Escape or reject leading `**X:**` in edited text.

### M2. A hidden tab counts as a closed tab, so the server shuts down under the user
`ui/app.js:75` pings only when `document.visibilityState === 'visible'`. The idle limit is 10 minutes and only API calls reset it (`ui-server.mjs:164`, `:215`).
- A user who starts "Find stories" (several minutes) and switches to another tab or app for 10 minutes comes back to a dead server and network errors, not the "open momentry again" page (`api()` gets a fetch TypeError rather than a 401).
- This contradicts the command summary ("tự tắt khi không còn tab nào mở", i.e. "shuts down when no tab is open").
- Confidence: high.
- Fix: ping regardless of visibility (browsers throttle background timers to about once a minute, which still beats a 10-minute idle), or treat a running `jobs` entry as activity.

### M3. `deleteProject` and the quarantine key on the display name
`lib/ui-api.mjs:548`. `Q.heldDir(project.name, …)` uses `cfg.repo || basename`, and `repo` can be set from the repo file.
- Two clones both named `app`, or a repo that sets `"repo":"other-project"`, share one quarantine folder. Deleting one wipes the other's held stories.
- `privacyView` (`:359`) lists the shared items once per project.
- This keying is inherited from the CLI, but delete is the first destructive use of it.
- Confidence: medium.
- Fix: before `rmSync`, refuse when another listed project maps to the same `heldDir`.

### M4. Ledger changes in `deleteProject`: lost `repos` entry and a race with scan
`lib/ui-api.mjs:550-554`.
- `delete ledger.repos[root]` is saved only when `forgot > 0`, so the `repos` entry survives a delete when no sessions are recorded.
- The load-modify-save runs without any ledger lock. A concurrent `scan` (the UI's own `startFind` child, or a hook-triggered scan) that saves in between loses its harvest records, or brings back the sessions just forgotten.
- Confidence: high for the first point, medium for the race (small window).
- Fix: save when either changed. Refuse while `jobs` has a running job for that project, or take the same lock scan uses.

### M5. UI story edits skip the "no name list" rule that the pipeline enforces
`lib/ui-api.mjs:240-245`. With no blocklist, `writeStory` writes straight into the repo. The pipeline instead holds such text back unless `privacy.allowUnchecked` is set.
- Removing the last name in Privacy (`privacyRemove`) and then editing gives a path into the repo for text that was never checked.
- Confidence: medium. Whether this matters is a product decision, since the human typed the text.
- Fix: refuse the edit when `!blocklist && !cfg.privacy.allowUnchecked`, matching `addNote`.

### M6. `saveSetting` passes `scope` from the request through without checking it
`lib/ui-api.mjs:575-578` → `config-cmd.mjs:116-158`. Any scope other than `'project'` writes the user file, but the `loadConfig` probe only runs for `scope === 'user'`. A body with `scope: "x"` therefore writes the user config with schema validation only and skips the full loader check.
- Project scope never runs the loader check either. A broken repo file (for example `box` invalid in combination with other keys) is only discovered on the next load, where `projectInfo` marks the project as errored.
- Confidence: high, low impact.
- Fix: `if (!['user','project'].includes(scope)) throw`. For project scope, run the probe through a temporary copy of the repo file or a `loadConfig` override.

## Low

- **L1. CLI behavior change.** `config set repo 2024` now fails with "must be text": `parseValue` turns it into a number, and the old loader accepted that. `config set outsider.enabled 1` is also rejected now (the loader used to coerce `!== false`). Small, but it changes an exported CLI contract. Note it in the changelog or coerce strings for string keys. `lib/config-cmd.mjs:133-135`.
- **L2. `setGitignore(off)` with box == root.** `rel` is `''`, so the filter removes every blank line in `.gitignore`, and lines equal to `/`. `lib/ui-api.mjs:588-592`. Guard on `!rel || rel.startsWith('..')` the same way `ignoreBox` does.
- **L3. `POST /api/health/fix` with an unknown project.** It falls back to fixing `ctx.cwd` instead of returning 404. `lib/ui-api.mjs:455`.
- **L4. `Q.release` errors become generic 500s.** Unknown id and missing target throw a plain `Error`, so the user sees "Something went wrong". `lib/ui-api.mjs:395`.
- **L5. Client builds API paths from unencoded route segments.** `ui/app.js:266,287,393,410` build `/api/stories/${pid}/${id}` from the hash. A frontmatter link id of `..` makes the request go to `/api/stories`. Only GET is affected and the server returns a list, so this is cosmetic. Use `encodeURIComponent`.
- **L6. Token in the export download link.** The `?t=` query is kept in the browser's downloads history. The token is per start, so exposure is limited.
- **L7. Two `momentry ui` runs at the same moment** can both spawn servers. The loser keeps running until its idle timeout. `clearState` checks the pid, so this is harmless.

## Checked, no issue found

- **Host/Origin checks:** exact match on `127.0.0.1:port` / `localhost:port`; `Origin: null` is rejected; no CORS headers. A cross-site POST without the header token gets 401. DNS rebinding is blocked.
- **Static files:** `path.resolve` plus a `startsWith(UI_DIR + sep)` check holds against `..`, `%2e%2e` and encoded separators. A bad `%` encoding gives a 500 with no detail.
- **XSS:** every interpolated server value in `ui/app.js` goes through `esc()`, which escapes `& < > " '`. The unescaped values (`key`, `x.value`, `scope`, `f.min`, numbers) are constants or numbers. Errors use `textContent`. The CSP (`script-src 'self'`, no inline script) is a strong second layer. `href`s are prefixed with `#/` or `/api/`, so no `javascript:` URL is possible.
- **State file and token storage:** written 0600 in a private dir, compared with `timingSafeEqual`, stored in `sessionStorage` and removed from the address bar.
- **Project-scope config:** refuses USER_ONLY keys. The loader also drops them from the repo file.
- **Packaging allow-lists** in `install.sh`, `install.ps1`, `update.mjs` and `package-release.mjs` all add `ui` consistently.

## Pre-existing, outside this diff, but conflicts with the stated threat model
`privacy.allowFile` defaults to `<box>/.privacy-allow` inside the repo, and terms in it are never reported (`lib/privacy.mjs:196`). A repo can therefore whitelist any blocked name, which is exactly a repo file bypassing the blocklist. The UI now also offers `privacy.allowFile` as a project-scope setting. Consider making the allow file user-only, or intersecting it so it can never cover a term that appears verbatim in the user's blocklist.

## Recommended order
1. C1: restrict the delete target. This is a release blocker.
2. H1: token delivery without argv.
3. H2: `ID_RE` checks in `storyFile` and `links`.
4. M1, M2: section separator and the idle ping.
5. M3 to M6, then the Low items. Add tests for `deleteProject`, including box == root, box outside the repo and a shared box.

## Unresolved questions
- Should a UI edit be allowed when there is no name list (M5)? This is a product decision.
- Is the `.privacy-allow` behavior in the repo intended given the threat model?


## Fixes applied (2026-11-04)

- C1: delete removes only story files (`ID_RE` names) and the folder only when it is inside the repo and then empty; the schema refuses `.` and `..` for `box`. Test: repo with `box: "."` keeps `.git` and code.
- H1: the token lives in `<cache>/ui-open.html` (0600); the browser is opened with that file and `--no-open --json` prints only its path. Export now uses the header (the `?t=` path returns 401) and downloads through a blob.
- H2: story ids are checked against `ID_RE` and project ids against their format before any path; `links` too.
- M1: edits keep each part's trailing spacing and the file's blank-line style for inserts; a line starting with a bold label is refused.
- M2: the tab pings when hidden too; the server never stops for idleness while a search runs.
- M3: held stories are kept when another known project has the same name.
- M4: the ledger is saved when only the repo entry changed. No ledger lock added (scan has none either).
- M5: edits without a name list are refused unless `privacy.allowUnchecked` is on, as in the pipeline.
- M6: only `user` and `project` scopes; project scope only for project-tier keys.
- L1: `config set` keeps text for text keys and takes 1/0 for switches. L2: gitignore off touches only our lines and nothing when the folder is not inside the repo. L3: unknown project in Health is a 404. L4: release errors are plain messages. L5: ids are encoded in API paths. L6: no token in download history.
- Not changed: the older `.privacy-allow` concern (predates this work); `privacy.allowFile` can no longer be set per project from the UI.
