// Config dirs of every agent host and every profile/account of it found on this machine (user decision 2026-11-03:
// install into and scan all profiles). One source for scan, connect, doctor and uninstall.
import fs from 'node:fs';
import path from 'node:path';
import { paths, homeOf } from './paths.mjs';

export const HOSTS = ['claude', 'codex', 'pi', 'omp', 'agy'];

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const children = (dir) => { try { return fs.readdirSync(dir).sort().map((n) => path.join(dir, n)).filter(isDir); } catch { return []; } };

/**
 * Existing config dirs of a host, default first, then profiles (deduplicated).
 * - claude: CLAUDE_CONFIG_DIR or ~/.claude
 * - codex:  CODEX_HOME or ~/.codex, plus ~/.codex-*
 * - pi:     PI_CODING_AGENT_DIR or ~/.pi/agent, plus ~/.pi/accounts/*
 * - omp:    ~/.omp/agent, plus ~/.omp/profiles/<name>/agent
 * - agy:    ~/.gemini, plus ~/.agy-homes/<name>/.gemini (one HOME per account)
 * @param {'claude'|'codex'|'pi'|'omp'|'agy'} host @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function hostRoots(host, env = process.env) {
  const p = paths(env);
  const userHome = homeOf(env);
  let list = [];
  if (host === 'claude') list = [p.claude];
  else if (host === 'codex') list = [p.codex, ...children(userHome).filter((d) => /^\.codex-/.test(path.basename(d)))];
  else if (host === 'pi') list = [env.PI_CODING_AGENT_DIR ? path.resolve(env.PI_CODING_AGENT_DIR) : path.join(userHome, '.pi', 'agent'), ...children(path.join(userHome, '.pi', 'accounts'))];
  else if (host === 'omp') list = [path.join(userHome, '.omp', 'agent'), ...children(path.join(userHome, '.omp', 'profiles')).map((d) => path.join(d, 'agent'))];
  else if (host === 'agy') list = [path.join(userHome, '.gemini'), ...children(path.join(userHome, '.agy-homes')).map((d) => path.join(d, '.gemini'))];
  else throw new Error(`host lạ: ${host}`);
  return [...new Set(list.map((d) => path.resolve(d)))].filter(isDir);
}
