---
title: "Hub nhiều máy (E22)"
description: "Một dự án làm trên nhiều máy không bị tách đôi hay trùng; hub tuỳ chọn cho người dùng nâng cao gom gu, chi phí, chỉ mục chuyện."
status: in-progress
priority: P3
branch: ""
tags: [sync, multi-machine, data-model]
blockedBy: []
blocks: []
created: 2026-11-07
---

# Hub nhiều máy (E22)

Board: [board.md](../board.md). Gu người dùng: [user-taste](../261106-0900-user-taste/plan.md) (E21).

## Mục tiêu

Một người làm nhiều dự án trên nhiều máy, một repo có thể checkout và làm ở nhiều máy. Dữ liệu của momentry phải gộp được mà không tách đôi một dự án, không trộn hai dự án, không trùng chuyện hay mã chuyện. Hub là phần cắm thêm cho người dùng nâng cao.

## Ràng buộc

- **Anh quyết 2026-11-07:** hub là phụ, cho người dùng nâng cao. Lõi giữ Node, chạy trên từng máy; không có hub thì chạy y như bây giờ. Không viết lại lõi bằng ngôn ngữ khác vì hub.
- Dữ liệu vẫn nằm trên máy người dùng (quyết định 2026-11-05). Hub là của chính người dùng (repo git riêng tư hoặc máy chủ trong tailnet của họ).
- File chuyện vẫn nằm trong repo, git đồng bộ. Hub chỉ giữ chỉ mục, không giữ bản sao chuyện.

## Phân tích: một dự án ở nhiều máy

| Dữ liệu | Trùng? | Cách giữ |
|---|---|---|
| Mã dự án | Hiện băm đường dẫn (`lib/projects.mjs` `projectId`): cùng repo khác đường dẫn ra hai mã; hai repo cùng đường dẫn trên hai máy ra một mã | Danh tính từ git: commit gốc (không đổi khi clone, đổi tên, đổi remote), remote chuẩn hoá làm tên phụ; đường dẫn là của từng máy |
| Phiên, transcript | Không (UUID, mỗi phiên chạy một máy). Ngoại lệ: thư mục `~/.claude` đồng bộ giữa máy thì hai máy cùng gom một phiên | Khoá `host:session`, ghi máy đã gom; hub giữ chỗ phiên |
| File chuyện | File thì không (git). Dễ vỡ: tên file trùng giữa hai máy (add/add), mã `M-XXXX` gán khác nhau khi băm trùng, cùng sự kiện qua hai phiên | Hậu tố tên theo phiên; luật phân xử mã cố định; nối chuyện qua phiên là M.4 của [story-material](../261105-story-material/plan.md) |
| Sự kiện gu | Cùng chuyện quyết ở hai máy | Mỗi máy một file chỉ nối thêm; học lấy quyết định mới nhất mỗi chuyện; khoá chuyện theo danh tính dự án git |
| Chi phí | Không | Mỗi máy một file, cộng |
| Hồ sơ dự án | Mỗi máy tự viết một bản | Khoá danh tính dự án + băm tài liệu; bản sửa tay thắng |
| Danh sách dự án, cấu hình | Đường dẫn theo máy | Theo máy; gu, ngân sách, trọng số luật dùng chung |

## Việc

| ID | Việc | Ai | Trạng thái |
|---|---|---|---|
| H.1 | **Lõi an toàn khi một repo làm ở nhiều máy** (làm ngay, không cần hub): danh tính dự án từ commit gốc của git (repo chưa có commit thì giữ băm đường dẫn), chuyển dữ liệu cũ (`taste.json`, sổ gom, `metrics.json`, `ui-state.json`, hồ sơ) không mất gì; tên file chuyện mới không đụng nhau giữa hai máy; luật phân xử mã `M-XXXX` khi hai máy gán trùng, `check` báo và `check --fix` sửa theo luật | Agent | ✅ 2026-11-07: `lib/project-id.mjs`. Hai mã: mã dự án = băm commit gốc (nhiều gốc lấy sha nhỏ nhất; chưa có commit, clone nông, git không đọc được thì băm đường dẫn), khoá gu, số đo, hồ sơ; mã checkout = băm đường dẫn, giữ cho URL giao diện web và `ui-state.json` (theo máy; hai worktree một repo vẫn hai dòng; link cũ vẫn mở). Sổ gom, `projects.json`, quarantine giữ theo đường dẫn, tên. Mã giữ trong `<cache>/project-ids.json` kèm inode của `.git`: 0,1 ms thay vì 7 ms gọi git; hook đầu phiên không cần mã dự án. Chuyển dữ liệu cũ lúc lệnh ghi hỏi mã lần đầu: mã và `storyRef` trong `taste.json`, `metrics.json` (atomic, `0600`), hồ sơ đổi tên; không chuyển từ mã git này sang mã git khác (repo khác cùng đường dẫn). Tên file mới `YYYY-MM-DD-slug-xxxx` (4 hex của `sha256(id phiên)`, không phiên thì ngẫu nhiên), luôn thêm vì máy không thấy file của máy kia trước khi pull. Mã trùng: id nhỏ hơn giữ, chuyện kia lấy ứng viên trống kế tiếp, `check --fix` cất mã cũ vào `old_codes` (bỏ khỏi `aliases`); tra theo mã có hơn một chuyện dính vào thì báo trùng kể từng chuyện. PRD 6.6, 6.9; test `test/project-id.test.mjs`, `story-code`, `pipeline` |
| H.2 | Mã máy và sự kiện chỉ nối thêm theo máy (gu, chi phí) | Agent | ⬜ |
| H.3 | Hub đầu tiên: repo git riêng tư, lệnh đồng bộ, giữ chỗ phiên | Agent | ⬜ |
| H.4 | Hub server (chỉ khi cần xem trực tiếp, tìm chung): một file chạy, có thể Go, trong tailnet | Agent | ⬜ |

## Câu hỏi còn mở

1. Hub chỉ cho một người, hay sau này cho nhóm dùng chung (cần đăng nhập, phân quyền)?
2. Transcript có bao giờ lên hub không?
