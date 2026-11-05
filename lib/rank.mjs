// Ranking (PRD 5.9). No threshold; only order changes.
// Measured on replayed captures of 8 labelled sessions: docs/experiments/2026-11-05-ranking/README.md.

const num = (v) => (Number.isInteger(v) ? v : null);

/**
 * Found only by the outsider step: `hit_by` has `outsider` but neither `harvest` nor `bip`. Such stories retell a
 * practice from the outside angle; no harvest run caught them as an event, and few are truly notable.
 * A later harvest that merges into the story appends `harvest` and lifts it back.
 * @param {Record<string, any>} d
 */
function outsiderOnly(d) {
  const by = Array.isArray(d?.hit_by) ? d.hit_by : [];
  return by.includes('outsider') && !by.includes('harvest') && !by.includes('bip');
}

/**
 * Sort key (ascending): [outsider-only ? 1 : 0, tension ≠ none ? 0 : 1, -(stakes + strength), -hits, -date].
 * A sum, not a product: a zero on one axis (strength 0 for every tension `none`, stakes 0 for a side incident) must
 * not erase the other axis. Missing fields sort last (tension missing -> 2; sum/hits/date missing -> +Infinity).
 * @param {{id: string, data: Record<string, any>}} story @returns {(number|string)[]}
 */
export function rankKey(story) {
  const d = story?.data || {};
  const tension = typeof d.tension === 'string' && d.tension ? (d.tension === 'none' ? 1 : 0) : 2;
  const st = num(d.stakes), sg = num(d.strength);
  const sum = st === null || sg === null ? Infinity : -(st + sg);
  const hits = num(d.hits) === null ? Infinity : -d.hits;
  const t = typeof d.date === 'string' ? Date.parse(d.date) : NaN;
  return [outsiderOnly(d) ? 1 : 0, tension, sum, hits, Number.isNaN(t) ? Infinity : -t];
}

/** New array, best first; nothing dropped; ties by id. @template {{id: string, data: Record<string, any>}} T @param {T[]} stories @returns {T[]} */
export function sortRanked(stories) {
  const keyed = stories.map((s) => [rankKey(s), s]);
  keyed.sort(([a, x], [b, y]) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    }
    return String(x.id).localeCompare(String(y.id));
  });
  return keyed.map(([, s]) => s);
}
