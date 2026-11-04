# momentry: sample stories for marketing (multi-domain)

Document version: 1.0 (2026-11-04). Pool of example stories for landing pages, posts and ads. Goal: show that a "moment worth telling" exists in any work done with an AI agent, not only code.

**Honesty rule:** every story below is **illustrative**, written for marketing, shaped like real momentry output. Anywhere one appears, label it ("Example story" / "Illustrative"). Real mined stories are in `docs/sample/` (all dev, Vietnamese). Replace these with real ones from buyers or from DM.9 (other-domain run) as soon as they exist, with permission.

**Why these are plausible today:** creators already run Claude Code, Codex and the other hosts for non-code work (writing, research, analysis, ops). A session that rewrites a newsletter or analyzes interviews leaves the same kind of transcript.

**Shape (same as a real story):** hook under 15 words with a number or a reversal; one tension type; stakes 0–3 against the session's goal; context, what happened, lesson.

Tension labels (public wording ↔ internal slug): tiny cause, big effect (`nho_ma_to`); meant to help, made it worse (`giup_ma_hai`); everyone thought X, it was Y (`tuong_ma_hoa_ra`); good parts, bad mix (`hop_ma_tan`); blocked it, still got through (`cam_ma_van_lot`); spent little, got a lot (`it_ma_nhieu`).

## Stories

| # | Domain | Creator | Hook | Tension | Stakes |
|---|---|---|---|---|---|
| S1 | Newsletter | Writer of a weekly founder newsletter | Dropping one word from the subject line lifted opens from 18% to 31% | tiny cause, big effect | 3 |
| S2 | Client research | Independent consultant | Everyone blamed the price. Seven of nine interviews blamed the signup form | everyone thought X, it was Y | 3 |
| S3 | Brand design | Freelance designer | Two fonts that each tested well read like a ransom note together | good parts, bad mix | 2 |
| S4 | Course creation | Coach selling a course | A two-page checklist brought 212 signups; the webinar brought 9 | spent little, got a lot | 3 |
| S5 | Writing | Essayist | Cutting the essay by 40% to make it readable halved the replies | meant to help, made it worse | 2 |
| S6 | Client work | Agency owner | We scrubbed the client's name everywhere; it survived in the PDF's file name | blocked it, still got through | 3 |
| S7 | Data / research | Analyst | A per-week vs per-month mix-up made the growth chart 4× too steep | tiny cause, big effect | 3 |
| S8 | Product | Solo founder / PM | The feature users asked for most was used by 3% after launch | everyone thought X, it was Y | 2 |
| S9 | Search code (real) | Developer | One Unicode accent made search scores drop 8× | tiny cause, big effect | 3 |

S9 is the only real one (`docs/sample/2026-11-02-mot-ky-tu-unicode.md`, translated).

## Full text (for the example card)

**S1 · Dropping one word from the subject line lifted opens from 18% to 31%**
- **Context:** a weekly newsletter for about 4,000 indie founders. Opens had slid for six weeks.
- **What happened:** the agent lined up 30 past subject lines against their open rates. Every issue under 20% had "free" in the subject. The next issue dropped the word; opens went from 18% to 31%.
- **Lesson:** before rewriting the content, check what the spam filter sees.

**S2 · Everyone blamed the price. Seven of nine interviews blamed the signup form**
- **Context:** a consultant hired to find out why trial signups stalled. The client's team was sure the price was too high.
- **What happened:** the agent coded nine interview transcripts by complaint. Price came up twice; the 11-field signup form came up seven times, usually in the first two minutes.
- **Lesson:** count what people actually say before testing what the team believes.

**S6 · We scrubbed the client's name everywhere; it survived in the PDF's file name**
- **Context:** an agency preparing a public case study under NDA.
- **What happened:** the client was renamed in every slide and caption. The export kept the original file name, `acme-q3-rebrand.pdf`, which went into the shared link.
- **Lesson:** the name you hid in the content is still in the metadata. (momentry's privacy gate checks file names for this reason.)

## Where they are used

- Canvas boards C2 and C3 (`website/design/`): hero wall shows S4, S2, S3, S9; example card shows S1.
