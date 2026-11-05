// Doctor checks (lib/doctor.mjs runs them). Each is read-only in check(); apply() performs its fix.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, REPO_FILE, ensurePrivateDir } from './config.mjs';
import { gitRoot } from './repo.mjs';
import { which, commandFor } from './proc.mjs';
import { loadBlocklist } from './privacy.mjs';
import { installState, isOurShim, activate } from './install.mjs';
import { pathFor, splitList } from './paths.mjs';
import * as hosts from './hosts.mjs';

export const MIN_NODE = 20;

const PRIVACY_FIX = 'momentry config privacy-add "<tên người hoặc từ riêng tư cần chặn>"';

function runVersion(bin, ctx) {
  const c = commandFor(bin, ['--version'], { env: ctx.env });
  const r = (ctx.spawnSync ?? spawnSync)(c.file, c.args, { env: ctx.env, encoding: 'utf8', timeout: 8000, ...c.options });
  if (r.error || r.status !== 0) return null;
  return String(r.stdout || '').trim().split('\n')[0] || 'có';
}

const repoRootOf = (ctx) => gitRoot(path.resolve(ctx.cwd, ctx.repo || '.'));

function cfgOf(ctx) {
  if (!('cfg' in ctx)) {
    try { ctx.cfg = loadConfig({ cwd: ctx.cwd, env: ctx.env, flags: { repo: ctx.repo } }); ctx.cfgError = null; } catch (e) { ctx.cfg = null; ctx.cfgError = e; }
  }
  return ctx.cfg;
}

const nodeInstall = (platform) => (platform === 'win32' ? 'winget install OpenJS.NodeJS.LTS' : platform === 'darwin' ? 'brew install node' : 'cài Node ≥ 20 từ https://nodejs.org (hoặc nvm install 22)');

/** @param {any} ctx */
export function buildChecks(ctx) {
  const platform = ctx.platform ?? process.platform;
  /** @type {import('./doctor.mjs').Check[]} */
  const checks = [
    {
      code: 'node.version', title: 'Node', critical: true,
      check: () => {
        const major = Number(process.versions.node.split('.')[0]);
        return major >= MIN_NODE ? { status: 'ok', detail: process.versions.node } : { status: 'fail', detail: `${process.versions.node} < ${MIN_NODE}`, fix: nodeInstall(platform) };
      },
    },
    {
      code: 'git.present', title: 'git', critical: true,
      check: () => {
        const v = which('git', { env: ctx.env }) && runVersion('git', ctx);
        return v ? { status: 'ok', detail: v } : { status: 'fail', detail: 'không thấy git trên PATH', fix: platform === 'win32' ? 'winget install Git.Git' : 'cài git từ https://git-scm.com' };
      },
    },
    {
      code: 'claude.present', title: 'claude CLI', critical: true,
      check: () => {
        if (ctx.quick) return { status: 'skip', detail: 'bỏ qua trong status' };
        if (!which('claude', { env: ctx.env })) return { status: 'fail', detail: 'không thấy claude trên PATH (cần để gom chuyện)', fix: 'cài Claude Code: https://docs.anthropic.com/claude-code, rồi chạy claude một lần để đăng nhập' };
        const v = runVersion('claude', ctx);
        return v ? { status: 'ok', detail: `${v.slice(0, 60)} (đăng nhập được kiểm ở lần gom đầu)` } : { status: 'fail', detail: 'claude --version lỗi', fix: 'chạy claude một lần trong terminal để sửa cài đặt hoặc đăng nhập' };
      },
    },
    {
      code: 'config.valid', title: 'cấu hình', critical: true,
      check: () => {
        cfgOf(ctx);
        if (ctx.cfgError) return { status: 'fail', detail: ctx.cfgError.message, fix: 'sửa file trong thông báo (momentry config path), rồi momentry config show' };
        return { status: 'ok', detail: 'đọc được' };
      },
    },
    {
      code: 'privacy.sources', title: 'nguồn chặn riêng tư', critical: true,
      check: () => {
        const cfg = cfgOf(ctx);
        if (!cfg) return { status: 'skip', detail: 'cấu hình hỏng' };
        const n = cfg.privacy.sources.length;
        if (!n) {
          return cfg.privacy.allowUnchecked
            ? { status: 'warn', detail: 'chưa có nguồn chặn; allowUnchecked=true nên chuyện vào hộp mà không kiểm', fix: PRIVACY_FIX }
            : { status: 'fail', detail: 'chưa có nguồn chặn: mọi chuyện sẽ bị giữ ngoài repo. Hỏi user những tên người, tên dự án, từ riêng tư cần chặn rồi thêm bằng lệnh dưới (thay phần <…>)', fix: PRIVACY_FIX };
        }
        let bl = null, err = null;
        try { bl = loadBlocklist(cfg.privacy.sources, { env: ctx.env }); } catch (e) { err = e; }
        if (!bl) {
          const home = ctx.env.HOME || ctx.env.USERPROFILE || '';
          const files = cfg.privacy.sources.map((x) => String(x?.path ?? '').replace(/^~(?=$|[\\/])/, home));
          const missing = files.find((f) => f && !fs.existsSync(f));
          return missing
            ? { status: 'fail', detail: `không có file nguồn chặn ${missing}`, fix: PRIVACY_FIX }
            : { status: 'fail', detail: `nguồn chặn không cho ra từ nào${err ? ` (${err.message})` : ''}: file rỗng, sai loại hoặc không đọc được`, fix: PRIVACY_FIX };
        }
        return { status: 'ok', detail: `${n} nguồn` };
      },
    },
    {
      code: 'repo.observed', title: 'repo', critical: true, creates: true,
      check: () => {
        const root = repoRootOf(ctx);
        if (!root) return { status: 'fail', detail: 'không ở trong git repo', fix: 'cd vào repo cần quan sát rồi chạy momentry init' };
        const cfg = cfgOf(ctx);
        if (fs.existsSync(path.join(root, REPO_FILE)) || cfg?.observed) return { status: 'ok', detail: `${root} được quan sát` };
        return { status: 'fail', detail: `${root} chưa được quan sát`, fix: 'momentry init --yes' };
      },
      apply: () => {
        const root = repoRootOf(ctx);
        if (!root) return [];
        const file = path.join(root, REPO_FILE);
        fs.writeFileSync(file, '{}\n', { flag: 'wx' });
        delete ctx.cfg;
        return `tạo ${file}`;
      },
    },
    {
      // pausing is the user's choice, never a failure: reported as information
      code: 'project.paused', title: 'gom chuyện', critical: false,
      check: () => {
        const cfg = cfgOf(ctx);
        if (!cfg?.observed) return { status: 'skip', detail: 'repo chưa được quan sát' };
        return cfg.paused
          ? { status: 'info', detail: 'đang tạm dừng trên máy này: hook không tự gom, chuyện cũ vẫn đọc được (bật lại: momentry resume)' }
          : { status: 'ok', detail: 'đang bật' };
      },
    },
    {
      code: 'box.exists', title: 'hộp chuyện', critical: false, creates: true,
      check: () => {
        const cfg = cfgOf(ctx);
        if (!cfg?.repoRoot) return { status: 'skip', detail: 'chưa có repo' };
        return fs.existsSync(cfg.box) ? { status: 'ok', detail: cfg.box } : { status: 'warn', detail: `chưa có ${cfg.box}`, fix: 'momentry init --yes' };
      },
      apply: () => {
        const cfg = cfgOf(ctx);
        if (!cfg?.repoRoot || fs.existsSync(cfg.box)) return [];
        fs.mkdirSync(cfg.box, { recursive: true });
        return `tạo ${cfg.box}`;
      },
    },
    {
      code: 'cache.private', title: 'cache', critical: false,
      check: () => {
        const dir = cfgOf(ctx)?.cacheDir;
        if (!dir) return { status: 'skip', detail: 'cấu hình hỏng' };
        if (!fs.existsSync(dir)) return { status: 'ok', detail: `${dir} (sẽ tạo với quyền 0700)` };
        if (platform === 'win32') return { status: 'ok', detail: dir };
        const mode = fs.statSync(dir).mode & 0o777;
        return mode & 0o077 ? { status: 'warn', detail: `${dir} quyền ${mode.toString(8)}, nội dung phiên lộ cho user khác`, fix: `chmod 700 '${dir}'` } : { status: 'ok', detail: dir };
      },
      apply: () => {
        const dir = cfgOf(ctx).cacheDir;
        ensurePrivateDir(dir);
        fs.chmodSync(dir, 0o700);
        return `chmod 700 ${dir}`;
      },
    },
    {
      code: 'install.path', title: 'bản cài', critical: false,
      check: () => {
        const st = installState(ctx.env, { platform });
        if (!st.running) return { status: 'ok', detail: 'chạy từ mã nguồn (git checkout); cập nhật bằng git pull' };
        const missing = st.shims.filter((s) => !isOurShim(s));
        if (missing.length || st.current !== st.running) return { status: 'warn', detail: missing.length ? `thiếu shim ${missing[0]}` : `current=${st.current}, đang chạy ${st.running}`, fix: 'momentry doctor --fix --yes' };
        const onPath = splitList(ctx.env.PATH ?? ctx.env.Path, platform).some((d) => pathFor(platform).resolve(d) === pathFor(platform).resolve(st.bin));
        if (!onPath) {
          const fix = platform === 'win32' ? `[Environment]::SetEnvironmentVariable('Path', "${st.bin};" + [Environment]::GetEnvironmentVariable('Path','User'), 'User')` : `export PATH="${st.bin}:$PATH"   # thêm vào ~/.bashrc hoặc ~/.zshrc`;
          return { status: 'warn', detail: `${st.bin} chưa có trong PATH (hook vẫn chạy vì dùng đường dẫn tuyệt đối)`, fix };
        }
        return { status: 'ok', detail: `${st.running} tại ${st.home}` };
      },
      apply: () => {
        const st = installState(ctx.env, { platform });
        if (!st.running) return [];
        const missing = st.shims.filter((s) => !isOurShim(s));
        if (!missing.length && st.current === st.running) return [];
        return activate(ctx.env, { platform }).wrote.map((f) => `ghi ${f}`);
      },
    },
  ];

  for (const name of hosts.HOST_NAMES) {
    checks.push({
      code: `host.${name}`, title: `${hosts.LABELS[name]}: hook, lệnh agent, skill`, critical: false,
      check: () => {
        if (!hosts.detect(name, ctx.env)) return { status: 'skip', detail: 'chưa cài trên máy này' };
        const s = hosts.inspect(name, ctx.prefix, ctx.env);
        if (s.status === 'ok') return { status: 'ok', detail: s.detail };
        if (s.status === 'broken') return { status: 'fail', detail: s.detail, fix: `sửa tay file trong thông báo, rồi momentry connect ${name} --yes` };
        if (s.status === 'foreign') return { status: 'warn', detail: s.detail };
        return { status: 'warn', detail: `${s.detail} (chưa tự gom chuyện sau phiên ở đó)`, fix: `momentry connect ${name} --yes` };
      },
      apply: () => {
        if (!hosts.detect(name, ctx.env)) return [];
        // Creating new entries in a host's global config needs consent (init --yes / a TTY yes); repairing ours does not.
        if (hosts.inspect(name, ctx.prefix, ctx.env).missing.length && !ctx.connect) return [];
        const r = hosts.apply(name, { prefix: ctx.prefix, env: ctx.env });
        return [...r.changes, ...r.backups.map((b) => `sao lưu ${b}`)];
      },
    });
  }
  return checks;
}
