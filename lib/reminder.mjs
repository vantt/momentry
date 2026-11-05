// The one line an agent session opens with: new stories, sessions waiting for the daily budget, problems to fix, each
// with the command that deals with it in that host. Built by `momentry hook session-start` (lib/cli.mjs runHook) for
// the session's repo only. Reads local files only: no network, no model, no child process. Empty when there is
// nothing to say.
import fs from 'node:fs';
import { loadConfig } from './config.mjs';
import { readBox } from './box.mjs';
import { realOr } from './repo.mjs';
import * as Ledger from './ledger.mjs';
import * as Projects from './projects.mjs';
import { projectId, loadState } from './ui-api.mjs';
import { buildChecks } from './checks.mjs';
import * as AF from './agent-files.mjs';
import { commandName } from './hosts.mjs';

/**
 * Doctor checks cheap enough for a session start (file reads only) and worth a nudge. Left out: node, git, claude
 * (child processes), repo (only observed repos get here), install.path (its PATH test depends on how the host was
 * started, so it would nag about the host's PATH, not the user's).
 */
const QUICK = ['config.valid', 'privacy.sources', 'box.exists', 'cache.private'];

/** Value of a map keyed by repo root, matching the same folder reached through another path. */
function byRoot(map, root) {
  if (Object.hasOwn(map, root)) return map[root];
  const real = realOr(root);
  for (const [k, v] of Object.entries(map)) if (realOr(k) === real) return v;
  return undefined;
}

/** Stories the user has not opened yet and not decided on (the UI's "unread"). */
function newStories(cfg, root, env) {
  if (!cfg || !fs.existsSync(cfg.box)) return 0;
  let key = root;
  try { key = Projects.find(Projects.read(env), root)?.root ?? root; } catch { /* broken list: the UI keys by the repo root too */ }
  const seen = loadState(env).seen;
  const pid = projectId(key);
  return readBox(cfg.box).filter((s) => !s.error && (s.data.status ?? 'raw') === 'raw' && !seen[`${pid}/${s.id}`]).length;
}

/** Quick checks (plus this host's own connection) that are failing or warning and have something to run. */
function problems(root, runtime, env, prefix) {
  const ctx = { cwd: root, env, prefix, quick: true, platform: process.platform };
  const codes = new Set([...QUICK, `host.${runtime}`]);
  let n = 0;
  for (const c of buildChecks(ctx).filter((x) => codes.has(x.code))) {
    let r;
    try { r = c.check(ctx); } catch { r = { status: 'fail', fix: 'momentry doctor' }; }
    if ((r.status === 'fail' || r.status === 'warn') && r.fix) n++;
  }
  return n;
}

/**
 * The reminder for a session opened in `root` (an observed repo), or '' when there is nothing to say.
 * @param {{root: string, runtime: string, env: NodeJS.ProcessEnv, prefix: string}} o
 * @returns {string}
 */
export function reminderLine({ root, runtime, env, prefix }) {
  let cfg = null;
  try { cfg = loadConfig({ cwd: root, env }); } catch { /* counted by config.valid below */ }
  const fresh = newStories(cfg, root, env);
  const waiting = cfg ? Number(byRoot(Ledger.waiting(cfg.cacheDir), cfg.repoRoot ?? root)) || 0 : 0;
  const bad = problems(root, runtime, env, prefix);
  const parts = [
    fresh && `${fresh} chuyện mới (${commandName(runtime, AF.NAMES.ui)})`,
    waiting && `${waiting} phiên chờ ngân sách ngày (momentry scan)`,
    bad && `${bad} lỗi cần sửa (momentry doctor)`,
  ].filter(Boolean);
  return parts.length ? `momentry: ${parts.join(' · ')}` : '';
}

/** JSON with every non-ASCII character escaped, so a Windows console code page cannot garble it on the way. */
const asciiJson = (v) => JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/**
 * What `hook session-start` prints for a host, given the line ('' = nothing to say).
 * - Claude Code, Codex: JSON; `systemMessage` is shown to the user, `additionalContext` reaches the model.
 * - Antigravity: always a JSON object; the line goes in as a system message the UI shows as markdown.
 * - pi, omp: the plain line; the extension shows it with ctx.ui.notify (it never reaches the model).
 * @param {string} runtime @param {string} line @returns {string}
 */
export function hookOutput(runtime, line) {
  if (runtime === 'agy') return line ? asciiJson({ injectSteps: [{ systemMessage: { systemMessage: line, metadata: { user_markdown: line } } }] }) : '{}';
  if (!line) return '';
  if (runtime === 'pi' || runtime === 'omp') return line;
  return asciiJson({ systemMessage: line, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: line } });
}
