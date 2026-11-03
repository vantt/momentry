# momentry: product marketing context

Document version: 1.0 (2026-11-03). Drafted from the repo (README.md, README.vi.md, docs/prd.md §1–5, §6.4, §6.6, §6.7, docs/installation.md, docs/sample/, CHANGELOG.md, LICENSE). Every claim below points to its source. If a later doc contradicts this file, the doc wins.

Framework: coreyhaines31/marketingskills `product-marketing` (sections 1–11) and `copywriting` (three-question gate, no AI tells, claims must be supportable).

---

## 1. Product overview

**One line:** momentry picks build-in-public story material out of your Claude Code and Codex sessions: one markdown file per moment, ranked by hook, tension and stakes. (README tagline)

**What it does:** After a coding-agent session ends (or compacts), a background hook reads the transcript. A cheap model (Haiku) harvests every moment that could be told: a number that moved, a surprising root cause, a decision that got reversed, an approach outsiders would want to learn. Sonnet scores each one for hook, tension, strength and stakes. A privacy check runs on every story before it is written into the repo. `momentry list --rank` puts the strongest ones on top. (PRD §1, §5.1)

**Division of labour (PRD §1):** the machine picks and ranks. You choose and write. momentry does not write blog posts, outlines or drafts (PRD §3.2: out of scope for v2).

**Category / shelf:** CLI for developers. Closest search terms: "build in public", "dev log", "Claude Code hooks", "weekly report from git/AI sessions". There is no established category name; describe it by job ("story notes from your agent sessions"), not by a coined category.

**Type:** local CLI. Node ≥ 20 `.mjs`, no npm dependencies (PRD §4.9). Installs with a one-line script.

**Business model:** free. Released into the public domain under the Unlicense (LICENSE: "free and unencumbered software released into the public domain"). Note: the brief said "MIT/whatever LICENSE says". It is the Unlicense, not MIT. Use "public domain (Unlicense)" on the page.

**Running cost to the user:** model calls go through the user's own logged-in `claude` CLI. About 1 USD per session of roughly 150k tokens (README). PRD §5.10 breaks it down: about 0.9–1.1 USD per window with default settings; the "outsider" step is about 0.65 of that and can be turned off (`outsider.enabled = false`).

**Version:** 0.1.0, released 2026-11-03 (CHANGELOG). pi, omp, Antigravity support is in Unreleased.

## 2. Target audience (ICP)

**Primary:** solo developers and indie hackers who use Claude Code or Codex every day and who, at least weekly, have to tell someone what they did:

- people who **build in public** (X/Bluesky/LinkedIn threads, devlogs),
- people who **write technical blog posts** about their projects,
- people who **write weekly reports** (to a client, a manager, a cohort, a newsletter).

PRD §2 defines the user as "the person working alone" who works normally with Claude Code or Codex, sometimes types `/bip`, and opens the box when it is time to write. The *reader* of each story is frozen in the prompt as "a solo dev who uses AI daily and doesn't know the session's domain" (PRD §2). That is also a good description of who reads the posts our ICP writes.

**Fit signals:** works in git repos; already comfortable running a CLI and approving hooks; has a `claude` login (required even for Codex-only users, because momentry calls `claude -p`); posts or reports regularly but runs out of material or memory.

**Anti-personas (who should not install today):**

- Teams wanting a shared, cross-repo story feed. One box per repo; cross-repo is out of scope (PRD §3.2).
- People who want finished posts. momentry stops at ranked notes.
- People who can't send transcripts to Anthropic's API (via `claude -p`). The privacy gate protects the repo, not the model call.
- People who need English CLI output today. The CLI prints Vietnamese (README).
- People without a `claude` CLI login.

## 3. Jobs to be done

1. **"When I sit down to write this week's post or report, help me remember what actually happened, so I don't publish something generic."**
2. **"While I'm deep in a session, let me flag a moment in two seconds and get back to work."** (`/bip`)
3. **"Keep the raw material in a form I can grep, link and commit, so a small story today can join a longer thread later."** (markdown files in the repo, `links`, `threads`; "capture a lot, link a lot, filter last", PRD §4.1)
4. **"Don't let me leak a client name, a private note title or a real user query when I share this."** (privacy gate, PRD §4.7)

## 4. Problems and pain points (in their words)

Paraphrased from the README and PRD §1. These are the product's own words, not customer interviews. `[NEED: verbatim customer quotes]` from real users to replace or confirm these.

- "The best thing that happened this week happened mid-session, in chat with the agent, and I forgot it by the end of the session." (PRD §1: "Hết phiên là quên.")
- "The transcript is long and nobody reads it again." (PRD §1)
- "Friday comes and I'm trying to remember what was worth telling." (README headline)
- "The things that would make a good post feel normal to me. I don't notice them." (PRD §1 goal: "including stories the person thinks are ordinary"; the curse-of-knowledge point in PRD §5.2 step 3)
- "I'm scared a private name ends up in something I publish." (sample story `lo-rieng-tu-trong-commit`: a sub-agent leaked a private query through a test fixture)

**Cost of the pain:** generic posts ("shipped X this week"), skipped weeks, hours scrolling transcripts, or leaked private data.

## 5. Current alternatives

| Alternative | How it falls short |
|---|---|
| Memory | Gone by the end of the session (PRD §1). Biased toward what felt hard, not what an outsider finds interesting. |
| Scrolling old transcripts | Long JSONL, hard to read, nobody does it (PRD §1). |
| Manual notes / a "devlog.md" you append to | Needs you to notice the moment and stop working. Works on good days only. momentry keeps this path as `/bip`. |
| Asking the agent to "remember to log interesting things" (an AGENTS.md rule) | The PRD calls this an add-on, not something to rely on (PRD §2, DB 1). It also costs tokens and attention inside the session. |
| `git log` | Shows what changed, not why it was surprising. Root causes, reversed decisions and numbers live in the chat. |
| Nothing | The most common one. Weeks go by unposted. |

## 6. Differentiation

1. **Reads the session you already had.** No change to how you work. Hooks run after the session (`SessionEnd`, `PreCompact`, `SessionStart`), in the background, exit 0 immediately, print nothing; target under 100 ms (PRD §4.8, §6.4).
2. **Checks every hotspot instead of skimming.** Four plain script detectors (non-zero exit, before/after numbers, git reversals, writes to agent config) plus `/bip` mark the spots to look at. The harvest must answer each one, and a script checks the count (PRD §5.3, §5.5). Real run: 28/28 hotspots answered.
3. **Ranks by what makes a story, not by recency.** Hook (< 15 words), tension type, strength 0–3, stakes 0–3 against the session's main goal. Ranking only reorders; it never hides a story (PRD §5.9).
4. **Privacy is a gate.** Every field, the filename slug and every appended line is checked against your block list (exact, accent-stripped and Telex forms) before anything is written to the repo. A violation goes to quarantine outside the repo. No block list means nothing goes in the repo (PRD §4.7, §6.7).
5. **Plain markdown in your repo.** One file per moment, YAML frontmatter, a `status` you change by hand (`raw`, `picked`, `drafted`, `published`, `dropped`). Nothing is deleted (README).
6. **Free, public domain, no npm dependencies.**

## 7. Objections and answers

| Objection | Answer (true, from repo) |
|---|---|
| "What does it cost me?" | The tool is free. Model calls run through your own `claude` CLI: about 1 USD for a session of roughly 150k tokens. The real run cost 0.95 USD. Turning off the outsider step (`outsider.enabled = false`) removes the biggest piece, about 0.65 USD (PRD §5.10). |
| "Will it slow my sessions?" | No. Hooks exit 0 right away, print nothing and spawn the harvest in the background (PRD §6.4). Model calls are never made inside the session (PRD §4.2). |
| "Will it leak private stuff into my repo?" | Not without your block list. `momentry init` asks you to declare names (`momentry config privacy-add "<name>"`). Stories that match go to `~/.cache/momentry/quarantine/` (outside the repo, mode 0700). With no block list, stories go to quarantine, not the repo. `momentry check --staged` works as a pre-commit hook. |
| "Does my transcript leave my machine?" | Yes, the same way your session did. momentry sends the reduced transcript to Anthropic through your `claude -p` CLI call, isolated from your settings, tools and MCP (PRD §4.10). The privacy gate controls what is written to the repo. Be explicit about this on the page. |
| "I use Codex, not Claude Code." | Codex transcripts and hooks are supported. You still need a logged-in `claude` CLI, since that's what reads the sessions. Codex hooks: see verification status in section 11. |
| "The output is in Vietnamese?" | Yes, today. CLI messages and docs under `docs/` are Vietnamese (README). The stories are Vietnamese too: the prompts in `prompts/` are Vietnamese and ask for Vietnamese titles and hooks (`cluster.md`, `hook-tension.md`). Tension labels are Vietnamese slugs (`nho_ma_to` = "tiny cause, big effect"). Say so up front, near the CTA. |
| "Is it mature?" | No. v0.1.0. The pipeline is tested with fake data and has been run for real once. The PRD warns its ranking accuracy figures are optimistic until re-checked on new labelled sessions (PRD §5.9). |
| "Will it mess up my Claude/Codex config?" | `init` backs up each file before editing, writes atomically, touches only momentry's own entries, and refuses broken JSON. `momentry uninstall` reverses it (PRD §6.4, README). |

## 8. Switching dynamics (JTBD four forces)

- **Push:** another week with nothing to post; the nagging sense that a good story happened and is gone.
- **Pull:** a ranked list of real moments from your own week, already in your repo, with numbers in them.
- **Habit:** "I'll just remember." "I'll write notes." Both feel free.
- **Anxiety:** cost per session, privacy, hooks in my agent config, a v0.1 tool, Vietnamese output. The page must answer each one plainly near the CTA.

## 9. Customer language

**Use:** session, transcript, hook, moment, story, box (the story box), ranked, build in public, devlog, weekly report, `/bip`, privacy gate, block list, quarantine, markdown, frontmatter.

**Avoid:** "AI-powered insights", "content engine", "supercharge", "unlock", "seamless", "revolutionary", "never miss a moment" (we can't promise that), "writes your posts" (it doesn't).

**Glossary:**

- **Story / moment:** one markdown file in the box.
- **Box:** the folder of stories in your repo.
- **Hotspot:** a transcript spot flagged by a script detector or by `/bip`.
- **Harvest:** the background pass that reads a transcript window and writes stories.
- **Hook / tension / stakes / strength:** ranking fields. Hook is the one-line opener (under 15 words). Tension is the kind of irony, one of: `nho_ma_to` tiny cause, big effect; `giup_ma_hai` done to help, made it worse; `tuong_ma_hoa_ra` everyone thought X, it was Y; `hop_ma_tan` combined good parts, got a bad result; `cam_ma_van_lot` blocked it, it still got through; `it_ma_nhieu` spent little, got a lot; `khac` other; `none` (prompts/hook-tension.md). Strength 0–3 is how hard the tension pulls. Stakes 0–3 is how much it mattered to the session's main goal.

## 10. Brand voice

- **Plain.** Short sentences, concrete nouns. "Writes one markdown file per moment." Not: "transforms your workflow".
- **Developer to developer.** Show the command. Show the file. Assume the reader knows what a hook is.
- **Honest about limits.** State the status line, the Vietnamese output, the cost, the transcript going to the API. The product's own docs do this (PRD marks every untested part), and the page should match.

## 11. Proof points (only these)

| Proof | Source |
|---|---|
| Real run: 28/28 hotspots answered, 8/8 human-labelled stories found, 0.95 USD | README status line |
| About 1 USD per ~150k-token session | README quick start |
| Pipeline tested with fake data (`node --test`, `--fake-llm`, `--dry-run`) | README status, PRD §3.1.8 |
| 8 real stories in `docs/sample/` (Vietnamese) | repo |
| Windows: verified on a real Windows CI runner (`windows-2025`, 2026-11-03): Claude Code fires its hooks at session start and end, and harvest reads the transcript; Codex v0.166 fires `SessionStart` | docs/installation.md |
| Codex: the README still says "the Codex hooks have not yet been verified on a real machine". The CHANGELOG (Unreleased) says the old snake_case hook keys were ignored by Codex, so Codex hooks never ran before the fix. Safe page wording: "Codex: hooks fixed in Unreleased; `SessionStart` verified firing on a Windows CI runner. A full harvest triggered by a Codex hook has not been verified yet. `momentry scan --codex` works as a fallback." | README, CHANGELOG, installation.md |
| pi, omp verified on Linux; Antigravity not verified (needs login, issue #1). All three are Unreleased. | installation.md, CHANGELOG |

**Do not use:** star counts, user counts, testimonials, logos, "AUC 0.93" (the PRD itself says that figure is optimistic and unconfirmed).

## 12. Goal of the page

One action: run the install one-liner. Secondary: open the GitHub repo.
