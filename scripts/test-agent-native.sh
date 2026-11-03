#!/bin/sh
# Agent-native loop on a clean HOME: install, then only `init --yes --json` and `doctor --json`, running every
# `next[]` command until doctor reports ok. Fails if it does not converge in 4 rounds.
# Usage: sh scripts/test-agent-native.sh
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT INT TERM
unset XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME CLAUDE_CONFIG_DIR CODEX_HOME MOMENTRY_HOME MOMENTRY_INSTALL_DIR \
  MOMENTRY_CONFIG MOMENTRY_CACHE MOMENTRY_RELEASE_BASE MOMENTRY_VERSION MOMENTRY_REPOS MOMENTRY_PRIVACY_SOURCES 2>/dev/null || true
export HOME="$WORK/home"
mkdir -p "$HOME/.claude"
PATH="$ROOT/test/fixtures/fake-claude:$PATH"
export PATH
BIN="$HOME/.local/bin/momentry"

node --input-type=module -e "const { buildRelease } = await import('$ROOT/scripts/package-release.mjs'); buildRelease({ out: '$WORK/rel' });"
sh "$WORK/rel/install.sh" --local-fixture "$WORK/rel" --yes --no-modify-path >/dev/null 2>&1
mkdir -p "$WORK/repo" && cd "$WORK/repo" && git init -q

# The agent: run every `momentry …` command from next[]. A `<…>` placeholder is data only the user has
# (names to block); the agent asks the user and fills it in. Here the "user" answers "Tên Riêng Cần Chặn".
act() {
  node -e 'const j = JSON.parse(require("fs").readFileSync(0, "utf8")); console.log((j.next ?? []).join("\n"));' |
  while IFS= read -r cmd; do
    case "$cmd" in
      "momentry "*)
        cmd=$(printf '%s' "$cmd" | sed 's/<[^>]*>/Tên Riêng Cần Chặn/g')
        printf '   agent runs: %s\n' "$cmd"
        eval "\"$BIN\" ${cmd#momentry }" >/dev/null 2>&1 || true ;;
    esac
  done
}

"$BIN" init --yes --json > "$WORK/init.json" || true
act < "$WORK/init.json"
round=1
while [ "$round" -le 4 ]; do
  if "$BIN" doctor --json > "$WORK/doctor.json"; then
    "$BIN" init --yes --json | node -e 'process.exit(JSON.parse(require("fs").readFileSync(0,"utf8")).ok ? 0 : 1)' || { echo "FAIL: init not ready after doctor ok" >&2; exit 1; }
    echo "OK: agent-native loop converged in $round round(s)"
    exit 0
  fi
  printf '== round %s\n' "$round"
  act < "$WORK/doctor.json"
  round=$((round + 1))
done
echo "FAIL: doctor still not ok after 4 rounds:" >&2
node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); for (const c of j.data.checks) if (c.status!=="ok"&&c.status!=="skip") console.error(` ${c.code}: ${c.detail} | fix: ${c.fix}`)' < "$WORK/doctor.json"
exit 1
