# Learned taste on the labelled set, leave one session out (2026-11-07)

**Purpose:** check personal ranking ([`lib/taste-rank.mjs`](../../../lib/taste-rank.mjs)) before it is turned on for anyone. Items T.4 and T.5 of the [user-taste plan](../../../plans/261106-0900-user-taste/plan.md). Done criterion from the plan: no session loses more than one `t` story from the top half against the default order, and the total of `t` stories in the top half goes up.

**Raw data** (captures, labels, model outputs) stays outside the repo. This record holds numbers only: no titles, no transcript text.

## 1. Setup

- **Data:** the first eval set (8 labelled sessions, first capture of each in `new-defaults`), replayed with `--fake-llm` (0 USD) by [`scripts/eval/taste-loso.mjs`](../../../scripts/eval/taste-loso.mjs), the same replay `run.mjs` measures. The replay reproduces the published baseline exactly: `t` in the top half 25/33, p@5 0.88, mean `t` rank 4.95.
- **Verdicts:** a story matched by a `t` label is "used"; every other story (matched by a non-`t` label or by none) is "dropped". 198 stories, 33 `t` labels.
- **Rotation:** learn on 7 sessions, rank the 8th with personal ranking, repeat for all 8. Inside the training set, sessions in manifest order play the role of time, so the held-out check sees the last 20% of used and of dropped verdicts.
- **Model as shipped:** logistic regression with the default order as a fixed offset (−ln position), L2 prior on the weights (λ = 1, chosen before measuring), features tension, signals, outsider-only, has-angle and standardised stakes, strength, hits, completeness; held-out check (fall back to the default order when the learned order ranks the held-out pairs worse); one top-5 place kept for the default order.
- **Missing features in the replays:** no capture of this set ran the angle step, so `completeness` and `has_angle` are missing on all 198 stories (treated as neutral). 45 stories have no signal. Tension, stakes, strength and hits are present everywhere.

## 2. Result (model as shipped, λ = 1)

| Session | Stories | `t` | `t` top half default → taste | p@5 default → taste | mean `t` rank default → taste | Model |
|---|---:|---:|---:|---:|---:|---|
| 2dfb5915 | 10 | 6 | 3 → 3 | 1.00 → 1.00 | 4.00 → 3.80 | on |
| c4caee3c | 34 | 4 | 3 → 3 | 0.40 → 0.40 | 10.25 → 10.25 | fell back |
| 9514b261 | 18 | 8 | 6 → 6 | 0.80 → 0.80 | 6.57 → 6.57 | fell back |
| 6a207191 | 19 | 4 | 3 → 3 | 1.00 → 1.00 | 5.75 → 5.75 | fell back |
| 0faf0bb2 | 31 | 4 | 4 → 4 | 1.00 → 1.00 | 3.25 → 3.25 | fell back |
| f0bf048d | 28 | 4 | 3 → 3 | 1.00 → 1.00 | 7.25 → 7.25 | fell back |
| ab9a1dd8 | 27 | 1 | 1 → 1 | 0.80 → 0.80 | 1.00 → 1.00 | fell back |
| cd4449ab | 31 | 2 | 2 → 2 | 1.00 → 1.00 | 1.50 → 1.50 | on |
| **Total** | 198 | 33 | **25 → 25** | **0.88 → 0.88** | **4.95 → 4.92** | 2 of 8 on |

Held-out check (pairwise AUC, taste / default) when it fell back: 0.76/0.79, 0.78/0.79, 0.77/0.79, 0.74/0.76, 0.77/0.79, 0.67/0.68. When it stayed on: 0.75/0.75 and 0.63/0.60.

**Criterion not met.** No session loses a `t` story, but the total does not go up (25/33 both ways). Personal ranking therefore ships **off** (`rank.personal` defaults to false). Without the top-5 place kept for the default order the count would go up (section 3).

## 3. What the parts do

| Variant (λ = 1) | `t` top half | p@5 | mean `t` rank | Worst session |
|---|---:|---:|---:|---:|
| as shipped | 25/33 | 0.88 | 4.92 | 0 |
| no top-5 place for the default | 27/33 | 0.85 | 4.87 | 0 |
| no held-out check | 24/33 | 0.85 | 5.43 | −4 |
| no held-out check, no top-5 place for the default | 26/33 | 0.82 | 5.28 | −4 |

- Without the held-out check the learned weights hurt one session badly (9514b261: 6 → 2 `t` in the top half, p@5 0.80 → 0.60). The check catches it: on that rotation the learned order is below the default on held-out pairs.
- The top-5 place kept for the default order is what keeps the shipped model from meeting the criterion. On 2dfb5915 (10 stories, so the top half is the top 5) the model alone gets 5 `t` labels into the top 5 (default 3); with the kept place, which moves the story at place 5 down, it stays at 3 (labels count by their best-matching story, so one story moved can cost more than one label). On cd4449ab the kept place holds p@5 at 1.00 (0.80 without it). Without the kept place the criterion is met on the `t` count (27/33, no session loses) but p@5 drops from 0.88 to 0.85. The kept place is a product decision (plan, open question 2: guard against the taste locking itself into one kind of story), not something this set can measure, so it stays.

Prior strength, same rotation (as shipped otherwise):

| λ | `t` top half | p@5 | mean `t` rank | Sessions where the model stayed on |
|---:|---:|---:|---:|---:|
| 0.3 | 25/33 | 0.88 | 4.92 | 3 |
| 1 | 25/33 | 0.88 | 4.92 | 2 |
| 3 | 25/33 | 0.88 | 5.05 | 3 |
| 10 | 26/33 | 0.88 | 5.04 | 4 |

λ = 10 meets the criterion on the count (26/33, no session loses) but makes the mean `t` rank worse, and choosing it after seeing these numbers would tune on the test set. Not adopted.

## 4. Reading

- On this set the default order already carries most of what the features can say: tension and stakes/strength are the default ranking itself, and the features the model adds (signals) separate `t` from the rest only weakly across projects.
- The set is one person's labels over 8 sessions of 8 projects, with an inferred verdict for every story. Real verdicts (Use, Drop, drafted, published) are fewer, chosen by the user and taken from the stories they actually looked at. This measure shows the mechanism is safe (thresholds and held-out check keep the default order when it cannot do better) but not that it helps.
- Next evidence: two weeks of real use with `rank.personal` turned on by the owner, comparing the top-5 use rate before and after (plan T.5, second half). Re-run this measure once captures with the angle step exist (`completeness`, `has_angle` filled).

Reproduce: `node scripts/eval/taste-loso.mjs --manifest docs/_private/eval/manifest.json [--lambda 0.3,1,3,10] [--no-check] [--no-explore]`.
