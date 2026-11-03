# Audit đóng gói, phân phối, cài đặt — momentry

Thời điểm: 2026-11-03 15:57 (Asia/Saigon). Commit: `9b5ccb6`. Chuẩn: skill `cs-packaging-distribution`. Checklist đầy đủ theo từng luật: [docs/packaging-checklist.md](../../docs/packaging-checklist.md).

## Kết luận

Phần lõi đã chắc (CLI không phụ thuộc ngoài, cấu hình có thứ tự ưu tiên rõ, cache 0700, cấu hình hỏng là lỗi, hook không bao giờ chặn phiên, chỉ in cấu hình hook thay vì sửa file người dùng, 205/205 test qua trên bản clone sạch). Phần **phân phối gần như chưa tồn tại**: không có phiên bản, release, installer, lệnh cập nhật, lệnh gỡ hay `doctor`. Quick start trong README không chạy được như viết vì dùng `<momentry>` mà không có bước lấy code. Một người mới, hay một agent chỉ đọc `--help`, không thể tự đi từ con số 0 tới lần chạy đầu thành công.

Rủi ro thực tế lớn nhất ngoài trải nghiệm lần đầu: cấu hình hook in ra ghi cứng đường dẫn Node tuyệt đối (`process.execPath`). Khi người dùng nâng Node qua nvm/fnm hoặc chuyển thư mục clone, hook hỏng im lặng vì lệnh `hook` luôn thoát 0, và không có `doctor` để phát hiện.

## Hồ sơ dự án

| Mục | Giá trị |
|---|---|
| Ngôn ngữ | Node ESM (`.mjs`), Node ≥ 20, cố ý không `package.json`, không npm (PRD mục 4.9) |
| Loại | CLI + công cụ cho agent (hook Claude Code/Codex, mẫu `/bip`); không daemon, không MCP |
| Nền tảng | Linux/macOS trên thực tế (`:` làm dấu tách, đường dẫn POSIX); Windows không được nói tới |
| Phụ thuộc chạy | Node ≥ 20, git, `claude` CLI đã đăng nhập (cho harvest) |
| Trạng thái lưu | `~/.config/momentry/config.json`, `~/.cache/momentry/` (0700, chứa nội dung phiên), `<repo>/.momentry.json`, hộp trong repo |
| Kênh hiện tại | Không có. Cách ngầm hiểu: `git clone` rồi `node bin/momentry.mjs` |

## Kết quả Verify (chạy trong HOME tạm)

| # | Kiểm | Kết quả | Bằng chứng | Luật |
|---|---|---|---|---|
| 1 | Màn hình đầu README | gap | Câu đầu tả cơ chế, không phải lợi ích; không có lời hứa "từ 0 tới … trong N phút"; quick start dùng `<momentry>` chưa định nghĩa; dòng "DM.1–DM.6" là jargon nội bộ | ONB-01/04/06/16 |
| 2 | `install.sh` | gap | Không tồn tại | INS-* |
| 3 | `momentry --version`, `version --json` | gap | "lệnh lạ: --version", thoát 1 | CMD-06 |
| 4 | `momentry`, `momentry --help` | gap | Chỉ liệt kê 12 lệnh + "Xem README.md"; không đối số thì thoát 1; không có mục Agents | CMD-15/19 |
| 5 | `init/doctor/update/uninstall --help` | gap | `init --help` → "momentry init [--repo]"; ba lệnh còn lại không tồn tại | CMD-16 |
| 6 | `momentry --bogus`, `lisst` | gap | Thoát 1 (chuẩn: 2), không gợi ý "did you mean" | CMD-08/12 |
| 7 | `init --yes --json </dev/null` | gap | `init` không nhận `--yes`/`--json` (parseArgs strict → lỗi); không tương tác thì đạt | CMD-03/11/17 |
| 8 | `doctor --json` | gap | Không có lệnh `doctor` | CMD-02, DOC-02 |
| 9 | `init` chạy lại | pass | "đã có …/.momentry.json", thoát 0 | PRN-05 |
| 10 | `update --check` | gap | Không có | UPD-* |
| 11 | Workflow release | gap | Không có `.github/`, không tag | REL-06/10, VER-02 |
| 12 | Thử agent-native | gap (suy ra, không chạy) | Không có release URL để agent cài; `--help` không đủ để agent biết phải khai báo `privacy.sources`, cần `claude` CLI, hay cài hook. Không tốn subagent vì kết quả đã chắc chắn | TST-04 |

Thêm sau `init` trong repo trống: `list --json` và `check` đều thoát 1 với "không có hộp: …/docs/storytelling-material". Người làm đúng quick start sẽ gặp lỗi ngay ở lệnh `list` nếu `scan` chưa ra chuyện nào.

Phát hiện phụ: `test/imports.test.mjs` duyệt toàn bộ cây thư mục (`readdirSync(ROOT, {recursive})`) nên trong bản làm việc có `.claude/`, `.agentkit/` chưa track, test import luôn cả script của skill và báo 1 lỗi (202/203). Trên bản clone sạch thì 205/205 qua. Nên giới hạn test vào `bin/ lib/ test/` hoặc vào `git ls-files`.

## Những gì đã đạt

- **CMD-09:** stdout chỉ chứa dữ liệu; lỗi và cảnh báo ra stderr; `hook` không in gì.
- **CMD-17:** không lệnh nào chờ nhập.
- **CFG-02/04/06/08:** biến môi trường cho từng gốc, thứ tự ưu tiên được ghi, cache 0700, cấu hình hỏng thì báo lỗi.
- **CFG-12:** `.momentry.json` trong repo không đặt được `privacy.sources`/`allowUnchecked`.
- **PRN-03/07:** chỉ in cấu hình hook, không sửa `~/.claude/settings.json` hay `~/.codex/*`; `init` dùng `wx`.
- **UX-07 (một phần):** kiểm Node ≥ 20 lúc chạy, thông báo rõ.

## Xung đột với quyết định đã chốt (cần user quyết, chưa đổi gì)

1. **Hook chỉ in vs AGT-01/CMD-03.** PRD 3.2 và 6.4 chốt "công cụ không tự sửa `~/.claude/settings.json`". Skill muốn `init` tự kết nối host. Đề xuất: giữ quyết định PRD; thêm check chỉ đọc trong `doctor` (hook có mặt, trỏ tới đường dẫn còn tồn tại, chạy được với input vô hại), `fix` là lệnh `momentry hooks --print --claude`. Phương án khác: `connect --yes` sửa có sao lưu và so preimage (AGT-03).
2. **Mã thoát vs CMD-08.** Hiện 1 = sai cú pháp, 2 = `check` thấy lỗi, 3/4/5 có nghĩa riêng; README và PRD 7.2 coi đây là hợp đồng. Chuẩn skill là 1 = lỗi, 2 = sai cú pháp. Đổi sẽ phá script/pre-commit hook đã dùng `check --staged`. Đề xuất: giữ, ghi lý do lệch chuẩn trong checklist.
3. **Không `package.json` vs NODE-01/02.** Overlay Node không kích hoạt nên không thật sự xung đột. Nguồn phiên bản đặt ở `lib/version.mjs`.
4. **Cấu hình JSON vs UX-11 (định dạng có comment).** Đề xuất giữ JSON (PRD 6.5) nhưng thêm `config default` và `config show` để không ai phải đọc README mới biết khoá.

## Kiến trúc phân phối đề xuất

```text
GitHub Release vX.Y.Z
  momentry-vX.Y.Z.tar.gz   (bin/ lib/ prompts/ LICENSE README.md)
  install.sh               (đóng dấu phiên bản lúc release)
  checksums.txt            (job cuối, needs: mọi job build)

install.sh  →  ~/.local/share/momentry/vX.Y.Z/           mã nguồn
               ~/.local/share/momentry/current -> vX.Y.Z  symlink
               ~/.local/bin/momentry                     shim: exec node ".../current/bin/momentry.mjs" "$@"
               ~/.local/share/momentry/.momentry-managed marker
            →  in: "Tiếp: momentry init"

hook trong ~/.claude/settings.json:  momentry hook session-end   (qua shim, sống sót khi nâng Node/momentry)
momentry update   → tải tarball, kiểm sha256, giải nén cạnh bản cũ, `node … --version` thử, đổi `current`, giữ bản trước
momentry uninstall → gỡ shim + bản cài, in đoạn hook cần xoá tay, giữ ~/.config & ~/.cache trừ khi --purge
```

Vì sao tarball + shim thay vì Node SEA: momentry không có bước build, `claude` CLI đã là phụ thuộc lớn hơn Node, và một tarball chạy trên mọi nền có Node. SEA bỏ được Node nhưng thêm ma trận build 4 nền và ký số; chỉ đáng khi có người dùng không cài Node.

Điểm xuất phát code: `templates/install.sh` của skill (đã test), forgent `install.sh` + `scripts/package-release-assets.mjs` cho release Node, skillstation `internal/app/health.go` cho mô hình check của doctor.

## Bước tiếp theo (theo thứ tự)

1. Sửa README: câu lợi ích, lời hứa + điều kiện, bước lấy code thật, ví dụ `privacy.sources` tối thiểu, mục Cập nhật / Gỡ / Sự cố; chuyển phần nội bộ (`--fake-llm`, hợp đồng module) sang `docs/`.
2. Thêm `lib/version.mjs`, `--version`, `version --json`.
3. Thêm `doctor [--json]` chỉ đọc với các check: Node, git, `claude` (có và đã đăng nhập), cấu hình, `privacy.sources`, repo quan sát, hộp, hook trỏ đúng, cache 0700, khoá chết.
4. `init` tạo luôn hộp, chạy doctor, in "✓ Sẵn sàng" + một bước; nhận `--yes --json`.
5. Viết lại help theo nhiệm vụ cho mọi lệnh, thêm mục Agents.
6. Release workflow + `install.sh` + `checksums.txt`; hook in ra dùng shim.
7. `update`, `uninstall`, `paths --json`.
8. CI: test trên Node 20/22/24, test vòng đời installer offline, smoke test sau release; sửa phạm vi `imports.test.mjs`.

Bước 1–5 không cần release và giải quyết phần lớn gap tầng 1; nên làm trước.

## Câu hỏi chưa giải quyết

- Giữ hay đổi hợp đồng mã thoát (xung đột 2)?
- Hook: giữ "chỉ in" hay thêm `connect --yes`?
- Có cần hỗ trợ Windows không, hay ghi rõ "chỉ Linux/macOS"?
- Tarball + shim hay Node SEA?
