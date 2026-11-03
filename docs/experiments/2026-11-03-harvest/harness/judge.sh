#!/usr/bin/env bash
# Chấm mỗi lần chạy theo 7 chuyện đáp án trong cửa sổ (hop-chua nằm ngoài cửa sổ L1-L4405).
set -u
SAMPLE="$(cd "$(dirname "$0")/../../.." && pwd)/sample"
cd "$(dirname "$0")/out"
GOLD=$(for f in "$SAMPLE"/2026-*.md; do
  case "$f" in *hop-chua*) continue;; esac
  echo "### GOLD $(basename "$f" .md)"; sed -n '/^# /,$p' "$f"; echo; done)
# bash judge.sh [run ...]   không có tham số thì chấm mọi parsed-e*.json
runs=("$@"); [ ${#runs[@]} -eq 0 ] && runs=($(ls parsed-e*.json | sed 's/^parsed-//; s/\.json$//'))
for run in "${runs[@]}"; do
  p=parsed-$run.json
  (
    STORIES=$(node -e 'const j=require("./'"$p"'");j.stories.forEach((s,i)=>console.log(`S${i+1}: ${s.title} | ${s.what_happened} | lines ${JSON.stringify(s.lines)}`))')
    cat > "judge-in-$run.txt" <<EOF
Bạn chấm một lần chạy "harvest" (máy nhặt chuyện từ transcript) so với 7 chuyện đáp án do người ghi.

ĐÁP ÁN:
$GOLD

CHUYỆN MÁY NHẶT:
$STORIES

Với mỗi chuyện đáp án, chỉ ra chuyện máy nào (S-id) nói về CÙNG sự kiện cốt lõi (không cần cùng câu chữ, nhưng phải cùng sự kiện và cùng điểm chính; chỉ nhắc lướt trong chuyện khác thì là "partial"). Rồi phân loại mọi chuyện máy KHÔNG khớp đáp án: "new" (sự kiện riêng, có vẻ có thật, đáng đọc với người ngoài), "weak" (có thật nhưng nhạt, ít giá trị kể), "dup" (trùng chuyện máy khác), "dubious" (có vẻ bịa hoặc sai số liệu so với chính nó).
Chỉ trả JSON: {"gold":[{"id":"<tên file đáp án>","match":"S3"|null,"level":"full"|"partial"|"miss"}],"extras":[{"s":"S5","class":"new|weak|dup|dubious","note":"ngắn"}]}
EOF
    claude -p --model sonnet --setting-sources "" --tools "" --strict-mcp-config --no-session-persistence \
      --output-format json < "judge-in-$run.txt" > "judge-raw-$run.json" 2>/dev/null
    echo "$run judged"
  ) &
done
wait
