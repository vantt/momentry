# momentry landing page: final copy

English copy, section by section, ready to paste. Facts come from `product-marketing.md` (same folder), which cites the repo for each one. Section order and layout: `wireframe.md`.

Diagnosis (copywriting skill): situation A with a strong source voice. The README is already plain and specific, so the page reuses its vocabulary (session, transcript, moment, box, hook, tension, stakes) and its honest status line.

---

## Meta

- **Page title:** momentry: build-in-public stories from your Claude Code sessions
- **Meta description:** A free CLI that reads your Claude Code and Codex transcripts after each session, writes every moment worth telling as a markdown file in your repo, and ranks them by hook, tension and stakes.
- **OG title:** Your agent sessions are full of stories. momentry writes them down.

---

## Nav

Logo/wordmark: `momentry`

Links: How it works · Example · Privacy · Cost · FAQ · GitHub (icon + "GitHub")

Right side button: **Install** (scrolls to the hero install block)

---

## 1. Hero

**Eyebrow:** none (removed in v2; the lede and requirements line cover it)

**Headline (chosen):**

# Your agent sessions are full of stories. momentry writes them down.

**Subhead:**

momentry is a free CLI. After each Claude Code or Codex session, it reads the transcript and saves every moment worth telling as a markdown file in your repo. A number that moved. A root cause nobody suspected. A decision you reversed. Then it ranks them, so on Friday you open a list instead of a blank page.

**Primary CTA (install block):**

Label above the block: **Install (Linux, macOS, WSL)**

```sh
curl -fsSL https://github.com/vantt/momentry/releases/latest/download/install.sh | sh
```

Tab or toggle: **Windows (PowerShell)**

```powershell
irm https://github.com/vantt/momentry/releases/latest/download/install.ps1 | iex
```

Under the Windows block, small: The installer adds `%LOCALAPPDATA%\momentry\bin` to your PATH. Open a new terminal afterwards.

**Secondary CTA (text button):** Read the README on GitHub → `https://github.com/vantt/momentry`

**Line under CTAs (small):** Free, public domain (Unlicense). Needs Node 20+, git and a logged-in `claude` CLI. Harvesting costs about 1 USD per long session, billed through your own `claude`. Stories and CLI messages are in Vietnamese for now.

**Hero demo:** first four rows of `list --rank`, trimmed to hook / tension / stakes. Caption: Real output format from the author's repo, trimmed to three columns. Text translated from Vietnamese; scores illustrative.

### Headline alternates (rejected)

- **"Stop trying to remember what was worth telling this week."** (the README's own line). Strong pain, in the reader's words. Rejected for the hero because it doesn't say where the stories come from, so a first-time visitor can't tell what the tool is. Reused as the pain-section heading.
- **"Build-in-public material, harvested from your Claude Code and Codex sessions."** Clear category, passes the swap test. Rejected because it reads like a spec line: it names inputs and outputs but no moment the reader can picture. Kept as the meta/tagline style.

Why the chosen one: the reader can picture it (their own sessions, a file appearing), it is checkable (it does write files), and a generic "AI notes" tool could not write it word for word because it names the source and the action.

---

## 2. Pain

**Heading:** Stop trying to remember what was worth telling this week.

**Body:**

The best part of your week happened mid-session, in the chat with your agent. A benchmark jumped. A bug turned out to be one invisible character. You threw away an approach you'd spent a day on, and you had a good reason.

By the time the session ended, it was gone. The transcript is still on disk, thousands of lines of JSONL that nobody reads again.

So the weekly post says "shipped some fixes". The blog idea stays an idea. The report gets written from `git log`, which shows what changed but never why it was interesting.

**Three small cards (optional, under the body):**

- **Memory** keeps what felt hard. Readers want what was surprising.
- **Scrolling transcripts** takes longer than the work did.
- **A devlog file** only works on days you remember to stop and write.

---

## 3. How it works

**Heading:** Three commands, then it runs on its own

**Step 1: Install**

One line. It checks the sha256, tries the new version before switching to it, and puts `momentry` on your PATH. Use the command at the top of the page (link to #install).

**Step 2: Turn it on for a repo**

`init` creates `.momentry.json` and the story box, installs the hooks and the `/bip` command (backing up each file first), and checks everything. If you haven't listed any private names yet, its check fails and tells you how to add them. Until you do, stories go to quarantine instead of your repo.

```sh
cd your-repo
momentry init
momentry config privacy-add "Client Name" "secret-project"
```

**Step 3: Keep working. Read the list when you want to write.**

Hooks harvest in the background after every session and before every compaction. When it's time to write, open the ranked list.

```sh
momentry list --rank
```

**/bip, folded into step 3:** Saw something worth telling? Type `/bip` and a short note. The agent saves two to four sentences to the box right away, through the same privacy check. Terminal line: `/bip p95 went from 800ms to 90ms after swapping the Map for an LRU`

**Small line under the steps:** Want results right now? `momentry scan --max-sessions 1 --quiet-minutes 0` harvests your latest session on demand. By default, `scan` skips sessions touched in the last 30 minutes, and `--quiet-minutes 0` turns that off.

**Terminal demo (beside or under the steps):**

```text
$ momentry list --rank
id                                     date        status  hook                                      tension         stakes  strength  hits
2026-11-02-mot-ky-tu-unicode           2026-11-02  raw     One Unicode form cut search scores 8x     nho_ma_to       3       3         1
2026-11-02-tu-dien-lam-te-hon          2026-11-02  raw     Adding an abbreviation dictionary made …  giup_ma_hai     3       3         1
2026-11-03-may-soan-nguoi-duyet        2026-11-03  raw     Machine drafts 51 test questions, human…  it_ma_nhieu     3       2         1
2026-11-02-hybrid-lan-at-y-nghia       2026-11-02  raw     Hybrid search buried the semantic hit a…  giup_ma_hai     2       2         1
2026-11-02-lo-rieng-tu-trong-commit    2026-11-02  raw     A sub-agent leaked private data through…  cam_ma_van_lot  2       2         1
2026-11-02-pkill-tu-ban-minh           2026-11-02  raw     The agent killed its own shell            khac            0       1         1
2026-11-03-hop-chua-sinh-ra-giua-chat  2026-11-03  raw     This story box was born mid-chat          none            1       0         1
```

**Caption under the full demo:** All seven stories from the same box. The two dimmed rows have no tension, so they sink to the bottom. (The "translated, scores illustrative" caption sits on the hero demo.)

---

## 4. What you get

**Heading:** One markdown file per moment

**Body:**

Each story lands in your repo as a plain markdown file with frontmatter. You can grep it, link it to other stories, and commit it. Nothing is deleted. You move a story along by editing its `status`: `raw`, `picked`, `drafted`, `published` or `dropped`.

**Label above the file (required):** A real story from the author's box, translated from Vietnamese.

**File tab:** `2026-11-02-mot-ky-tu-unicode.md`

```markdown
---
date: 2026-11-02
status: raw
signals: [surprising root cause]
source: chat Claude, V15, PR vantt/obsidian-hybrid-search#4
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

**Side note beside the file:**

Stories that momentry harvests also carry ranking fields in the frontmatter:

```yaml
hook: "Một ký tự Unicode làm điểm tìm kiếm tụt 8 lần"
tension: nho_ma_to      # tiny cause, big effect
strength: 3
stakes: 3
hit_by: [hotspot, harvest, outsider]
privacy: checked
```

Caption: Field values from the spec's example, not from a real run.

**Small line under the example:** `links` and `threads` let a small story today join a longer series later. That's why momentry keeps everything and filters last.

---

## 5. Ranking (v2: merged into section 4 as "Ranked by what makes a story worth reading"; the hotspot paragraph sits in a closed `Under the hood` details element)

**Heading:** Ranked by what makes a story worth reading

**Intro:** `list --rank` shows every story. It only changes the order. Three things push a story up:

- **Hook.** A one-line opener under 15 words, with a number or a concrete detail when there is one.
- **Tension.** The gap between what you expected and what happened. A tiny cause with a big effect. A fix that made things worse. A guard that something still slipped past. Stories with no real tension sink to the bottom. They stay in the list.
- **Stakes.** How much the moment mattered to what the session was actually about. momentry works out the session's main goal itself and scores each story 0 to 3 against it.

**Small print:** Stories with tension come first. Then they're sorted by stakes × strength, by how many harvest runs caught them, and by date.

**How it finds the moments (short paragraph, optional):** Before any model reads the transcript, four plain scripts mark hotspots: commands that failed, before/after numbers, git resets and reverts, and edits to agent config. Your `/bip` marks count too. The harvest has to give a verdict on every hotspot, and a script checks that none were skipped.

---

## 6. Privacy

**Heading:** Private names stay out of your repo

**Body:**

You list the names that must never reach the repo: people, clients, project codenames.

```sh
momentry config privacy-add "Jane Doe" "secret-project"
```

Every story is checked before it's written: every field, the filename, and every line appended to an older story. Matching also catches the name with accents stripped and typed in Telex, because that's how one leaked in the author's own repo, through a test fixture.

A story that matches goes to quarantine in `~/.cache/momentry/quarantine/`, outside the repo, where you can read it and decide. If you haven't set a block list yet, stories go to quarantine too. They don't go into the repo unchecked.

Run `momentry check --staged` as a git pre-commit hook for a last check.

**Honesty line (required, same section):** momentry sends the transcript to Anthropic's Claude through your own `claude -p`, with your settings, tools and MCP servers switched off for that call. For Claude Code sessions that is the provider that already saw it. For Codex and the other hosts it is a second provider. The block list controls what gets written into your repo, not what Claude reads.

---

## 7. `/bip` (v2: folded into step 3 of How it works; no separate section)

**Heading:** Saw something worth telling? Type `/bip`.

**Body:**

You'll notice some moments yourself. Type `/bip` and a short note in Claude Code or Codex. The agent writes two to four sentences about what just happened and saves it to the box right away, through the same privacy check. Then you keep working.

```text
/bip p95 went from 800ms to 90ms after swapping the Map for an LRU
```

In Claude Code, the `/bip` line also becomes a hotspot for the next harvest, so the full story gets written up with its context.

---

## 8. Cost and requirements

**Heading:** Free tool. You pay for the model calls.

**Two columns:**

**Cost**

- momentry is free and in the public domain (Unlicense).
- Harvesting runs through your own logged-in `claude` CLI. A session of about 150k tokens costs about 1 USD. The one real run so far cost 0.95 USD.
- The biggest piece is the "outsider" pass (about 0.65 USD per window), which rewrites a story from the angle of what others would want to learn. Turn it off with `outsider.enabled = false`.

**Requirements**

- Node 20 or newer
- git
- A logged-in `claude` CLI (Codex, pi, omp and Antigravity users need it too)
- Linux, macOS, WSL or Windows

**Hooks don't slow you down (small block):** The hooks exit right away, print nothing and start the harvest as a background process. No model is called inside your session. Hooks only run in repos where you ran `momentry init`.

**After the strip:** "Install it now" + the OS toggle and install one-liner with Copy.

---

## 9. Status and limitations

**Heading:** Where it stands

**Body (v0.2.0, four lines):**

- **Version 0.2.0**, released 2026-11-03. Hooks have run for real with Claude Code (Windows), Codex (Linux and Windows), and pi, omp and Antigravity (Linux).
- The harvest-and-score pipeline is tested with fake data and has been run for real once: **28/28 hotspots answered, 8/8 human-labelled stories found, 0.95 USD.**
- Not verified yet: pi, omp and Antigravity on Windows, and the ranking scores on sessions other than the ones they were designed on.
- **The CLI, the docs and the stories are in Vietnamese for now.** The English README covers install and use.

**Link line:** What changed in each release: [CHANGELOG on GitHub](https://github.com/vantt/momentry/blob/main/CHANGELOG.md).

---

## 10. FAQ

**Heading:** Questions

**Does it write my blog posts?**
No. It finds and ranks the material. You pick the stories and write the post. Outlines and drafts are out of scope for now.

**Will it slow down my Claude Code or Codex sessions?**
No. The hooks exit immediately and start the harvest in the background. No model call happens inside your session.

**What does a harvest cost?**
About 1 USD for a session of around 150k tokens, billed through your own `claude` CLI. Turning off the outsider pass cuts most of that.

**Does my transcript leave my machine?**
Yes. momentry sends the transcript to Anthropic's Claude through your own `claude -p`. For Claude Code sessions that is the provider that already saw it. For Codex and the other hosts it is a second provider. The block list controls what gets written into your repo, not what Claude reads.

**I only use Codex. Can I use it?**
Yes, but you still need a logged-in `claude` CLI, since that's what reads the sessions. Codex hooks work in v0.2.0 and have run for real on Linux and Windows. If a hook doesn't fire, `momentry scan --codex` harvests by hand.

**Does it work with pi, omp or Antigravity?**
Yes, since v0.2.0. `init` installs their hooks and `/bip` too, and `momentry scan --pi`, `--omp` or `--agy` harvests by hand. They have run for real on Linux, not yet on Windows.

**Why is the output in Vietnamese?**
momentry was built inside a Vietnamese-language project, so its CLI messages and prompts were written in Vietnamese, and the stories come out in Vietnamese too. That's the state today. The README is in English.

**What does it change on my machine?**
`init` adds hooks and a `/bip` command to your agent config, backs up each file first, and only touches its own entries. `momentry uninstall --dry-run` shows what removal would do; `momentry uninstall --yes` removes it and keeps your stories.

**Something isn't working. Now what?**
Run `momentry doctor`. Every failing check prints a command that fixes it. Hooks log to `~/.cache/momentry/hook.log`.

---

## 11. Final CTA

**Heading:** Try it on your last session

**Body:** Install, run `momentry init` in a repo, then harvest your most recent session.

```sh
curl -fsSL https://github.com/vantt/momentry/releases/latest/download/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://github.com/vantt/momentry/releases/latest/download/install.ps1 | iex
```

Then:

```sh
momentry init
momentry scan --max-sessions 1 --quiet-minutes 0
momentry list --rank
```

**Secondary CTA:** Read the source and docs on GitHub → `https://github.com/vantt/momentry`

**Under the CTA (small):** Free, public domain. Harvesting costs about 1 USD per long session, billed through your own `claude`. Uninstall any time with `momentry uninstall --yes`.

---

## Footer

momentry · Public domain (Unlicense) · [GitHub](https://github.com/vantt/momentry) · [CLI reference](https://github.com/vantt/momentry/blob/main/docs/cli-reference.md) · [Changelog](https://github.com/vantt/momentry/blob/main/CHANGELOG.md) · [Report an issue](https://github.com/vantt/momentry/issues)

---

## Microcopy

| Element | Text |
|---|---|
| Copy button, idle | Copy |
| Copy button, after click (revert after 2 s) | Copied |
| Copy button, clipboard blocked | Ctrl+C (text is selected; screen readers hear "Command selected. Press Ctrl+C or Cmd+C to copy.") |
| Copy button aria-label | Copy install command |
| OS toggle | macOS / Linux / WSL · Windows |
| Nav button | Install |
| Hero secondary | Read the README on GitHub |
| Final secondary | Read the source and docs on GitHub |
| Demo caption toggle (if the demo is animated) | Replay |
| Back to top (mobile) | Top |

---

## Notes for the team

- **License:** the brief said MIT. LICENSE is the Unlicense (public domain). The copy says "public domain (Unlicense)".
- **"Five minutes":** dropped in v2 (the default 30-minute quiet window made the promise unreliable).
- **Story language:** prompts in `prompts/` ask for Vietnamese titles and hooks. That is why the demo caption and status section say so.
- **Codex wording:** the README status line still says Codex hooks are unverified on a real machine. `docs/installation.md` (2026-11-03) records `SessionStart` firing on a Windows CI runner. The copy states both facts and claims nothing more.
- **The `/bip` example** (`p95 800ms → 90ms`) is the example from `docs/cli-reference.md` for `momentry add`. It is a usage example, not a real result.
- **AI-tell check done:** no contrast reveals, no negation lists outside the honesty lines, no em dashes in headings or buttons, no hype words.
