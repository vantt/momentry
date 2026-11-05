// One description per config key: type, allowed values, tier and an English label. `config set` validates against it
// and the web UI builds its settings form from it, so there is no second copy of the rules.
import { DEFAULTS, USER_ONLY, PROMPT_CACHES } from './config.mjs';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/**
 * @typedef {object} KeySchema
 * @property {'int'|'number'|'string'|'bool'|'list'} type
 * @property {number} [min]
 * @property {string[]} [suggest]      common values (free text still allowed)
 * @property {string[]} [values]       the only allowed values
 * @property {'general'|'project'|'advanced'} tier
 * @property {string} label            short English label
 * @property {string} desc             one English sentence
 * @property {boolean} [userOnly]      only from the user's own config, never from a repo file
 * @property {boolean} [hidden]        not shown as a form field (edited through its own screen)
 */

const MODELS = ['haiku', 'sonnet', 'opus'];

/** @type {Record<string, KeySchema>} */
export const SCHEMA = {
  box: { type: 'string', tier: 'project', label: 'Story folder', desc: 'Where this project keeps its story files, relative to the repo root.' },
  repo: { type: 'string', tier: 'project', label: 'Project name on stories', desc: 'Name written into each story. Empty means the folder name.' },
  'budget.dailyUsd': { type: 'number', min: 0, tier: 'general', label: 'Daily budget (USD)', desc: 'Limit for reading sessions automatically after they end. When today reaches it, the next sessions wait until tomorrow. 0 means no limit. Searches you start yourself are not limited.' },
  'outsider.enabled': { type: 'bool', tier: 'general', label: 'Outsider read', desc: 'A second pass reads each session as a stranger would and adds what stands out to them.' },
  'scan.maxSessions': { type: 'int', min: 0, tier: 'general', label: 'Sessions per automatic run', desc: 'How many sessions are read after a session ends. 0 means no limit.' },
  'harvest.runs': { type: 'int', min: 1, tier: 'advanced', label: 'Reads per session', desc: 'Read each session this many times; stories found more often rank higher. Costs grow with each read.' },
  'harvest.model': { type: 'string', suggest: MODELS, tier: 'advanced', label: 'Model for finding stories', desc: 'Claude model that reads the session.' },
  'rank.model': { type: 'string', suggest: MODELS, tier: 'advanced', label: 'Model for ranking', desc: 'Claude model that scores how strong each story is.' },
  'outsider.model': { type: 'string', suggest: MODELS, tier: 'advanced', label: 'Model for the outsider read', desc: 'Claude model for the outsider pass.' },
  'llm.promptCache': { type: 'string', suggest: [...PROMPT_CACHES], values: [...PROMPT_CACHES], tier: 'advanced', label: 'Prompt cache', desc: 'off: each prompt is billed once as plain input (it is never read back). 5m or 1h: pay to cache it. auto: Claude Code decides.' },
  'scan.quietMinutes': { type: 'int', min: 0, tier: 'advanced', label: 'Quiet minutes', desc: 'Skip sessions that changed within this many minutes; they are probably still open.' },
  'scan.maxFailures': { type: 'int', min: 1, tier: 'advanced', label: 'Retries before giving up', desc: 'Stop retrying a session that failed this many times in a row.' },
  'harvest.fillRetries': { type: 'int', min: 0, tier: 'advanced', label: 'Gap retries', desc: 'Extra tries for parts of a session the model skipped.' },
  'harvest.maxInputTokens': { type: 'int', min: 1000, tier: 'advanced', label: 'Tokens per window', desc: 'Largest piece of a session sent to the model at once.' },
  'harvest.timeoutSec': { type: 'int', min: 1, tier: 'advanced', label: 'Model timeout (seconds)', desc: 'Give up on one model call after this long.' },
  'lock.staleSec': { type: 'int', min: 1, tier: 'advanced', label: 'Stale lock (seconds)', desc: 'A session lock older than this is treated as left over from a crash.' },
  'privacy.sources': { type: 'list', tier: 'general', label: 'Name lists', desc: 'Files with names that must never reach a story.', userOnly: true, hidden: true },
  'privacy.allowFile': { type: 'string', tier: 'advanced', label: 'Allowed words file', desc: 'Words that look like blocked names but are fine. Empty means .privacy-allow in the story folder.' },
  'privacy.allowUnchecked': { type: 'bool', tier: 'advanced', label: 'Write stories without a name list', desc: 'Let stories into the repo even when no name list exists. Not recommended.', userOnly: true },
};

/** Dotted leaf keys of DEFAULTS, in schema order first. */
export const SCHEMA_KEYS = Object.keys(SCHEMA);

/** Default value of a dotted key. */
export function defaultOf(key) {
  let t = DEFAULTS;
  for (const p of key.split('.')) { if (!isObj(t) || !(p in t)) return undefined; t = t[p]; }
  return t;
}

/**
 * Checks one value against the key's schema. `null`/`undefined` means unset and is always allowed.
 * @param {string} key @param {any} value
 * @returns {string|null} English error, or null when valid
 */
export function validate(key, value) {
  const s = SCHEMA[key];
  if (!s) return `unknown setting: ${key}`;
  if (value === null || value === undefined) return null;
  switch (s.type) {
    case 'int':
      if (!Number.isInteger(value)) return `${s.label} must be a whole number`;
      if (s.min !== undefined && value < s.min) return `${s.label} must be at least ${s.min}`;
      return null;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${s.label} must be a number`;
      if (s.min !== undefined && value < s.min) return `${s.label} must be at least ${s.min}`;
      return null;
    case 'bool': return typeof value === 'boolean' ? null : `${s.label} must be on or off`;
    case 'list': return Array.isArray(value) ? null : `${s.label} must be a list`;
    case 'string':
      if (typeof value !== 'string') return `${s.label} must be text`;
      if (s.values && !s.values.includes(value)) return `${s.label} must be one of ${s.values.join(', ')}`;
      if (key === 'box' && !value.trim()) return `${s.label} cannot be empty`;
      if (key === 'box' && /^(\.[\\/]*|\.\.([\\/].*)?)$/.test(value.trim())) return `${s.label} must be a folder inside the project, not the project itself or above it`;
      return null;
    default: return null;
  }
}

/** Schema as plain data for the UI (`userOnly` from config.mjs so the rule has one owner). */
export function describeSchema() {
  return SCHEMA_KEYS.map((key) => ({ key, ...SCHEMA[key], userOnly: USER_ONLY.includes(key), default: defaultOf(key) ?? null }));
}
