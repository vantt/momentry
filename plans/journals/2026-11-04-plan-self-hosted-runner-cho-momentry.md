---
title: Plan self-hosted runner cho momentry
date: 2026-11-04
summary: GitHub-hosted Actions hết quota tháng 11; lập plan chạy CI trên runner tự host Linux/Windows/macOS
---

# Plan self-hosted runner cho momentry

## What happened
Repo private trên gói Free đã dùng hết 2.000 phút Actions tháng 11 ngay 2026-11-03 (macOS ×10, Windows ×2). Mọi job GitHub-hosted bị chặn, kể cả windows-hook-probe cần cho issue #2. Trước đó tôi đọc nhầm là lỗi thanh toán; thật ra là hết hạn mức trong cùng tháng.

## Decision
Lập plan plans/261104-1455-self-hosted-runners: một runner cho mỗi máy (Linux, Windows, macOS), chọn bằng biến repo MOMENTRY_SELF_HOSTED, mặc định vẫn GitHub-hosted. Phase 1 là cổng kiểm xem GitHub có chặn cả self-hosted khi hết quota không. Phát hiện quan trọng: workflow hiện ghi đè ~/.claude, ~/.codex, ~/.omp và cài/gỡ momentry thật, nên trên máy riêng phải cô lập HOME cho từng job; riêng job agy-real dùng phiên agy thật.

## Next steps
Chạy phase 1 trên máy Linux (cần user đồng ý tạo tài khoản ghrunner). Windows và macOS cần user cài runner trên máy của họ.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
