// What momentry puts in front of the user's coding agent: the `momentry-bip` / `momentry-ui` commands (plus the old
// `/bip` name kept as an alias) and the `momentry` skill. Pure text builders; lib/hosts.mjs decides where each file goes
// and adds the ownership marker. `bin` is how the agent's shell calls momentry (see binFor).
import { render as renderPrompt } from './prompts.mjs';

/** Command and skill names. */
export const NAMES = { bip: 'momentry-bip', ui: 'momentry-ui', skill: 'momentry', alias: 'bip' };

/** How the agent's shell calls momentry. An installed Windows shim is called by name (the shell may be PowerShell). */
export function binFor(prefix) {
  return /momentry\.cmd"$/.test(prefix) ? 'momentry' : prefix;
}

const FRONT = /^---\n[\s\S]*?\n---\n/;
const frontmatter = (fields) => ['---', ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`), '---', ''].join('\n');

/** The bip command (Claude, pi, omp): frontmatter + body; the host replaces $ARGUMENTS with what the user typed. */
export function bipCommand(bin) {
  return `${renderPrompt('bip', { bin })}\n`;
}

/** Body shared by the ui command and the ui skill. */
function uiBody(bin) {
  return `Open momentry's local web UI for the user.

Run exactly one shell command, in the current directory:

   ${bin} ui

It starts the UI in the background (or reuses a running one) and opens the browser, or prints the path of a file to open.
Tell the user, in one line and in their language, the line the command printed. Do not open, read or print that file:
it holds the UI's access token. Do nothing else.
`;
}

/** The ui command (Claude, pi, omp). */
export function uiCommand(bin) {
  return frontmatter({ description: 'Mở giao diện web của momentry (đọc chuyện, chọn chuyện)' }) + uiBody(bin);
}

/**
 * Explicit-only skills (Codex, Antigravity, where commands are skills): `disable-model-invocation` keeps the model from
 * running them on its own; Codex reads agents/openai.yaml for the same (see codexManualPolicy). Skills get no
 * $ARGUMENTS, so the user's note is "the text typed after the command".
 */
export function bipSkill(bin, name = NAMES.bip) {
  const body = bipCommand(bin).replace(FRONT, '').replace(/\$ARGUMENTS/g, `(phần chữ user gõ sau ${name}, nếu có)`);
  return frontmatter({ name, description: `Ghi lại khoảnh khắc vừa rồi vào hộp chuyện (momentry). Chỉ chạy khi user gọi ${name}.`, 'disable-model-invocation': true }) + body;
}

export function uiSkill(bin) {
  return frontmatter({ name: NAMES.ui, description: `Mở giao diện web của momentry. Chỉ chạy khi user gọi ${NAMES.ui}.`, 'disable-model-invocation': true }) + uiBody(bin);
}

/** Codex: agents/openai.yaml next to an explicit-only SKILL.md (Codex ignores disable-model-invocation). */
export function codexManualPolicy() {
  return 'policy:\n  allow_implicit_invocation: false\n';
}

/** Kept short: it is the only part of the skill that sits in every session's context. */
export const SKILL_DESCRIPTION = 'Read and act on the user\'s momentry story box (moments harvested from their coding sessions). Use when they ask what good stories happened ("tuần này có chuyện gì hay?"), want one shown or marked use/later/drop, or want a story drafted as a post or thread ("viết chuyện X thành thread").';

/**
 * The `momentry` skill: only name + description sit in the agent's context; the body loads when the user asks about
 * their stories. It drives the CLI with --json only; drafting is done by the user's own agent, never by momentry.
 */
export function momentrySkill(bin) {
  return `${frontmatter({ name: NAMES.skill, description: JSON.stringify(SKILL_DESCRIPTION) })}# momentry

momentry harvests "stories" (worth-telling moments: a bug with a twist, a number that moved) from the user's coding
sessions into markdown files in a story box, one box per repo. You reach it only through its CLI, always with \`--json\`.
Every call prints one JSON envelope on stdout: \`{"schema":1,"ok":bool,"data":…,"error":{"code","why","fix"}|null,"next":[…]}\`.

## Commands

Call momentry exactly as \`${bin}\` (written \`momentry\` below). Run it in the repo the user is talking about,
or add \`--repo DIR\`.

- Ranked list: \`momentry list --rank --json\`. \`data\` is an array of \`{id, date, status, hook, tension, stakes, strength, hits}\`,
  best first. Status: raw (new), picked (chosen to use), drafted, published, dropped.
  For "this week" keep the rows whose \`date\` is in the last 7 days; skip \`dropped\` unless asked.
- One story: \`momentry show <id> --json\`. \`data\` has \`title\`, \`summary\`, \`date\`, \`status\`, \`later\`, \`threads\`,
  \`links\`, \`file\` and \`sections\` = \`{context, what, lesson, artefact, outsider}\` (empty string when missing).
- Label it: \`momentry mark <id> use|later|drop --json\`. use = the user wants to write it up (status becomes picked);
  later = remind them later (kept on this machine, the file does not change); drop = not interesting.
  Mark only when the user says so.
- Web UI for browsing: \`momentry ui\`. Never open or print the file it mentions (it holds an access token).

Ids look like \`2026-11-04-cache-lru\`; take them from \`list\`, never invent one.

## Answering

- "What's good this week?": run \`list\`, then \`show\` the top 3-5 and answer with one line each (title + why it is
  interesting), with the id so the user can pick.
- "Write story X as a thread / post": \`show\` it, then write the draft yourself, here in the conversation, from its
  sections: the hook first, the before/after numbers, the lesson. Match the user's language and the platform's length.
  momentry has no drafting command and calls no model for this. Do not write the draft into the story file. When the
  user is happy with it, offer \`mark <id> use\`.
- Use only what the story says. Stories passed momentry's private-name check; do not add names, paths or details from
  elsewhere in the repo or from your memory of the session.
- When \`ok\` is false, tell the user \`error.why\` and the \`error.fix\` command; run a fix yourself only if it is a
  read-only command (list, show, doctor, status).
`;
}
