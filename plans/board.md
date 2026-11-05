# Program board: momentry

This board is high-level: one row = one epic = one plan. Step status and evidence live in the plan, not here.

**Context:** momentry is the experimental first slice of CIS (Creator Intelligence System, `vantt/cis`). Current focus: **selling it**. Every sales step (E8, E10–E15) lives in one plan: [sales](261104-sales/plan.md). What sells tells CIS which audience to build for next ([audiences](../website/content/audiences.md)).

**Last updated:** 2026-11-05 (E16 done and released in v0.3.0; E19 shared labels split out as backlog; quality work uses only our own data; E20 story material signals opened, M.1 done) · **Released version:** v0.3.0 (2026-11-05)

## Overview

20 epics:
- 2 done: E2, E16.
- 3 in progress: E1, E3, E8.
- 1 not started: E10. In progress: E17.
- 6 in the sales plan, backlog: E11–E15, E18.
- 5 backlog, no plan: E4, E5, E6, E7, E9.
- 1 backlog with plan: E19.
- 1 in progress with plan: E20 (M.1 done; M.2–M.4 todo).

Main path: E1 and E3 close (record real runs, Antigravity on Windows) → E4 validate the mechanism → E5 real use → E6 story assembly.
Sales path (focus): E10 close the source → E12 host the page → E11 sell to devs. Landing page v2 for the paid product is in progress on branch `website-v2` (E8).

## In progress

Steps the agent is running, taken from plans. Steps waiting on the human are not here.

| ID | Step | Plan | Notes |
|---|---|---|---|
| E8 | S0.8 Landing page v2 for the paid product (content, design, review) | [sales](261104-sales/plan.md) | Branch `website-v2`; separate artifact to compare with v1 |

## Next

### Next step of plans in progress

At most 1 step per plan.

| ID | Step | Plan | Condition |
|---|---|---|---|
| (none) | Agent steps of E1 are done; DM.6 and DM.7 wait on the human | | |
| E3 | Set the plan `completed` | [more-agent-hosts](261103-1110-more-agent-hosts/plan.md) | After issue #2 passes |
| E20 | M.2 Git as a second source inside the session time range, with SHA evidence | [story-material](261105-story-material/plan.md) | After M.1 merges to main |

### Next plans

At most 3 epics, in the order to open them.

| # | Epic | Plan | Priority | First step | Who | Condition |
|---|---|---|---|---|---|---|
| 1 | E10 Close the source | [sales](261104-sales/plan.md) S0.1–S0.7 | P1 | S0.1 draft the EULA; S0.2–S0.3 license lines and move the `gh` section out of README | Agent; human approves the EULA, creates the R2 bucket | Domain and R2 for S0.4–S0.6 |
| 2 | E4 Validate the mechanism | — (rows DM.8–DM.10 in [PRD §9](../docs/prd.md)) | P1 | Write the plan; DM.9 run on 1–2 sessions of another domain, at least one Codex | Agent | E1 closed |
| 3 | E5 Real use and measurement | — (DM.11 in PRD §9) | P1 | Write the plan around PRD §10 metrics | Agent, then human uses it 1–2 weeks | E4 plan open |

## Needs the human

The only section that holds steps waiting on the human.

| ID | Step | Plan | What the human must do |
|---|---|---|---|
| Sales | Nine open questions | [sales](261104-sales/plan.md) § Câu hỏi còn mở | Domain, R2 vs releases repo, final price, Lemon Squeezy or Gumroad, refund policy, story language, what "lifetime" covers, trial model, sell before the license worker |
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
| E8 | Marketing copy: pain and selling points, pricing, posts | [sales](261104-sales/plan.md) | 🔄 Doing | P2 | — | v2 (paid) on branch `website-v2`. Landing page v1 built (`site-v1`, `website/src/`), not hosted; its copy still says free and Unlicense. `website/content/selling-points.md` collecting. Track competitors (Taplio, Typefully, Castmagic, Supergrow) |
| E9 | Release signing (cosign, SEC-02/03) and shell completions | — | 📥 Backlog | P3 | E2 | Deferred out of E2's scope |
| E10 | Close the source: proprietary EULA, binaries on Cloudflare R2 (replaces the releases-only repo idea), installer and update URLs | [sales](261104-sales/plan.md) | ⬜ Todo | P1 | — | Repo already private, so `install.sh`/`install.ps1` from `vantt/momentry` 404 for outsiders. `LICENSE` still Unlicense; change README ×2, CHANGELOG. Move sales docs to `docs/_private/`? The `gh` section of README ships in release tarballs and names the private repo: move it to `docs/development.md` |
| E11 | Sell to devs: Lemon Squeezy or Gumroad, 19–29 USD lifetime, light license-key check, pricing on the landing page | [sales](261104-sales/plan.md) | 📥 Backlog | P2 | E10, E12 | Build momentry in public with momentry; collect feedback from first buyers. Go on when people pay and ask for post drafts |
| E12 | Host the landing page on Cloudflare Pages | [sales](261104-sales/plan.md) | 📥 Backlog | P2 | E10 | Replaces `.github/workflows/website.yml` (GitHub Pages; fails on a private repo). Copy must match E10 and E11: license, price, download link |
| E13 | Pro features: post drafts (X, LinkedIn, Threads, newsletter, weekly report), personal voice, cheaper LLM pass | [sales](261104-sales/plan.md) | 📥 Backlog | P3 | E11 | Overlaps E6 (draft post); decide which epic owns drafting when either opens |
| E14 | Validate with vibe coders and creators: separate landing page, waitlist at 15–20 USD/month | [sales](261104-sales/plan.md) | 📥 Backlog | P3 | E11 | Lead line "Anh không thiếu ý tưởng, anh quên mất mình đã làm gì." Go on at a few hundred signups |
| E16 | UI and UX without commands: one app for every project (data split per project), English UI, setup wizard, ranked story cards with Use/Later/Drop, privacy, cost, health; agent commands `momentry-ui`, `momentry-bip`; a `momentry` skill for plain-language questions (no MCP: token cost per session); Settings screen; one on-demand web process | [ui-ux](261104-ui-ux/plan.md) ✅, [ui-ux-followup](261104-ui-ux-followup/plan.md) ✅ | ✅ Done (v0.3.0) | P1 | — | Decisions 2026-11-04 in the plan. Box stays in the repo by default, optional outside; auto-gather with a budget. Frontend is static so E18 reuses it |
| E17 | Story selection quality and cost per session: labelled test set (5–10 sessions), replay harness with `--save-llm`/`--fake-llm`, per-step cost, ranking tuning, e5 embedding experiment for cluster/merge | [story-quality](261104-story-quality/plan.md) | 🟡 In progress | P1 | E1 | Overlaps E4 (DM.9, DM.10) and E5 metrics. e5 not in the first paid build unless Q.3/Q.6 show cluster cost matters: adds native `onnxruntime-node` and a ~117 MB download to a zero-dependency tool |
| E18 | Port to Rust: core crate, CLI that also serves the E16 web UI from one binary; same box, ledger and config formats | [rust-port](261104-rust-port/plan.md) | 📥 Backlog | P2 | E17 | User allows a full Rust rewrite when needed (2026-11-04). ~6.2k lines JS, ~3.3k lines tests. Proposal: after the first sales signal, before A2 (E14/E15). Pulls in S0.19 (readable JS), S1.3 (license check), Q.6 (e5, embedded and run in-process via `candle`, R.7, only if a small model fits: ≤ ~50 MB added, quality not below e5-small), E9 (signing) |
| E19 | Shared labels: users opt in to send anonymous Use/Later/Drop labels to a momentry server to improve default ranking; explicit consent screen listing every field sent, private projects never send | [shared-labels](261105-shared-labels/plan.md) | 📥 Backlog | P3 | E17 | Split from E16 (U.7b) 2026-11-05. Not now: quality work uses only our own data. Changes the "no momentry server" promise |
| E20 | Story material signals: owner-voice, lesson-write and blocked hotspot kinds with noise filters (M.1 done); next git as a second source (M.2), subagent and worker transcripts (M.3), cross-session arc and retrospective mode (M.4) | [story-material](261105-story-material/plan.md) | 🔄 Doing | P1 | E17 | Evidence: [material-signals](../docs/experiments/2026-11-05-material-signals/README.md). Ranking and outsider cost stay in E17 |
| E15 | Hosted product: desktop or web app, more sources (Cursor, Lovable, Bolt, ChatGPT/Claude exports), accounts, subscription billing | [sales](261104-sales/plan.md) | 📥 Backlog | P3 | E14 | Privacy gate on the sales page, data policy, onboarding under 2 minutes |

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
