# Program board: momentry

This board is high-level: one row = one epic = one plan. Step status and evidence live in the plan, not here.

**Last updated:** 2026-11-04 · **Released version:** v0.2.0 (2026-11-03)

## Overview

9 epics:
- 1 done: E2.
- 2 in progress: E1, E3.
- 0 not started.
- 6 backlog, no plan: E4, E5, E6, E7, E8, E9.

Main path: E1 and E3 close (record real runs, Antigravity on Windows) → E4 validate the mechanism → E5 real use → E6 story assembly.

## In progress

Steps the agent is running, taken from plans. Steps waiting on the human are not here.

| ID | Step | Plan | Notes |
|---|---|---|---|
| (none) | | | |

## Next

### Next step of plans in progress

At most 1 step per plan.

| ID | Step | Plan | Condition |
|---|---|---|---|
| (none) | Agent steps of E1 are done; DM.6 and DM.7 wait on the human | | |
| E3 | Set the plan `completed` | [more-agent-hosts](261103-1110-more-agent-hosts/plan.md) | After issue #2 passes |

### Next plans

At most 3 epics, in the order to open them.

| # | Epic | Plan | Priority | First step | Who | Condition |
|---|---|---|---|---|---|---|
| 1 | E4 Validate the mechanism | — (rows DM.8–DM.10 in [PRD §9](../docs/prd.md)) | P1 | Write the plan; DM.9 run on 1–2 sessions of another domain, at least one Codex | Agent | E1 closed |
| 2 | E5 Real use and measurement | — (DM.11 in PRD §9) | P1 | Write the plan around PRD §10 metrics | Agent, then human uses it 1–2 weeks | E4 plan open |
| 3 | E8 Marketing copy | — | P2 | Write the plan from `website/content/` | Agent | None |

## Needs the human

The only section that holds steps waiting on the human.

| ID | Step | Plan | What the human must do |
|---|---|---|---|
| E1 | DM.6, DM.7 forced-compact sessions | [PRD §9](../docs/prd.md) | Force a compact in one Claude Code and one Codex session with hooks installed; kill one session midway |
| E3 | Antigravity hook on Windows ([issue #2](https://github.com/vantt/momentry/issues/2)) | [more-agent-hosts](261103-1110-more-agent-hosts/plan.md) | On a Windows machine with agy signed in, run `scripts/probe-agy-windows.ps1` and paste the result into the issue; passes on `hook fired: True` |

## Backlog

All epics, from idea to done. One plan per epic. The board shows no progress; read it in the plan.

| ID | Epic | Plan | Status | Priority | Depends on | Notes |
|---|---|---|---|---|---|---|
| E1 | Core pipeline: harvest, privacy, hook, scan (DM.0–DM.7) | [PRD §9](../docs/prd.md) | 🔄 Doing | P1 | — | Code shipped in v0.1.0; real run 2026-11-04 recorded |
| E2 | Packaging and distribution | [packaging-distribution](261103-0921-packaging-distribution/plan.md) | ✅ Done | P1 | E1 | v0.1.0 |
| E3 | More hosts: pi, omp, Antigravity, every profile | [more-agent-hosts](261103-1110-more-agent-hosts/plan.md) | 🔄 Doing | P1 | E2 | Released in v0.2.0; only agy on Windows left |
| E4 | Validate the mechanism (DM.8 sealed outsider test, DM.9 other domains, DM.10 stakes recheck) | — | 📥 Backlog | P1 | E1 | DM.8 and DM.10 need the human's labels |
| E5 | Real use 1–2 weeks and measurement (DM.11) | — | 📥 Backlog | P1 | E1 | Metrics in PRD §10 |
| E6 | Editing, threads, hooks, draft post (DM.12) | — | 📥 Backlog | P3 | E5, box ≥ 30 stories | |
| E7 | Multi-repo box and cross-repo threads (DM.13) | — | 📥 Backlog | P3 | E5 | |
| E8 | Marketing copy: pain and selling points, pricing, posts | — | 📥 Backlog | P2 | — | Landing page v1 shipped (`site-v1`); `website/content/selling-points.md` collecting |
| E9 | Release signing (cosign, SEC-02/03) and shell completions | — | 📥 Backlog | P3 | E2 | Deferred out of E2's scope |

Status: 📥 Backlog, ⬜ Todo, 🔄 Doing, ⏸ Waiting, ✅ Done, ❌ Dropped.
Priority: P1 needed first, P2 should do, P3 later.

## How to update the board

Rule: **plan first, board second.** Step status and evidence live only in the plan.

1. New idea: add a Backlog row with the next epic ID, status 📥, plan `—`. The ID never changes.
2. Plan created: link it in the Plan column, set ⬜ Todo.
3. Start a step: mark it in the plan first. Agent step goes to "In progress", human step to "Needs the human", never both. Epic becomes 🔄 Doing.
4. Finish a step: mark ✅ with evidence in the plan; remove the board row; promote the plan's next step to "Next".
5. Human step: only in "Needs the human", with what they must do; remove it when done.
6. Epic finished: set ✅ Done and pick the next epic for "Next plans" (max 3).
7. Dropped: ❌ in the plan with a reason; ❌ Dropped on the board if the epic is dropped.
8. Never copy progress or evidence onto the board.
9. Update "Last updated".
