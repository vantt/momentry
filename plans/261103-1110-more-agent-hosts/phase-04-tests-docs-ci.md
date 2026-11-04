---
phase: 4
title: "Test, tài liệu, CI"
status: done
priority: P2
effort: "0.5d"
dependencies: [3]
---

# Phase 4: Test, tài liệu, CI

## Files
- Modify: `docs/installation.md` (bảng host, profile), `docs/prd.md` (host mới, quyết định agy), `CHANGELOG.md`, `docs/cli-reference.md` (sinh lại), `docs/packaging-checklist.md` (AGT-02).

## Tasks & Steps
- [x] test đủ; `scripts/test-installer.sh` kiểm init cài cho pi/omp/agy giả
- [x] tài liệu
- [x] push, CI 9/9 xanh

## Verification
- CI xanh trên commit cuối.
