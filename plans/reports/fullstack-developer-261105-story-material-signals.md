# Story material signals: hotspot detectors

Status: done. Branch `feat/story-material-signals` (from origin/main d6f3273). Not pushed, not merged. Tests: 369 pass (362 before, 7 new).

## What changed

- `lib/hotspots.mjs`: one file, no new layer.
  - `ownerVoice(e, stretch)`: interrupt, rejected tool call, choice answer, pushback/prod, short turn (≤ 100 chars) after ≥ 30 non-owner entries. `detect` passes the running stretch; harness-injected user lines (leading tag, cross-session message) neither count nor reset it.
  - `lessonWrite`: edit tools and shell writes (`>`, `>>`, `tee`, heredoc, `cp`/`mv`/`install` last arg) to `memory/`, `MEMORY.md`, `decisions/`, `adr/`, `journals/`, `CHANGELOG`. Heredoc bodies are skipped. `metaWrite` now skips lesson paths (memory sits under `.claude/`), so one write is one hotspot; its agent-config meaning is unchanged.
  - `blocked`: hook veto, permission refusal, worktree guard, sandbox. `nonzeroExit` skips it and skips user rejections.
  - `metricPair`: ranges dropped (range-noun before, id-like prefix or leading zero, size/day/row unit after `to`/`tới`), grouped thousands with space, decimal comma, `%`, all matches scanned not only the first, harness-injected user lines ignored.
  - `gitReversal`: heredoc bodies skipped; `checkout --` needs a real `--` token; routine `rebase` onto upstream/main skipped (kept `--abort -i --onto --root --exec --autosquash`); `checkout -- <lockfile>` skipped.
- `lib/sources/claude.mjs`: `rejected: true` on result entries (from `toolDenialKind: user-rejected` or the refusal text). Interrupt lines were already user entries.
- `lib/reduce.mjs`: blocked results still render their last lines, labelled `(bị chặn)`.
- `prompts/harvest.md`, `prompts/harvest-fill.md`: one line per label (both, because they carry the same hotspot paragraph and the fill prompt would otherwise show unexplained labels).
- Tests: extended `test/reduce-hotspots.test.mjs` (one owner per behaviour), contract arity rows, fabricated fixture `test/fixtures/transcripts/claude-owner-voice.jsonl`.
- Docs: PRD 5.3 table and 6.2 Entry, CHANGELOG Unreleased, experiment record, plan `plans/261105-story-material/plan.md` (E20, M.1 done, M.2–M.4 todo), board row and counts.

## Measurement (4 real sessions, numbers only, no LLM)

| | Before | After |
|---|---:|---:|
| hotspots total | 547 | 500 |
| `metricPair` raw hits | 216 | 51 |
| `gitReversal` raw hits | 109 | 52 |
| `nonzeroExit` raw hits | 212 | 143 (68 moved to `blocked`, 1 user rejection) |
| `metaWrite` / `lessonWrite` raw | 22 / n.a. | 1 / 42 |
| `ownerVoice` raw | n.a. | 153 |

Moments (16 listed, rows 1-3 excluded): any hotspot within 15 lines 10 -> 11. Owner-line moments (5): hotspot on the owner turn 0 -> 5. New hits: rows 7 and 8. Still missed: rows 4, 5, 9, 12. Details and caveat on `ownerVoice` density in `docs/experiments/2026-11-05-material-signals/README.md`. Scratch output: `<scratchpad>/detector-measure/{before,after}/<id>/`.

## Decisions to know about

- `ownerVoice` short-turn label is the noisy one (97 of 153 raw): most are "continue" or status asks. Kept, because it is the only catch for owner turns with no keyword; prompt says it is usually just "continue". Easy to drop or raise the 30-entry threshold if harvest cost matters.
- "X trên Y" ratio tried and dropped: 65 raw hits, nearly all progress counts.
- `checkout -- <lockfile>` routine rule was not in the brief; added because it was 10 of the 62 remaining merged hits. Remove if unwanted.
- `blocked` stays a hotspot (harvest must answer every hotspot); attention lowered by prompt text only.
- Plain `git reset <file>` unstaging still counts as a reversal (not asked to change).

## Not done / limits

- Codex has no `rejected` or interrupt equivalent; `ownerVoice` is Claude-only for those two labels.
- Precision of new kinds judged by reading samples, no labelled set. Vocabulary is hand-written VN/EN.
- Did not touch `lib/rank.mjs`, `lib/outsider.mjs`, model defaults, momentry-eval, or any forgentX file.

Status: DONE
Summary: Added `ownerVoice`, `lessonWrite`, `blocked` detectors and noise filters for `metricPair`/`gitReversal`, with prompt labels, tests (369 pass), PRD/CHANGELOG/plan/board and a numbers-only measurement; committed on the branch, not pushed.
