// CLI output contract: errors in the form error / why / fix, and one --json envelope for every command.
import { EXIT } from './config.mjs';

export const SCHEMA = 1;

/** An error the CLI reports to the user. `fix` is a copy-pasteable command. */
export class CliError extends Error {
  /**
   * @param {string} message what went wrong
   * @param {{exitCode?: number, code?: string, why?: string, fix?: string}} [o]
   */
  constructor(message, o = {}) {
    super(message);
    this.exitCode = o.exitCode ?? EXIT.FAIL;
    this.code = o.code ?? (this.exitCode === EXIT.USAGE ? 'usage' : 'error');
    this.why = o.why ?? null;
    this.fix = o.fix ?? null;
  }
}

/** Usage error (exit 2). */
export const usageError = (message, o = {}) => new CliError(message, { ...o, exitCode: EXIT.USAGE });

/** Human text: `lỗi: …` plus optional `vì:` and `sửa:` lines. @param {{message: string, why?: string|null, fix?: string|null}} e */
export function formatError(e) {
  const out = [`lỗi: ${e.message}`];
  if (e.why) out.push(`  vì: ${e.why}`);
  if (e.fix) out.push(`  sửa: ${e.fix}`);
  return out.join('\n');
}

/**
 * The --json envelope, printed on stdout even on failure.
 * @param {{ok: boolean, data?: any, error?: {code: string, why: string, fix: string|null}|null, next?: string[]}} r
 */
export function envelope({ ok, data = null, error = null, next = [] }) {
  return JSON.stringify({ schema: SCHEMA, ok, data, error, next }, null, 2);
}

/** Error object for the envelope. @param {any} e */
export function jsonError(e) {
  return { code: e.code && typeof e.code === 'string' && !/^E[A-Z]/.test(e.code) ? e.code : 'error', why: [e.message, e.why].filter(Boolean).join(': '), fix: e.fix ?? null };
}
