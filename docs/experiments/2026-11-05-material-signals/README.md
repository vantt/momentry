# Material signals: hotspot detector changes on real sessions (2026-11-05)

**Purpose:** check what the new and tightened hotspot detectors ([PRD 5.3](../../prd.md)) do on the four sessions that a reduce-only test missed owner decisions and lesson writes on. Item M.1 of the [story-material plan](../../../plans/261105-story-material/plan.md).

**Raw data** (transcripts, hotspot lists, per-line output) stays outside the repo. This record holds numbers only: no titles, no transcript text, no file names.

## 1. Setup

- **Data:** 4 Claude Code transcripts of one project: 24,702 entries in total (the largest has 21,442). No LLM call: `momentry reduce` runs `readEntries`, `render` and `detect` only.
- **Before:** detectors at the commit before this change. **After:** this branch. Same transcripts, same `window` of 5 lines for merging.
- **Raw hits** are per entry, before same-kind hits within 5 lines are merged into one hotspot. **Hotspots** are after merging, which is what harvest must answer one by one.
- **Moment hit** = a hotspot within 15 lines of the moment's line(s). Moments are the 14 session-era rows (3 to 16) of an earlier read-only reduce report, plus its two adjacent-fact rows (8b, 12b) and one owner line found later; 16 in all. Rows 1 and 2 (git history) and row 3 (not in these four transcripts) are left out; row 13 is anchored on the night of the landing.

## 2. Hotspots per kind (merged)

| Kind | Before | After |
|---|---:|---:|
| `nonzeroExit` | 204 | 138 |
| `blocked` (new) | n/a | 66 |
| `metricPair` | 213 | 51 |
| `gitReversal` | 109 | 52 |
| `metaWrite` | 21 | 1 |
| `lessonWrite` (new) | n/a | 40 |
| `ownerVoice` (new) | n/a | 152 |
| **Total** | **547** | **500** |

Per session (before to after): 19 to 23, 51 to 68, 35 to 26, 442 to 383.

Raw hits: `nonzeroExit` 212 to 143 (68 of the removed 69 moved to `blocked`, the other one is a user rejection), `metricPair` 216 to 51, `gitReversal` 109 to 52, `metaWrite` 22 to 1 (21 went to `lessonWrite`, which also finds 21 more writes made through the shell).

`ownerVoice` raw hits by label: short turn after a long stretch 97, choice answer 41, pushback or prod 12, interrupt 2, rejected tool call 1. The short-turn label is the noisy one: most such turns are "continue" or a status request. The prompt says so.

## 3. What each fix removed

- **`metricPair` 216 to 51.** Position and id ranges ("rows 0 to 190", "mapping-0241 to 0300", "8 to 12 days"), numbers with a leading zero, and user lines injected by the harness (task notifications, cross-session messages) no longer count. Space-grouped thousands ("4 301") and decimal commas parse as one number. An "X trên Y" ratio was tried and dropped: 65 raw hits in these sessions, almost all progress counts ("47 of 50 rows ok"), not a before/after.
- **`gitReversal` 109 to 52.** `checkout --detach/--ours/--theirs` no longer match; a plain `rebase` onto `origin/…`, `upstream/…` or a main branch is routine; `checkout -- <lockfile>` is routine (the lockfile rule alone took the merged count from 62 to 52). Words inside heredoc bodies no longer count. Kept: `rebase --abort/-i/--onto`, `reset`, `revert`, `commit --amend`, `push -f`, `checkout -- <other file>`.
- **`nonzeroExit` to `blocked`.** Of 212 raw failing results, 68 are hook vetoes, permission refusals or worktree guards (the hook ones alone are 42). They carry no exit code and say nothing about the work, so they get their own kind and the prompt tells harvest they are rarely a story. User-rejected calls are the owner's voice, not a failure.

## 4. Moments

| Moment (row) | Hotspot before | Hotspot after |
|---|---|---|
| 4 | none | none |
| 5 | none | none |
| 6 | `nonzeroExit` (a hook block) | `ownerVoice`, `blocked` |
| 7 | none | `ownerVoice` |
| 8 | none | `ownerVoice` |
| 8b | `metricPair`, `gitReversal` | `metricPair` |
| 9 | none | none |
| 10 | `metaWrite` | `lessonWrite` |
| 11 | `metaWrite` | `ownerVoice`, `lessonWrite` |
| 12 | none | none |
| 12b | `metricPair`, `nonzeroExit` | `metricPair`, `ownerVoice`, `lessonWrite`, `blocked` |
| 13 | `metaWrite` | `lessonWrite` |
| 14 | `metricPair` (a range) | none |
| 15 | `metricPair` | `metricPair`, `ownerVoice` |
| 16 | `metricPair`, `nonzeroExit` | `nonzeroExit`, `metricPair` |
| owner line, 2026-11-02 | `nonzeroExit` (a hook block) | `ownerVoice`, `blocked` |

- Moments with any hotspot: 10 of 16 before, 11 of 16 after (rows 7 and 8 are new). Rows 6 and the owner line were "caught" before only by a hook block; row 14 was only a range and is now clean.
- **Caveat on proximity.** `ownerVoice` is dense in the largest session (104 hotspots over 21,442 entries), so a 15-line window finds one easily. The honest reading is the owner-line rows (6, 7, 8, 11, owner line): the owner turn itself now has a hotspot in 5 of 5; before, none had one.
- Still missed: rows 4, 5, 9 (a table with no arrow, a quota stop, a message from another machine) and 12 (the oracle edits). The fix for 12 lies in the lesson memory, which was not within 15 lines of the anchor used here.

## 5. Limits

- No label set: this counts hotspots and moments, not story quality. Precision of the new kinds is judged by reading, not measured. Cost per session is unchanged apart from the hotspot count harvest must answer (547 to 500 here).
- `ownerVoice` and the rejected-call flag are Claude-only; Codex transcripts have no equivalent field.
