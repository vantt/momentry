# momentry landing page v2: wireframe

One page. Section numbers match [copy.md](copy.md) v2. Desktop is about 1120px content width; mobile is 360–420px with a 16px side gutter. Code blocks never wrap: on mobile they scroll sideways inside their own box; the page never scrolls sideways.

Legend: `[[ CODE ]]` = monospace block with a Copy button · `[ Button ]` = button · `[* Buy *]` = primary buy button (accent colour, the only filled button on the page) · `( link )` = text link · `{ TERMINAL }` = terminal-styled block (dark, no Copy button).

Primary action: Buy (`{{CHECKOUT_URL}}`). It appears in the sticky nav, the hero (1), the pricing card (7) and the final CTA (10). Secondary action: read a real story file (scrolls to `#example`).

## What changed from v1

| v1 (`site-v1`) | v2 |
|---|---|
| CTA: install one-liner from GitHub, OS toggle in hero | CTA: `[* Buy momentry · {{PRICE}} *]`. Install command moved to How it works step 1 with `{{DOWNLOAD_BASE}}`, labelled "arrives with your key" |
| Secondary CTA: GitHub README | Secondary: "Read a real story file" → `#example` |
| Nav: … Cost · FAQ · GitHub · [Install] | Nav: … Privacy · Pricing · FAQ · [* Buy · {{PRICE}} *] |
| Hero headline: "Your agent sessions are full of stories…" | Lead line: "You're not short of ideas. You forgot what you did." Set larger, two lines, more contrast; the hero carries the page's one bold moment |
| 4 What you get + 5 Ranking (merged) | Same, plus a bold proof line (7 of 8 in the top half) |
| 7 `/bip` section | Stays folded into How it works step 3 |
| 8 Cost and requirements | Replaced by **7 Pricing**: price card + running cost + requirements + fit line |
| none | New **6 Why pay for this**: six tiles |
| 9 Where it stands (README numbers) | 8 Where it stands (recorded-run numbers), shorter |
| FAQ: 9 items | FAQ: 13 items, paid and closed-source questions first |
| Footer: Unlicense, GitHub, changelog, issues | Footer: © · License agreement (`{{EULA_URL}}`) · Contact (`{{SUPPORT_EMAIL}}`) |

**Against "boring":** v1 was a long run of same-weight text sections. v2 changes rhythm, not skeleton: a bigger hero line, a dark full-bleed band for How it works, a tile grid for Why pay, a card for Pricing, and alternating light/tinted backgrounds so each section reads as a new beat. Motion stays minimal (the hero terminal types its five rows once; static under reduced motion).

---

## Desktop

```text
+--------------------------------------------------------------------------------+
| NAV (sticky)                                                                   |
| momentry     How it works  Example  Privacy  Pricing  FAQ   [* Buy · 29 USD *] |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 1. HERO                                         two columns, 55 / 45           |
|                                                                                |
|  eyebrow: For devs who build in public |  { TERMINAL: list --rank }            |
|           with coding agents           |  $ momentry list --rank               |
|                                        |  hook ...           tension  stakes   |
|  You're not short of ideas.            |  (5 rows, type in once)               |
|  You forgot what you did.     (H1, XL) |  caption: top 5 of 38 from a recorded |
|                                        |  run; hooks translated; values        |
|  Subhead (3-4 lines)                   |  illustrative                         |
|                                        |                                       |
|  [* Buy momentry · 29 USD *]           |                                       |
|  ( Read a real story file )            |                                       |
|  small: one-time license · key + install by email · ~1 USD/session via your    |
|  claude · stories in Vietnamese for now                                        |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 2. PAIN                               tinted background, one column 680px      |
|   H2 Friday comes and you're trying to remember what was worth telling.        |
|   3 short paragraphs                                                           |
|   +------------------+ +------------------+ +------------------+               |
|   | Memory           | | Scrolling        | | A devlog file    |   3 cards     |
|   +------------------+ +------------------+ +------------------+               |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 3. HOW IT WORKS (#how)                dark full-bleed band, 3 columns          |
|  H2 Buy once, turn it on per repo, keep working                                |
|  +----------------------+ +----------------------+ +----------------------+    |
|  | 1 Buy and install    | | 2 Turn it on         | | 3 Keep working       |    |
|  | key + command by     | | [[ momentry init     | | [[ momentry list     |    |
|  | email                | |    privacy-add ]]    | |    --rank ]]         |    |
|  | [mac/Linux/WSL][Win] | |                      | | { /bip p95 ... }     |    |
|  | [[ curl -fsSL        | |                      | |                      |    |
|  |  {{DOWNLOAD_BASE}}/… ]]| |                    | |                      |    |
|  | small: exact command | |                      | |                      |    |
|  | arrives with your key| |                      | |                      |    |
|  +----------------------+ +----------------------+ +----------------------+    |
|  small: Want a result now? momentry scan --max-sessions 1 --quiet-minutes 0    |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 4. WHAT YOU GET (#example)            60 / 40                                  |
|  H2 One markdown file per moment, ranked                                       |
|  2-line intro                                                                  |
|  label: A real story from the author's  |  Ranked by what makes a story        |
|  box. Translated from Vietnamese.       |  worth reading                      |
|  +-----------------------------------+  |  - Hook                             |
|  | tab: 2026-11-02-mot-ky-tu-unicode |  |  - Tension                          |
|  | --- frontmatter ---               |  |  - Stakes                           |
|  | # One way of writing Unicode ...  |  |  **7 of 8 hand-labelled stories in  |
|  | Context / What happened /         |  |  the top half of 38** (proof line)  |
|  | Lesson / Artefact                 |  |  status chips: raw > picked >       |
|  +-----------------------------------+  |  drafted > published · dropped      |
|  (read-only, no Copy button)            |  > Under the hood (details, closed) |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 5. PRIVACY (#privacy)                 tinted background, 50 / 50               |
|  H2 Client names stay out of your repo |  [[ momentry config privacy-add       |
|  2 paragraphs                          |     "Jane Doe" "secret-project" ]]    |
|                                        |  diagram: story -> check -> box (repo)|
|                                        |                      \-> quarantine   |
|  +--------------------------------------------------------------------------+  |
|  | Honesty note (bordered): transcript goes to Anthropic via your claude;   |  |
|  | no momentry server                                                       |  |
|  +--------------------------------------------------------------------------+  |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 6. WHY PAY FOR THIS                   3 x 2 tile grid                          |
|  H2 You could write the script. This is the rest of it.                        |
|  intro (2 lines)                                                               |
|  +----------------+ +----------------+ +----------------+                      |
|  | Five hosts,    | | Each host's    | | Privacy gate   |                      |
|  | every profile  | | quirks         | | (Telex)        |                      |
|  +----------------+ +----------------+ +----------------+                      |
|  +----------------+ +----------------+ +----------------+                      |
|  | Windows + WSL  | | doctor +       | | Ranking vs a   |                      |
|  |                | | checked update | | human          |                      |
|  +----------------+ +----------------+ +----------------+                      |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 7. PRICING (#pricing)                 card left 45, text right 55              |
|  H2 Pay once. Run it on your own Claude account.                               |
|  +------------------------------+  |  What it costs to run                     |
|  | momentry, lifetime license   |  |  1 paragraph (~1 USD/session, outsider)  |
|  | 29 USD  one-time   (XL)      |  |  "No subscription and no markup on       |
|  | ✓ CLI for 4 platforms        |  |   tokens."                                |
|  | ✓ 5 hosts + /bip             |  |                                           |
|  | ✓ privacy gate               |  |  Requirements (4 bullets)                 |
|  | ✓ ranking                    |  |                                           |
|  | ✓ doctor, updates, uninstall |  |  small fit line: not for you yet if ...   |
|  | ✓ updates v0.x and 1.x       |  |                                           |
|  | [* Buy momentry · 29 USD *]  |  |                                           |
|  | small: key + install by email|  |                                           |
|  | {{REFUND_POLICY}}            |  |                                           |
|  +------------------------------+  |                                           |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 8. WHERE IT STANDS                    muted panel, one column                  |
|  H2 Version 0.2, honestly                                                      |
|  5 bullets (recorded-run line bold)                                            |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 9. FAQ (#faq)                         one column, 13 accordions                |
|  > Why pay for what looks like a script?          (open by default)            |
|  > It's closed source. Can I trust hooks ...                                   |
|  > I already pay Anthropic ...                                                 |
|  > ...                                                                         |
|  (all text in HTML for search and no-JS)                                       |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| 10. FINAL CTA                         centered, max 720px, tinted              |
|  H2 Get last week back.                                                        |
|  1 line                                                                        |
|  [* Buy momentry · 29 USD *]                                                   |
|  ( Read a real story file first )                                              |
|  small: one-time · ~1 USD/session · Vietnamese for now · {{REFUND_POLICY}}     |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| FOOTER   momentry · © 2026 · License agreement · Contact                       |
+--------------------------------------------------------------------------------+
```

"29 USD" in the sketch is `{{PRICE}}` rendered; the HTML must read it from one variable.

---

## Mobile

One column, same order. Changes from desktop:

```text
+--------------------------+
| NAV (sticky, 56px)       |
| momentry  [*Buy*]  [=]   |   [=] opens a sheet: How it works /
+--------------------------+   Example / Privacy / Pricing / FAQ
                               Nav button drops the price on < 380px
+--------------------------+
| 1. HERO                  |
| eyebrow                  |
| H1 (3-4 lines)           |
| subhead                  |
| [* Buy momentry · 29 *]  |   full width
| ( Read a real story )    |   centered text link
| small line               |
| { TERMINAL }             |   below the CTA; hook column only,
| caption                  |   block scrolls sideways for the rest
+--------------------------+
| 2. PAIN  text, 3 cards   |   cards stack
+--------------------------+
| 3. HOW IT WORKS (dark)   |
| 1 Buy+install [[code]] >>|   steps stack, number on the left
| 2 Turn on     [[code]]   |
| 3 Keep going  [[code]]   |
+--------------------------+
| 4. WHAT YOU GET          |
| label                    |
| file block (scrolls >>)  |   lines wrap at 72 chars in source
| ranking list + proof     |   moved under the file
| details: Under the hood  |
+--------------------------+
| 5. PRIVACY               |
| text, code, diagram      |   diagram turns vertical
| honesty note             |
+--------------------------+
| 6. WHY PAY  6 tiles      |   one column; title + 1 line each,
|                          |   tap to expand the rest
+--------------------------+
| 7. PRICING               |
| price card (full width)  |   card first, then running cost,
| [* Buy *]                |   requirements, fit line
| running cost, reqs       |
+--------------------------+
| 8. WHERE IT STANDS       |
+--------------------------+
| 9. FAQ accordions        |
+--------------------------+
| 10. FINAL CTA            |
| [* Buy *]  ( story )     |
+--------------------------+
| FOOTER (links wrap)      |
| [ Top ]                  |
+--------------------------+
```

---

## Behaviour notes

- **Price:** one variable (`PRICE`) in the page script or build; nav, hero, pricing card, FAQ and final CTA read it.
- **Buy button:** plain link to `{{CHECKOUT_URL}}` (Lemon Squeezy). If the Lemon Squeezy overlay script is used later, the link must still work without JS.
- **Secondary link:** smooth-scrolls to `#example` and moves focus to the file block's label.
- **OS toggle:** only in How it works step 1 now; default by user agent (Windows shows PowerShell first).
- **Copy button:** on install and command blocks; `Copy` → `Copied` for 2 s; on clipboard failure, select the text and show `Ctrl+C`.
- **Terminal demo:** plain text in HTML; optional one-time type-in; none under `prefers-reduced-motion`; caption always visible.
- **Anchors:** `#how`, `#example`, `#privacy`, `#pricing`, `#faq`.
- **No social-proof strip.** No testimonials, user counts or stars exist. Proof is the recorded run (sections 4, 6, 8) and the real story file.
- **No GitHub anywhere:** no nav icon, no footer link, no "view source".
- **Dark mode:** terminal, code blocks and the How it works band stay dark in both themes; the rest follows the system theme.
