---
title: "UI và UX: dùng momentry không cần nhớ lệnh (E16)"
description: "Một app web nhẹ cho mọi dự án: wizard, hộp chuyện, settings, skill trong agent."
status: todo
priority: P1
branch: website-v2
tags: [ui, ux]
blockedBy: []
blocks: []
created: 2026-11-04
---

# UI và UX: dùng momentry không cần nhớ lệnh (E16)

Mã S0.x, S1.x, S2.x là bước trong [sales plan](../261104-sales/plan.md); Q.x, R.x, U.x là bước của các plan [story-quality](../261104-story-quality/plan.md), [rust-port](../261104-rust-port/plan.md), [ui-ux](../261104-ui-ux/plan.md). Board: [board.md](../board.md).

## Mục tiêu

Người dùng, kể cả người không kỹ thuật, dùng momentry tốt nhất mà **không cần nhớ lệnh nào**: cài một lần, đọc chuyện, chọn chuyện để kể. Mọi việc khác máy tự làm hoặc là một nút bấm.
- Một app web nhẹ cho mọi dự án, dữ liệu tách theo dự án.
- Agent nhắc khi có chuyện mới; mở UI hoặc hỏi bằng lời ngay trong chat (`momentry-ui`, skill `momentry`).
- Riêng tư, chi phí, sức khoẻ và thiết lập đều nhìn thấy và chỉnh được trên giao diện.

Đo bằng: thời gian từ cài tới chuyện đầu tiên, và tỉ lệ chuyện top 5 được bấm Use.

Đích: người dùng chỉ làm ba việc: cài một lần, đọc chuyện, chọn chuyện để kể. Mọi việc khác máy tự làm hoặc là một nút bấm. Không bao giờ hiện mã thoát hay thuật ngữ nội bộ (harvest, ledger, hotspot, quarantine, tension, stakes).

**Quyết định (2026-11-04):**
- Một app cho mọi dự án. Mỗi dự án giữ hộp, sổ, config riêng; danh sách dự án toàn cục (tên, đường dẫn hộp, bật/tắt). App đọc gộp để hiển thị, không trộn dữ liệu.
- Giao diện tiếng Anh.
- Hộp chuyện mặc định trong repo. Wizard có ô "Keep stories out of git" (tự thêm vào `.gitignore`), tick sẵn khi repo có remote; tuỳ chọn lưu ngoài repo cho từng dự án. `init`, `scan`, hook đọc đường dẫn hộp từ danh sách dự án.
- Tự gom sau mỗi phiên, có giới hạn ngân sách (mặc định thấp, vd 3 USD/ngày, hỏi trong wizard). Chạm giới hạn: phiên xếp hàng chờ, không mất; báo ở dòng nhắc và trên UI. Nếu S0.12 cho thấy gói Pro/Max tính quota thì giới hạn theo số phiên.
- Lệnh trong agent: `momentry-ui`, `momentry-bip`, cùng tên ở mọi host (Codex hiện là `/prompts:momentry-ui`). Không làm plugin Claude Code. Gõ `/momentry` là menu gợi ý đủ lệnh.
- Thật nhẹ: **một tiến trình web duy nhất**, chạy khi cần (`momentry-ui` hoặc `momentry ui` mở nó), tự tắt khi không ai dùng. Không daemon, không icon khay, không app Tauri. Việc gom vẫn do hook chạy ngắn như hiện nay. Thông báo thay bằng dòng nhắc lúc mở phiên. Khi port Rust (E18): cùng một tiến trình, giao diện nhúng trong binary.

**Màn hình:**
- **Setup wizard** (tự mở lần đầu): Agents (dò và kết nối host) → Projects (công tắc, nơi lưu hộp) → Privacy (tên cần che, chung và theo dự án) → Budget. Kết thúc bằng nút "Find stories in your last 3 sessions (~3 USD)" có tiến độ.
- **Stories** (màn chính): thẻ xếp hạng: tiêu đề, một dòng chuyện gì xảy ra, nhãn tín hiệu, dự án, ngày, 1–3 sao. Lọc: tuần này, dự án, chưa đọc. Nút Use / Later / Drop.
- **Story**: các phần Context, What happened, Lesson, Artefact; sửa tại chỗ (ghi thẳng markdown); "Show source" mở khúc hội thoại gốc; Copy; sau này "Draft a post" (E13).
- **Series**: gom chuyện cùng `threads`.
- **Privacy**: chuyện bị giữ lại kèm lý do và nút thả; tên cần che; nhật ký đã gửi gì cho Claude; câu "no momentry server".
- **Cost**: tiêu tuần này, theo phiên, theo dự án, ngân sách chung và riêng.
- **Health**: đèn xanh/đỏ; lỗi bằng lời thường kèm nút "Fix it" (từ `doctor` và `fix`).
- **Quick note**: ghi chuyện tay, như `momentry-bip`.
- **Theo dự án**: tắt gom, chế độ kín (không đưa vào nháp, không gửi nhãn), xuất zip/markdown, xoá sạch dữ liệu một dự án.

| ID | Việc | Ai | Trạng thái |
|---|---|---|---|
| U.1 | Danh sách dự án toàn cục và đường dẫn hộp theo dự án; `init`, `scan`, hook đọc từ đó; giữ tương thích máy đã cài | Agent | ⬜ |
| U.2 | Đổi lệnh agent sang `momentry-ui`, `momentry-bip` ở cả 5 host; giữ `/bip` làm bí danh một thời gian. Kiểm trên máy thật tên hiện ra ở từng host (Codex `/prompts:`, Antigravity skill) | Agent; anh kiểm Windows | ⬜ |
| U.3 | Dòng nhắc lúc mở phiên (hook SessionStart): số chuyện mới, phiên đang chờ vì ngân sách, lỗi cần sửa, kèm tên lệnh đúng theo host | Agent | ⬜ |
| U.4 | Tiến trình web: `node:http` trên localhost, không dependency, tự tắt khi rảnh, một instance (cổng và khoá); JSON API đọc/ghi hộp; giao diện HTML/JS/CSS tĩnh dùng lại được khi sang Rust | Agent | ⬜ |
| U.5 | Màn hình theo danh sách trên; thiết kế theo bảng màu landing v2 | Team agent; anh duyệt | ⬜ |
| U.6 | Ngân sách và hàng chờ gom (config chung và theo dự án, `dry-run` đúng hơn từ S0.13) | Agent | ⬜ |
| U.7 | Use / Later / Drop lưu thành nhãn trên máy; chỉnh xếp hạng theo người dùng; gửi nhãn ẩn danh chỉ khi đồng ý (nối E17) | Agent | ⬜ |
| U.8 | Đo: thời gian từ cài tới chuyện đầu (S1.10), tỉ lệ chuyện top 5 được Use | Agent | ⬜ |
| U.9 | **Skill `momentry`** (thay MCP, quyết định 2026-11-04 vì MCP tốn token mỗi phiên): một skill duy nhất, cài vào cả 5 host như `momentry-bip`. Lúc thường chỉ tên và mô tả nằm trong context (vài chục token); thân skill chỉ nạp khi người dùng hỏi ("tuần này có chuyện gì hay?", "viết chuyện X thành thread"). Skill chỉ agent gọi CLI `--json`; thêm lệnh `show <id> --json`, `mark <id> use\|later\|drop`. Soạn nháp bài do agent của người dùng viết bằng model họ đã trả, không tốn LLM phía momentry (đường ngắn tới E13). Kiểm host nào hỗ trợ skill (Antigravity đã dùng skill cho bip; Claude Code có; Codex, pi, omp cần kiểm) | Agent | ⬜ U0 hoặc ngay sau |
| U.10 | Màn Settings, ba tầng: chung (agent, ngân sách, tên cần che, ngôn ngữ chuyện, cập nhật); từng dự án (bật/tắt gom, nơi lưu hộp và gitignore, tên che riêng, chế độ kín, ngân sách riêng, xuất/xoá); nâng cao, gập sẵn (model, số lần chạy, `quietMinutes`, `maxSessions`). UI ghi vào đúng file JSON qua `lib/config.mjs`, CLI và sửa tay vẫn dùng được. Cách làm: API trong tiến trình web (`GET /api/settings` gọi `show`, `PUT` gọi `write`/`privacyAdd` của `lib/config-cmd.mjs`), không có logic config thứ hai; thêm schema cho từng key (kiểu, giá trị được phép, min/max, tầng, mô tả tiếng Anh), `config set` kiểm theo schema và form UI sinh từ schema; ghi atomic qua đường sẵn có. Bảo mật: chỉ nghe `127.0.0.1`, token ngẫu nhiên trong URL mỗi lần mở UI, kiểm header `Host` (chặn DNS rebinding). Key mới: ngân sách, danh sách dự án, chế độ kín, gitignore. Giữ luật `USER_ONLY`: tên che riêng của dự án lưu trong config người dùng theo dự án, không ghi vào `.momentry.json` (repo lạ không được tắt lưới riêng tư) | Agent | ⬜ U0 |

**Giới hạn cần nói thật:** UI giúp dev A1 dùng dễ hơn, nhưng người không kỹ thuật thật vẫn vướng hai rào: cần Node (E18 gỡ) và cần `claude` CLI đã đăng nhập (chỉ E15 hoặc backend API gỡ).

**Thứ tự:** U.1–U.6 và U.10 cùng hoặc ngay sau lần bán đầu (U0); U.9 ngay sau; U.7–U.8 khi có người dùng.
