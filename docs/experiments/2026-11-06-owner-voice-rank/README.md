# Owner decisions in ranking: rank rule vs prompt lines (2026-11-06)

**Purpose:** measure two fixes for stories where the user objects or picks a new direction, which the tension step often scores `none` and the ranking then pushes down. Items M.5 (rank rule) and M.6 (prompt lines) of the [story-material plan](../../../plans/261105-story-material/plan.md).

**Raw data** (captures, labels, model outputs) stays outside the repo. This record holds numbers only: no titles, no transcript text.

## 1. Setup

- **Data:** the second eval set (8 windows of one other project, labels drafted by an agent and checked by a second agent, not yet graded by the owner). One transcript was deleted from disk after its capture, so a run that needs the transcript covers 7 windows.
- **Measures** ([harness](../../../scripts/eval/README.md)): p@5, p@10, `t` labels in the top half, mean rank of found `t` labels, and that rank divided by the list length (rank/N, lower is better).
- **M.5, 0 USD:** the captured boxes re-sorted under three tables. `base` is the shipped table. `merge` is the proposal: a `none` story with stakes ≥ 2 ranks inside the tension tier by score (needs an OR, which the rule table cannot say). `tier` is the table-only version: such stories get their own tier right under the tension tier.
- **M.6, paid:** two refreshes of the newest capture with `--refresh hook-tension,stakes,angle` (harvest, cluster and outsider replayed, so the stories are the same): `ctl` with the shipped prompts, measuring how much a second model call moves things by itself; `m6` with one line added to each prompt (tension: a user objection, interruption or change of direction is a tension, not `none`; stakes: a user objection or decision that changes scope, method or pace is at least 2, a new direction chosen by the user is 3). 0.88 USD for `ctl`, 0.85 USD for `m6`.

## 2. M.5: rank rule (0 USD)

| Captures | Windows | Table | p@5 | p@10 | `t` top half | rank/N |
|---|---:|---|---:|---:|---:|---:|
| first capture | 8 | base | 0.700 | 0.600 | 24/31 | 0.315 |
| | | merge | 0.700 | 0.625 | 26/31 | 0.309 |
| main capture | 8 | base | 0.550 | 0.525 | 24/28 | 0.281 |
| | | merge | 0.550 | 0.525 | 24/28 | 0.287 |
| branch capture | 7 | base | 0.514 | 0.543 | 20/25 | 0.287 |
| | | merge | 0.514 | 0.543 | 20/25 | 0.291 |

`tier` equals `base` on every capture: inside the `none` tier the score already puts stakes ≥ 2 first, so a tier of their own changes nothing. `merge` lifts two `t` labels into the top half on one capture out of three and makes rank/N slightly worse on the other two. The story that prompted the proposal is not found at all in the newer captures, so its jump cannot be checked there.

## 3. M.6: prompt lines (refresh of three steps)

Same 7 windows, same stories in all three rows.

| Run | p@5 | p@10 | `t` top half | mean `t` rank | rank/N | `none` stories | `none` with stakes ≥ 2 |
|---|---:|---:|---:|---:|---:|---:|---:|
| capture (shipped prompts) | 0.543 | 0.529 | 20/23 | 7.85 | n/a | 67/213 | 21 |
| `ctl` (shipped prompts, called again) | 0.571 | 0.514 | 19/23 | 8.70 | 0.281 | 59/213 | 11 |
| `m6` | 0.571 | 0.557 | 20/23 | 7.47 | 0.245 | 62/213 | 18 |

- A second call with the same prompts moves the mean `t` rank by 0.85. `m6` is 1.23 better than `ctl` and 0.38 better than the capture: the right direction, but only about one noise width.
- The tension line did not cut `none` (62 vs 59); the stakes line raised the stakes of `none` stories (18 vs 11 with stakes ≥ 2). Per label, `m6` lifts some `t` stories a lot (one from #17 to #4, one from #6 to #2) and drops one from #1 to #6.
- With `m6`, `merge` on top changes rank/N from 0.245 to 0.254: no gain.

## 4. Decision

- **M.5:** not proposed for the shipped table. No gain on any measure beyond one capture, and the table-only form is a no-op.
- **M.6:** kept on an unmerged branch until the owner grades the set. Both refreshed captures stay in the private data, so re-measuring them against the owner's labels is a replay at 0 USD.
