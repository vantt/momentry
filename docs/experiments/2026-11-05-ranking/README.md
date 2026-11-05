# Ranking tuning on replayed captures (2026-11-05)

**Purpose:** tune the `list --rank` order (`lib/rank.mjs`, PRD 5.9) against the draft labels of 8 sessions, without new model calls. Item Q.5 of the [story-quality plan](../../../plans/261104-story-quality/plan.md).

**Raw data** (model outputs, scratch boxes, labels) stays in `docs/_private/eval/` and is never committed. This record holds numbers only: no story titles, no transcript text.

## 1. Setup

- **Data:** the 9 captures of [the step-cost run](../2026-11-05-step-cost/README.md) (8 sessions, `2dfb5915` captured twice), replayed with `--fake-llm` through [the eval harness](../../../scripts/eval/README.md). 0 USD.
- **Labels:** agent-written drafts, unreviewed. 60 labels, 30 of them `t` (truly notable). A label can match several stories: 55 of the 166 first-capture stories match a `t` label.
- **Ceiling:** three sessions (`2dfb5915`, `9514b261`, `f0bf048d`) each have one `t` label that no story matches (recall, not ranking). So at most 27/30 `t` labels can reach the top half, and DM.5 ("every `t` label in the top half") can hold in at most 5/8 sessions. Ranking cannot change recall.
- **Metrics:** as the harness defines them (`p@5`, `p@10`, mean best rank of found `t` labels, `t` labels in the top ⌈N/2⌉). Totals are over the first capture of each session; the second capture of `2dfb5915` is reported separately as a stability check.
- **Method:** each replay's box was dumped once; variants of the sort key were then evaluated in memory on the same stories, and the chosen key was confirmed by re-running the harness itself.

## 2. Which inputs predict `t`

Story level, first captures, 166 stories. `t` = matches a `t` label; `other` = matches only non-`t` labels; `none` = matches no label.

| Input | Value | t | other | none | t share |
|---|---|---|---|---|---|
| tension | `none` | 7 | 5 | 21 | 0.21 |
| | any other | 48 | 27 | 58 | 0.36 |
| stakes | 0 | 6 | 7 | 21 | 0.18 |
| | 1 | 12 | 4 | 21 | 0.32 |
| | 2 | 28 | 15 | 30 | 0.38 |
| | 3 | 9 | 6 | 7 | 0.41 |
| strength | 0 | 7 | 4 | 15 | 0.27 |
| | 1 | 6 | 6 | 16 | 0.21 |
| | 2 | 29 | 11 | 34 | 0.39 |
| | 3 | 13 | 11 | 14 | 0.34 |
| stakes × strength | 0 | 12 | 9 | 31 | 0.23 |
| | 1–3 | 15 | 7 | 21 | 0.35 |
| | 4–9 | 28 | 16 | 27 | 0.39 |
| found by | outsider step only (no harvest run) | 2 | 4 | 14 | 0.10 |
| | a harvest run | 53 | 28 | 65 | 0.36 |
| outsider angle | yes | 18 | 13 | 32 | 0.29 |
| | no | 37 | 19 | 47 | 0.36 |
| hotspot | yes | 17 | 7 | 28 | 0.33 |
| | no | 38 | 25 | 51 | 0.33 |
| body length (chars) | < 600 | 4 | 3 | 22 | 0.14 |
| | 600–999 | 34 | 23 | 41 | 0.35 |
| | ≥ 1000 | 17 | 6 | 16 | 0.44 |

Tension `none` crossed with stakes:

| | t | other | none | t share |
|---|---|---|---|---|
| tension `none`, stakes ≥ 2 | 5 | 1 | 7 | 0.38 |
| tension `none`, stakes ≤ 1 | 2 | 4 | 14 | 0.10 |
| tension other, stakes 0 | 5 | 4 | 14 | 0.22 |

Reading:

- **Stories only the outsider step found are rarely `t`** (2/20). They retell a practice from the outside angle; no harvest run saw them as an event. `hits` is 0 for exactly these stories (with `runs` 1), and the old key used `hits` only as a late tie-break.
- **The product erases an axis.** A tension `none` story always has strength 0, so its product is 0 whatever its stakes: inside the `none` tier, stakes was ignored. Tension `none` with stakes ≥ 2 is `t` as often as the average story (5/13), more than tension-with-stakes-0 (5/23). Same for strength 3 with stakes 0.
- Hotspot and the outsider angle on a harvested story carry no signal. Body length does, but it mostly restates "found by the outsider step only" (short bodies) and is not a scoring field.
- Single tension types hold 2–36 stories each, with `t` shares from 0.00 (`it_ma_nhieu`, 0/14) to 0.62 (`nho_ma_to`, 16/26). Not used: a per-type weight would be fitted to these drafts and to the current prompt's wording.

## 3. Variants

All rows: first captures (8 sessions) | second capture of `2dfb5915`.

| Key | t top half | DM.5 | p@5 | p@10 | mean t-rank | 2nd: t top half | 2nd: p@10 | 2nd: t-rank |
|---|---|---|---|---|---|---|---|---|
| **before:** tension tier, stakes × strength, hits, date | 21/30 | 3 | 0.63 | 0.62 | 6.41 | 2/4 | 0.50 | 12.00 |
| outsider-only last, then as before | 22/30 | 3 | 0.63 | 0.63 | 5.94 | 2/4 | 0.50 | 11.33 |
| tension tier, stakes + strength | 22/30 | 3 | 0.63 | 0.61 | 6.19 | 2/4 | 0.40 | 12.00 |
| **after:** outsider-only last, tension tier, stakes + strength | **23/30** | 3 | 0.63 | 0.61 | **5.79** | 2/4 | 0.40 | **11.33** |
| outsider-only last, stakes + strength (no tension tier) | 23/30 | 3 | 0.63 | 0.61 | 5.84 | 2/4 | 0.40 | 12.67 |
| outsider-only last, stakes, then strength | 23/30 | 2 | 0.57 | 0.62 | 5.96 | 2/4 | 0.40 | 14.00 |
| outsider-only last, strength, then stakes | 22/30 | 3 | 0.63 | 0.61 | 5.48 | 2/4 | 0.50 | 10.67 |
| best weighted sum in a 287-point grid (2·stakes + strength + tension + 3·harvested) | 24/30 | 3 | 0.57 | 0.62 | 6.08 | 2/4 | 0.40 | 13.33 |
| strength + 2·harvested (stakes ignored) | 23/30 | 4 | 0.60 | 0.59 | 5.56 | 2/4 | 0.40 | 9.33 |

The 2nd-capture p@5 is 0.40 for every row except stakes-then-strength and the best grid sum (0.20 each).

## 4. Per session, before → after

| Session | N | t top half | p@5 | p@10 | mean t-rank | DM.5 |
|---|---|---|---|---|---|---|
| 2dfb5915#1 | 14 | 1/4 → 2/4 | 0.60 → 0.60 | 0.60 → 0.60 | 9.33 → 7.00 | no (ceiling 3/4) |
| c4caee3c | 28 | 3/4 → 3/4 | 0.40 → 0.40 | 0.20 → 0.20 | 9.75 → 9.50 | no |
| 9514b261 | 17 | 2/4 → 2/4 | 0.40 → 0.40 | 0.60 → 0.60 | 5.33 → 5.33 | no (ceiling 3/4) |
| 6a207191 | 21 | 3/5 → 4/5 | 0.80 → 0.80 | 0.60 → 0.70 | 10.00 → 7.60 | no |
| 0faf0bb2 | 27 | 4/4 → 4/4 | 0.80 → 0.80 | 0.90 → **0.70** | 6.50 → **7.25** | yes → yes |
| f0bf048d | 9 | 3/4 → 3/4 | 0.60 → 0.60 | 0.56 → 0.56 | 2.00 → 2.00 | no (ceiling 3/4) |
| ab9a1dd8 | 26 | 3/3 → 3/3 | 0.60 → 0.60 | 0.80 → 0.80 | 7.33 → 6.67 | yes → yes |
| cd4449ab | 24 | 2/2 → 2/2 | 0.80 → 0.80 | 0.70 → 0.70 | 1.00 → 1.00 | yes → yes |
| **mean / total** | | **21/30 → 23/30** | 0.63 → 0.63 | 0.62 → 0.61 | **6.41 → 5.79** | 3 → 3 |
| 2dfb5915#2 | 31 | 2/4 → 2/4 | 0.40 → 0.40 | 0.50 → **0.40** | 12.00 → 11.33 | no (ceiling 3/4) |

Recall is unchanged (92% mean; ranking does not touch it). Mean t-rank improves in 4 sessions, worsens in 1 (`0faf0bb2`); `t` top half improves in 2 sessions and worsens in none.

Where each change acts:

- **Outsider-only last** moves one `t` label into the top half in `2dfb5915`, lowers t-rank in `2dfb5915` (both captures) and `6a207191`, and is not worse in any metric on any of the 9 lists.
- **Sum instead of product** moves one `t` label into the top half in `6a207191`, lowers t-rank in `c4caee3c`, `6a207191`, `ab9a1dd8`, and costs p@10 in `0faf0bb2` (0.90 → 0.70) and in the second `2dfb5915` capture (0.50 → 0.40), plus t-rank in `0faf0bb2` (6.50 → 7.25).

## 5. Leave-one-session-out

Pick the key on 7 sessions (objective: `t` labels in the top half, then mean relative t-rank, then p@5), score it on the 8th. Sum of held-out `t` labels in the top half:

| Candidate set | Held-out t top half | Baseline | Picks |
|---|---|---|---|
| 287 weighted sums + 11 rule keys (incl. the old key) | 21/30 | 21/30 | 5 different keys across 8 folds |
| the 4 explainable keys: before, outsider-only last, sum, both | **23/30** | 21/30 | "both" in all 8 folds |
| before vs outsider-only last | 22/30 | 21/30 | "outsider-only last" in all 8 folds |

The free search overfits: whatever wins on 7 sessions does not beat the old key on the 8th. The two explainable changes generalise across folds, and the pick is stable.

## 6. Decision

New key (ascending): `[outsider-only ? 1 : 0, tension ≠ none ? 0 : 1, -(stakes + strength), -hits, -date]`. "Outsider-only" = `hit_by` has `outsider` but neither `harvest` nor `bip`; a later harvest that merges into the story lifts it back.

- **Adopted, outsider-only last:** clear reason (no harvest run saw an event), 2/20 `t`, never worse on any list.
- **Adopted, sum instead of product:** removes a defect rather than fitting a weight (the product ignored stakes for every tension `none` story and strength for every stakes-0 story). Gains spread over 3 sessions; the cost is p@10 on one session and the second capture. Accepted because DM.5 and t-rank are the target and LOO picks it in every fold.
- **Rejected:** dropping the tension tier (worse on the second capture: t-rank 12.67), stakes-first (DM.5 3 → 2, p@5 0.57), the best grid weights (p@5 0.57; held-out no better), strength-only (best DM.5 and second-capture t-rank, but drops stakes, the axis DM.10 is to verify, and lowers p@5 to 0.60).
- **Not reached:** DM.5 stays at 3/8 sessions (ceiling 5/8). The remaining misses in reachable sessions are a tension `none`, stakes 2 story in `6a207191` (rank 18/21, the same pattern as the [2026-11-04 real run](../2026-11-04-dm-real-run/README.md)) and a stakes 0, strength 2 story in `c4caee3c` (rank 19/28). Lifting the first needs dropping the tension tier, which the second capture penalises. The 2026-11-04 session is not among the 8 captures, so that case is not re-measured here.

## 7. Limits

- Labels are unreviewed agent drafts; 30 `t` labels. A difference of 1–2 labels is within the noise of one relabel.
- One capture per session (two for `2dfb5915`, whose two captures differ by 17 stories); `runs` 1, so `hits` is 0 or 1.
- The same captures were used for the step-cost record and for this tuning; there is no untouched test set. DM.10 (user labels written before seeing scores) remains the real check.
