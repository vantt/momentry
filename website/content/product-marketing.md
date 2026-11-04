# momentry: product marketing context

**Document version:** 2.0
**Last updated:** 2026-11-04

Drafted from the repo (README.md, CHANGELOG.md, docs/installation.md, docs/prd.md, docs/sample/, docs/experiments/2026-11-04-dm-real-run/README.md, `lib/`) and the sales decisions of 2026-11-04 ([audiences.md](audiences.md), `plans/board.md` E10–E12). Every claim points to its source. If a later doc contradicts this file, the doc wins.

Framework: coreyhaines31/marketingskills `product-marketing` (sections 1–14), `copywriting` (three-question gate, no AI tells, claims must be supportable, declined claims name their unlock) and `cro` (value clarity, one primary CTA, objections near the CTA).

## Changelog

*Newest first.*

- 2.0 (2026-11-04): Repositioned from a free, public-domain CLI to a paid, closed-source CLI with a one-time lifetime license. First audience narrowed to A1 in audiences.md. Lead line added. Objections rewritten for paid and closed source. Proof points moved to the recorded real run of 2026-11-04 and the v0.2.0 host verification. All GitHub links removed from the page goal.
- 1.0 (2026-11-03): Initial context for landing page v1 (free, Unlicense, install from GitHub).

---

## 1. Product overview

**One line:** momentry reads your coding-agent sessions after they end and writes every moment worth telling into your repo as one markdown file, ranked by hook, tension and stakes. (README tagline, reworded)

**Lead line (decision 2026-11-04, audiences.md):** "You're not short of ideas. You forgot what you did." (Vietnamese original: "Anh không thiếu ý tưởng, anh quên mất mình đã làm gì.")

**What it does:** After a Claude Code, Codex, pi, omp or Antigravity session ends (or compacts), a background hook reads the transcript. Four plain script detectors mark hotspots. A cheap model (Haiku) harvests every moment that could be told: a number that moved, a surprising root cause, a decision that got reversed, an approach outsiders would want to learn. Sonnet scores each one for hook, tension, strength and stakes. A privacy gate checks every story before it is written into the repo. `momentry list --rank` puts the strongest on top. (README "What it does", PRD §1, §5)

**Division of labour (PRD §1):** the machine picks and ranks. You choose and write. momentry does not write posts, outlines or drafts (PRD §3.2). Post drafts are a possible later Pro feature (board E13), not sold today.

**Category / shelf:** CLI for developers who use coding agents. Search terms: "build in public", "devlog", "Claude Code hooks", "weekly report". No category name exists; describe the job ("story notes from your agent sessions").

**Type:** local CLI, Node ≥ 20, no npm dependencies (PRD §4.9). Runs on Linux, macOS, WSL and Windows (docs/installation.md).

**Business model (decision 2026-11-04):**

- Sold, closed source, under a proprietary EULA (board E10; EULA text not written yet: `{{EULA_URL}}`).
- One-time lifetime license. List price **29 USD** (audiences.md range 19–29 USD; 29 chosen as list price on 2026-11-04). Includes updates for v0.x and 1.x.
- Checkout on Lemon Squeezy (not set up yet: `{{CHECKOUT_URL}}`).
- After purchase the buyer gets a license key and the install command by email. Binaries are hosted on Cloudflare R2 under a custom domain (not set up yet: `{{DOWNLOAD_BASE}}`). A light license-key check is planned, not built. Page wording: "activate with your key", nothing more.
- Refund policy not decided: `{{REFUND_POLICY}}`. Do not promise a refund window.
- The GitHub repo is private. The page has no GitHub links, no "read the source", no "public domain", no "free".

**Running cost to the buyer:** model calls go through the buyer's own logged-in `claude` CLI. About 1 USD per session of roughly 150k tokens (README quick start). The recorded real run cost 1.01 USD for one harvest pass (docs/experiments/2026-11-04-dm-real-run). The "outsider" step is about 0.65 USD of a window and can be turned off with `outsider.enabled = false` (PRD §5.10).

**No momentry server:** in v0.2.0 the only network code in `bin/` and `lib/` is `lib/update.mjs` (grep, 2026-11-04). Transcripts go from the buyer's machine to Anthropic through their own `claude -p` call (PRD §4.10). We never receive them. No telemetry code exists. Re-check this when the license-key check ships: it may add one call.

**Version:** 0.2.0, released 2026-11-03 (CHANGELOG).

## 2. Target audience

The full audience map is in [audiences.md](audiences.md). This page sells to **A1 only**.

**Communication rule:** public copy names one audience, **creators**. A1 is an internal segment; on the page it appears as "creators who work with AI agents" (generic: work, not build; AI agents, not coding agents); the exact hosts go in the subhead and requirements. Never "solo devs", "indie hackers" or "developers" as the audience label (see audiences.md, "Communication rule").

**A1:** solo devs and indie hackers on Claude Code, Codex, pi, omp or Antigravity who, at least weekly, tell someone what they did:

- build in public (X, Bluesky, LinkedIn threads, devlogs),
- write technical blog posts about their projects,
- write weekly reports (client, manager, cohort, newsletter).

**Fit signals:** works in git repos; comfortable with a CLI and with hooks in agent config; has a `claude` login (required for every host, since momentry calls `claude -p`); posts or reports regularly but runs out of material or memory.

**Why A1 first (audiences.md):** it is the only audience that can use the CLI as it exists today. A2–A4 need an app, other sources or hosted LLM cost.

**Anti-personas (do not sell to, say so on the page where it matters):**

- Teams wanting a shared cross-repo story feed (one box per repo, PRD §3.2).
- People who want finished posts now.
- People who cannot send transcripts to Anthropic's API.
- People without a `claude` CLI login.
- People who need English stories today (stories and CLI messages are Vietnamese, README; prompts in `prompts/` ask for Vietnamese titles and hooks).

## 3. Jobs to be done

1. "When I sit down to write this week's post or report, give me what actually happened, ranked, so I don't publish something generic." (audiences.md A1 job)
2. "While I'm deep in a session, let me flag a moment in two seconds and get back to work." (`/bip`, README)
3. "Keep the raw material as files I can grep, link and commit." (story box, `links`, `threads`, PRD §4.1)
4. "Don't let me leak a client name when I share this." (privacy gate, PRD §4.7)

## 4. Problems and pain points

In A1's words (audiences.md, from the 2026-11-04 sales chats; paraphrased by the author, not customer interviews; `[NEED: verbatim quotes from first buyers]`):

- "You're not short of ideas. You forgot what you did."
- "Friday comes and I'm trying to remember what was worth telling." (README)
- "The best thing this week happened mid-session and I forgot it." (PRD §1: "Hết phiên là quên.")
- "Things that would make a good post feel normal to me." (PRD §1, §5.2 step 3: curse of knowledge)
- "I'm scared a client name ends up in a post." (sample `lo-rieng-tu-trong-commit`: a sub-agent leaked a private query through a test fixture, in Telex form)

**Cost of the pain:** generic posts ("shipped some fixes"), skipped weeks, hours scrolling transcripts, leaked private names.

**Emotional tension:** the sense that a good story happened and is gone; mild guilt at another week with nothing posted.

## 5. Competitive landscape

| Type | Alternative | Falls short because |
|---|---|---|
| Direct | None found that reads coding-agent sessions (audiences.md, "Competitors to watch") | |
| Secondary | Taplio, Typefully, Supergrow (LinkedIn/X writing, 15–65 USD/month); Castmagic (content from recordings) | They generate or polish posts from a blank prompt or a recording. None reads coding-agent sessions. All are subscriptions. |
| Indirect | Memory, a hand-kept `devlog.md`, an AGENTS.md rule "log interesting things", `git log`, scrolling transcripts | Memory keeps what felt hard. A devlog needs you to stop and write. An AGENTS.md rule is an add-on the PRD says not to rely on (PRD §2) and costs tokens in-session. `git log` shows what changed, not why it was surprising. Transcripts are long JSONL nobody rereads (PRD §1). |
| DIY | "I could write a script that pipes my transcript to Claude" | That is the 10% that works on one machine. See section 6 (the polish). |

## 6. Differentiation

**Against creator AI tools:** they generate ideas from a blank prompt. momentry digs real material out of real work: real numbers, real reversals, real root causes (audiences.md).

**Against a DIY script ("why pay for a script?"), the polish (audiences.md A1):**

1. **Hooks for five hosts, every profile.** Claude Code, Codex (hooks), pi and omp (extension), Antigravity (`SessionStart`), installed in every profile found: `~/.codex-*`, `~/.pi/accounts/*`, `~/.omp/profiles/*/agent`, `~/.agy-homes/*/.gemini`. `doctor` reports profiles not yet installed (CHANGELOG 0.2.0, installation.md "Host được hỗ trợ").
2. **Each host's quirks handled.** Codex needs PascalCase event keys (snake_case was silently ignored); Codex on Windows runs hooks in PowerShell, Claude Code in Git Bash, Antigravity in `cmd /c`; momentry writes the command each one needs (CHANGELOG 0.2.0 Fixed, installation.md "Hook trên Windows").
3. **Privacy gate.** Every field, the filename slug and every appended line is checked against your block list in exact, accent-stripped and Telex forms (`lib/viet.mjs`, PRD §6.7). A match goes to quarantine outside the repo. No block list means nothing enters the repo. `quarantine --release all` rechecks and releases clean stories (CHANGELOG 0.2.0). `check --staged` works as a pre-commit hook.
4. **Windows and WSL.** Native Windows installer (PowerShell 5.1+, no admin), `%APPDATA%`/`%LOCALAPPDATA%` paths, `claude.cmd`, user PATH edit; WSL uses its own config (installation.md).
5. **`doctor`.** Checks Node, git, `claude`, config, block sources, repo, hooks, install; every failing check prints a runnable fix; `doctor --fix --yes` applies them (README).
6. **Checked updates.** `update` verifies sha256, tries the new version before switching, keeps the old one if anything fails; config, cache and box untouched (README "Update").
7. **Ranking tested against human labels.** Recorded run 2026-11-04: 7 of 8 stories the author had labelled worth telling ranked in the top half of 38; all 7 reference stories found; 28/28 hotspots answered (docs/experiments/2026-11-04-dm-real-run).
8. **Reads the session you already had.** Hooks exit 0 at once, print nothing, harvest in the background; no model call inside your session (PRD §4.2, §6.4).
9. **Plain markdown in your repo.** One file per moment, YAML frontmatter, `status` you edit by hand. Nothing is deleted (README).
10. **One-time price, no momentry server.** Model cost goes to the Anthropic account you already have, at Anthropic's price. We never see transcripts (section 1).

## 7. Objections and answers

| Objection | Answer (true, sourced) |
|---|---|
| "Why pay for a script?" | You could write the part that pipes one transcript to Claude. The rest took the work: hooks for five hosts in every profile, Windows shells per host, a privacy gate that catches Telex and accent-stripped names, quarantine, `doctor` with fixes, checked updates, and a ranking checked against human labels (section 6). |
| "Closed source. Can I trust hooks in my agent config?" | `momentry hooks --print` shows exactly what it would add (docs/cli-reference.md). `init` backs up each file, writes atomically, touches only momentry's own entries and refuses broken JSON (PRD §6.4). Hooks only run in repos where you ran `init`. `momentry uninstall --dry-run` lists every change it would undo; `uninstall --yes` removes them and keeps your stories (README). momentry has no server: the only network code is the update check (section 1). Do not claim "audited" or "open to inspect". |
| "I already pay Anthropic." | Good: momentry uses that account. The one-time price buys the tool. Model calls run through your own `claude` CLI at Anthropic's price, about 1 USD per long session; there is no momentry subscription or token markup on top (README, decision 2026-11-04). |
| "What does it cost to run?" | About 1 USD per session of roughly 150k tokens. Recorded run: 1.01 USD. Turn off the outsider pass (`outsider.enabled = false`) to cut about 0.65 USD of that (PRD §5.10). |
| "Will it slow my sessions?" | No. Hooks exit right away, print nothing and spawn the harvest in the background (PRD §6.4). |
| "Will it leak private names into my repo?" | Not without your block list: no block list, no stories in the repo. Matches go to `~/.cache/momentry/quarantine/` (outside the repo, mode 0700) (PRD §4.7, §6.7). |
| "Does my transcript leave my machine?" | Yes, to Anthropic, through your own `claude -p`, with your settings, tools and MCP off for that call (PRD §4.10). For Claude Code sessions that is the provider that already saw it; for other hosts it is a second provider. Never to us. |
| "The output is in Vietnamese?" | Yes, today: stories and CLI messages (README; `prompts/` ask for Vietnamese titles and hooks). Say it near the CTA. No English date promised. |
| "It's v0.2. Is it mature?" | No. Pipeline tested with fake data and run for real and recorded once (2026-11-04). Hooks verified with real agents (section 11). Ranking not yet checked on sessions from other domains (PRD §9 DM.9, board E4). Updates through 1.x are included in the price. |
| "I use Codex / pi / omp / Antigravity, not Claude Code." | All supported in v0.2.0. You still need a logged-in `claude` CLI. Antigravity hooks verified on Linux only; Windows pending (issue #2). `momentry scan --codex|--pi|--omp|--agy` harvests by hand (CHANGELOG 0.2.0, installation.md). |
| "What if it doesn't work for me?" | `{{REFUND_POLICY}}` (not decided; do not promise a window). `doctor` covers setup failures. |

## 8. Switching dynamics

- **Push:** another week with nothing to post; the sense a good story happened and is gone.
- **Pull:** a ranked list of real moments from your own week, already in your repo, with numbers in them; pay once.
- **Habit:** "I'll just remember." "I'll keep a devlog." "I'll write a script one weekend."
- **Anxiety:** paying for a v0.2 tool; closed-source hooks in agent config; per-session model cost; transcript to Anthropic; Vietnamese output. Answer each near the CTA or in Pricing and FAQ.

## 9. Customer language

**Use:** creator (the only audience word), session, transcript, hook, moment, story, box, ranked, build in public, devlog, weekly report, `/bip`, privacy gate, block list, quarantine, markdown, frontmatter, license key, lifetime, one-time.

**Avoid:** "AI-powered insights", "content engine", "supercharge", "unlock", "seamless", "never miss a moment", "writes your posts", "free", "open source", "public domain", "read the source", "audited", "secure" (unqualified), "subscription".

**Glossary:**

- **Story / moment:** one markdown file in the box.
- **Box:** the folder of stories in your repo (default `docs/storytelling-material`).
- **Hotspot:** a transcript spot flagged by a script detector or by `/bip`.
- **Harvest:** the background pass that reads a transcript window and writes stories.
- **Hook / tension / stakes / strength:** ranking fields. Tension values: `nho_ma_to` tiny cause, big effect; `giup_ma_hai` done to help, made it worse; `tuong_ma_hoa_ra` everyone thought X, it was Y; `hop_ma_tan` combined good parts, got a bad result; `cam_ma_van_lot` blocked it, it still got through; `it_ma_nhieu` spent little, got a lot; `khac` other; `none` (prompts/hook-tension.md).

## 10. Brand voice

| Attribute | Means | Doesn't mean | Example line |
|---|---|---|---|
| Plain | Short sentences, concrete nouns, the command and the file | Terse to the point of jargon | "Writes one markdown file per moment." |
| Dev to dev | Assumes the reader knows what a hook is | Insider jokes | "Hooks exit right away, print nothing and start the harvest in the background." |
| Honest about limits | States cost, Vietnamese output, v0.2, transcript to Anthropic | Apologetic | "Stories come out in Vietnamese for now." |
| A little sharp | One punchy line per page (the lead line) | Hype | "You're not short of ideas. You forgot what you did." |

**Tone by context:** sales page plain and specific; pricing direct about what is and isn't included; errors and FAQ factual.

## 11. Proof points (only these)

| Proof | Source |
|---|---|
| Recorded real run (2026-11-04): 28/28 hotspots answered, 7/7 reference stories found, 7 of 8 human-labelled stories in the top half of 38, 1.01 USD, 246 s | docs/experiments/2026-11-04-dm-real-run |
| About 1 USD per ~150k-token session | README quick start |
| Hooks verified with real agents: Claude Code, Codex, pi, omp on Linux and Windows; Antigravity on Linux (Windows pending, issue #2) | README status, installation.md |
| Windows CI runner (`windows-2025`, 2026-11-04): Claude Code fires hooks at start and end and `harvest` reads the transcript; Codex v0.166, pi 1.5.0, omp 18.16 fire at session start | installation.md "Hook trên Windows" |
| Install, update, uninstall tested on Linux, macOS, Windows in CI | .github/workflows/ci.yml header |
| 8 real stories in `docs/sample/` (Vietnamese; translate and label) | repo |

**Conflict to resolve (not on the page):** README's status line says "8/8 human-labelled stories, 0.95 USD" from an earlier unrecorded run. The recorded run says 7/8 in the top half and 1.01 USD, and marks DM.5 ranking "not passed". The page uses the recorded numbers. README should be updated (E8/E10).

**Do not use:** testimonials, user counts, stars, logos, "AUC 0.93" (PRD says optimistic), "verified on macOS hooks" (not recorded), CIS (internal framing).

**Declined claims and their unlock:**

- "Saves you X hours a week": needs first-buyer usage data (board E5 metrics).
- "Works in English": needs English prompts shipped.
- Testimonials: needs first buyers' written permission.

## 12. Goals

- **Business goal:** first paying A1 buyers; go-on signal is "people pay, and ask for post drafts" (audiences.md).
- **Conversion action:** Buy (Lemon Squeezy checkout, `{{CHECKOUT_URL}}`).
- **Secondary action:** read a real story file (translated sample on the page).
- **Current metrics:** none (page not hosted, board E12).

## 13. Paid ads

Not running ads.

## 14. Learnings

| Date | Learning | Evidence | Applies to | Status |
|---|---|---|---|---|
| 2026-11-04 | Lead with the forgetting, not the mechanism: "You're not short of ideas. You forgot what you did." | Author's call after reviewing v1; no test yet | Hero, posts | watch |
| 2026-11-04 | v1's section skeleton works; v1 read as boring | Author review of site-v1 | Landing page | watch |
| 2026-11-04 | Sell once, not monthly: A1 already pays Anthropic per session, so a subscription reads as paying twice | Sales chat, audiences.md | Pricing | active (decision) |
