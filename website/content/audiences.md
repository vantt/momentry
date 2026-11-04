# momentry: audiences

Document version: 1.0 (2026-11-04). Gathered from the pricing and sales chats of 2026-11-04 (see [plans/261104-sales/plan.md](../../plans/261104-sales/plan.md)). Every page, post and pricing decision names which audience it speaks to.

**Context:** momentry is the experimental, narrow first product of CIS (Creator Intelligence System, repo `vantt/cis`). CIS is the big idea: capture a person's work and learning, find insight and content in it. momentry tests one slice of it on the people closest to the tool: devs who work with coding agents. What sells here tells CIS which audience to build for next.

**Product line (one sentence for all audiences):** "Anh không thiếu ý tưởng, anh quên mất mình đã làm gì." / "You're not short of ideas. You forgot what you did."

The difference against every creator AI tool: they generate ideas from a blank prompt; momentry digs real material out of real work (real numbers, real reversals, real root causes).

## Communication rule: one concept, "creator" (2026-11-04)

Four segments inside, one word outside. Every public message (landing pages, posts, ads, store page, emails) speaks to **creators**: people who make things and tell others what they made. A dev who ships and posts about it is a creator; so is a vibe coder, a consultant writing case studies, a newsletter writer.

- The segments A1–A4 below are internal only: they decide product scope, sources, price and channels. They never appear as labels in public copy ("solo devs", "indie hackers", "vibe coders", "knowledge workers").
- Default public line (2026-11-04): **"creators who work with AI agents"**. Generic on purpose: "work", not "build"; "AI agents", not "coding agents", so the same line carries to A2 and A3 later. The concrete hosts (Claude Code, Codex, pi, omp, Antigravity) go in the subhead and requirements, which keeps the page true for what runs today.
- When a page targets one segment, the qualifier can narrow: "creators who build with Cursor, Lovable or Bolt" (A2), "creators who work in ChatGPT or Claude all day" (A3).
- The promise stays the same for everyone: "You're not short of ideas. You forgot what you did."
- Why: one brand concept carries from momentry to CIS (Creator Intelligence System). Each new segment widens the same story instead of starting a new one.

## Audiences, nearest first

| # | Audience | Uses today | What they pay for | Can use momentry today? | Epic |
|---|---|---|---|---|---|
| A1 | Solo devs and indie hackers on Claude Code, Codex, pi, omp, Antigravity who build in public, blog or write weekly reports | Coding agents every day, a terminal, git | Not forgetting the week; material with numbers in it; privacy | Yes (CLI, v0.2.0) | E11 |
| A2 | Vibe coders and non-pro indie makers | Cursor, Lovable, Bolt, Claude Code, without being devs | Post drafts (X, LinkedIn, Threads) from what they built; build-in-public without effort | No: needs one-click install and Cursor/Lovable/Bolt sources | E14, E15 |
| A3 | Knowledge workers in AI chat all day: marketers, consultants, PMs, writers | ChatGPT, Claude.ai, Claude Cowork | Their chat history is their work log: weekly report, case study, post | No: needs ChatGPT/Claude export reader or browser extension | E15 |
| A4 | Pure creators: YouTubers, newsletter writers, coaches | Recordings, meetings, notes, Notion, voice memos | Content ideas from their own life | No, and crowded (Castmagic, Otter, Notion AI) | Later, maybe never |

Order: start with A1 (sell what exists), validate A2 with a waitlist before writing app code, then A3. A4 waits for a sharp edge.

## A1: solo devs who tell people what they did (selling now)

- **Pain, their words:** "Friday comes and I'm trying to remember what was worth telling." "The best thing this week happened mid-session and I forgot it." "Things that would make a good post feel normal to me." "I'm scared a client name ends up in a post."
- **Job:** when I sit down to write this week's post or report, give me what actually happened, ranked.
- **Pays:** 19–29 USD once (lifetime license). They already pay about 1 USD per harvested session to Anthropic through their own `claude` CLI, so a subscription feels like paying twice.
- **Objections:** LLM cost per session; transcript goes to Anthropic; hooks in my agent config; v0.x; stories come out in Vietnamese; closed source ("why pay for a script?").
- **Answer to "why pay for a script":** the polish: hooks for five agent hosts and every profile, privacy gate with Telex/accent matching and quarantine, Windows/WSL, `doctor`, checked updates, a ranking tested against human labels.
- **Where they are:** X/Bluesky build-in-public, Hacker News, r/ClaudeAI, r/ChatGPTCoding, indie hacker communities, Vietnamese dev groups.
- **Go-on signal:** people pay, and ask for post drafts.

## A2: vibe coders (validate next, waitlist only)

- **Lead line:** "You're not short of ideas. You forgot what you did."
- **Needs before they can buy:** desktop or web app, no terminal; moments as cards; one click to a post draft in their voice; LLM cost carried by us; install under 2 minutes with a first moment in the first run.
- **Price to test:** 15–20 USD/month on a waitlist page.
- **Go-on signal:** a few hundred waitlist signups.

## A3: AI-chat knowledge workers (after A2)

- Same promise; the source is a ChatGPT/Claude export or a browser extension.
- Privacy is the first objection: sending work chats to someone's server. The privacy gate goes on the sales page.

## Anti-personas (all audiences, today)

- Teams wanting a shared cross-repo feed (one box per repo).
- People who want finished posts now (drafting is Pro, not built).
- People who cannot send transcripts to Anthropic's API.
- People without a `claude` CLI login (A1 product only).

## Competitors to watch

Taplio, Typefully, Supergrow (LinkedIn/X writing, 15–65 USD/month), Castmagic (content from recordings). None reads coding-agent sessions.
