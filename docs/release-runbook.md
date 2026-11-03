# Phát hành momentry

Một bản phát hành là tag `vX.Y.Z` khớp `VERSION` trong `lib/version.mjs`. Workflow [release.yml](../.github/workflows/release.yml) làm phần còn lại.

## Cắt bản

1. Ghi thay đổi vào mục `## [Unreleased]` của `CHANGELOG.md`.
2. Trên `main` sạch và khớp `origin/main`:

   ```sh
   node scripts/prepare-release.mjs 0.2.0 --dry-run
   node scripts/prepare-release.mjs 0.2.0
   ```

   Script kiểm cây sạch, nhánh, tag chưa có; nâng `lib/version.mjs`; chuyển `Unreleased` thành `[0.2.0] - <ngày>`; chạy test; rồi in lệnh commit, tag, push để bạn chạy.
3. Push tag. Workflow:
   - chạy lại toàn bộ CI (ba OS, ba bản Node, vòng đời installer);
   - kiểm tag bằng `VERSION`;
   - đóng gói bằng `scripts/package-release.mjs` (một tarball, `install.sh`, `install.ps1` đã đóng dấu phiên bản, `checksums.txt`) và kiểm lại checksum;
   - tạo **bản nháp** với ghi chú lấy từ CHANGELOG;
   - cài thử bản nháp trên Linux, macOS, Windows rồi gỡ;
   - chỉ khi cả ba qua mới công bố. Tag có `-` (ví dụ `v0.2.0-rc.1`) thành prerelease, không thành "latest".

Thử đóng gói trên máy trước khi tag:

```sh
node scripts/package-release.mjs --dry-run           # liệt kê file trong archive
node scripts/package-release.mjs --out /tmp/rel      # tạo asset thật
sh /tmp/rel/install.sh --local-fixture /tmp/rel --dry-run
```

## Kiểm sau khi công bố

```sh
curl -fsSL https://github.com/vantt/momentry/releases/latest/download/install.sh | sh -s -- --dry-run
momentry update --check
```

## Khi bản phát hành hỏng

- **Smoke test hỏng:** bản nháp nằm lại, không ai nhận được. Sửa, xoá bản nháp và tag (`gh release delete vX.Y.Z --cleanup-tag`), cắt lại.
- **Đã công bố rồi mới thấy lỗi:** cắt ngay bản vá `vX.Y.Z+1`. `momentry update` không bao giờ hạ cấp tự động, nên đừng chỉ xoá bản hỏng mà hãy phát hành bản mới hơn.
- **Rút bản (yank):** `gh release edit vX.Y.Z --draft=true` để `releases/latest` trỏ lại bản trước. Người đã cài quay về bằng `momentry update --version vX.Y.W --yes`.
- **Một máy cập nhật hỏng:** `momentry update` tự quay lại bản cũ khi bản mới không chạy hoặc không kích hoạt được. Bản trước vẫn nằm trong `versions/`; quay tay: ghi tên bản đó vào file `current` (xem `momentry paths`).

## Lưu ý

- Ghim mọi action bằng SHA; khi nâng, tra SHA của tag (`gh api repos/actions/checkout/git/ref/tags/<tag>`).
- Đổi tên asset, bố cục archive hay thư mục cài thì sửa cùng lúc `scripts/package-release.mjs`, `install.sh`, `install.ps1`, `lib/update.mjs` (`ASSET_RE`, `ARCHIVE_ALLOW`) và `lib/install.mjs`; `scripts/test-installer.sh` bắt lệch.
