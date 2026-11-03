# Code review: packaging and distribution layer (uncommitted changes)

Date: 2026-11-03 (Asia/Saigon). Scope: `git diff HEAD` plus untracked files, excluding `.claude/`, `.agentkit/`, `plans/`.
Focus: real defects only (correctness, data loss, traversal, injection, Windows breakage, CI workflows).

## Verification run

- `node --test test/*.test.mjs`: 230/230 pass (Linux, Node 24).
- `sh scripts/test-installer.sh`: OK.
- Reproduced in the scratchpad (temp HOME): a custom `--home` / `--install-dir` install, and a symlinked `settings.json` edit. See H4 and M1.
- Windows findings come from reading the code against documented PowerShell 5.1, cmd.exe and libuv behavior. None of them was run on Windows. `scripts/test-installer.ps1` would catch H1 and H2 the first time CI runs on Windows.

## High

### H1. install.ps1:56: on Windows PowerShell 5.1 the Node version probe always fails, so install is impossible
`& node -p 'process.versions.node.split(".")[0]'`. PowerShell versions before 7.3 pass a native argument with no whitespace as-is, without escaping its embedded `"`. Node receives the command line `-p process.versions.node.split(".")[0]` and its argv parser strips the quotes, giving `process.versions.node.split(.)[0]`. That is a SyntaxError. Stdout is empty, `[int]$null` is 0, and the script throws "Node ... is too old" on every machine. This hits the shipping target (`irm | iex` on stock Windows) and the CI step `installer lifecycle (PowerShell 5.1)`.
Fix: drop the embedded double quotes, e.g. `& node -p "process.versions.node.split('.')[0]"`, or parse `(& node --version)` (`v22.1.0`) in PowerShell.

### H2. lib/uninstall.mjs:77-78: Windows deferred delete is mis-quoted, so nothing is removed but uninstall reports success
`spawn(ComSpec, ['/d','/c', 'ping ... & rmdir /s /q "C:\...\momentry"'])` runs without `windowsVerbatimArguments`. libuv quotes the argument because it contains spaces and quotes, and escapes each inner `"` as `\"`. cmd.exe does not treat `\` as an escape, so `del`/`rmdir` get `\"C:\...\momentry.cmd\"` and fail ("syntax is incorrect"). stdio is `ignore` and the step has already printed success. Result: `momentry.cmd`, the sh shim and `%LOCALAPPDATA%\momentry` stay on disk after "✓ Đã gỡ momentry". The release smoke job does not check that files are gone; `test-installer.ps1:75` does and would fail.
Fix: `spawn(comspec, ['/d','/s','/c', `"ping -n 3 127.0.0.1 >nul & ${cmds}"`], { windowsVerbatimArguments: true, detached: true, stdio: 'ignore', windowsHide: true })`. Also reject `%` and `"` in targets the same way `quoteCmd` does, because `/c` expands `%VAR%`.

### H3. lib/uninstall.mjs:59 + lib/paths.mjs:39: Windows uninstall without `--purge` deletes the cache it promises to keep
On win32, `cache = <LOCALAPPDATA>\momentry\cache`, which is inside `st.home`. The plan lists `p.cache` under "Giữ lại ..." but also schedules `rmdir /s /q <home>`. Once H2 is fixed, every plain `momentry uninstall` (and `install.ps1` with `MOMENTRY_UNINSTALL=1`) wipes the ledger, quarantine (held stories), runs and hook.log. That is user data loss that contradicts the command's own output and the docs ("giữ cấu hình, cache").
Fix: on Windows, delete only `versions\`, `current`, the marker and the momentry-owned `bin\` inside home. Delete `home` itself only when it is empty, or with `--purge`. Alternatively, move the Windows cache out of the install root (e.g. `%LOCALAPPDATA%\momentry-cache`). Add an assertion to `test-installer.ps1` that the cache survives uninstall.

### H4. lib/install.mjs:35 (shimSh) and lib/paths.mjs: `--home` / `--install-dir` installs are invisible to the CLI
The installer passes `MOMENTRY_HOME` / `MOMENTRY_INSTALL_DIR` only to `_activate`. At run time the POSIX shim assigns `MOMENTRY_HOME=...` without `export`, and nothing ever carries the install dir. `paths()` therefore falls back to the defaults. Reproduced in the scratchpad:
- `install.sh --home X --install-dir Y`: `momentry paths` shows `managed false`, `running -`. Then `momentry update` refuses ("đang chạy từ mã nguồn") and `momentry uninstall` reports "không có gì để gỡ". Hooks written by `init`/`connect` use `"node" "X/versions/v0.1.0/bin/momentry.mjs"`, which breaks when that version is pruned.
- `install.sh --install-dir Y` with the default home: `doctor` says "thiếu shim ~/.local/bin/momentry". `connect` registers hooks pointing at `~/.local/bin/momentry`, which does not exist, so hooks fail silently and no stories are harvested. `doctor --fix` / `init` then create a second shim in `~/.local/bin`, ignoring the user's choice (see also L5). Uninstall leaves `Y/momentry`.
- Windows: the cmd `set` does propagate `MOMENTRY_HOME`, but `MOMENTRY_INSTALL_DIR` is lost in the same way.
Fix: make the layout self-describing. Derive `home` from the running code (`dirname(dirname(ROOT))` when ROOT is under `*/versions/v*`), and store `bin` (and home) in `.momentry-managed` at `_activate`. `installState` should read the marker before falling back to env/defaults. Exporting the variables from the shims also works but is weaker, because hooks and `node .../momentry.mjs` callers bypass the shim.

## Medium

### M1. lib/safe-edit.mjs:53 (via lib/install.mjs writeAtomic): a symlinked `~/.claude/settings.json` is replaced by a regular file
`writeAtomic` renames a temp file over the path, which replaces the symlink itself. Reproduced: `settings.json -> real.json`. After `writeJsonFile`, `settings.json` is a plain file and `real.json` (the user's dotfiles repo) is unchanged. Dotfile-managed Claude/Codex configs are common. The user silently loses the link, and later changes in the dotfiles repo stop applying. `uninstall` then edits the copy, never the original.
Fix: resolve the target first (`fs.realpathSync(file)` when `lstat` says symlink) and write atomically next to the real file. Run the digest check and the backup against the real path.

### M2. .github/workflows/release.yml:56-70: the smoke job probably cannot see the draft release
`gh release download <tag>` runs with `contents: read`. GitHub lists draft releases only to tokens with push access, so the download likely returns "release not found", and every release stops at the draft. Not verified in a run.
Fix: either give `smoke` `contents: write` (it only reads), or better, `actions/upload-artifact` the `out/` dir in `draft` and `download-artifact` it in `smoke`. That also smoke-tests the exact bytes without a network round trip.

### M3. lib/uninstall.mjs:53: the PATH cleanup rewrites the user PATH as REG_SZ with variables expanded
Windows PowerShell 5.1 runs on .NET Framework. There, `[Environment]::GetEnvironmentVariable('Path','User')` returns the expanded value and `SetEnvironmentVariable(...,'User')` writes `REG_SZ`. After uninstall, entries such as `%USERPROFILE%\.dotnet\tools` or `%JAVA_HOME%\bin` are frozen to literal paths, and the value type changes. `install.ps1:161-167` deliberately preserves `REG_EXPAND_SZ` with `DoNotExpandEnvironmentNames`, and uninstall undoes that.
Fix: use the same registry code as install.ps1 (`OpenSubKey('Environment',$true)`, `GetValue('Path','',DoNotExpandEnvironmentNames)`, `SetValue('Path',$n,$kind)`), then broadcast `WM_SETTINGCHANGE`.

### M4. lib/llm.mjs:59-67 with lib/proc.mjs:commandFor: the claude timeout does not work on Windows
`claude` is now spawned through `cmd.exe /c claude.cmd`. On timeout, `process.kill(-pid)` throws on win32, and `child.kill()` ends only cmd.exe. The real `node .../claude` grandchild keeps running and keeps the inherited stdout/stderr pipes open. `'close'` therefore does not fire until claude finishes on its own: `timeoutSec` is not enforced, the harvest/scan lock stays held, and the LLM call keeps spending.
Fix: on win32, kill the process tree: `spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })`.

### M5. install.sh:174-175 and install.ps1:144-145: reinstalling the active version cannot repair it
When `current == VERSION` but `versions/VERSION/bin/momentry.mjs` is missing or corrupt, the "already installed" short-cut is skipped. The `rm -rf "$dest"` is also skipped (it runs only when VERSION != current), and so is the `mv`, because `$dest` still exists. `_activate` then runs the broken tree and fails. The documented remedy ("chạy lại installer") never works for this case; the user has to delete the directory by hand.
Fix: also replace `$dest` when it lacks `bin/momentry.mjs`, e.g. `[ "$VERSION" = "$current" ] && [ -f "$dest/bin/momentry.mjs" ] || rm -rf "$dest"`, and the same in PowerShell.

## Low

### L1. lib/safe-edit.mjs:49,61: backup names have one-second resolution
`stamp()` drops milliseconds and `copyFileSync` overwrites. Two edits of the same file within one second (`connect --remove` then `connect`, scripted agents, `init` then `connect`) overwrite the first backup, which is the only copy of the pristine user file. Fix: add milliseconds or the pid, or use `COPYFILE_EXCL` and a counter.

### L2. lib/update.mjs:94: the archive is fetched from `latest/download/` after checksums.txt was resolved
If a release is published between the two requests, `latest` moves, the archive (named for the old version) returns 404, and the update fails spuriously. Fix: fetch `download/${rel.version}/${rel.name}` once the version is known.

### L3. lib/install.mjs:70: the `.tmp` filter never matches
`installState.versions` excludes names ending in `.tmp`, but update stages into `vX.Y.Z.tmp-<pid>` (update.mjs:100). Stale staging dirs show up in `paths`/`versions`. If two updates run concurrently, the first to finish runs `_activate`, which prunes the other's staging dir mid-extraction. Fix: filter `/\.tmp(-\d+)?$/`, or match `^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$` exactly.

### L4. lib/hosts.mjs:47-60: a non-object `hooks` value is mangled
If `hooks` is a string, `Object.entries` iterates its characters (`{"0":"x",...}`). An array becomes `{}`. Either way the user's (already invalid) value is rewritten into something else. Fix: in `apply`/`inspectHooks`, treat a `hooks` value that is not a plain object as `host-config-malformed` and refuse, matching `readJsonFile`.

### L5. lib/checks.mjs:161 to lib/install.mjs:101: `doctor --fix` / `init` overwrite a non-momentry `momentry` in the bin dir
`install.sh guard_shim` refuses to overwrite a foreign `momentry`. `activate()` has no such guard, and the `install.path` check treats a foreign file as a "missing shim" and rewrites it. `update` runs `doctor --fix` automatically. Fix: in `activate`, skip or fail on an existing shim path that is not `isOurShim`, and have the check report it.

### L6. install.sh:227: the INT/TERM trap does not exit
`trap 'rm -rf "$TMP"' EXIT INT TERM` runs the cleanup on Ctrl-C and then resumes the script with `$TMP` gone. Fix: `trap 'rm -rf "$TMP"' EXIT` plus `trap 'exit 130' INT TERM`.

### L7. install.ps1:139: `2>$null` together with `$ErrorActionPreference='Stop'` on PowerShell 5.1
In PowerShell 5.1, any stderr line from a native command with redirected stderr becomes a terminating NativeCommandError, e.g. a Node warning caused by the user's `NODE_OPTIONS`. Install then aborts with a misleading message. Fix: locally set `$ErrorActionPreference='Continue'` around the probe, or wrap it in `cmd /c "... 2>nul"`.

## Checked, no defect found

- `lib/tar.mjs`: rejects absolute paths, drive letters, backslashes, NUL, `.`/`..` segments, links/devices/pax entries; checks checksums; enforces bounded gunzip and truncation; applies a top-dir allow-list before any write; extracts into a fresh dir with `mkdirSync(recursive:false)`; masks the mode to `0o755`. Integrity of the whole chain still depends on a same-origin `checksums.txt` (no signature). The installers already say "chưa kiểm chữ ký".
- install.sh / install.ps1 archive checks: listing allow-list plus a link-type check before extraction, and `curl --proto '=https'`.
- `lib/proc.mjs quoteCmd`: with `/d /s /c "..."` and verbatim args, refusing `% ! ^ & | < > " CR LF` and quoting whitespace/`,;=()[]` is sound for the argv that momentry sends (`buildArgs` uses only fixed tokens and empty strings).
- `safeToDelete`: refuses the filesystem root, any ancestor of HOME, and basenames without "momentry".
- update rollback: after a failed `_activate`, it restores `current` and removes only the new version dir (never the running one).
- ci.yml / release.yml: actions pinned by SHA, `persist-credentials: false`, least-privilege top-level `permissions: {}`, tag == `lib/version.mjs` gate. Only M2 is a problem.

## Unresolved questions

- H1, H2, M3, M4 and L7 are inferred from documented Windows/PowerShell 5.1/libuv behavior and were not run on Windows. The first Windows CI run of `scripts/test-installer.ps1` should confirm H1 and H2.
- M2 depends on GITHUB_TOKEN visibility of drafts under `contents: read`. GitHub docs say drafts are listed only for push access. Not verified in a run.

Status: DONE_WITH_CONCERNS
Summary: Found 4 high-severity defects: Windows install fails on PS 5.1 (Node probe quoting), Windows uninstall's deferred delete is mis-quoted and, once fixed, would delete the cache it promises to keep, and custom --home/--install-dir installs are invisible to update/uninstall/connect. Also 5 medium (symlinked settings.json replaced, draft smoke job permissions, PATH REG_EXPAND_SZ flattening, Windows LLM timeout, reinstall cannot repair) and 7 low. The tar reader and archive validation hold up.

---

## Xử lý (2026-11-03, phiên cook)

Mọi phát hiện đã sửa; kiểm lại bằng `node --test` (232 qua), `scripts/test-installer.sh`, `scripts/test-agent-native.sh`. Các sửa riêng Windows chưa chạy trên Windows (chờ CI).

- H1: `install.ps1` gọi `node -p "process.versions.node.split('.')[0]"`.
- H2: xoá trễ trên Windows dùng `cmd.exe /d /s /c "…"` với `windowsVerbatimArguments`, từ chối đường dẫn có ký tự đặc biệt của cmd.
- H3: Windows tách `%LOCALAPPDATA%\momentry\{app,bin,cache}`; uninstall chỉ xoá `app` và shim.
- H4: `installState` suy thư mục cài từ nơi code đang chạy (`…/versions/vX` có marker) và đọc thư mục shim từ marker (`bin`); test lifecycle thêm ca `--home`/`--install-dir`.
- M1: `safe-edit` ghi vào đích của symlink; M2: job smoke có `contents: write`; M3: gỡ PATH qua registry giữ `REG_EXPAND_SZ`; M4: timeout trên Windows dùng `taskkill /T /F`; M5: installer thay bản đang dùng nếu nó không chạy được.
- L1: tên bản sao lưu có mili giây và pid; L2: update tải đúng bản đã giải quyết; L3: lọc `.tmp` trong tên; L4: từ chối `hooks` không phải object; L5: `activate` không ghi đè `momentry` lạ; L6: trap INT/TERM thoát; L7: lệnh native trong `install.ps1` chạy qua `Invoke-Quiet`.
- `safeToDelete` đổi sang bằng chứng sở hữu (marker) thay vì tên thư mục.
