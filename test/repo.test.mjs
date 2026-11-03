import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitRoot, repoName, isInside } from '../lib/repo.mjs';

test('gitRoot finds .git dir and worktree .git file, null outside', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-repo-'));
  const a = path.join(base, 'a');
  fs.mkdirSync(path.join(a, '.git'), { recursive: true });
  fs.mkdirSync(path.join(a, 'x', 'y'), { recursive: true });
  assert.equal(gitRoot(path.join(a, 'x', 'y')), a);
  assert.equal(gitRoot(a), a);
  const wt = path.join(base, 'wt');
  fs.mkdirSync(wt);
  fs.writeFileSync(path.join(wt, '.git'), 'gitdir: /somewhere\n');
  assert.equal(gitRoot(wt), wt);
  assert.equal(gitRoot(path.join(base, 'none-here')), null);
});

test('repoName and isInside', () => {
  assert.equal(repoName('/home/u/projects/cis/'), 'cis');
  assert.ok(isInside('/a/b/c', '/a/b'));
  assert.ok(isInside('/a/b', '/a/b'));
  assert.ok(!isInside('/a/bc', '/a/b'));
  assert.ok(!isInside('/a', '/a/b'));
});
