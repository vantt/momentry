# Measurement: time to first story and top-5 Use rate

Status: done. Branch `worktree-agent-ad1a207dffa8ce2c1` (on top of `main` dd4760e). Tests: 302 pass (291 before, 11 new in `test/metrics.test.mjs`).

## What is measured

**Time to first story.** From the install time to the moment the first story found by momentry lands in a story box of any project on this machine.

- Install time is recorded once, in this order of precedence: by `momentry _activate` (what `install.sh` and `install.ps1` run), else by the first `momentry init` (dev checkouts). After that it never changes.
- A machine that already used momentry before this change gets `known: false` and no time. "Used before" means one of these: the install marker already existed at activation (an update), or `<cache>/ledger.json`, `<cache>/ui-state.json` or `<config>/projects.json` exists. The marker's `activatedAt` is rewritten on every update and the ledger only knows harvest times, so neither can stand in for the install time. The screen says "Unknown" with the reason.
- A "story found by momentry" is any new story file written to the box with `captured_by` other than `human`: harvest, rescore, `add --by live` (the `/bip` path), and a held story released from quarantine (by the CLI or the UI). Notes the user types (`add`, Quick note) do not count, because they show nothing about what the product finds.
- States: `measured` (seconds), `waiting` (install known, no story yet), `unknown` (install time not on record).

**Top-5 Use rate.**

- Rank at decision: the story's 1-based position on the wall that the Stories screen shows by default. That wall covers all observed projects, ranked best first (`listStories`, with personalisation), with dropped stories hidden except the story being decided. The rank is computed inside `markStory` before the change is applied. The UI and `momentry mark` both call `markStory`, so both record the same rank. `of` is the size of that wall.
- Decision state after the action: `use` (status picked, drafted or published, the `USED` set), `drop` (dropped), `later` (on the Later list and not used or dropped), `open` (undecided again after Undo, restore or un-later). An event is recorded only when this state changes. Moving from Picked to Drafted, or pressing Later twice, records nothing, so the original Use keeps its rank.
- Each story counts once, by its latest event. Undo therefore takes a story back out of the count.
- Rate = Use ÷ (Use + Later + Drop), over stories whose latest decision is one of those three and whose rank at that decision was 1–5. Later is in the denominator because it is a decision not to use the story yet. The Later count is shown next to the rate, so a reader can remove it.
- Threshold: the rate is shown from 10 such stories (`MIN_TOP5`). Below that it reads "Not enough data" with the count so far.

## Storage

`<cache>/metrics.json`, mode 0600, written atomically (`writeAtomic`). This is the cache dir from `lib/paths.mjs`, so `MOMENTRY_CACHE` is honoured.

```json
{ "version": 1,
  "install": { "at": "ISO|null", "known": true, "via": "install|init", "noted": "ISO" },
  "firstStories": { "<project id>": { "at": "ISO", "private": false } },
  "marks": [ { "at": "ISO", "project": "<project id>", "story": "<12-hex hash of key>", "state": "use|later|drop|open", "rank": 3, "of": 18, "private": false } ] }
```

- The file holds no titles, story ids or paths. A project is the same 10-hex hash of its root that the UI already uses (`projectId`, now exported from `lib/projects.mjs`). A story is a hash of `<project id>/<story id>`, because story ids carry title words.
- Growth is bounded: only the first story per project is kept, and `marks` keeps the newest 1000 entries.
- An unreadable file reads as empty. A failed write never blocks a decision, a story write, an install or `init`.
- The file is read-modify-write without a lock, like `projects.json`, so two decisions in the same instant can drop one.
- Nothing is sent anywhere, and no network path was added.

**Private mode.** Every record carries `private`, which is `cfg.privateMode` of its project at the time. `measures(m, { excludePrivate: true, privateProjects })` leaves out records made in private mode and records of projects that are private now (pass their current ids). The anonymous-sending item (U.7b) will use that call. The local view shows everything, because it is the user's own data on their own machine.

## Where the user sees it

- **Cost screen, "How it is going" panel** at the bottom. It has two stats: "Time to first story" (for example "1 h 24 min", "Not yet" or "Unknown") and "Top 5 stories used" (a percentage with the use/later/drop counts, or "Not enough data" with progress). It uses only existing components (`panel`, `panel-head`, `stat-row`, `stat`, `hint`) and adds three CSS rules under `.measures`. There are no inline styles, and light and dark modes come from the existing tokens.
- **`momentry status --json`**: `data.measures` has `{ install, firstStory, top5 }`. The text output is unchanged.
- **Docs.** `docs/installation.md` describes the file. `lib/commands.mjs` now lists `metrics.json` in the "changes" of init, scan, mark, add and quarantine, and the status summary mentions the measures. `docs/cli-reference.md` was regenerated with `node scripts/gen-cli-reference.mjs`.

Screenshots (rendered from seeded temp sandboxes through the real API, not committed). The UI server and browser were stopped afterwards.
- `/tmp/claude-1000/-home-vantt-projects-momentry/daa7147c-5d6d-4b8b-bc2f-e967ff9177e4/scratchpad/cost-light-1440.png`
- `/tmp/claude-1000/-home-vantt-projects-momentry/daa7147c-5d6d-4b8b-bc2f-e967ff9177e4/scratchpad/cost-dark-1440.png`
- `/tmp/claude-1000/-home-vantt-projects-momentry/daa7147c-5d6d-4b8b-bc2f-e967ff9177e4/scratchpad/cost-light-375.png`
- `/tmp/claude-1000/-home-vantt-projects-momentry/daa7147c-5d6d-4b8b-bc2f-e967ff9177e4/scratchpad/cost-dark-375.png`
- `/tmp/claude-1000/-home-vantt-projects-momentry/daa7147c-5d6d-4b8b-bc2f-e967ff9177e4/scratchpad/cost-notenough-light-375.png`

## Files

- New: `lib/metrics.mjs`, `test/metrics.test.mjs`.
- Changed: `lib/ui-api.mjs` (`markStory` records the decision and the rank, `releaseHeld` notes the first story, `costView` returns `measures`), `lib/pipeline.mjs` (`noteFirstStory`, called after each new story is written to the box), `lib/quarantine.mjs` (`release` also returns `created` and `capturedBy`), `lib/cli.mjs` (`_activate` and `init` record the install time, quarantine release notes the first story, `status --json` returns `measures`), `lib/projects.mjs` (exports `projectId`), `lib/commands.mjs`, `ui/app.js`, `ui/app.css`, `docs/installation.md`, `docs/cli-reference.md` (generated).
- `lib/hook.mjs` and `lib/hosts.mjs` were not changed.

## Tests added

- Install recorded once with a known time on a fresh machine; unknown with no time when the ledger exists or on an update; `init` records it; `_activate` from a copy laid out as an install records it, and records unknown when a marker already exists.
- First story: hand notes ignored, earliest of the projects used, waiting before any story, unknown install leads to unknown; noted by `add --by live` and by a release from quarantine through the UI.
- Rank at decision, through `markStory`: dropped stories are hidden, nothing is recorded when the state does not change, Undo takes the story out of the count, and the file holds no ids, titles or paths. The CLI `mark` records the same way, and `--dry-run` records nothing.
- Rate: only ranks 1–5 count, it appears at 10 decided stories and is null below, and private-mode records are excluded (by the stored flag and by the current private project list).
- `marks` is capped at 1000 (oldest dropped first); a broken file reads as empty; the Cost view and `status --json` carry the numbers.

## Open questions

1. **Rank with a filter on.** If the user decides while the wall is filtered (Unread, This week, or one project), the "#N" on the card is the position in that filtered list, but the recorded rank is the default-wall rank. I chose the default wall because it is the same for the CLI and the UI and does not depend on a view choice. If the shown number is wanted instead, the UI could send it with the mark. That would mean trusting a client value and leaving the CLI on a different basis.
2. **Later in the denominator.** The rate counts Later as "not used". If Later should be left out, change one line in `measures`; the counts are already stored.
3. **Threshold.** The threshold of 10 decided top-5 stories is my choice. It is the `MIN_TOP5` constant in `lib/metrics.mjs`.
4. **Module table.** `docs/development.md` has a table of modules that does not list `lib/metrics.mjs`. That file was outside what I was allowed to edit.
