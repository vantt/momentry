#!/bin/sh
# Offline lifecycle of install.sh + the installed CLI, in a throwaway HOME:
# package two versions -> install -> re-install (no-op) -> init (hooks, agent commands, skill) -> session-start
# reminder (and a missing shim counted) -> doctor -> update --check (10)
# -> update (removes what older versions installed, keeps edited files) -> tampered release refused -> uninstall (data kept) -> command gone.
# Usage: sh scripts/test-installer.sh
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT INT TERM
unset XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME CLAUDE_CONFIG_DIR CODEX_HOME MOMENTRY_HOME MOMENTRY_INSTALL_DIR \
  MOMENTRY_CONFIG MOMENTRY_CACHE MOMENTRY_RELEASE_BASE MOMENTRY_VERSION MOMENTRY_REPOS MOMENTRY_PRIVACY_SOURCES 2>/dev/null || true
export HOME="$WORK/home"
mkdir -p "$HOME/.claude" "$HOME/.codex" "$HOME/.pi/agent" "$HOME/.pi/accounts/work" "$HOME/.omp/agent" "$HOME/.gemini/config"
PATH="$ROOT/test/fixtures/fake-claude:$PATH"   # doctor needs a `claude` that answers --version
export PATH
BIN="$HOME/.local/bin/momentry"

step() { printf '== %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
json_ok() { node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); if(!j.ok){console.error(JSON.stringify(j.data?.checks?.filter(c=>c.status!=="ok"&&c.status!=="skip")??j.error,null,1));process.exit(1)}'; }

V1=$(node -p "require('fs').readFileSync('$ROOT/lib/version.mjs','utf8').match(/VERSION = '([^']+)'/)[1]")
V2=$(node -p "'$V1'.replace(/(\d+)\.(\d+)\.(\d+).*/, (m,a,b,c)=>a+'.'+b+'.'+(+c+1))")
node --input-type=module -e "
  const { buildRelease } = await import('$ROOT/scripts/package-release.mjs');
  buildRelease({ out: '$WORK/r1' });
  buildRelease({ out: '$WORK/r2', version: '$V2' });
"

step "install v$V1"
sh "$WORK/r1/install.sh" --local-fixture "$WORK/r1" --yes --no-modify-path
"$BIN" --version | grep -qx "momentry $V1" || fail "installed version"
sh -c "\"$BIN\" --version" >/dev/null || fail "shim runs from a new shell"

step "re-install is a no-op"
sh "$WORK/r1/install.sh" --local-fixture "$WORK/r1" --yes --no-modify-path 2>&1 | grep -q "không có gì phải làm" || fail "re-install changed something"

step "init"
mkdir -p "$WORK/repo" && (cd "$WORK/repo" && git init -q)
printf 'Trần Thị Bích Ngọc\n' > "$HOME/names.txt"
"$BIN" config set privacy.sources "[{\"type\":\"lines\",\"path\":\"$HOME/names.txt\"}]" >/dev/null
(cd "$WORK/repo" && "$BIN" init --yes --json) | json_ok || fail "init --yes --json"
grep -q "momentry\\\\\" hook session-end" "$HOME/.claude/settings.json" || fail "hook registered through the shim"
grep -q "add --by human" "$HOME/.claude/commands/momentry-bip.md" || fail "momentry-bip installed"
grep -q '"momentry"' "$HOME/.gemini/config/hooks.json" || fail "Antigravity hook group missing"
# Codex and pi read the shared ~/.agents/skills: their skills sit there once, for every profile
for f in .pi/agent/extensions/momentry.ts .pi/accounts/work/extensions/momentry.ts .omp/agent/extensions/momentry.ts \
  .claude/commands/momentry-bip.md .claude/commands/momentry-ui.md .claude/skills/momentry/SKILL.md \
  .agents/skills/momentry-bip/SKILL.md .agents/skills/momentry-bip/agents/openai.yaml .agents/skills/momentry-ui/SKILL.md .agents/skills/momentry/SKILL.md \
  .pi/agent/prompts/momentry-bip.md .pi/agent/prompts/momentry-ui.md .pi/accounts/work/prompts/momentry-bip.md \
  .omp/agent/commands/momentry-bip.md .omp/agent/commands/momentry-ui.md .omp/agent/skills/momentry/SKILL.md \
  .gemini/config/skills/momentry-bip/SKILL.md .gemini/config/skills/momentry-ui/SKILL.md .gemini/config/skills/momentry/SKILL.md; do
  [ -f "$HOME/$f" ] || fail "init did not install $f"
done
for f in .claude/commands/bip.md .pi/agent/prompts/bip.md .omp/agent/commands/bip.md .gemini/config/skills/bip .codex/skills .pi/agent/skills .pi/accounts/work/skills; do
  [ ! -e "$HOME/$f" ] || fail "init installed $f (the /bip alias is gone; Codex and pi skills live in ~/.agents/skills)"
done
grep -q "hook session-start\"" "$HOME/.claude/settings.json" || fail "Claude SessionStart hook missing"
grep -q "hook session-start --codex" "$HOME/.codex/hooks.json" || fail "Codex SessionStart hook missing"
grep -q "hook session-start --agy" "$HOME/.gemini/config/hooks.json" || fail "Antigravity SessionStart hook missing"
grep -q "ui?.notify" "$HOME/.pi/agent/extensions/momentry.ts" || fail "pi extension does not show the reminder"
(cd "$WORK/repo" && "$BIN" init --yes) | grep -q "không có gì phải làm" || fail "init is idempotent"

step "session-start reminder"
BOX="$WORK/repo/docs/storytelling-material"
printf -- '---\nid: 2026-11-05-thu\nstatus: raw\n---\n\n# thu\n' > "$BOX/2026-11-05-thu.md"
OUT=$(printf '{"cwd":"%s","source":"startup"}' "$WORK/repo" | "$BIN" hook session-start)
printf '%s' "$OUT" | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); if(!j.hookSpecificOutput.additionalContext.startsWith("momentry: 1 chuyện mới (/momentry-ui)")) process.exit(1)' \
  || fail "Claude reminder: $OUT"
OUT=$(printf '{"cwd":"%s"}' "$WORK/repo" | "$BIN" hook session-start --codex)
printf '%s' "$OUT" | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); if(!j.systemMessage.includes("($momentry-ui)")) process.exit(1)' \
  || fail "Codex reminder: $OUT"
OUT=$(printf '{"cwd":"%s","source":"compact"}' "$WORK/repo" | "$BIN" hook session-start)
[ -z "$OUT" ] || fail "reminder repeated after compaction: $OUT"
rm "$BOX/2026-11-05-thu.md"
# a missing shim is a problem to fix (the installed copy still runs the hook here, as pi's extension falls back to it)
APP="$HOME/.local/share/momentry/versions/v$V1/bin/momentry.mjs"
mv "$BIN" "$WORK/shim.bak"
OUT=$(printf '{"cwd":"%s","source":"startup"}' "$WORK/repo" | node "$APP" hook session-start)
printf '%s' "$OUT" | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); if(j.systemMessage!=="momentry: 1 lỗi cần sửa (momentry doctor)") process.exit(1)' \
  || fail "missing shim not counted: $OUT"
(cd "$WORK/repo" && node "$APP" doctor --fix >/dev/null) || true
[ -x "$BIN" ] || fail "doctor --fix did not write the shim back"
rm -f "$WORK/shim.bak"

step "doctor"
(cd "$WORK/repo" && "$BIN" doctor --json) | json_ok || fail "doctor"

step "update --check reports a newer version with exit 10"
set +e; MOMENTRY_RELEASE_BASE="$WORK/r2" "$BIN" update --check >/dev/null; code=$?; set -e
[ "$code" = 10 ] || fail "update --check exit $code"

step "update cleans what older versions installed (edited files kept)"
cp "$HOME/.claude/commands/momentry-bip.md" "$HOME/.claude/commands/bip.md"
cp "$HOME/.pi/agent/prompts/momentry-bip.md" "$HOME/.pi/agent/prompts/bip.md"
mkdir -p "$HOME/.codex/skills" "$HOME/.pi/agent/skills"
cp -R "$HOME/.agents/skills/momentry-bip" "$HOME/.agents/skills/momentry" "$HOME/.codex/skills/"
cp -R "$HOME/.agents/skills/momentry" "$HOME/.pi/agent/skills/"
sed 's/Việc của bạn:/Việc của bạn (đã sửa):/' "$HOME/.omp/agent/commands/momentry-bip.md" > "$HOME/.omp/agent/commands/bip.md"
MOMENTRY_RELEASE_BASE="$WORK/r2" "$BIN" update --yes
"$BIN" --version | grep -qx "momentry $V2" || fail "updated version"
for f in .claude/commands/bip.md .pi/agent/prompts/bip.md .codex/skills/momentry-bip .codex/skills/momentry .pi/agent/skills/momentry; do
  [ ! -e "$HOME/$f" ] || fail "update left $f"
done
grep -q "đã sửa" "$HOME/.omp/agent/commands/bip.md" || fail "update removed an edited file"
rm "$HOME/.omp/agent/commands/bip.md"
"$BIN" config get privacy.sources | grep -q names.txt || fail "config survived the update"
(cd "$WORK/repo" && "$BIN" doctor --json) | json_ok || fail "doctor after update"

step "tampered release is refused and the install is untouched"
mkdir -p "$WORK/r3" && cp "$WORK/r1/"* "$WORK/r3/"
node -e "const f='$WORK/r3/checksums.txt';const fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/^[0-9a-f]{64}(?=  momentry-)/m,'0'.repeat(64)))"
if sh "$WORK/r3/install.sh" --local-fixture "$WORK/r3" --yes --version "v$V1" 2>/dev/null; then fail "tampered archive installed"; fi
set +e; MOMENTRY_RELEASE_BASE="$WORK/r3" "$BIN" update --yes --version "v$V1" >/dev/null 2>&1; code=$?; set -e
[ "$code" = 1 ] || fail "update accepted a tampered archive (exit $code)"
"$BIN" --version | grep -qx "momentry $V2" || fail "install changed after a refused update"

step "a damaged active copy is repaired by re-running the installer"
printf 'broken\n' > "$HOME/.local/share/momentry/versions/v$V2/bin/momentry.mjs"
sh "$WORK/r2/install.sh" --local-fixture "$WORK/r2" --yes --no-modify-path >/dev/null 2>&1 || fail "re-install over a damaged copy"
"$BIN" --version | grep -qx "momentry $V2" || fail "damaged copy not repaired"

step "custom --home and --install-dir are found by update, connect and uninstall"
H2="$WORK/custom-home"; B2="$WORK/custom-bin"
HOME="$WORK/home2" sh "$WORK/r1/install.sh" --local-fixture "$WORK/r1" --yes --no-modify-path --home "$H2" --install-dir "$B2" >/dev/null 2>&1 || fail "custom install"
mkdir -p "$WORK/home2/.claude"
HOME="$WORK/home2" "$B2/momentry" paths --json | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")).data; if(!d.managed||d.running!=="v'"$V1"'") process.exit(1)' || fail "custom home not seen as managed"
HOME="$WORK/home2" "$B2/momentry" connect claude --yes >/dev/null || fail "connect (custom)"
grep -q "custom-bin/momentry" "$WORK/home2/.claude/settings.json" || fail "hook does not point at the custom shim"
HOME="$WORK/home2" "$B2/momentry" uninstall --yes >/dev/null || fail "uninstall (custom)"
[ ! -e "$B2/momentry" ] && [ ! -e "$H2" ] || fail "custom install not removed"

step "uninstall keeps data"
set +e; "$BIN" uninstall </dev/null >/dev/null 2>&1; code=$?; set -e
[ "$code" = 2 ] || fail "uninstall without --yes and without a TTY must exit 2 (got $code)"
"$BIN" uninstall --yes
[ ! -e "$BIN" ] || fail "shim still there"
[ ! -e "$HOME/.local/share/momentry" ] || fail "install dir still there"
! grep -q "momentry" "$HOME/.claude/settings.json" || fail "hooks left in settings.json"
[ ! -e "$HOME/.pi/agent/extensions/momentry.ts" ] && [ ! -e "$HOME/.omp/agent/extensions/momentry.ts" ] || fail "pi/omp extension left"
! grep -q '"momentry"' "$HOME/.gemini/config/hooks.json" || fail "Antigravity hook group left"
! grep -q "momentry" "$HOME/.codex/hooks.json" || fail "Codex hooks left"
LEFT=$(find "$HOME/.claude" "$HOME/.codex" "$HOME/.pi" "$HOME/.omp" "$HOME/.gemini" "$HOME/.agents" \( -name 'momentry*' -o -name 'bip.md' -o -path '*/skills/bip' \) ! -name '*.momentry-bak-*' -print)
[ -z "$LEFT" ] || fail "agent commands or skills left: $LEFT"
[ -f "$HOME/.config/momentry/config.json" ] || fail "config was removed without --purge"
[ -f "$WORK/repo/.momentry.json" ] || fail "repo file was removed"
if command -v momentry >/dev/null 2>&1 && [ "$(command -v momentry)" = "$BIN" ]; then fail "command still resolves"; fi

echo "OK: installer lifecycle"
