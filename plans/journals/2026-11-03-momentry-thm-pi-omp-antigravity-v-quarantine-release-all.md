---
title: "momentry thêm pi, omp, Antigravity và quarantine --release all"
date: 2026-11-03
summary: "Hai yêu cầu thêm vào goal: release all và ba host mới ở mọi profile; CI xanh"
---

# momentry thêm pi, omp, Antigravity và quarantine --release all

## What happened
User thêm hai việc vào goal. (1) `momentry quarantine --release all`: kiểm lại mọi chuyện bị giữ, thả chuyện sạch, giữ chuyện còn vi phạm. (2) Hỗ trợ pi, omp, Antigravity. Researcher khảo sát mã nguồn và dữ liệu thật (chỉ cấu trúc): pi/omp dùng chung JSONL và API extension TypeScript; Antigravity có hooks.json theo nhóm nhưng chỉ SessionStart/Stop và transcript không có cwd.

Trong lúc đó tìm ra lỗi có từ đầu: Codex đọc khoá sự kiện PascalCase, momentry ghi snake_case nên hook Codex chưa từng chạy. Đã sửa.

## Decision
- agy gom khi mở phiên sau (SessionStart + chỉ mục phiên), không dùng Stop.
- Cài và quét ở mọi profile: ~/.codex-*, ~/.pi/accounts/*, ~/.omp/profiles/*/agent, ~/.agy-homes/*/.gemini.
- Session id host mới lấy 8 hex cuối (UUIDv7).

## Next steps
Issue #1: kiểm Codex và Antigravity bằng phiên thật đã đăng nhập. Phần chưa phát hành nằm ở mục Unreleased của CHANGELOG.

## Sai sót
Khi thử omp, omp bỏ qua OPENAI_BASE_URL và gửi một yêu cầu với khoá giả tới OpenAI; trước đó tôi đã nói sẽ không gửi gì ra ngoài.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
