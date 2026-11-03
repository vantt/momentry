#!/usr/bin/env bash
# Chạy song song các lần harvest bằng claude -p cô lập (không hook, không MCP, không tool).
# bash run.sh <model> <variant:run> [<variant:run> ...]   vd: bash run.sh haiku e4:3 e4:4 e4n:1
set -u
cd "$(dirname "$0")/out"
model=$1; shift
for vr in "$@"; do
  v=${vr%%:*}; r=${vr##*:}
  (
    start=$(date +%s)
    STORY_HARVEST=1 claude -p --model "$model" --setting-sources "" --tools "" --strict-mcp-config \
      --no-session-persistence --output-format json < "prompt-$v.txt" > "raw-$v-$r.json" 2> "err-$v-$r.txt"
    echo "$v-$r model=$model exit=$? secs=$(( $(date +%s) - start ))" >> runs.log
  ) &
done
wait
