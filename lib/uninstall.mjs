// Uninstall: the exact inverse of install + init, removing only what is still ours. User data stays unless --purge.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { paths } from './paths.mjs';
import { installState, isOurShim, MARKER } from './install.mjs';
import * as hosts from './hosts.mjs';

/**
 * Refuses to delete anything that is not provably momentry's: never `/`, HOME or a parent of HOME; and the dir
 * must carry our install marker, or (config, cache) be named momentry or sit in a `momentry` dir (Windows cache).
 */
function safeToDelete(dir, env) {
  const r = path.resolve(dir);
  const home = path.resolve(env.HOME || env.USERPROFILE || os.homedir());
  const rel = path.relative(r, home);
  const containsHome = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  const ours = fs.existsSync(path.join(r, MARKER)) || /momentry/i.test(path.basename(r)) || /^momentry$/i.test(path.basename(path.dirname(r)));
  return r !== path.parse(r).root && !containsHome && ours;
}

/**
 * @param {{env?: NodeJS.ProcessEnv, purge?: boolean, platform?: string, prefix: string}} o
 * @returns {{steps: Array<{what: string, run: () => void}>, kept: string[], skipped: string[]}}
 */
export function plan(o) {
  const env = o.env ?? process.env;
  const platform = o.platform ?? process.platform;
  const p = paths(env, { platform });
  const st = installState(env, { platform });
  const steps = [], skipped = [];

  for (const name of hosts.HOST_NAMES) {
    if (!hosts.detect(name, env)) continue;
    try {
      const r = hosts.apply(name, { prefix: o.prefix, remove: true, removing: hosts.HOST_NAMES, dryRun: true, env });
      skipped.push(...r.skipped);
      if (r.changes.length) steps.push({ what: r.changes.join('; '), run: () => hosts.apply(name, { prefix: o.prefix, remove: true, removing: hosts.HOST_NAMES, env }) });
    } catch (e) { skipped.push(`${name}: ${e.message}`); }
  }
  // Windows: momentry.cmd is still executing (cmd.exe re-reads it after node exits), so files are removed by a
  // detached cmd.exe a moment after we exit instead of in-process.
  const later = [];
  const remove = (what, target, dir) => {
    if (platform === 'win32') { later.push({ target, dir }); steps.push({ what: `${what} (ngay sau khi lệnh này thoát)`, run: () => {} }); }
    else steps.push({ what, run: () => fs.rmSync(target, { recursive: dir, force: true }) });
  };
  for (const shim of st.shims) {
    if (isOurShim(shim)) remove(`xoá ${shim}`, shim, false);
    else if (fs.existsSync(shim)) skipped.push(`${shim} không phải shim của momentry; để nguyên`);
  }
  if (platform === 'win32' && st.managed) {
    steps.push({
      what: `gỡ ${st.bin} khỏi PATH của user`,
      run: () => {
        // Same registry API as install.ps1: keep %VAR% entries unexpanded and the value kind (REG_EXPAND_SZ).
        const ps = `$k=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment',$true); try { $o=$k.GetValue('Path','',[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); if ($o) { $kind=$k.GetValueKind('Path'); $n=(@($o -split ';' | Where-Object { $_ -and ($_.TrimEnd('\\') -ine '${st.bin.replace(/'/g, "''").replace(/\\$/, '')}') }) -join ';'); if ($n -ne $o) { $k.SetValue('Path',$n,$kind) } } } finally { $k.Close() }`;
        spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', windowsHide: true });
      },
    });
  }
  if (st.managed) {
    if (safeToDelete(st.home, env)) remove(`xoá bản cài ${st.home}`, st.home, true);
    else skipped.push(`không xoá ${st.home}: không giống thư mục của momentry`);
  } else if (st.running === null) {
    skipped.push('đang chạy từ mã nguồn (git checkout): không có bản cài để xoá');
  }
  const data = [p.config, p.cache].filter((d) => fs.existsSync(d));
  const kept = [];
  if (o.purge) {
    for (const d of data) {
      if (safeToDelete(d, env)) steps.push({ what: `xoá ${d}`, run: () => fs.rmSync(d, { recursive: true, force: true }) });
      else skipped.push(`không xoá ${d}: không giống thư mục của momentry`);
    }
  } else kept.push(...data);
  kept.push('hộp chuyện và .momentry.json trong các repo');
  if (later.length) {
    steps.push({
      what: 'hẹn xoá file đang chạy',
      run: () => {
        if (later.some((l) => /[%"^&|<>!]/.test(l.target))) throw new Error('đường dẫn cài có ký tự cmd.exe không xử lý an toàn; xoá tay');
        const cmds = later.map((l) => (l.dir ? `rmdir /s /q "${l.target}"` : `del /f /q "${l.target}"`)).join(' & ');
        // verbatim: Node must not re-escape the inner quotes (cmd.exe does not understand \").
        const child = spawn(env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"ping -n 3 127.0.0.1 >nul & ${cmds}"`], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true });
        child.unref();
      },
    });
  }
  return { steps, kept, skipped };
}

/** Runs the steps in order; stops at the first failure (later, irreversible steps are skipped). */
export function execute(steps) {
  const done = [];
  for (const s of steps) {
    try { s.run(); done.push(s.what); } catch (e) { return { done, failed: { what: s.what, error: e.message } }; }
  }
  return { done, failed: null };
}
