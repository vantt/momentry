# momentry

[English](README.md) · **Tiếng Việt**

*Picks `build-in-public` story material out of your Claude Code, Codex, pi, omp and Antigravity sessions.*

**Không còn phải ngồi nhớ lại tuần này có chuyện gì đáng kể: momentry tự nhặt chúng từ các phiên làm việc với coding agent của bạn.**

Bạn cứ làm việc với coding agent như thường. Sau mỗi phiên, momentry đọc transcript và tìm những khoảnh khắc đáng kể: con số đổi, nguyên nhân bất ngờ, quyết định bị đảo, cách làm người ngoài muốn học. Mỗi chuyện được ghi thành một file markdown trong repo và xếp hạng theo câu hook, sự giằng xé và mức ảnh hưởng. Dành cho người build in public, viết blog kỹ thuật hay làm báo cáo tuần mà không muốn mất chất liệu.

[Bắt đầu nhanh](#bắt-đầu-nhanh) · [Tham chiếu lệnh](docs/cli-reference.md) · [Cài đặt chi tiết](docs/installation.md) · [Đặc tả](docs/prd.md)

## Bắt đầu nhanh

Từ con số 0 tới danh sách chuyện đã xếp hạng trong khoảng 5 phút. Cần: **Node ≥ 20**, **git**, và **`claude` CLI đã đăng nhập** (momentry dùng nó để đọc phiên; mỗi phiên cỡ 150k token tốn khoảng 1 USD).

**1. Cài** (Linux, macOS, WSL):

```sh
curl -fsSL https://github.com/vantt/momentry/releases/latest/download/install.sh | sh
```

<details>
<summary>Windows (PowerShell)</summary>

```powershell
irm https://github.com/vantt/momentry/releases/latest/download/install.ps1 | iex
```

Installer thêm `%LOCALAPPDATA%\momentry\bin` vào PATH của user; mở terminal mới sau khi cài.
</details>

**2. Bật cho repo của bạn.** `init` tạo `.momentry.json` và hộp chuyện, cài hook (hoặc extension) và lệnh `/bip` cho Claude Code, Codex, pi, omp và Antigravity, ở mọi profile tìm thấy (có sao lưu), rồi kiểm mọi thứ. Lần đầu nó sẽ nhắc bạn khai báo những tên riêng tư cần chặn (tên người, tên dự án…) để không có gì lọt vào repo, bằng `momentry config privacy-add "<tên>"`:

```sh
cd <repo của bạn>
momentry init
```

**3. Gom phiên gần nhất và xem kết quả:**

```sh
momentry scan --max-sessions 1
momentry list --rank
```

Từ đây hook tự gom sau mỗi phiên. Muốn tự đánh dấu một khoảnh khắc ngay lúc đang làm, gõ `/bip <ghi chú>` trong agent của bạn.

Muốn đọc, chọn và sửa chuyện trên trình duyệt thì chạy `momentry ui`: một trang trên máy (127.0.0.1) có tường chuyện, riêng tư, chi phí, sức khoẻ và thiết lập. Không còn tab nào mở thì nó tự tắt.

<details>
<summary>Cài bằng agent của bạn</summary>

Dán vào agent của bạn (Claude Code, Codex, pi, omp, Antigravity):

> Cài momentry từ https://github.com/vantt/momentry (install.sh, hoặc install.ps1 trên Windows), rồi trong repo này làm theo `momentry init --help` và `momentry doctor --help` cho tới khi `momentry doctor --json` trả `"ok": true`. Nếu cần file tên riêng tư, hỏi tôi những tên cần chặn.

Sau đó nói: "gom phiên vừa rồi bằng momentry và cho tôi xem 3 chuyện mạnh nhất".
</details>

## Làm được gì

- **Tự gom sau phiên.** Hook `SessionEnd`, `PreCompact`, `SessionStart` (Claude Code, Codex), extension `momentry.ts` (pi, omp) và hook `SessionStart` (Antigravity, gom khi mở phiên kế tiếp) chạy nền, không làm chậm phiên, chỉ chạy trong repo đã `init`.
- **Đánh dấu tay bằng `/bip`.** Agent viết 2–4 câu về chuyện vừa xảy ra và ghi vào hộp.
- **Riêng tư là chốt chặn.** Chuyện có tên trong danh sách chặn bị giữ ngoài repo (`momentry quarantine`). `momentry check --staged` dùng được làm git pre-commit hook.
- **Ghi nhiều, lọc sau.** Không xoá gì; bạn đổi `status` của chuyện (`raw`, `picked`, `drafted`, `published`, `dropped`).

## Cập nhật

```sh
momentry update --check     # thoát 10 nếu có bản mới
momentry update --yes
```

`update` kiểm sha256, thử bản mới trước khi đổi, lỗi thì giữ bản cũ. Cấu hình, cache và hộp chuyện giữ nguyên.

## Cấu hình

Mặc định đủ dùng; thứ duy nhất phải khai báo là những tên riêng tư cần chặn khỏi repo:

```sh
momentry config privacy-add "Trần Văn A" "du-an-bi-mat"   # ghi vào names.txt và khai báo nguồn chặn
momentry config show        # giá trị hiệu lực và lớp đặt nó
momentry config default     # mọi khoá và giá trị mặc định
```

Thứ tự ưu tiên: cờ > biến môi trường > `<repo>/.momentry.json` > cấu hình người dùng > mặc định. Bảng khoá, biến môi trường và nơi lưu từng thứ: [docs/installation.md](docs/installation.md).

## Gỡ

```sh
momentry uninstall --dry-run   # xem sẽ gỡ gì
momentry uninstall --yes       # gỡ hook, /bip, lệnh và bản cài; giữ cấu hình, cache, hộp chuyện
momentry uninstall --purge --yes   # gỡ cả cấu hình và cache
```

## Sự cố

```sh
momentry doctor          # kiểm Node, git, claude, cấu hình, nguồn chặn, repo, hook, bản cài
momentry doctor --fix --yes
```

Mỗi check chưa đạt có dòng `sửa:` là lệnh chạy được. Hook ghi kết quả vào `~/.cache/momentry/hook.log`.

## Lệnh `gh` cho người bảo trì

Repo đang private: các lệnh dưới cần `gh` đã đăng nhập bằng tài khoản có quyền ghi. Runner checkout từ GitHub, nên push code trước khi chạy.

Cài từ release private (khi `curl … | sh` chưa dùng được):

```sh
gh release download v0.2.0 --repo vantt/momentry --dir ~/momentry-rel
sh ~/momentry-rel/install.sh --local-fixture ~/momentry-rel --yes
```

Windows: tải như trên vào `$HOME\momentry-rel`, rồi `$env:MOMENTRY_RELEASE_BASE = "$HOME\momentry-rel"` và chạy `install.ps1` trong thư mục đó.

CI (push và PR chỉ chạy Linux + một job Windows; ma trận đầy đủ có macOS chạy khi có tag hoặc chạy tay):

```sh
gh workflow run ci.yml --ref main                    # Linux × Node 20/22/24 (tạm tắt Windows/macOS)
gh workflow run windows-hook-probe.yml --ref main    # kiểm hook trên Windows thật; chỉ khi sửa phần hook Windows
gh run list --limit 5                                # các lần chạy gần nhất
gh run watch <run-id> --exit-status                  # theo dõi tới khi xong
gh run view <run-id> --log-failed                    # log của job hỏng
```

Phát hành: tag trùng `lib/version.mjs` thì `release.yml` chạy CI đầy đủ, tạo bản nháp, smoke test rồi publish:

```sh
git tag v0.3.0 && git push origin v0.3.0
gh run watch $(gh run list --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId') --exit-status
```

## Tài liệu

- [docs/cli-reference.md](docs/cli-reference.md): mọi lệnh, cờ, mã thoát, dạng `--json` (sinh từ code).
- [docs/installation.md](docs/installation.md): nền tảng, thư mục, biến môi trường, PATH, Windows và WSL.
- [docs/development.md](docs/development.md): chạy từ mã nguồn, test, `--fake-llm`, hợp đồng module, phát hành.
- [docs/prd.md](docs/prd.md): đặc tả; [docs/README.md](docs/README.md): mục lục tài liệu.

Trạng thái: pipeline gom và chấm có test với dữ liệu giả và đã chạy thật một lần (28/28 điểm nóng, 8/8 chuyện người gắn nhãn, 0,95 USD); hook đã kiểm với agent thật: Claude Code, Codex, pi và omp trên Linux và Windows; Antigravity trên Linux (chi tiết ở [docs/installation.md](docs/installation.md#host-được-hỗ-trợ)).

Giấy phép: [LICENSE](LICENSE).
