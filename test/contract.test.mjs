// Public contract between modules (PRD 7.1). Stubs may throw 'not implemented'; names and arity must stay.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const CONTRACT = {
  'config.mjs': { loadConfig: 0, isObserved: 1, cacheDir: 0, userConfigPath: 0, ensurePrivateDir: 1 },
  'repo.mjs': { gitRoot: 1, repoName: 1, isInside: 2 },
  'frontmatter.mjs': { parse: 1, stringify: 1, needsQuote: 1 },
  'box.mjs': { readBox: 1, readStory: 2, readStoryFile: 1, writeNew: 2, mergeInto: 3, uniqueId: 2, storiesOfSession: 2, checkShape: 1, checkBox: 2, whatHappened: 1, titleOf: 1 },
  'log.mjs': { logEvent: 1, logPath: 0, sanitize: 0 },
  'viet.mjs': { nfc: 1, stripDiacritics: 1, toTelex: 1, slugify: 1 },
  'privacy.mjs': { loadBlocklist: 1, loadAllow: 1, variants: 1, check: 3, checkStory: 4, checkPatch: 3, mask: 1 },
  'quarantine.mjs': { put: 4, list: 2, release: 4 },
  'sources/claude.mjs': { sessionId: 1, encodeProjectDir: 1, listTranscripts: 1, readEntries: 1, countLines: 1 },
  'sources/codex.mjs': { sessionId: 1, sessionMeta: 1, listTranscripts: 1, readEntries: 1, patchPaths: 1, countLines: 1 },
  'reduce.mjs': { approxTokens: 1, renderEntry: 1, render: 1, chunk: 2 },
  'hotspots.mjs': { nonzeroExit: 1, metricPair: 1, gitReversal: 1, metaWrite: 1, bipMark: 1, detect: 1, format: 1 },
  'prompts.mjs': { render: 2 },
  'llm.mjs': { buildArgs: 1, call: 1, callJson: 1 },
  'json.mjs': { extractJson: 1 },
  'validate.mjs': { validateHarvest: 2, validateCluster: 2, validateHookTension: 2, validateStakes: 2, validateOutsider: 2 },
  'harvest.mjs': { harvest: 4, coverage: 2 },
  'cluster.mjs': { cluster: 4, checkPartition: 2, resolveBoxTarget: 1, countHits: 2 },
  'score.mjs': { hookTension: 3, stakes: 3, shuffle: 2 },
  'outsider.mjs': { outsider: 4, applyOutsider: 2 },
  'story.mjs': { buildStory: 5, mergePatch: 5, renderBody: 1 },
  'ledger.mjs': { load: 1, save: 2, lock: 2, touch: 1, unlock: 1, needsHarvest: 3, record: 4, forget: 2 },
  'rank.mjs': { rankKey: 1, sortRanked: 1 },
  'pipeline.mjs': { runSession: 2, rescore: 2, scan: 1, addStory: 1, reduceCommand: 1 },
  'hook.mjs': { handleHook: 3, printHookConfig: 1 },
};

for (const [mod, fns] of Object.entries(CONTRACT)) {
  test(`contract ${mod}`, async () => {
    const m = await import(`../lib/${mod}`);
    for (const [name, arity] of Object.entries(fns)) {
      assert.equal(typeof m[name], 'function', `${mod} ${name}`);
      assert.equal(m[name].length, arity, `${mod} ${name} arity`);
    }
  });
}

test('shared constants', async () => {
  const box = await import('../lib/box.mjs');
  assert.deepEqual(box.TENSIONS, ['nho_ma_to', 'giup_ma_hai', 'tuong_ma_hoa_ra', 'hop_ma_tan', 'cam_ma_van_lot', 'it_ma_nhieu', 'khac', 'none']);
  assert.deepEqual(box.STATUSES, ['raw', 'picked', 'drafted', 'published', 'dropped']);
  const cfg = await import('../lib/config.mjs');
  assert.deepEqual({ ...cfg.EXIT }, { OK: 0, USAGE: 1, CHECK: 2, UNCHECKED: 3, LLM: 4, LOCKED: 5 });
});
