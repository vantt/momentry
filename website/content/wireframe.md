# momentry landing page: wireframe

One page. Section numbers match `copy.md`. Desktop is about 1120px content width; mobile is 360–420px with a 16px side gutter. Code blocks never wrap: on mobile they scroll sideways inside their own box, and the page itself never scrolls sideways.

Legend: `[[ CODE ]]` = monospace block with a Copy button · `[ Button ]` = button · `( link )` = text link · `{ TERMINAL }` = terminal-styled block (dark, prompt line, no Copy button).

CTA repeats: hero (1), how it works step 1 (3), final CTA (11), plus the sticky nav "Install" button that scrolls to the hero.

---

## Desktop

```text
+--------------------------------------------------------------------------------+
| NAV (sticky)                                                                   |
| momentry      How it works  Example  Privacy  Cost  FAQ  (GitHub)  [ Install ] |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 1. HERO                                         two columns, 50 / 50           |
|                                                                                |
|  Free CLI for Claude Code and Codex   |   { TERMINAL: list --rank }            |
|                                       |   $ momentry list --rank               |
|  Your agent sessions are full of      |   id ...      hook ...   tension ...   |
|  stories. momentry writes them down.  |   (first 4 rows of the demo,           |
|                                       |    rows type in one by one, once;      |
|  Subhead (2-3 lines)                  |    static if reduced motion)           |
|                                       |   caption: illustrative scores,        |
|  [macOS / Linux / WSL] [Windows]      |   hooks translated                     |
|  [[ curl -fsSL ...install.sh | sh ]]  |                                        |
|                                       |                                        |
|  [ View on GitHub ]                   |                                        |
|  small: Unlicense · Node 20+ · git ·  |                                        |
|  claude CLI · output in Vietnamese    |                                        |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 2. PAIN                                         one column, max 680px text     |
|   H2 Stop trying to remember what was worth telling this week.                 |
|   3 short paragraphs                                                           |
|   +------------------+ +------------------+ +------------------+               |
|   | Memory           | | Scrolling        | | A devlog file    |   3 cards     |
|   +------------------+ +------------------+ +------------------+               |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 3. HOW IT WORKS  (#how)                         3 columns, numbered            |
|  +--------------------+ +--------------------+ +--------------------+          |
|  | 1 Install          | | 2 Turn it on       | | 3 Keep working     |          |
|  | 1-2 lines          | | 2-3 lines          | | 1-2 lines          |          |
|  | [[ curl ... | sh ]]| | [[ momentry init   | | [[ momentry list   |          |
|  |  (CTA repeat)      | |    privacy-add ]]  | |    --rank ]]       |          |
|  +--------------------+ +--------------------+ +--------------------+          |
|  small: Want results now? momentry scan --max-sessions 1                       |
|                                                                                |
|  { TERMINAL: full 7-row list --rank demo, full width }                         |
|  caption (required): real layout, illustrative scores, hooks translated        |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 4. WHAT YOU GET  (#example)                     60 / 40                        |
|                                                                                |
|  H2 One markdown file per moment                                               |
|  2-line intro                                                                  |
|  label: A real story from the author's box,  |  Side note:                     |
|  translated from Vietnamese                  |  "Harvested stories also carry  |
|  +-----------------------------------------+ |   ranking fields"               |
|  | tab: 2026-11-02-mot-ky-tu-unicode.md    | |  [[ yaml: hook, tension,        |
|  | ---                                     | |     strength, stakes ... ]]     |
|  | date / status / signals / source ...    | |  caption: values from the spec  |
|  | ---                                     | |  example, not a real run        |
|  | # One way of writing Unicode cut ...    | |                                 |
|  | Context / What happened / Lesson /      | |  status chips:                  |
|  | Artefact                                | |  raw > picked > drafted >       |
|  +-----------------------------------------+ |  published · dropped            |
|  (file block: no Copy button, read-only)     |                                 |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 5. RANKING                                      3 columns                      |
|  H2 Ranked by what makes a story worth reading                                 |
|  +-------------+ +-------------+ +-------------+                               |
|  | Hook        | | Tension     | | Stakes      |                               |
|  +-------------+ +-------------+ +-------------+                               |
|  small print: sort order line                                                  |
|  optional paragraph: how hotspots are found                                    |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 6. PRIVACY  (#privacy)                          50 / 50                        |
|  H2 Private names stay out of your repo  |  [[ momentry config privacy-add     |
|  2 paragraphs                            |     "Jane Doe" "secret-project" ]]  |
|                                          |  flow diagram (simple boxes):       |
|                                          |  story -> check -> box (repo)       |
|                                          |                \-> quarantine       |
|                                          |                    (~/.cache)       |
|  +--------------------------------------------------------------------------+  |
|  | Honesty line (bordered note): transcript is sent to Claude via your CLI  |  |
|  +--------------------------------------------------------------------------+  |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 7. /bip                                         50 / 50                        |
|  H2 Saw something worth telling? Type /bip. |  { TERMINAL: agent prompt line   |
|  2 short paragraphs                         |    /bip p95 went from 800ms ... }|
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 8. COST AND REQUIREMENTS  (#cost)               2 columns + strip              |
|  H2 Free tool. You pay for the model calls.                                    |
|  +------------------------------+ +------------------------------+             |
|  | Cost (3 bullets)             | | Requirements (4 bullets)     |             |
|  +------------------------------+ +------------------------------+             |
|  strip: Hooks don't slow you down (1-2 lines)                                  |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 9. WHERE IT STANDS                              one column, muted panel        |
|  H2 Where it stands                                                            |
|  bullet list (all 8 lines; numbers line in bold)                               |
|  ( Full spec and open questions: docs/prd.md )                                 |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 10. FAQ  (#faq)                                 one column, 8 accordions       |
|  > Does it write my blog posts?                                                |
|  > Will it slow down my sessions?                                              |
|  > ...                                                                         |
|  (first item open by default; all text present in HTML for search/no-JS)      |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 11. FINAL CTA                                   centered, max 720px            |
|  H2 Try it on your last session                                                |
|  1 line                                                                        |
|  [macOS / Linux / WSL] [Windows]                                               |
|  [[ curl ... | sh ]]                   (CTA repeat)                            |
|  [[ momentry init / scan --max-sessions 1 / list --rank ]]                     |
|  [ Read the source on GitHub ]                                                 |
|  small: Free, public domain. Uninstall any time.                               |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| FOOTER   momentry · Unlicense · GitHub · CLI reference · Changelog · Issues    |
+--------------------------------------------------------------------------------+
```

---

## Mobile

Everything stacks in one column in the same order. Changes from desktop:

```text
+--------------------------+
| NAV (sticky, 56px)       |
| momentry   [Install] [=] |   [=] opens a sheet:
+--------------------------+   How it works / Example / Privacy /
                               Cost / FAQ / GitHub
+--------------------------+
| 1. HERO                  |
| eyebrow                  |
| H1 (2-4 lines)           |
| subhead                  |
| [macOS/Linux] [Windows]  |   toggle full width
| [[ curl ... | sh  ]] >>  |   scrolls sideways inside box;
|            [ Copy ]      |   Copy button always visible (right edge)
| [ View on GitHub ]       |   full-width secondary button
| small requirements line  |
|                          |
| { TERMINAL demo }        |   moved BELOW the CTA; show 4 rows,
|  id + hook columns only  |   only id/hook/tension columns fit,
|  caption                 |   block scrolls sideways for the rest
+--------------------------+
| 2. PAIN                  |
| text, then 3 cards       |   cards stack
+--------------------------+
| 3. HOW IT WORKS          |
| 1 Install  [[ code ]]    |   steps stack, number on the left
| 2 Turn on  [[ code ]]    |
| 3 Keep     [[ code ]]    |
| full demo omitted        |   (hero already showed it)
+--------------------------+
| 4. WHAT YOU GET          |
| label                    |
| file block (scrolls >>)  |   lines wrap at 72 chars in the
| side note + yaml below   |   source, so it fits ~360px at 13px
+--------------------------+
| 5. RANKING  3 stacked    |
+--------------------------+
| 6. PRIVACY               |
| text, code, diagram      |   diagram turns vertical
| honesty note             |
+--------------------------+
| 7. /bip  text, terminal  |
+--------------------------+
| 8. COST  Cost, Reqs      |   stacked
+--------------------------+
| 9. WHERE IT STANDS       |
+--------------------------+
| 10. FAQ accordions       |
+--------------------------+
| 11. FINAL CTA            |
| toggle, [[curl]], [[3]]  |
| [ Read the source ... ]  |
+--------------------------+
| FOOTER (links wrap)      |
| [ Top ]                  |
+--------------------------+
```

---

## Behaviour notes

- **OS toggle:** default by `navigator.platform`/userAgent (Windows shows PowerShell first, everything else shows `curl`). The hero toggle and final-CTA toggle stay in sync.
- **Copy button:** copies the exact one-liner, label `Copy` → `Copied` for 2 s. If the clipboard API fails, label becomes `Select and copy` and the command text is selected.
- **Terminal demo:** plain text in the HTML (searchable, copyable). Optional one-time type-in animation; none under `prefers-reduced-motion`. Caption is always visible.
- **Anchors:** `#how`, `#example`, `#privacy`, `#cost`, `#faq`. Nav "Install" scrolls to the hero install block and focuses its Copy button.
- **No social-proof strip.** There are no testimonials, user counts or stars to show. The proof is the status line in section 9 and the real example in section 4.
- **Dark mode:** the terminal and code blocks are dark in both themes; page background follows the system theme.
