// The one engine that reaches the desired state. `doctor` reads only; `doctor --fix` repairs what exists;
// `init` also runs checks marked `creates`. A check never writes during diagnosis.

/**
 * @typedef {object} CheckResult
 * @property {'ok'|'warn'|'fail'|'skip'} status
 * @property {string} detail
 * @property {string} [fix]   copy-pasteable, non-interactive command (or instruction when no command exists)
 *
 * @typedef {object} Check
 * @property {string} code        stable id
 * @property {string} title
 * @property {boolean} critical   a failing critical check makes doctor exit 1
 * @property {boolean} [creates]  its apply() creates something new: only under init
 * @property {(ctx: any) => CheckResult|Promise<CheckResult>} check
 * @property {(ctx: any) => string|string[]|Promise<string|string[]>} [apply]  performs the fix, returns what it did
 */

const TIMEOUT_MS = 10000;

async function withTimeout(fn, ms) {
  let t;
  try {
    return await Promise.race([Promise.resolve().then(fn), new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`quá ${ms / 1000}s`)), ms); })]);
  } finally { clearTimeout(t); }
}

async function runOne(c, ctx) {
  const base = { code: c.code, title: c.title, critical: c.critical, creates: !!c.creates };
  try {
    return { ...base, ...(await withTimeout(() => c.check(ctx), TIMEOUT_MS)) };
  } catch (e) {
    return { ...base, status: 'fail', detail: `check lỗi: ${e.message}` };
  }
}

/**
 * Runs the checks; with `fix`, applies fixes of failing/warning checks and re-checks, up to `rounds` rounds.
 * @param {Check[]} checks @param {any} ctx
 * @param {{fix?: boolean, creates?: boolean, dryRun?: boolean, rounds?: number}} [o]
 * @returns {Promise<{ok: boolean, results: Array<CheckResult & {code: string, title: string, critical: boolean}>, changes: string[], planned: string[]}>}
 */
export async function run(checks, ctx, o = {}) {
  const rounds = o.rounds ?? 3;
  const changes = [], planned = [];
  let results = [];
  for (let round = 0; round <= rounds; round++) {
    results = [];
    for (const c of checks) results.push(await runOne(c, ctx));
    if (!o.fix || round === rounds) break;
    const todo = checks.filter((c, i) => c.apply && results[i].status !== 'ok' && results[i].status !== 'skip' && (!c.creates || o.creates));
    if (!todo.length) break;
    let progressed = false;
    for (const c of todo) {
      if (o.dryRun) { planned.push(`${c.code}: ${results[checks.indexOf(c)].fix ?? 'sửa'}`); continue; }
      try {
        const did = await withTimeout(() => c.apply(ctx), TIMEOUT_MS * 3);
        const list = [did].flat().filter(Boolean);
        changes.push(...list);
        if (list.length) progressed = true;
      } catch (e) {
        const i = checks.indexOf(c);
        results[i] = { ...results[i], status: 'fail', detail: `${results[i].detail}; sửa lỗi: ${e.message}`, fix: e.fix ?? results[i].fix };
      }
    }
    if (o.dryRun || !progressed) break;
  }
  return { ok: results.every((r) => !r.critical || r.status === 'ok' || r.status === 'skip' || r.status === 'warn'), results, changes, planned };
}

const MARK = { ok: '✓', warn: '!', fail: '✗', skip: '-' };

/** Human report lines. */
export function format(results) {
  const out = [];
  for (const r of results) {
    out.push(`${MARK[r.status]} ${r.title}: ${r.detail}`);
    if (r.status !== 'ok' && r.status !== 'skip' && r.fix) out.push(`    sửa: ${r.fix}`);
  }
  return out;
}

/** Fix commands of checks that are not ok, in order (for --json `next`). */
export function nextCommands(results) {
  return results.filter((r) => (r.status === 'fail' || r.status === 'warn') && r.fix && /^momentry\b/.test(r.fix)).map((r) => r.fix);
}
