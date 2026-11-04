# momentry landing page v2: final copy

English copy, section by section, ready to paste. Version 2.1 (2026-11-04, CRO + QA fix round) replaces v1 (tag `site-v1`), which sold momentry as a free, public-domain CLI installed from GitHub. Facts come from [product-marketing.md](product-marketing.md) v2.0, which cites the repo for each one. Audience: A1 in [audiences.md](audiences.md). Layout: [wireframe.md](wireframe.md).

Diagnosis (copywriting skill): situation B. v1 has a real voice (plain, dev to dev, honest status lines) and a structure the author liked; the author found it boring. So: keep the vocabulary and the honesty, keep the skeleton, add selling sections, and put the one punchy moment (the lead line) in the hero.

CRO notes applied: one primary action (Buy) repeated at hero, pricing and final CTA; objections answered next to the price (running cost, closed source, Vietnamese, v0.2); no social proof invented, so the proof is the recorded run and a real story file.

---

## Variables (change here only)

| Token | Value | Status |
|---|---|---|
| `{{PRICE}}` | 29 USD | List price, decided 2026-11-04. Every price on the page uses this token. |
| `{{CHECKOUT_URL}}` | Lemon Squeezy checkout link | Not set up yet |
| `{{DOWNLOAD_BASE}}` | Base URL for binaries on Cloudflare R2 custom domain | Not set up yet. Do not guess the domain. |
| `{{REFUND_POLICY}}` | One-line refund/guarantee text | Not decided. Do not promise a window. |
| `{{EULA_URL}}` | License agreement page | EULA not written yet (board E10) |
| `{{SUPPORT_EMAIL}}` | Contact address for buyers | Not chosen yet |

---

## Meta

- **Page title:** momentry: story notes from your coding-agent sessions
- **Meta description:** momentry reads your Claude Code, Codex, pi, omp and Antigravity sessions after they end and writes every moment worth telling into your repo as a markdown file, ranked by hook, tension and stakes. One-time license, {{PRICE}}.
- **OG title:** You're not short of ideas. You forgot what you did.
- **OG description:** momentry writes the moments from your agent sessions into your repo, ranked, so Friday's post starts from a list.

---

## Nav

Wordmark: `momentry`

Links: How it works · Example · Privacy · Pricing · FAQ

Right-side button: **Buy · {{PRICE}}** (links to `{{CHECKOUT_URL}}`)

---

## 1. Hero

**Eyebrow:** For creators who work with AI agents

**Headline (chosen):**

# You're not short of ideas. You forgot what you did.

**Subhead:**

The best thing you did this week happened mid-session, in chat with your agent. momentry reads your Claude Code, Codex, pi, omp and Antigravity sessions after they end and writes each moment worth telling into your repo as a markdown file: a number that moved, a root cause nobody suspected, a decision you reversed. Then it ranks them, so on Friday you start from a list.

**Primary CTA (button):** Buy momentry · {{PRICE}} → `{{CHECKOUT_URL}}`

**Secondary CTA (text link):** Read a real story file → `#example`

**Line under CTAs (small):** One-time license, updates through 1.x included. You get your key and the install command by email. Runs through your own `claude` CLI: about 1 USD per 150k-token window. A session that compacts pays once per window. Needs Claude Code installed and logged in, even if you work in Codex, pi, omp or Antigravity. Stories and CLI messages are in Vietnamese for now.

**Hero demo (terminal, plain text):**

```text
$ momentry list --rank
hook                                                     tension          stakes
One way of writing Unicode cut search scores 8x          nho_ma_to        3
A machine drafted the test questions, a human reviewed   it_ma_nhieu      3
How bad is Vietnamese search in Obsidian? I measured it  tuong_ma_hoa_ra  3
Adding an abbreviation dictionary made search worse      giup_ma_hai      3
Hybrid search buried the semantic hit                    giup_ma_hai      2
```

**Tension legend (under the terminal):** `nho_ma_to` small cause, big effect · `it_ma_nhieu` little in, a lot out · `tuong_ma_hoa_ra` expected X, found Y · `giup_ma_hai` meant to help, made it worse

**Caption:** The top 5 of 38 stories from a recorded run on one of the author's sessions (2026-11-04). Hooks translated from Vietnamese. Tension and stakes reconstructed; the raw output of that run wasn't kept.

### Headline alternates (rejected)

- **"Your agent sessions are full of stories. momentry writes them down."** (v1 headline). Clear and checkable: it names the source and the action. Rejected because the author found v1 boring, and this line describes the mechanism while the lead line names the feeling the reader already has on Friday. Its content moved into the subhead.
- **"Friday's post, already in your repo."** Short and picturable. Rejected because it overpromises: momentry writes ranked notes, not the post, and a reader who buys expecting a draft will want a refund.

Why the chosen one: it is the line the author picked for every audience (audiences.md), the reader recognises it as their own situation, and it sets up the subhead's mechanism without a contrast trick. It fails the swap test alone (a generic note app could say it), so the subhead must carry the specifics: the five hosts, the file in the repo, the ranking.

---

## 2. Pain

**Heading:** Friday comes and you're trying to remember what was worth telling.

**Body:**

A benchmark jumped. A bug turned out to be one invisible character. You threw away a day's approach, for a good reason. All of it happened in the chat with your agent, and by the end of the session it was gone.

The transcript is still on disk: thousands of lines of JSONL nobody reads again.

So the weekly post says "shipped some fixes". The report gets written from `git log`, which shows what changed and never why it was interesting. And the things that would make a good post feel normal to you, because you were there.

**Three small cards:**

- **Memory** keeps what felt hard. Readers want what was surprising.
- **Scrolling transcripts** takes longer than the work did.
- **A devlog file** works on the days you remember to stop and write.

---

## 3. How it works

**Heading:** Buy once, turn it on per repo, keep working

**Step 1: Buy and install**

Your license key and the install command arrive by email. The installer checks the sha256, tries the new version before switching to it, and puts `momentry` on your PATH. Activate with your key.

```sh
curl -fsSL {{DOWNLOAD_BASE}}/install.sh | sh
```

Windows (PowerShell):

```powershell
irm {{DOWNLOAD_BASE}}/install.ps1 | iex
```

Small, under the block: The exact command arrives with your key.

**Step 2: Turn it on for a repo**

`init` creates the story box, installs the hooks and the `/bip` command for every agent it finds, in every profile, and backs up each file first. Then you list the names that must never reach the repo.

```sh
cd your-repo
momentry init
momentry config privacy-add "Client Name" "secret-project"
```

**Step 3: Keep working. Read the list when you write.**

Hooks harvest in the background after every session and before every compaction. When it's time to write:

```sh
momentry list --rank
```

**`/bip`, folded into step 3:** Saw something worth telling? Type `/bip` and a short note. The agent saves two to four sentences to the box right away, through the same privacy check.

```text
/bip p95 went from 800ms to 90ms after swapping the Map for an LRU
```

**Small line under the steps:** Want a result right now? `momentry scan --max-sessions 1 --quiet-minutes 0` harvests your latest session on demand.

---

## 4. What you get (#example)

**Heading:** One markdown file per moment, ranked

**Intro:** Each story is a plain markdown file in your repo. Grep it, link it, commit it. Nothing is deleted. You move a story along by editing its `status`: `raw`, `picked`, `drafted`, `published` or `dropped`.

**Label above the file (required):** A real story from the author's box. The first tab is translated for this page; momentry writes it in Vietnamese today, as in the second tab.

**Tabs on the file:** Translated for this page · What you get today (Vietnamese). The second tab shows the original Vietnamese of `docs/sample/2026-11-02-mot-ky-tu-unicode.md` (source line without the PR reference).

**File tab:** `2026-11-02-mot-ky-tu-unicode.md`

```markdown
---
date: 2026-11-02
status: raw
signals: [surprising root cause]
source: chat Claude, V15
links: [2026-11-02-do-tim-kiem-tieng-viet]
threads: [obsidian-hieu-tieng-viet]
---

# One way of writing Unicode cut search scores 8x

**Context:** The letter "ệ" can be stored two ways: as one character (NFC),
or as "e" plus combining marks (NFD). The human eye can't tell them apart.

**What happened:** The first measurement came out at nDCG 0.075, absurdly low.
The root cause: the search engine stored paths as NFD, the hand-written golden
set used NFC, so the string comparison never matched. Normalizing both to one
form brought the score back to 0.6.

**Lesson:** When a measurement is unusually bad, suspect the ruler before the
thing you're measuring. With Vietnamese text, suspect Unicode first.

**Artefact:** two strings that look identical but differ in bytes (build your
own example; don't use real note names).
```

**Ranking block (beside or under the file):**

**Sub-heading:** Ranked by what makes a story worth reading

- **Hook.** A one-line opener under 15 words, with a number when there is one.
- **Tension.** The gap between what you expected and what happened: a tiny cause with a big effect, a fix that made things worse, a guard something slipped past. Stories with no tension sink. They stay in the list.
- **Stakes.** How much the moment mattered to what the session was about. momentry works out the session's main goal and scores each story 0 to 3 against it.

**Proof line (bold, under the three):** Checked once against hand labels: on the session it was tuned on, 7 of the 8 stories the author had marked worth telling landed in the top half of 38.

**Under the hood (closed `details`):** Before any model reads the transcript, four plain scripts mark hotspots: failed commands, before/after numbers, git resets and reverts, and edits to agent config. Your `/bip` marks count too. The harvest must give a verdict on every hotspot, and a script checks none were skipped. Recorded run: 28 of 28 answered.

---

## 5. Privacy (#privacy)

**Heading:** Client names stay out of your repo

**Body:**

You list the names that must never reach the repo: people, clients, codenames.

```sh
momentry config privacy-add "Jane Doe" "secret-project"
```

Every story is checked before it's written: every field, the filename, and every line added to an older story. Matching also catches the name with accents stripped and typed in Telex, because that's how one leaked in the author's own repo, through a test fixture.

A story that matches goes to quarantine in momentry's cache folder (`momentry paths` shows it), outside the repo, where you read it and decide. With no block list set, stories go to quarantine too. Add `momentry check --staged` to your pre-commit hook for a last check.

**Honesty note (bordered, same section):** momentry sends the transcript to Anthropic through your own `claude -p`, with your settings, tools and MCP servers off for that call. For Claude Code sessions that is the provider that already saw it; for Codex and the other hosts it is a second one. Transcripts go to Anthropic only, through your own `claude -p`. momentry's own network calls are the license check and update downloads; they carry no session content. The block list controls what is written into your repo, not what Claude reads.

---

## 6. Why pay for this

**Heading:** You could write the script. This is the rest of it.

**Intro:** Piping one transcript to Claude takes an afternoon. Making it run after every session, on every agent you use, without leaking a name or breaking your config, took the rest.

**Six tiles:**

- **Five hosts, every profile.** Claude Code, Codex, pi, omp and Antigravity. `init` installs into every profile it finds (`~/.codex-*`, pi accounts, omp profiles, Antigravity homes) and `doctor` flags new ones.
- **Each host's quirks.** Codex silently ignores the wrong event-key case. On Windows, Claude Code runs hooks in Git Bash, Codex in PowerShell, Antigravity in `cmd`. momentry writes the command each one expects.
- **A privacy gate that knows Vietnamese typing.** Exact, accent-stripped and Telex matching on every field and filename, quarantine outside the repo, and `quarantine --release all` once you've fixed the list.
- **Windows and WSL.** A native PowerShell installer, no admin rights, correct `%APPDATA%` paths. WSL keeps its own config.
- **`doctor` and checked updates.** `doctor` checks Node, git, `claude`, config, hooks and install, and prints a command for every failure. `update` verifies the sha256, tries the new version first and keeps the old one if anything fails.
- **Ranking checked against hand labels.** Ranking checked once against hand labels: on the session it was tuned on, 7 of 8 landed in the top half. Not yet checked on other projects.

---

## 7. Pricing (#pricing)

**Heading:** Pay once. Run it on your own Claude account.

**Subhead:** Use it forever. Updates through 1.x included.

**Price card:**

- **momentry, lifetime license**
- **{{PRICE}}** one-time
- What you get:
  - The momentry CLI for Linux, macOS, WSL and Windows
  - Hooks and `/bip` for Claude Code, Codex, pi, omp and Antigravity
  - The privacy gate, quarantine and pre-commit check
  - Ranking by hook, tension and stakes
  - `doctor`, checked updates and clean uninstall
  - Updates for v0.x and 1.x
- Button: **Buy momentry · {{PRICE}}** → `{{CHECKOUT_URL}}`
- Under the button, a 3-step strip: 1. **Pay** (checkout by Lemon Squeezy) → 2. **Email** with key and install command → 3. `momentry init` in a repo
- Under the strip (small): License key and install command by email. {{REFUND_POLICY}}

**Running cost (beside the card):**

**Sub-heading:** What it costs to run

momentry calls models through your own logged-in `claude` CLI, so you pay Anthropic directly at their price. About 1 USD per 150k-token window. A session that compacts pays once per window. The recorded run cost 1.01 USD. The biggest piece is the outsider pass, about 0.65 USD, which rewrites a story from the angle of what others want to learn. Turn it off with `outsider.enabled = false`.

No subscription and no markup on tokens.

**Requirements (under running cost):**

- Node 20 or newer
- git
- A logged-in `claude` CLI (every host needs it)
- Linux, macOS, WSL or Windows

**Fit line (small, under requirements):** Stories and CLI messages are in Vietnamese for now. Not for you yet if you need English stories today, want finished posts, or can't send transcripts to Anthropic.

---

## 8. Where it stands

**Heading:** Version 0.2, honestly

- **Version 0.2.0**, released 2026-11-03.
- **Hooks run with the real agents:** Claude Code, Codex, pi and omp on Linux and Windows; Antigravity on Linux, Windows still to check.
- **The pipeline has been run for real and recorded:** 28/28 hotspots answered, 7 of 8 hand-labelled stories in the top half, 1.01 USD.
- **macOS:** install and tests run in CI; hooks not yet checked with real agents on a Mac.
- **Not checked yet:** the ranking on sessions from other kinds of projects.
- **Stories and CLI messages are in Vietnamese for now.**

---

## 9. FAQ (#faq)

**Heading:** Questions

**Why pay for what looks like a script?**
The part that sends one transcript to Claude is small. What you pay for is everything around it: hooks for five agents in every profile, the right command for each Windows shell, a privacy gate that catches Telex and accent-stripped names, quarantine, `doctor`, checked updates, and ranking checked once against hand labels.

**It's closed source. Can I trust hooks in my agent config?**
You can see every change before and after. `momentry hooks --print --claude` prints what it would add. `init` backs up each file, touches only momentry's own entries and refuses to edit broken JSON. Hooks fire in every session but do nothing outside repos where you ran `init`. `momentry uninstall --dry-run` lists what removal would undo; `uninstall --yes` removes it and keeps your stories.

**I already pay Anthropic. Why pay again?**
You pay Anthropic for the model calls, through the account you already have. The {{PRICE}} buys the tool, once. There's no momentry subscription and no markup on tokens.

**What does a harvest cost?**
About 1 USD per 150k-token window, billed by Anthropic through your own `claude`. A session that compacts pays once per window. Turning off the outsider pass cuts about 0.65 USD of that.

**Is it billed per token if I'm on a Pro or Max plan?**
`claude -p` uses whatever your `claude` login uses. On a subscription, harvests count toward your plan's usage limits instead of costing dollars.

**Does my transcript leave my machine?**
Yes, to Anthropic, through your own `claude -p`. For Claude Code sessions that's the provider that already saw it; for other hosts it's a second one. Transcripts go to Anthropic only, through your own `claude -p`. momentry's own network calls are the license check and update downloads; they carry no session content. The block list controls what is written into your repo.

**Does it write my posts?**
No. It finds and ranks the material. You pick the stories and write.

**Will it slow down my sessions?**
No. Hooks exit right away and start the harvest in the background. No model call happens inside your session.

**Why is the output in Vietnamese?**
momentry was built inside a Vietnamese-language project, and its prompts ask for Vietnamese titles and hooks. That's the state today.

**I use Codex, pi, omp or Antigravity. Does it work?**
Yes. `init` installs their hooks and `/bip`. You still need a logged-in `claude` CLI, since that's what reads the sessions. Antigravity hooks have run on Linux; Windows is not checked yet. If a hook doesn't fire, `momentry scan --codex` (or `--pi`, `--omp`, `--agy`) harvests by hand.

**How do I get it after paying?**
You get a license key and the install command by email. Run the command, activate with your key, then `momentry init` in a repo.

**What updates are included?**
Every release in v0.x and 1.x. `momentry update` checks for a new version and installs it.

**What if it doesn't work for me?**
Run `momentry doctor` first: every failing check prints the command that fixes it. {{REFUND_POLICY}}

**How do I remove it?**
`momentry uninstall --yes` removes the hooks, `/bip` and the install, and keeps your stories and config.

---

## 10. Final CTA

**Heading:** Get last week back.

**Body:** Buy once and run `momentry init` in a repo. Once you've added your block list, your next session ends with stories in the box.

**Button:** Buy momentry · {{PRICE}} → `{{CHECKOUT_URL}}`

**Secondary (text link):** Read a real story file first → `#example`

**Under the CTA (small):** One-time license, updates through 1.x. Model calls about 1 USD per 150k-token window, through your own `claude`; a session that compacts pays once per window. Stories and CLI messages are in Vietnamese for now. {{REFUND_POLICY}}

---

## Footer

momentry · © 2026 · [License agreement]({{EULA_URL}}) · [Contact]({{SUPPORT_EMAIL}})

No GitHub link, no changelog link (the repo is private).

---

## Microcopy

| Element | Text |
|---|---|
| Nav button | Buy · {{PRICE}} |
| Primary button (hero, pricing, final) | Buy momentry · {{PRICE}} |
| Secondary link (hero) | Read a real story file |
| Secondary link (final) | Read a real story file first |
| Copy button on code blocks | Copy → Copied (2 s) |
| Copy button, clipboard blocked | Selected (text selected, press Ctrl+C) |
| Install block note | The exact command arrives with your key. |
| Back to top (mobile) | Top |

---

## Notes for the team

- **What changed from v1:** headline; CTA is Buy, not install; no GitHub, Unlicense, "free" or source links anywhere; new sections Why pay for this (6) and Pricing (7), which absorbs v1's Cost and requirements; Where it stands uses the recorded run (2026-11-04) instead of the README's earlier unrecorded numbers; FAQ adds paid and closed-source questions; footer drops GitHub links.
- **Numbers conflict:** README says "8/8 human-labelled stories, 0.95 USD". The only recorded run says 7 of 8 in the top half, 7/7 reference stories found, 1.01 USD. The page uses the recorded numbers. Update the README.
- **"No momentry server":** true for v0.2.0 (the only network code is `lib/update.mjs`). Re-check when the license-key check ships; if it calls home, keep "transcripts never reach us" (still true) and drop any broader claim.
- **Install command:** shown with `{{DOWNLOAD_BASE}}` and labelled as arriving with the key. Activation is described only as "activate with your key".
- **Hero demo:** stories and order are real (ranks 1–5 in the recorded run), hooks translated, tension and stakes values illustrative. The caption says so.
- **The `/bip` example** (`p95 800ms → 90ms`) is a usage example from `docs/cli-reference.md`, not a real result.
- **AI-tell check done:** no "it's not X, it's Y", no negation lists except the one real absence near the price ("No subscription and no markup on tokens"), no em dashes in headings or buttons, one punchy line (hero), no hype words.
