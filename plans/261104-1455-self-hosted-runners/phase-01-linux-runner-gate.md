---
phase: 1
title: "Runner Linux và kiểm self-hosted có bị chặn không"
status: done
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Runner Linux và kiểm self-hosted có bị chặn không

## Goal
Đăng ký một runner trên máy Linux này và chạy một job thử để biết GitHub có cho job self-hosted chạy khi tài khoản đang hết quota hay không.

## Kết quả (2026-11-04)
- **Self-hosted không bị chặn.** Run 41809894408 (`runs-on: [self-hosted, linux]`) chạy xong `success` trên runner `linux-fg-server-docker`, trong khi job GitHub-hosted cùng lúc vẫn báo hết quota/billing.
- Runner chạy trong container Docker thay cho tài khoản hệ thống `ghrunner` (máy không có sudo không mật khẩu; container cho cùng mức cô lập với HOME của user và gỡ sạch hơn).
  - Image `ghcr.io/actions/actions-runner:2.338.2` (Ubuntu 24.04, user `runner`, có git, không có Node — `setup-node` tự tải).
  - Container `momentry-runner-linux`, `--restart unless-stopped`, nhãn `self-hosted,Linux,X64,docker`.
  - Volume `momentry-runner-linux` giữ `.runner`/`.credentials*` để khởi động lại không cần token mới. Đã thử `docker restart`: runner online lại sau khoảng một phút (phiên cũ trên GitHub hết hạn rồi kết nối lại).
- Nhánh và workflow thử `ci/self-hosted-gate` đã xoá. `git push` tới nhánh mới bị GitHub trả `Internal Server Error`; tạo file qua `gh api .../contents` thì được.

## Lệnh tạo lại runner
```sh
docker volume create momentry-runner-linux
TOKEN=$(gh api -X POST repos/vantt/momentry/actions/runners/registration-token --jq .token)
docker run -d --name momentry-runner-linux --restart unless-stopped \
  -v momentry-runner-linux:/home/runner/state -e TOKEN="$TOKEN" -e RUNNER_NAME="linux-$(hostname)-docker" \
  --entrypoint bash ghcr.io/actions/actions-runner:2.338.2 -c 'cd ~ && for f in .runner .credentials .credentials_rsaparams; do [ -f state/$f ] && cp state/$f .; done; if [ ! -f .runner ]; then ./config.sh --url https://github.com/vantt/momentry --token "$TOKEN" --name "$RUNNER_NAME" --labels linux,docker --unattended --replace && cp .runner .credentials .credentials_rsaparams state/; fi; unset TOKEN; exec ./run.sh'
```

## Verification
- `gh api repos/vantt/momentry/actions/runners --jq '.runners[] | [.name, .status] | @tsv'` → `linux-fg-server-docker online`.

## Rollback
```sh
docker rm -f momentry-runner-linux && docker volume rm momentry-runner-linux
gh api -X DELETE repos/vantt/momentry/actions/runners/$(gh api repos/vantt/momentry/actions/runners --jq '.runners[] | select(.name=="linux-fg-server-docker") | .id')
```
