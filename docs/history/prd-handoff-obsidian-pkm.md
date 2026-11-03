# docu-moment: nhặt chất liệu kể chuyện (build in public) ngay trong phiên làm việc

**Nguồn:** chat Claude 2026-11-03 trong repo `vantt/obsidian-pkm-automation` (sau việc E12.9): user thấy chính việc đang làm (đo và sửa tìm kiếm tiếng Việt của Obsidian, duyệt golden set) là chuyện người ngoài quan tâm · **Mẫu:** [sample/](../sample/README.md) (bản chép hộp chứa và 8 chuyện thật từ repo nguồn, nguyên trạng ngày bàn giao)

**Trạng thái:** bàn giao 2026-11-03 cho project khác làm tiếp; repo nguồn không theo tiếp. DM.0 (bản tay) đã chạy ở repo nguồn. Mục 9 là lời dặn cho agent tiếp quản. Các đường dẫn `docs/blog/storytelling-material/`, `AGENTS.md`, `scripts/story/` trong PRD là cách bố trí ở repo nguồn; project nhận tự đặt lại cho hợp.

## 1. Vì sao cần

Người dùng đích của dự án là người làm một mình (solo, freelancer, công ty một người). Họ cần kể công việc của mình ra ngoài (build in public) nhưng không có thời gian ngồi nhớ lại. Chuyện hay nhất thường xảy ra giữa lúc làm, trong chat với agent: một con số đổi, một lỗi có nguyên nhân bất ngờ, một quyết định bị đảo. Hết phiên là quên, transcript thì dài và không ai đọc lại.

Agent ở ngay đó, thấy hết. Việc của E13: agent tự nhận ra khoảnh khắc, ghi lại thành chất liệu có nối với nhau, để sau này gom thành bài. Đây cũng là đường ống 5 bước của dự án (capture, triage, highlight, summarize, express) áp vào chính công việc của user: máy giúp bước capture và bước express, người giữ phán đoán.

Bằng chứng chạy được bằng tay (DM.0): một phiên E12.9 cho ra 8 chuyện, trong đó 4 chuyện user thấy rất đáng kể.

## 2. Nguyên tắc (user chốt 2026-11-03)

1. **Ghi nhiều, nối nhiều, lọc sau cùng.** Lúc làm việc không chấm điểm, không bỏ chuyện vì thấy nhỏ. Chuyện nhỏ hôm nay có khi là mảnh của một mạch dài. Chấm và bỏ chỉ ở bước dựng bài, và "bỏ" là đổi `status: dropped`, không xoá file.
2. **Hai cơ chế tách nhau:** (a) cơ học: khi nào kích hoạt, lưu và nối thế nào; (b) phán đoán: chuyện có đáng kể không, nhìn bằng mắt người kể chuyện. (a) làm trước, chạy lúc làm việc, nhạy (thà thừa); (b) làm sau, chạy theo đợt khi user muốn viết, chặt.
3. **Phạm vi: một repo** (repo này) trước. Sau này gom chung nhiều repo để thấy mạch xuyên repo; định dạng phải sẵn cho việc đó ngay từ đầu (mục 5).
4. **Riêng tư như golden set:** chất liệu chỉ ghi cơ chế, con số, tên công cụ. Không tên note, đường dẫn, câu hỏi thật, nội dung vault, tên người trong vault. Transcript chứa đủ thứ đó, nên mọi đường ghi tự động phải qua bộ kiểm (mục 6.4).
5. **Ngôn ngữ:** công cụ là `.mjs` tự chứa, chạy trên Node (không npm), hoặc Rust. Không Python (user chốt 2026-11-02).
6. **Dùng được cho cả Claude Code và Codex.**

## 3. Đã có (DM.0)

- Hộp `docs/blog/storytelling-material/`: README (6 tín hiệu gợi ý, khuôn một file, mục Nối, mục Riêng tư), 8 file chuyện có `links` và `threads`.
- Luật trong `AGENTS.md` (Claude đọc qua `CLAUDE.md`, Codex đọc thẳng): gặp chuyện thì ghi ngay, nối, báo user một dòng cuối lượt.
- Điểm yếu đã biết: chỉ dựa vào agent tự nhớ (phiên dài, đang tập trung là quên); không có đường gom phần bị bỏ sót; chưa có bước dựng bài.

## 4. Kiến trúc

```
              kích hoạt                                   lưu, nối                  dùng (sau)
 ┌──────────────────────────────────┐
 │ L1 agent tự ghi giữa phiên       │──┐
 │    (luật AGENTS.md + skill)      │  │
 ├──────────────────────────────────┤  │   ┌───────────────────────────┐   ┌──────────────────────┐
 │ L2 hook PreCompact / SessionEnd  │──┼──▶│ docs/blog/                │──▶│ biên tập: chấm, gom   │
 │    (Claude, Codex) gọi gom       │  │   │   storytelling-material/  │   │ mạch, dựng dàn ý,     │
 ├──────────────────────────────────┤  │   │ một chuyện một file,      │   │ bản nháp docs/blog/   │
 │ L3 gom từ transcript (tay/hook)  │──┘   │ links, threads, index     │   └──────────────────────┘
 └──────────────────────────────────┘      └───────────────────────────┘
                     mọi đường ghi tự động đi qua: kiểm riêng tư, chống trùng
```

L1 có sẵn (cần làm chắc hơn bằng skill). L2 chỉ là cò súng: hook không tự phán, nó gọi L3 cho đúng phiên vừa xong. L3 là động cơ: đọc transcript, gọi model không giao diện để nhặt chuyện, ghi qua bộ kiểm.

## 5. Định dạng lưu

Giữ khuôn hiện có trong README hộp, thêm trường cho chống trùng và cho việc gom nhiều repo sau này.

```yaml
---
id: 2026-11-02-tu-dien-lam-te-hon        # = tên file, không đổi sau khi tạo
date: 2026-11-02                          # ngày chuyện xảy ra
repo: obsidian-pkm-automation             # MỚI: để sau gom nhiều repo
status: raw                               # raw | picked | drafted | published | dropped
signals: [đảo quyết định có lý do]        # gợi ý, có thể [khác]
source: chat Claude, E12.9                # người đọc hiểu: phiên, plan, commit
sessions: [claude:95ca719b]               # MỚI: id phiên (claude:<uuid8>, codex:<uuid8>) để chống trùng và truy lại
captured_by: live                         # MỚI: live (agent giữa phiên) | harvest (gom từ transcript) | human
links: [2026-11-02-do-tim-kiem-tieng-viet]
threads: [obsidian-hieu-tieng-viet]
---
```

- Thân: câu mở đầu (tiêu đề), rồi Bối cảnh, Chuyện gì xảy ra, Bài học, Artefact (các mục được phép thiếu khi ghi thô).
- `links` hai chiều: ghi chuyện mới mà nối tới chuyện cũ thì sửa cả file cũ.
- `threads`: tên mạch chữ thường, gạch nối, không dấu. Danh sách mạch và mô tả ở `threads.md` (sinh bằng script, có một dòng mô tả user hay agent viết tay cho mỗi mạch).
- Cập nhật README hộp và 8 file cũ theo các trường mới (DM.1).

## 6. Các phần

### 6.1 Skill `storytelling` (DM.1)

`.claude/skills/storytelling/SKILL.md` (thư mục `.claude/skills/` đã được git theo dõi). `AGENTS.md` trỏ tới file này để Codex đọc cùng quy trình. Nội dung:

- **Ghi:** khi nào ghi (6 tín hiệu là gợi ý, không phải ngưỡng), khuôn, chọn `id`, điền `sessions`, `captured_by: live`.
- **Nối:** trước khi ghi chạy `story.mjs list` (6.3) để thấy chuyện và mạch đang có; nối `links` hai chiều; gắn hoặc mở `threads`.
- **Bổ sung thay vì nhân bản:** chuyện đang có file thì thêm vào file đó (ví dụ số mới sau một lần đo lại).
- **Riêng tư:** luật, ví dụ đúng và sai, chạy `story.mjs check` trước khi commit.
- **Báo:** một dòng cuối lượt, ví dụ "Đã ghi chất liệu: …".
- **Không làm ở đây:** chấm điểm, bỏ chuyện (thuộc DM.6).

Rút gọn mục trong `AGENTS.md` về: nguyên tắc, trỏ tới skill.

### 6.2 Gom từ transcript (DM.3)

`scripts/story/story.mjs harvest [--session ID | --since DATE | --transcript FILE] [--dry-run]`

- **Nguồn:** Claude Code `~/.claude/projects/<thư-mục-repo-mã-hoá>/<session>.jsonl`; Codex `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (lọc theo `cwd` của phiên là repo này). Cấu trúc hai loại khác nhau: viết bộ đọc riêng cho mỗi loại, rút ra dãy lượt user và trả lời của agent (bỏ output dài của tool, giữ lệnh và vài dòng kết quả).
- **Nhặt chuyện:** cắt transcript thành khúc vừa ngữ cảnh, gửi cho model chạy không giao diện (`claude -p`, mặc định model rẻ; cờ `--model`) kèm: danh sách tín hiệu, khuôn, danh sách `id` và tiêu đề chuyện đang có (để nối và để khỏi ghi trùng), luật riêng tư. Model trả JSON (chuyện mới, bổ sung cho chuyện cũ, links, threads). Nguyên tắc 1: dặn model ghi thừa còn hơn bỏ sót.
- **Ghi:** qua bộ kiểm 6.4; `captured_by: harvest`. Chuyện trùng một chuyện `live` cùng phiên thì bổ sung, không tạo file mới.
- **Sổ đã gom:** `~/.cache/storytelling/ledger.json` (phiên nào, gom tới dòng nào), để chạy lại không ghi trùng và hook gọi nhiều lần vẫn an toàn. Ngoài repo vì gắn với transcript trên máy.
- **Chi phí:** in số token và thời gian mỗi lần; ghi vào playbook sau khi đo trên 3 phiên thật.

### 6.3 Công cụ hộp (DM.2)

Cùng `story.mjs`:

- `list [--thread T] [--status S]`: bảng id, ngày, status, threads, số links (cho agent và user).
- `check`: frontmatter đúng khuôn; `id` khớp tên file; `links` không gãy và hai chiều (`--fix` thêm chiều thiếu); thread chưa có trong `threads.md`; chạy bộ kiểm riêng tư 6.4 trên mọi file.
- `threads`: sinh lại `threads.md` (mỗi mạch: mô tả, số chuyện, danh sách chuyện theo ngày), giữ nguyên dòng mô tả viết tay.

### 6.4 Bộ kiểm riêng tư (DM.2)

Một hàm dùng chung cho `check` và `harvest`; là chốt chặn chứ không phải lời dặn.

- **Danh sách chặn sinh từ máy:** tiêu đề note của vault đã khai báo (mặc định bản B, `/mnt/c/obsidan-evernote-workshop-b` hoặc `$OHS_VAULT`; chỉ đọc tên file `.md`, bỏ trang hệ thống), các `query` và tên file trong `relevant_paths` của `VAULT/_ohs/eval/golden-set.json`. Danh sách giữ trong bộ nhớ hoặc ở `~/.cache/storytelling/`, không bao giờ vào repo.
- **Khớp:** chuẩn hoá NFC, chữ thường, so cả bản bỏ dấu; chỉ báo cụm từ 2 chữ trở lên hoặc tên riêng (tránh báo nhầm từ thường như "kết quả").
- **Hành vi:** `harvest` gặp vi phạm thì không ghi chuyện đó, in lý do (không in nội dung ra file); `check` trả mã lỗi khác 0. Có danh sách cho phép (`docs/blog/storytelling-material/.privacy-allow`) cho từ chung hay bị báo nhầm, chỉ chứa từ chung.
- Không có vault trên máy (máy khác, CI) thì báo "bỏ qua kiểm theo vault" chứ không coi là qua.

### 6.5 Hook (DM.4)

Cò súng gọi `story.mjs harvest --session <id hiện tại>` ở hai lúc:

- **Trước khi chat bị tóm tắt:** Claude `PreCompact`, Codex `pre_compact` (đã thấy sự kiện này trong cấu hình Codex trên máy). Lúc này phiên dài, nhiều chuyện, và phần đầu sắp mất khỏi ngữ cảnh.
- **Cuối phiên:** Claude `SessionEnd`; Codex: tìm sự kiện tương đương, không có thì dựa vào `pre_compact` cộng chạy tay.

Yêu cầu: chạy nền, không làm chậm hay chặn phiên; lỗi chỉ ghi log ở `~/.cache/storytelling/hook.log`; một phiên không gom hai lần cùng đoạn (sổ 6.2). Cấu hình đặt ở `.claude/settings.json` và `.codex/hooks.json` của repo (theo dõi bằng git, `.gitignore` cần mở cho hai file này), kèm hướng dẫn bật và tắt.

**Phải kiểm trước khi làm (chưa kiểm):** hook nhận `transcript_path` hay `session_id` dưới dạng nào ở mỗi bên; hook Codex cần duyệt tin cậy (`trusted_hash` trong `~/.codex/config.toml`) thế nào; `claude -p` gọi từ trong hook có kéo theo hook của chính nó không (tránh vòng lặp: đặt biến môi trường `STORY_HARVEST=1` và hook thoát ngay khi thấy biến này).

Không làm hook sau mỗi lượt (`Stop`): tốn một lượt trả lời mỗi lần, user đã đồng ý bỏ.

### 6.6 Biên tập và dựng bài (DM.6, DM.7: để sau)

Chỉ bắt đầu khi hộp có khoảng 30 chuyện thật trở lên, để thang chấm được thử trên dữ liệu thật chứ không đoán.

- **Chấm (`story.mjs edit --thread T`, agent đóng vai biên tập):** 5 trục, mỗi trục 0–2: Móc (ngược trực giác, bất ngờ), Đau chung (người ngoài có gặp), Cung truyện (thử, hỏng, vỡ lẽ, kết quả), Bằng chứng (số, artefact), Mang về được (bài học dùng ngoài dự án). Cộng hệ số hợp người đọc đích (người làm một mình). Ghi điểm vào frontmatter (`score`), user sửa được; không tự đổi `status`.
- **Gom mạch:** đề xuất mạch mới từ `links` và nội dung (các chuyện chưa có thread, các thread nên gộp); xếp chuyện trong mạch thành cung truyện.
- **Dựng bài:** từ một mạch ra dàn ý, rồi bản nháp trong `docs/blog/` (khuôn frontmatter như bài nháp đang có ở đó), các chuyện dùng tới đổi `status: drafted`. Người duyệt, người viết lại giọng; máy không đăng gì ra ngoài.

### 6.7 Nhiều repo (DM.8: để sau)

Hộp chung (một repo nhận chuyện từ mọi repo, hoặc mỗi repo một hộp rồi gom), luật toàn cục trong `~/.claude/CLAUDE.md` và `~/.codex/AGENTS.md`, tìm mạch xuyên repo. Trường `repo` và `sessions` ở mục 5 là để sẵn cho phần này. Quyết cách gom khi tới đây.

## 7. Việc

| ID | Việc | Ưu tiên | Trạng thái | Ai làm | Cần gì | Xong khi | Bằng chứng |
|---|---|---|---|---|---|---|---|
| DM.0 | Hộp chứa, luật trong AGENTS.md, 8 chuyện mồi từ phiên E12.9 | P2 | ✅ | Agent | — | Hộp có README, khuôn, links, threads | 2026-11-03: commit f32c170, 6bf1dcd, 4ca23aa, 47c389b; [mẫu](../sample/README.md) (repo nguồn `vantt/obsidian-pkm-automation`) |
| DM.1 | Skill `storytelling` (ghi, nối, bổ sung, riêng tư, báo) và thêm trường `repo`, `sessions`, `captured_by` vào khuôn và 8 file cũ; AGENTS.md trỏ tới skill | P2 | ⬜ | Agent | — | Một phiên mới (Claude) và một phiên Codex trong repo ghi được chuyện đúng khuôn, có links hai chiều mà không cần nhắc | |
| DM.2 | `scripts/story/story.mjs` `list`, `check`, `threads` và bộ kiểm riêng tư; test `node --test` | P2 | ⬜ | Agent | DM.1 | `check` sạch trên hộp hiện tại; test có ca cố ý chèn tên note giả (từ vault giả trong test) và bị chặn; `threads.md` sinh lại không mất mô tả tay | |
| DM.3 | `story.mjs harvest` cho transcript Claude và Codex, sổ đã gom, chống trùng với chuyện `live` | P2 | ⬜ | Agent | DM.2 | Chạy trên phiên E12.9 (`claude:95ca719b`) ra ít nhất các chuyện đã có (bổ sung, không nhân bản) cộng chuyện mới; chạy lại lần hai không ghi gì; đo token và thời gian trên 3 phiên | |
| DM.4 | Hook PreCompact và SessionEnd (Claude), pre_compact (Codex) gọi `harvest` nền | P2 | ⬜ | Agent | DM.3 | Ép compact một phiên thử: chuyện mới xuất hiện trong hộp, phiên không bị chậm, `hook.log` sạch, không vòng lặp | |
| DM.5 | Dùng thật 1–2 tuần, đo | P2 | ⬜ | User + Agent | DM.4 | Bảng: số chuyện mỗi phiên theo nguồn (live, harvest), tỉ lệ harvest bắt được chuyện live bỏ sót, số lần bộ kiểm chặn, số báo nhầm; user nói cảm nhận về độ ồn | |
| DM.6 | Biên tập: chấm 5 trục, gom mạch | P3 | ⬜ | Agent | DM.5, hộp ≥ 30 chuyện | User chấm cùng 10 chuyện, lệch điểm máy ≤ 1 trên đa số trục; user nhận các mạch đề xuất | |
| DM.7 | Dựng bài từ một mạch (dàn ý, bản nháp `docs/blog/`) | P3 | ⬜ | Agent + User | DM.6 | Một bài nháp từ mạch `obsidian-hieu-tieng-viet` user thấy đáng sửa để đăng | |
| DM.8 | Gom nhiều repo, mạch xuyên repo | P3 | ⬜ | Agent | DM.5 | Quyết cách gom; một mạch có chuyện từ 2 repo | |

## 8. Đo

- **Độ phủ:** chuyện mỗi phiên, tách theo `captured_by`. Harvest bắt thêm bao nhiêu so với live.
- **Độ ồn (không phải để lọc lúc ghi, mà để biết chi phí):** user lướt hộp mất bao lâu, có thấy ngợp không.
- **Riêng tư:** số vi phạm lọt vào repo phải là 0; số lần chặn đúng, chặn nhầm.
- **Chi phí harvest:** token, giây mỗi phiên.
- **Giá trị cuối:** số bài nháp ra từ hộp, số chuyện user đánh `picked`.

Chưa đo gì trong số trên; DM.5 là lần đo đầu.

## 9. Dặn agent tiếp quản

- Đọc trước: PRD này, [sample/README.md](../sample/README.md) và 8 file chuyện trong `sample/`. Đó là đầu vào thật để thử `check`, `list`, `threads`, và là đáp án một phần cho phép thử `harvest` (chuyện đã ghi tay từ cùng một phiên).
- Luật bản tay ở repo nguồn (mục "Chất liệu build in public" trong `AGENTS.md` của `vantt/obsidian-pkm-automation`): gặp chuyện thì ghi một file theo khuôn, nối `links` hai chiều, gắn `threads`, giữ riêng tư, báo user một dòng cuối lượt.
- Cách làm skill và công cụ JS có dữ liệu riêng không rời máy, tham khảo ở repo nguồn: `scripts/ohs/ohs.mjs`, `.claude/skills/ohs-golden-set/`, `docs/plans/E12.9-lexicon-golden-tooling.md`.
- Bộ kiểm riêng tư (6.4) lấy danh sách chặn từ vault của user trên máy; không chép dữ liệu thật vào test, dùng vault giả dựng trong test. Transcript của user có dữ liệu riêng: không dán vào repo, issue, commit.
- Các phép thử nêu tên phiên (`claude:95ca719b`) và vault (bản B) là của máy user; chạy được khi project nhận làm trên cùng máy.
- Gặp chuyện đáng kể trong lúc làm thì ghi vào chính hộp (cũng là phép thử DM.1).
