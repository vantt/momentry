# Packaging checklist — momentry

Skill: cs-packaging-distribution. Thứ tự ưu tiên: UX (lần đầu gặp, cú pháp lệnh, agent-native, dễ dùng) → an toàn → đúng → nhanh và nhẹ.
Kiểm lần đầu 2026-11-03 trên `9b5ccb6` ([audit](../plans/reports/packaging-audit-261103-1557-cs-packaging-distribution.md)); triển khai theo [plan](../plans/261103-0921-packaging-distribution/plan.md); trạng thái dưới đây sau khi triển khai (2026-11-03).

Archetype: **A** (một lệnh `momentry`) dạng "source bundle + shim": momentry là cây `.mjs` chạy trên Node, không có bước build. Lấy từ `references.md`: installer theo `templates/install.sh` của skill, `install.ps1` theo forgent `scripts/install.ps1`; mô hình doctor theo skillstation.

Overlay `languages/node.md` không kích hoạt (detect = `package.json`, PRD 4.9 cấm `package.json`). Áp luật chung, cộng NODE-04 (doctor kiểm Node).

## Quyết định
| Quyết định | Lựa chọn | Vì sao |
|---|---|---|
| Tagline | "Không còn phải ngồi nhớ lại tuần này có chuyện gì đáng kể: momentry tự nhặt chúng từ các phiên Claude Code và Codex của bạn." | Nói nỗi đau của người build in public |
| Lời hứa quick start | "Từ con số 0 tới danh sách chuyện đã xếp hạng trong khoảng 5 phút. Cần: Node ≥ 20, git, `claude` CLI đã đăng nhập." | |
| Lệnh | `init`, `doctor`, `status`, `connect`, `config`, `paths`, `version`, `update` (`upgrade`), `uninstall` (`remove`), `help`, cộng các lệnh pipeline sẵn có. Bỏ `completions`, `mcp`, `service` | Không daemon, không MCP; completions để sau (SHOULD) |
| `init --yes` một mình cho ra setup chạy được? | Có, trừ một dữ liệu chỉ user có: danh sách tên riêng tư cần chặn. `init` chỉ lệnh và file cần tạo | Không tự đoán dữ liệu riêng tư |
| Lệnh cài | `curl -fsSL …/releases/latest/download/install.sh \| sh`; Windows `irm …/install.ps1 \| iex` | |
| Ngân sách phụ thuộc | Node ≥ 20, git, `claude` CLI; installer cần `sh`, `curl`/`wget`, `tar`, sha256 (PowerShell 5.1 + `tar.exe` trên Windows) | |
| Cấu hình | JSON (PRD 6.5); `config default` sinh từ code, `config show` kèm lớp, `config set/unset` kiểm trước khi ghi | Lệch UX-11 (định dạng có comment) có chủ ý: giữ hợp đồng JSON |
| Nguồn phiên bản · asset | `lib/version.mjs`; tag phải khớp; `momentry-vX.Y.Z.tar.gz`, `install.sh`, `install.ps1`, `checksums.txt` | |
| PATH · ký số · host | Unix: in dòng `export`; Windows: thêm vào PATH user (HKCU). Chưa ký cosign. Host: Claude Code, Codex; `init` tự cài khi được đồng ý | Quyết định của user 2026-11-03 |
| Thư mục | Linux/WSL XDG; macOS giữ `~/.config`/`~/.cache` (lệch CFG-01 có chủ ý); Windows `%APPDATA%`, `%LOCALAPPDATA%` | Quyết định của user |
| Mã thoát | 0 ok, 1 lỗi, 2 sai cú pháp, 3/4/5 riêng, 10 có bản mới | Đổi hợp đồng có chủ ý, ghi CHANGELOG |

## Luật — MUST và SHOULD được chọn
| Luật | Mức | Trạng thái | Bằng chứng / ghi chú |
|---|---|---|---|
| ONB-01/04/06/07 màn hình đầu, thứ tự, lời hứa, lệnh cài + `<details>` Windows | MUST | done | `README.md` |
| ONB-08 ≤3 lệnh tới giá trị đầu | MUST | done | `init`, `scan --max-sessions 1`, `list --rank`; thêm một lệnh khai báo nguồn chặn lần đầu (dữ liệu của user) |
| ONB-09 khối lệnh chạy được nguyên văn | MUST | partial | Khối cài trỏ tới `releases/latest`, chỉ chạy được sau bản phát hành đầu tiên; CI chưa trích khối README để chạy |
| ONB-10/12 `init` kết thúc "✓ Sẵn sàng" + bước tiếp; installer, `init`, README cùng 3 bước | MUST | done | `lib/cli.mjs` `H.init`; `install.sh` `next_steps` |
| ONB-13 prompt "cài bằng agent" | SHOULD | done | README `<details>`; thử bằng agent thật (xem Verify 12) |
| ONB-14 lỗi trên đường đầu chỉ cách sửa / doctor | MUST | done | Lỗi dạng lỗi / vì / sửa; check nào cũng có `fix` |
| ONB-16 không jargon nội bộ trên màn hình đầu | SHOULD | done | Dòng "DM.x" chuyển xuống cuối README |
| CMD-01/02/03 một engine; doctor chỉ đọc; init = creates + fix | MUST | done | `lib/doctor.mjs`, `lib/checks.mjs`; test `cli.test.mjs` init |
| CMD-04 không có `setup` | MUST | done | |
| CMD-05 `status` + một lệnh tiếp | SHOULD | done | |
| CMD-06 `--version`, `version --json` có fingerprint | MUST | done | `lib/version.mjs` `fingerprint()` |
| CMD-07 cờ chung trên mọi lệnh | MUST | done | `GLOBAL_FLAGS` trong `lib/commands.mjs` |
| CMD-08 mã thoát | MUST | done | `EXIT` trong `lib/config.mjs`; CHANGELOG Breaking |
| CMD-09 stdout chỉ dữ liệu | MUST | done | `--json` đệm mọi dòng người đọc vào phong bì |
| CMD-10 lỗi / vì / sửa | MUST | done | `lib/cli-output.mjs` |
| CMD-11 phong bì `--json` | MUST | done | `envelope()`; test `commands.test.mjs`, `cli.test.mjs` |
| CMD-12 "did you mean" | SHOULD | done | lệnh, cờ, khoá cấu hình |
| CMD-15/16/19 help theo nhiệm vụ, help từng lệnh tự đủ, mục Agents | MUST/SHOULD | done | `renderMainHelp`, `renderCommandHelp`; test kiểm đủ trường |
| CMD-17/18 không tương tác; vòng agent hội tụ | MUST | done | `scripts/test-agent-native.sh` |
| CMD-20 completions, man page | SHOULD | todo | Chưa làm |
| UX-02/03 cài trong vài giây, chạy ngay | MUST | done | `scripts/test-installer.sh` |
| UX-04 cập nhật một lệnh | MUST | done | `momentry update` |
| UX-06 tự báo có bản mới | SHOULD | todo | Chưa có gợi ý định kỳ trên stderr; `update --check` có |
| UX-07 phụ thuộc runtime được doctor kiểm | MUST | done | `node.version`, `git.present`, `claude.present`; installer kiểm Node |
| UX-08 installer chỉ cần sh/curl/tar/sha256 | MUST | done | |
| UX-10 zero-config | MUST | partial | Chỉ thiếu nguồn chặn riêng tư (cố ý, PRD 4.7) |
| UX-11/CFG-05 cấu hình do binary sinh | MUST | done (JSON) | `config default`; JSON không có comment (quyết định giữ) |
| UX-14/15 `config set/unset`, kiểm thân thiện | MUST | partial | Có `set`/`unset`/`show`/`get`; chưa có `config edit` mở `$EDITOR` |
| INS-01..06, 09..13, 15 | MUST | done | `install.sh`, `install.ps1`; asset theo `releases/latest/download`; root bị từ chối; `--uninstall` |
| INS-07/08/14/16 marker, quay lui, fixture offline, allow-list | SHOULD | done | `.momentry-managed`, `versions/` giữ bản trước, `--local-fixture`, kiểm danh sách file |
| INS-17 PowerShell 5.1 | MUST | done (chưa chạy) | Viết theo forgent; chỉ chạy được trên CI Windows |
| UPD-01..06 | MUST | done | `lib/update.mjs`; test: lên bản, cùng bản, archive bị sửa |
| UPD-07 việc sau cập nhật chạy trong bản mới | SHOULD | done | `_activate` và `doctor --fix` gọi bằng bản mới |
| CFG-01..04, 06, 08 | MUST | done | `lib/paths.mjs`; cache 0700; cấu hình hỏng là lỗi |
| CFG-07 bí mật | MUST | n/a | momentry không giữ bí mật; `claude` tự quản đăng nhập |
| DOC-01..03 | MUST | done | |
| DOC-05 doctor chạy thử hook | SHOULD | partial | Kiểm hook có mặt, đúng lệnh, file đích còn; chưa gọi hook với input vô hại |
| AGT-01/03/04 tích hợp là check; sửa file host an toàn; đường dẫn ổn định | MUST | done | `lib/hosts.mjs`, `lib/safe-edit.mjs`; test `hosts.test.mjs` |
| AGT-02 bảng adapter host | MUST | done | `hostTable()`; `docs/installation.md` |
| AGT-07 file kỹ năng sở hữu theo digest | SHOULD | done | `bip.md` mang dòng `momentry:bip sha256=…` |
| PRN-03/04/05/07 | MUST/SHOULD | done | Chỉ đụng mục của mình; `--dry-run`; idempotent; liệt kê mọi thay đổi |
| UNI-01..05 | MUST | done | `momentry uninstall`, `install.sh --uninstall`; giữ dữ liệu trừ `--purge` |
| UNI-07 Windows xoá trễ | SHOULD | done (chưa chạy) | `cmd.exe` tách nền xoá shim và thư mục cài |
| SEC-01/04/05 | MUST | done | sha256 đúng tên; HTTPS, timeout, giới hạn byte; `lib/tar.mjs` từ chối `..`, link, mục ngoài danh sách |
| SEC-02/03 ký số cosign | SHOULD | todo | Installer nói rõ "chưa kiểm chữ ký" |
| VER-01/02/05/08 | MUST/SHOULD | done | `lib/version.mjs`; release.yml kiểm tag; `scripts/prepare-release.mjs`; `CHANGELOG.md` |
| VER-04 fingerprint | SHOULD | done | `version --json`: commit, thời điểm commit |
| REL-02/05/06 | MUST | done | Một quy tắc tên asset; `scripts/package-release.mjs`; `checksums.txt` |
| REL-03/04/07 CI trước release; draft → smoke → publish | MUST/SHOULD | done (chưa chạy) | `.github/workflows/release.yml` |
| REL-09 tái lập | SHOULD | done | Đóng gói hai lần ra cùng sha256 |
| REL-10 action ghim SHA, quyền tối thiểu | SHOULD | done | |
| REL-13 runbook | SHOULD | done | `docs/release-runbook.md` |
| TST-01..05 | MUST/SHOULD | done (Linux) | `scripts/test-installer.sh`, `.ps1`, `test-agent-native.sh`; CI ba OS chưa chạy lần nào |
| TST-06 hợp đồng lệnh ↔ docs | SHOULD | done | `test/commands.test.mjs`; `docs/cli-reference.md` sinh từ code |

Không áp dụng: `85-service-daemon` (không daemon; hook tách tiến trình chạy một lần), `channels/agent-host-plugin` (chưa phát hành dạng plugin), UX-01 binary dựng sẵn (một tarball mã nguồn dùng cho mọi nền), CFG-07 (không có bí mật).

## Verify (bảng của skill, chạy trong HOME tạm, 2026-11-03)
| # | Kết quả | Bằng chứng |
|---|---|---|
| 1 | pass | Màn hình đầu README: tagline, lời hứa, lệnh cài |
| 2 | pass | `main "$@"` cuối file, `set -eu`, `sh -n`, `--help` thoát 0 |
| 3 | pass | `momentry 0.1.0`; `version --json` có commit |
| 4 | pass | Không đối số: "Bắt đầu" 3 bước, mục "Agents / tự động hoá" |
| 5 | pass | `init/doctor/update/uninstall --help`: thay đổi, cờ + mặc định, ví dụ không tương tác, mã thoát, tiếp theo |
| 6 | pass | `--bogus` → thoát 2, "sửa: momentry --help"; `lisst` → "ý bạn là list" |
| 7 | pass | `init --yes --json </dev/null` không chờ, stdout chỉ JSON |
| 8 | pass | `doctor` chỉ đọc, thoát 1 khi chưa đạt, `next` chạy được |
| 9 | pass | `init --yes` lần hai: "không có gì phải làm" |
| 10 | pass | `update --check` thoát 10 khi có bản mới (fixture) |
| 11 | pass (chưa chạy trên GitHub) | release.yml: tag == VERSION, checksums kiểm lại, action ghim SHA |
| 12 | xem ghi chú dưới | Vòng có kịch bản qua (`test-agent-native.sh`); thử bằng agent thật: xem báo cáo cook |

## Còn lại
- Chạy CI lần đầu trên GitHub (cần push), sửa lỗi riêng Windows nếu lộ ra.
- Cắt bản `v0.1.0` (cần push tag) để lệnh cài trong README dùng được.
- Kiểm trên Windows thật shell mà Claude Code/Codex dùng chạy hook.
- SHOULD còn lại: completions (CMD-20), gợi ý bản mới định kỳ (UX-06), `config edit` (UX-14), cosign (SEC-02/03), doctor gọi thử hook (DOC-05).
