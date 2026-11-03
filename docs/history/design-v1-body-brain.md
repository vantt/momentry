# Docu-Moment Design

**Mục đích tài liệu:** Thiết kế cơ chế tự quan sát nhẹ trong session Claude Code và Codex để nhận ra những khoảnh khắc đáng kể chuyện (build in public) và giữ lại đủ chất liệu để kể, mà không làm lệch tiến trình làm việc chính.

```text
Không bỏ lỡ khoảnh khắc đáng kể,
kể cả khi chính người làm thấy nó bình thường.
```

Docu-moment là một lens chuyên biệt đặt trên raw capture. Nó tái dùng candidate marker, envelope, buffer và non-interference policy của Raw Capture Design (tài liệu trong repo riêng của CIS). Phần mới của tài liệu này là: cách chấm điểm mở rộng được, cách tổ chức chất liệu khi một moment được ghi nhận, và bộ óc nhà kể chuyện quyết định moment nào đáng kể.

Tài liệu này không thiết kế việc viết bài, lịch đăng hay kênh phân phối. Những phần đó thuộc Content Intelligence Service.

**Trạng thái:** Draft.

---

## 1. Thesis

Keyword trigger chỉ bắt được **phản ứng của người làm**: "hóa ra", "tôi cứ tưởng", "sai rồi". Nhưng chất liệu kể chuyện tốt nhất thường nằm ở chỗ người làm **không phản ứng gì**, vì họ quá rành. Đó là lời nguyền kiến thức (curse of knowledge): việc người làm thấy bình thường lại là việc người ngoài thấy "wow", thấy thèm, muốn biết làm sao.

Vì vậy docu-moment tách thành hai cơ chế với hai câu hỏi khác nhau:

| Cơ chế | Câu hỏi | Tính chất | Chạy ở đâu |
|---|---|---|---|
| **Thân (Body)** | Chuyện gì vừa xảy ra, có dấu hiệu nào, bằng chứng nằm ở đâu? | Cứng, thuần cơ học, rẻ, quyết định được | Trong session, qua hook và script |
| **Óc (Brain)** | Đây có phải một moment đáng kể không, kể cho ai, kể theo hình dạng nào? | Phán đoán, chuyên gia, có thể dùng LLM | Ngoài session, theo lô, có người duyệt |

Hợp đồng giữa hai cơ chế:

```text
Body thu rộng, chấm sơ, ghi signal thô và con trỏ tới bằng chứng.
Body không bao giờ tự quyết "đáng kể", chỉ quyết "đáng giữ".
Brain đọc signal và bằng chứng, phán "đáng kể", không bao giờ chạm vào session chính.
Người duyệt có tiếng nói cuối cùng; nhãn của người duyệt quay về chỉnh cả Body lẫn Brain.
```

Nguyên tắc cốt lõi:

```text
Observe everything cheap.
Keep signals, not just scores.
Point to evidence, do not copy it.
Judge later, with an outsider's eyes.
Learn from what actually got told.
```

---

## 2. Design Priorities

| Ưu tiên | Vấn đề | Lý do |
|---:|---|---|
| 1 | Không bỏ lỡ moment | Không bắt được thì không có gì để kể. Ngưỡng giữ ở Body phải thấp. |
| 2 | Non-interference | Hook phải nhanh, fail-open, im lặng. Không gọi LLM trong session. |
| 3 | Chấm điểm thay được | Cách nhận ra moment sẽ đổi liên tục. Đổi cách chấm không được làm mất dữ liệu cũ. |
| 4 | Vượt qua curse of knowledge | Phải có tín hiệu không phụ thuộc vào phản ứng của người làm. |
| 5 | Truy vết bằng chứng | Mỗi moment truy được về session, turn, file, commit, thời điểm. |
| 6 | Học từ kết quả thật | Nhãn duyệt và phản ứng của khán giả phải chỉnh được trọng số. |

---

# Phần A — Thân: cơ chế cứng

Phần A gồm mọi thứ chạy được bằng script, không cần phán đoán: điểm móc vào runtime, gom ngữ cảnh, detector, chấm sơ, lưu marker, và gom chất liệu khi moment được ghi nhận.

## 3. Pipeline tổng thể

```text
Hook point
  -> Turn context      (gom dữ liệu thô của turn vừa xong)
  -> Detectors         (plugin, mỗi cái sinh 0..n signal)
  -> Signals           (lưu nguyên, có evidence)
  -> Scorer profiles   (nhiều profile chạy song song)
  -> Keep decision     (qua ngưỡng giữ của ít nhất một profile)
  -> Moment marker     (con trỏ, không phải bản sao)
  ...
  -> Evidence bundle   (chỉ dựng khi Brain hoặc người dùng quyết định ghi nhận)
```

Body chia hai nhịp:

- **Nhịp nóng (in-session):** từ hook point tới moment marker. Ngân sách vài chục mili giây.
- **Nhịp nguội (out-of-session):** dựng evidence bundle, backfill từ transcript, chấm lại. Không có ngân sách thời gian chặt.

---

## 4. Hook Points

Tận dụng mọi điểm móc chính thức của runtime. Mỗi điểm cho một loại dữ liệu khác nhau.

### 4.1 Claude Code

Hook nhận JSON qua stdin, có `session_id`, `transcript_path`, `cwd`, `hook_event_name`.

| Hook | Dùng để | Ghi chú |
|---|---|---|
| `SessionStart` | Mở session record: cwd, git sha, branch, thời điểm | Mốc đầu cho detector đo thời lượng, đòn bẩy |
| `UserPromptSubmit` | Ghi prompt, đo độ dài, phát hiện correction và manual marker (`/bip`) | Không chèn context, không chặn |
| `PostToolUse` | Đếm tool call, file sửa, command chạy, exit code test | Chỉ ghi số liệu, không đọc nội dung lớn |
| `Stop` | Điểm chính: gom turn context, chạy detector, chấm, ghi marker | Turn boundary tự nhiên |
| `SubagentStop` | Ghi việc ủy quyền cho subagent | Tín hiệu điều phối, meta-work |
| `PreCompact` | Đánh dấu session dài, giữ con trỏ trước khi context bị nén | Tương ứng `long_session_drift` |
| `SessionEnd` | Chốt session: tổng hợp, chạy detector cấp session, xếp hàng backfill | Tương ứng `process_exit_risk` |

### 4.2 Codex

| Nguồn | Dùng để | Ghi chú |
|---|---|---|
| Hook (`SessionStart`, `Stop`, ...) nếu bản Codex đang dùng hỗ trợ | Giống Claude Code | Cần xác minh payload có `transcript_path` hay không |
| `notify` trong config | Báo turn kết thúc | Fallback khi không có hook đủ |
| Session rollout `~/.codex/sessions/**` | Đọc lại nội dung turn bằng `session_id` | Nguồn backfill chính |

### 4.3 Nguồn ngoài runtime

| Nguồn | Dùng để |
|---|---|
| Git (commit, diff stat, branch) | Bằng chứng thay đổi thật, đo khối lượng |
| Workspace (file mới trong `.claude/`, `.agents/`, `scripts/`, hook, skill) | Phát hiện meta-work: tự làm công cụ cho mình |
| Manual `/bip [ghi chú]` | Người dùng chủ động đánh dấu, điểm cao nhất |
| Manual `/bip wow <mô tả>` | Ghi nhận phản ứng "wow" của người khác ngoài đời |
| Agent self-mark (rule trong CLAUDE.md / AGENTS.md) | Agent ghi marker kèm một câu "vì sao hay" |
| Transcript poll | Backfill những turn hook bỏ sót, chạy ở nhịp nguội |

---

## 5. Turn Context

Mỗi lần `Stop`, script dựng một `turn_context` từ hook input, tail của transcript và số liệu tích lũy từ `PostToolUse`. Detector chỉ đọc `turn_context`, không tự đọc file khác.

```json
{
  "runtime": "claude_code",
  "session_id": "…",
  "transcript_path": "~/.claude/projects/…/…jsonl",
  "turn": {
    "index": 14,
    "transcript_line_start": 812,
    "transcript_line_end": 861,
    "started_at": "2026-11-03T09:12:04Z",
    "ended_at": "2026-11-03T09:16:40Z"
  },
  "user_prompt": { "text": "…", "chars": 412, "language": "vi" },
  "assistant_text_tail": "…",
  "tools": { "calls": 9, "by_name": { "Edit": 3, "Bash": 5, "Read": 1 } },
  "files": { "changed": ["…"], "created": ["…"], "lines_added": 220, "lines_removed": 14 },
  "commands": [{ "cmd_kind": "test", "exit_code": 1 }, { "cmd_kind": "test", "exit_code": 0 }],
  "workspace": { "cwd": "…", "git_sha_before": "…", "git_sha_after": "…" },
  "session_so_far": { "turns": 14, "minutes": 52, "markers": 3 }
}
```

Giới hạn để giữ nhanh:

- Chỉ tail tối đa N dòng transcript cho turn hiện tại.
- Văn bản cắt ở giới hạn ký tự trước khi đưa vào detector.
- Không đọc nội dung file đã sửa, chỉ tên file và diff stat.

---

## 6. Detector Plugin

### 6.1 Interface

```text
detect(turn_context, history_view) -> [Signal]
```

```json
{
  "name": "test_fail_then_pass",
  "family": "structural",
  "strength": 0.8,
  "evidence": {
    "transcript_lines": [830, 858],
    "files": [],
    "note": "2 lần test fail rồi pass trong cùng turn"
  },
  "detector": "structural.test_cycle@1"
}
```

Quy ước:

- Mỗi detector là một file trong `detectors/`, có `name`, `version`, `family`, `cost_class` (`hot` / `cold`).
- Detector `hot` chạy trong nhịp nóng, phải thuần cục bộ, không mạng, không LLM.
- Detector `cold` chỉ chạy ở nhịp nguội (vd cần đọc lịch sử nhiều session, cần LLM).
- Detector lỗi thì bị bỏ qua, ghi vào log lỗi, không làm hỏng turn.
- `history_view` là chỉ mục nhỏ đọc sẵn (tần suất chủ đề, công cụ đã dùng, chuyện đã kể), không phải toàn bộ lịch sử.

### 6.2 Danh mục detector ban đầu

| Family | Detector | Bắt gì | Cost |
|---|---|---|---|
| linguistic | `self_surprise` | "hóa ra", "tôi cứ tưởng", "thì ra", "aha" | hot |
| linguistic | `user_correction` | "không, ý tôi là", "sai rồi", "không phải vậy" | hot |
| linguistic | `decision_tradeoff` | "chọn A vì", "thay vì", "đánh đổi" | hot |
| linguistic | `emotion_burst` | "ồ", "hay quá", "cuối cùng cũng", "wtf" | hot |
| manual | `bip_marker` | `/bip`, "ghi lại", "lưu cái này" | hot |
| manual | `bip_wow` | `/bip wow` từ phản ứng người ngoài | hot |
| structural | `test_fail_then_pass` | Chu kỳ đỏ rồi xanh | hot |
| structural | `revert_or_retry` | Revert, làm lại, bỏ hướng cũ | hot |
| structural | `leverage_ratio` | Prompt ngắn sinh nhiều file/dòng/tool call | hot |
| structural | `long_turn` | Turn kéo dài, nhiều bước | hot |
| behavioral | `expert_override` | Người dùng bác đề xuất hợp lý của agent bằng giọng chắc chắn, không hỏi lại | hot |
| behavioral | `context_explaining` | Người dùng phải giải thích ngữ cảnh dài cho agent | hot |
| behavioral | `agent_asks_what` | Agent hỏi "X là gì", cần làm rõ thuật ngữ riêng | hot |
| artifact | `meta_work` | Tạo/sửa skill, hook, script, CLAUDE.md, AGENTS.md, config agent | hot |
| artifact | `showable_output` | Ảnh, UI, chart, diagram, HTML, artifact có thể chụp màn hình | hot |
| artifact | `commit_landed` | Commit mới, kèm diff stat | hot |
| history | `fluent_repetition` | Việc người dùng làm trơn tru qua nhiều session | cold |
| history | `unusual_combo` | Kết hợp công cụ/khái niệm hiếm gặp cùng nhau | cold |
| history | `already_told` | Chủ đề đã kể (dùng để trừ điểm) | cold |
| session | `learning_chain` | Chuỗi câu hỏi cùng chủ đề đi từ how tới why | cold |

Danh mục này là điểm xuất phát. Thêm detector chỉ là thêm file và bật trong config.

---

## 7. Scoring

### 7.1 Tách signal khỏi score

Marker luôn lưu **toàn bộ signal thô**. Điểm chỉ là kết quả của một profile ở một version. Hệ quả:

- Đổi trọng số, thêm combo, đổi ngưỡng thì chấm lại toàn bộ marker cũ, không cần detect lại.
- Thêm detector mới thì chạy lại detector đó trên transcript cũ (nhịp nguội), rồi chấm lại.
- So sánh hai cách chấm trên cùng dữ liệu là việc bình thường, không phải thí nghiệm riêng.

### 7.2 Profile

Nhiều profile chạy song song trên cùng bộ signal. Mỗi profile một mục đích.

```yaml
# ~/.cis/docu-moment/scoring.yaml
version: 3
profiles:
  build-in-public:
    keep_threshold: 0.35        # ngưỡng giữ: thấp, ưu tiên không bỏ lỡ
    weights:
      self_surprise: 0.5
      user_correction: 0.4
      decision_tradeoff: 0.4
      test_fail_then_pass: 0.5
      leverage_ratio: 0.6
      meta_work: 0.7
      showable_output: 0.5
      expert_override: 0.6
      context_explaining: 0.4
      bip_marker: 1.0
      bip_wow: 1.0
    combos:
      - when: [user_correction, test_fail_then_pass]
        bonus: 0.3
      - when: [meta_work, showable_output]
        bonus: 0.3
    penalties:
      already_told: -0.4
  learning:
    keep_threshold: 0.4
    weights:
      self_surprise: 0.8
      learning_chain: 0.7
      user_correction: 0.5
```

Chiến lược chấm là plugin như detector: `weighted_sum` (mặc định), `rules` (combo, điều kiện bắt buộc), sau này `model` (mô hình học từ nhãn). Profile chỉ định chiến lược nào.

### 7.3 Quyết định giữ

```text
keep = any(profile.score >= profile.keep_threshold for profile in profiles)
     or any(signal.family == "manual")
```

Ngưỡng giữ cố ý thấp. Body chỉ trả lời "có đáng giữ con trỏ không". Việc lọc chặt là của Brain.

---

## 8. Moment Marker

Marker là con trỏ tới bằng chứng, không chép nội dung.

```json
{
  "id": "dm_2026-11-03_8f2c",
  "type": "docu_moment_marker",
  "created_at": "2026-11-03T09:16:41Z",
  "runtime": "claude_code",
  "session_id": "…",
  "transcript_path": "…",
  "turn_index": 14,
  "transcript_lines": [812, 861],
  "cwd": "/home/vantt/projects/cis",
  "git_sha": "51cd949",
  "signals": [ { "name": "meta_work", "strength": 0.9, "evidence": { "files": [".claude/skills/distill/SKILL.md"] }, "detector": "artifact.meta_work@1" } ],
  "scores": { "build-in-public": { "score": 0.82, "scorer_version": 3 } },
  "snippet": "≤ 300 ký tự, đã redact",
  "self_note": "ghi chú của người dùng hoặc agent, nếu có",
  "status": "kept"
}
```

`status` đi qua các trạng thái: `kept` → `judged` → `selected` / `dismissed` → `bundled` → `told`.

---

## 9. Lưu trữ

```text
~/.cis/docu-moment/
  scoring.yaml               # profile và trọng số hiện hành
  detectors/                 # plugin detector
  scorers/                   # plugin chiến lược chấm
  markers/2026-11-03.jsonl   # marker, append-only, một file mỗi ngày
  sessions/<session_id>.json # trạng thái tích lũy trong session (PostToolUse đếm vào đây)
  index/history.json         # history_view: tần suất chủ đề, công cụ, chuyện đã kể
  judgments/2026-11-03.jsonl # kết quả của Brain
  labels.jsonl               # nhãn người duyệt và phản ứng khán giả
  ledger.jsonl               # sổ chuyện đã kể
  bundles/<marker_id>/       # evidence bundle, chỉ có khi được chọn
  fixtures/                  # turn mẫu đã gắn nhãn, dùng để kiểm thử
  errors.log
```

Theo Raw Capture Design (tài liệu trong repo riêng của CIS) mục Retention: marker `dismissed` hết hạn sau một khoảng thời gian, bundle `told` giữ lâu dài.

---

## 10. Evidence Bundle

Khi Brain hoặc người dùng chọn một marker, nhịp nguội dựng một bundle đủ để kể mà không cần mở lại session.

```text
bundles/<marker_id>/
  moment.json        # marker + judgment + lý do được chọn
  excerpt.md         # đoạn trích transcript: khoảng 4 turn trước, 3 turn sau, đã redact
  diff.patch         # diff của các commit/file liên quan, đã giới hạn kích thước
  artifacts/         # ảnh chụp, diagram, file kết quả (copy hoặc link)
  timeline.json      # mốc thời gian: bắt đầu, các lần fail, bước ngoặt, xong
  numbers.json       # số liệu khoe được: thời gian, số file, số dòng, tỉ lệ đòn bẩy
  related.json       # các marker cùng chủ đề (để dựng arc)
```

Quy tắc dựng bundle:

- Redact secret trước khi ghi bất cứ thứ gì ra bundle.
- Span trích có thể mở rộng nếu marker là một phần của arc (xem mục 16).
- Nếu transcript gốc đã mất, bundle vẫn dựng từ snippet và git, đánh dấu `partial: true`.

---

## 11. Non-Interference

| Quy tắc | Giá trị |
|---|---|
| Ngân sách nhịp nóng mỗi hook | < 50ms mục tiêu, cắt cứng ở 200ms |
| Exit code | Luôn `0` |
| Stdout | Không in gì (tránh chèn vào context hoặc chặn agent) |
| Mạng / LLM trong nhịp nóng | Không |
| Lỗi detector | Bỏ qua detector đó, ghi `errors.log` |
| Ghi file | Append-only, không khóa lâu |
| Hook config | Nối vào config sẵn có của runtime, không serialize lại toàn bộ (bài học `merge-into-runtime-config-never-reserialize` từ agent-beacon) |

---

## 12. Fixtures Và Replay

- `fixtures/` chứa các turn mẫu thật đã gắn nhãn: `tell`, `maybe`, `skip`, kèm lý do.
- Lệnh replay chạy detector và scorer hiện hành trên fixtures, in ra precision/recall theo profile.
- Mọi thay đổi detector, trọng số, ngưỡng phải chạy replay trước khi bật.
- Nhãn mới từ người duyệt (mục 18) được đề xuất đưa vào fixtures.

---

# Phần B — Óc: bộ óc nhà kể chuyện

Phần B trả lời câu hỏi Body không trả lời được: **moment này có đáng kể không, kể cho ai, kể theo hình dạng nào**. Body đo được "chuyện gì xảy ra". Brain đo "chuyện đó cách cái người khác biết bao xa, và người khác có muốn nó không".

## 13. Moment đáng kể là gì

Một moment đáng kể khi có **khoảng cách** giữa điều người làm đã làm và điều khán giả biết hoặc có, cộng với **lực kéo** khiến khán giả muốn vượt qua khoảng cách đó.

```text
story_value ≈ gap × pull × shape × proof − told_before
```

| Thành phần | Câu hỏi |
|---|---|
| `gap` | Việc này cách cách làm phổ biến bao xa? Người ngoài có biết nó tồn tại không? |
| `pull` | Người ngoài có muốn có nó, muốn làm được, tò mò cách làm không? |
| `shape` | Có kể được thành chuyện không: có căng thẳng, bước ngoặt, kết quả, bài học? |
| `proof` | Có bằng chứng cho thấy được không: số liệu, ảnh, diff, trước/sau? |
| `told_before` | Đã kể chủ đề này chưa, khán giả đã thấy chưa? |

Công thức không để tính chính xác. Nó là khung để Brain và người duyệt cùng nói một ngôn ngữ.

---

## 14. Các lens

Brain nhìn mỗi marker qua nhiều lens. Một marker chỉ cần mạnh ở một lens là đáng xem xét.

| Lens | Nhìn vào | Bắt được |
|---|---|---|
| **Self-surprise** | Phản ứng của chính người làm | Khoảnh khắc người làm tự thấy lạ, đổi nhận thức |
| **Outsider** | Khoảng cách với thực tế phổ biến | Việc người làm thấy bình thường nhưng người ngoài thấy wow (curse of knowledge) |
| **Arc** | Nhiều marker yếu nối nhau qua thời gian | Hành trình: từ vấn đề tới giải pháp qua nhiều session |
| **Audience** | Vấn đề này phổ biến với khán giả mục tiêu không | Nỗi đau chung, giải pháp không phổ biến |

---

## 15. Outsider Lens

Đây là lens giải quyết curse of knowledge. Nó không hỏi "người làm có bất ngờ không", mà hỏi "**người ngoài có bất ngờ không**".

### 15.1 Tín hiệu khoảng cách

Những tín hiệu này đến từ Body, nhưng Brain đọc chúng theo góc nhìn người ngoài:

| Tín hiệu | Người ngoài nghĩ gì | Hình dạng chuyện gợi ý |
|---|---|---|
| Đòn bẩy / nén (`leverage_ratio`) | "Nhanh vậy sao?" | Trước/sau, số liệu thời gian |
| Tự làm công cụ (`meta_work`) | "Setup của anh là gì?" | Setup tour, workflow reveal |
| Kết hợp lạ (`unusual_combo`) | "Chưa từng nghĩ ghép hai thứ này" | Ghép nối bất ngờ |
| Thói quen lặp lại (`fluent_repetition`) | "Anh làm cái này hằng ngày à?" | Thói quen chuyên gia, hướng dẫn |
| Gu / phán đoán (`expert_override`) | "Sao anh biết hướng kia sai?" | Bài học từ kinh nghiệm |
| Tốn công giải thích (`context_explaining`, `agent_asks_what`) | "Cái này là gì?" | Tutorial, giải thích khái niệm |
| Có thứ để khoe (`showable_output`) | "Cho xem với" | Demo, ảnh, video ngắn |
| Đi ngược số đông | "Sao không làm như mọi người?" | Quan điểm trái chiều |

### 15.2 Persona panel

Ở nhịp nguội, LLM đóng vai một hội đồng nhỏ đại diện cho khán giả. Mỗi persona đọc evidence (snippet, số liệu, mô tả việc đã làm) và chấm độc lập.

Persona mặc định:

| Persona | Đại diện |
|---|---|
| `junior_dev` | Người mới làm nghề, muốn học cách làm |
| `peer_expert` | Chuyên gia cùng ngành, khó gây ấn tượng |
| `non_tech_creator` | Creator không rành kỹ thuật, quan tâm kết quả |
| `ai_tool_user` | Người dùng AI tool hằng ngày, so với cách mình đang dùng |

Mỗi persona chấm 4 trục, thang 0–3:

| Trục | Câu hỏi cho persona |
|---|---|
| `novel_to_me` | Tôi đã biết cái này chưa? |
| `want_it` | Tôi có muốn có thứ này / làm được thế này không? |
| `could_follow` | Đọc xong tôi có làm theo được không? |
| `clear_before_after` | Tôi thấy rõ trước và sau không? |

Output:

```json
{
  "marker_id": "dm_2026-11-03_8f2c",
  "panel_version": 1,
  "personas": {
    "junior_dev":       { "novel_to_me": 3, "want_it": 3, "could_follow": 2, "clear_before_after": 2, "reaction": "…" },
    "peer_expert":      { "novel_to_me": 1, "want_it": 2, "could_follow": 3, "clear_before_after": 2, "reaction": "…" },
    "non_tech_creator": { "novel_to_me": 3, "want_it": 2, "could_follow": 1, "clear_before_after": 3, "reaction": "…" }
  },
  "baseline_note": "Cách làm phổ biến hiện nay là …, việc này khác ở …"
}
```

Lý do dùng LLM ở đây: LLM là một đại diện khá tốt cho "người làm nghề trung bình". Nó biết cách làm phổ biến, nên đo được khoảng cách giữa việc người làm đã làm và chuẩn chung, thứ mà chính người làm không còn thấy.

Persona, trục và prompt là cấu hình, có version, thay được như detector.

---

## 16. Arc Lens

Nhiều moment không mạnh khi đứng riêng nhưng mạnh khi nối lại: một vấn đề xuất hiện ở session thứ nhất, một hướng sai ở session thứ ba, bước ngoặt ở session thứ năm.

Cách nối:

- Gom marker theo chủ đề (từ khóa, file, thư mục, khái niệm chung).
- Sắp theo thời gian, tìm các vai: `problem`, `attempt`, `failure`, `turning_point`, `result`.
- Arc có đủ ít nhất `problem` + `turning_point` + `result` thì thành ứng viên, kể cả khi từng marker có điểm thấp.

Arc là lý do Body phải giữ ngưỡng thấp: marker điểm thấp hôm nay có thể là mảnh ghép của một chuyện lớn tuần sau.

---

## 17. Hình dạng chuyện

Brain gán mỗi ứng viên vào một hoặc vài hình dạng. Hình dạng quyết định bundle cần những gì.

| Hình dạng | Cấu trúc | Cần bằng chứng |
|---|---|---|
| Tưởng X, hóa ra Y | Giả định → va chạm → nhận thức mới | Đoạn trích trước và sau |
| Đòn bẩy | Việc lớn → cách làm nhỏ → kết quả | Số liệu thời gian, khối lượng |
| Setup tour | Công cụ tự làm → vì sao → dùng thế nào | File config, skill, ảnh |
| Debug journey | Lỗi → giả thuyết → sai → đúng → bài học | Timeline, các lần fail |
| Đi ngược số đông | Cách phổ biến → cách của tôi → lý do | Baseline note, kết quả |
| Thất bại có giá | Thử → hỏng → học được gì | Diff revert, lý do bỏ |
| Build log | Tiến độ qua nhiều mốc | Arc, commit |

Thiếu bằng chứng cho hình dạng đã chọn thì ứng viên bị hạ `proof`, không bị loại.

---

## 18. Novelty Và Ledger

- `ledger.jsonl` ghi mỗi chuyện đã kể: chủ đề, hình dạng, ngày, kênh, link.
- Ứng viên trùng chủ đề và hình dạng với chuyện đã kể gần đây bị trừ `told_before`.
- Cùng chủ đề nhưng hình dạng khác, hoặc có bước tiến mới, thì không bị trừ (đó là phần tiếp theo, không phải lặp lại).

---

## 19. Vòng phản hồi và hiệu chỉnh

Đây là cách Brain và Body học dần khẩu vị thật.

| Nguồn | Cách thu | Dùng để |
|---|---|---|
| Nhãn duyệt | Người dùng gắn `tell` / `maybe` / `skip` cho ứng viên | Chỉnh trọng số profile, thêm vào fixtures |
| Phản ứng khán giả | Sau khi đăng: like, comment, câu hỏi "làm sao", lượt lưu | Chỉnh trọng số theo tín hiệu và theo hình dạng |
| Wow ngoài đời | `/bip wow <việc gì>` khi ai đó ấn tượng lúc xem người làm làm việc | Tín hiệu mạnh nhất cho outsider lens; tìm marker liên quan và tăng trọng số các signal của nó |
| Bất đồng panel và người duyệt | Panel chấm cao nhưng người dùng `skip`, hoặc ngược lại | Chỉnh persona, prompt, trục |

Nguyên tắc: hiệu chỉnh sinh **đề xuất** thay đổi `scoring.yaml` hoặc cấu hình panel, chạy replay trên fixtures, người dùng duyệt rồi mới áp dụng. Không tự đổi trọng số âm thầm.

---

## 20. Output của Brain

```json
{
  "candidate_id": "sc_2026-11-03_01",
  "markers": ["dm_2026-11-03_8f2c", "dm_2026-10-29_11ab"],
  "lens_hits": ["outsider", "arc"],
  "shape": "setup_tour",
  "story_value": { "gap": 0.8, "pull": 0.7, "shape": 0.6, "proof": 0.9, "told_before": 0.0 },
  "hook_line": "Một câu mở đầu thử",
  "why_outsiders_care": "…",
  "missing_evidence": ["ảnh chụp kết quả"],
  "status": "awaiting_review"
}
```

Ứng viên đi qua review gate của người dùng. Chỉ ứng viên được chọn mới kích hoạt dựng evidence bundle đầy đủ và chuyển sang Content Intelligence Service.

---

## 21. MVP Slice

Làm theo thứ tự, mỗi bước dùng được ngay:

1. **Body tối thiểu:** hook `Stop` + `UserPromptSubmit` cho Claude Code; 6 detector hot (`bip_marker`, `self_surprise`, `user_correction`, `test_fail_then_pass`, `meta_work`, `leverage_ratio`); một profile `build-in-public` dạng `weighted_sum`; ghi marker.
2. **Manual:** lệnh `/bip` và `/bip wow`.
3. **Review tay:** skill `/bip-review` liệt kê marker trong ngày kèm snippet, người dùng gắn nhãn. Chưa có panel.
4. **Fixtures + replay:** lấy nhãn ở bước 3 làm fixtures.
5. **Outsider panel:** thêm persona panel vào `/bip-review`.
6. **Codex:** nối hook hoặc notify, backfill từ `~/.codex/sessions`.
7. **Arc + ledger:** nối marker qua session, ghi chuyện đã kể.

---

## 22. Open Questions

- Payload hook `Stop` của Codex có `transcript_path` không, hay phải tìm rollout bằng `session_id`?
- `leverage_ratio` nên đo bằng gì: số dòng, số file, số tool call, hay thời gian ước tính cho người làm tay?
- Baseline "cách làm phổ biến" của outsider panel lấy từ đâu ngoài kiến thức của LLM? Có cần một bộ ví dụ khán giả thật?
- Persona panel nên chạy mỗi ngày hay chỉ khi người dùng mở `/bip-review`?
- Arc nối bằng heuristic chủ đề có đủ không, hay cần embedding?
- Phản ứng khán giả sau khi đăng thu thế nào mà không phải nhập tay?
- Docu-moment dùng chung buffer với raw capture hay buffer riêng `~/.cis/docu-moment/`?
