---
title: "Bán momentry: đóng source, host trang, bán cho dev, kiểm chứng audience kế tiếp"
description: "Gom mọi việc bán hàng (E8, E10–E15) thành một lộ trình có bước, điều kiện đi tiếp và người làm."
status: in-progress
priority: P1
effort: 2–6 tuần (giai đoạn 0–1); giai đoạn 2–4 tuỳ tín hiệu
branch: website-v2
tags: [sales, marketing]
blockedBy: []
blocks: []
created: 2026-11-04
---

# Bán momentry

## Bối cảnh: momentry là bản thử nghiệm của CIS

- **CIS (Creator Intelligence System, repo `vantt/cis`)** là ý tưởng lớn: ghi nhận công việc và hành trình học của một người, tìm insight và cơ hội nội dung trong đó (`vantt/cis` → `docs/prd/cis/creator-intelligence-system.md`).
- **momentry là lát cắt hẹp đầu tiên của CIS**, tách ra repo riêng ngày 2026-11-03 (`vantt/cis` → `docs/prd/momentry.md`). Nó là nhánh hẹp của Raw Capture Design: bắt ở ranh giới phiên, không can thiệp phiên chính, đầu ra là file chuyện đọc được ngay.
- **Mục tiêu hiện tại là bán.** Bán không chỉ để kiếm tiền: mỗi đồng trả và mỗi lượt đăng ký waitlist cho CIS biết nên xây cho audience nào tiếp (A1 dev → A2 vibe coder → A3 người làm việc với AI chat). Xem [audiences.md](../../website/content/audiences.md).
- Trên trang bán hàng không nhắc CIS; CIS là khung nội bộ.

## Nguồn

- Phiên "Định giá sản phẩm bán" (2026-11-04): định giá, quyết định đóng hẳn, audience creator, lộ trình 4 giai đoạn, Cloudflare thay GitHub Pages, CI thu gọn, repo đã private.
- Phiên "Quy trình xây dựng website bán hàng" (2026-11-03/04): research quy trình 8 bước và skill, team agent làm landing page v1 (`site-v1`), board thêm E10–E15.
- [board.md](../board.md), [selling-points.md](../../website/content/selling-points.md), [product-marketing.md](../../website/content/product-marketing.md).

## Quyết định đã chốt

| Ngày | Quyết định | Ghi chú |
|---|---|---|
| 2026-11-04 | Bán, không free; bán thì **đóng hẳn** (proprietary EULA), không FSL | User: "nếu bán thì sẽ đóng hẳn" |
| 2026-11-04 | Repo `vantt/momentry` chuyển **private** | Đã làm. Hệ quả: `curl … install.sh` và `momentry update` 404 với người ngoài cho tới khi binary lên R2 |
| 2026-11-04 | CI thu gọn: push/PR 4 job, ma trận đủ khi tag hoặc chạy tay | Đã làm, `3591a51` |
| 2026-11-04 | Host trang trên **Cloudflare** (không trả GitHub Pro) | Workers/Pages, R2 cho binary, Worker cho license, Web Analytics |
| 2026-11-04 | Giá dev: **19–29 USD trọn đời**, Lemon Squeezy hoặc Gumroad | Landing v2 dùng 29 USD làm giá tạm, đổi một chỗ |
| 2026-11-04 | Thứ tự audience: A1 dev → A2 vibe coder → A3 AI-chat worker; A4 creator thuần để sau | [audiences.md](../../website/content/audiences.md) |
| 2026-11-04 | Truyền thông dùng **một concept: creator**. 4 nhóm A1–A4 chỉ dùng nội bộ (phạm vi, nguồn, giá, kênh); ra ngoài chỉ thêm vế "creator làm việc với …" khi cần cho đúng sự thật | Nối thẳng sang CIS (Creator Intelligence System). [audiences.md](../../website/content/audiences.md) mục "Communication rule" |
| 2026-11-04 | Website: một thư mục `website/src/`, phương án thử trên nhánh + artifact riêng, bản lên mạng gắn tag `site-vN` | |

## Câu hỏi còn mở (chờ anh)

1. **Domain riêng:** đã có chưa, tên gì? Chặn E12 (host) và URL tải trong E10.
2. **Binary ở đâu:** board E10 còn ghi "repo public chỉ chứa Releases", nhưng phiên sau chốt **R2 trên Cloudflare** thay cho repo đó. Plan này theo R2; anh xác nhận.
3. **Giá cuối:** 19, 29 USD hay early-bird 19 → 29?
4. **Lemon Squeezy hay Gumroad.** Đề xuất Lemon Squeezy (merchant of record, lo VAT, có API license key).
5. **Chính sách hoàn tiền** (trang để placeholder `{{REFUND_POLICY}}`).
6. **Ngôn ngữ chuyện:** trang tiếng Anh nhưng chuyện ra tiếng Việt. Bán cho dev quốc tế cần prompt tiếng Anh (thêm việc S1.6) hay bán cho dev Việt trước?

## Lộ trình

Mỗi giai đoạn chỉ bắt đầu khi giai đoạn trước có tín hiệu. Cột Epic khớp [board](../board.md).

### Giai đoạn 0: Dọn nền (E10, E12, E8)

| ID | Việc | Epic | Ai | Trạng thái |
|---|---|---|---|---|
| S0.1 | Viết EULA (proprietary, 1 người dùng/license, cấm phân phối lại, không bảo hành); thay `LICENSE` | E10 | Agent soạn, anh duyệt | ⬜ |
| S0.2 | Sửa dòng license trong `README.md`, `README.vi.md`, `package.json` (nếu có); ghi `CHANGELOG.md` license đổi từ bản nào | E10 | Agent | ⬜ |
| S0.3 | Chuyển mục "Lệnh `gh` cho người bảo trì" từ README sang `docs/development.md` (README bị đóng vào tarball release, lộ tên repo private) | E10 | Agent | ⬜ |
| S0.4 | Tạo bucket R2, domain tải (vd `dl.<domain>`); workflow release đẩy binary + `install.sh` + `install.ps1` + checksums lên R2 | E10 | Anh tạo bucket và token; agent sửa workflow | ⬜ |
| S0.5 | Đổi URL mặc định trong `install.sh`, `install.ps1`, `lib/update.mjs` sang R2 (`MOMENTRY_RELEASE_BASE` đã có) | E10 | Agent | ⬜ |
| S0.5b | Sửa URL GitHub trong thông báo lỗi của shim (`lib/install.mjs:36`) | E10 | Agent | ⬜ |
| S0.6 | Phát một bản cuối trên GitHub Releases trỏ `update` sang R2 cho máy đã cài (20 lượt tải, chủ yếu máy anh) | E10 | Agent | ⬜ |
| S0.7 | Quyết giữ kín tài liệu bán hàng: `website/content/` vẫn trong repo private là đủ, hay chuyển `docs/_private/` | E10 | Anh | ⬜ |
| S0.8 | Landing page v2 cho bản bán (giá, Buy, EULA, không link GitHub, màu mới) | E8 | Team agent (luồng như đêm 2026-11-03) | 🔄 v2 xong trên nhánh `website-v2`, chưa commit; preview https://claude.ai/artifact/AP5YGq1seYZBAg9GHyVDzH; chờ anh chọn |
| S0.9 | Host trang trên Cloudflare (Workers static assets hoặc Pages), bỏ `.github/workflows/website.yml`, bật Web Analytics, Email Routing `hi@<domain>` | E12 | Anh trỏ domain; agent dựng deploy | ⬜ |
| S0.10 | Gắn tag `site-v2` khi v2 lên mạng | E12 | Agent | ⬜ |
| S0.11 | Sửa số liệu README cho khớp lần chạy thật đã ghi (`docs/experiments/2026-11-04-dm-real-run/`: 28/28 hotspot, 7/7 chuyện mẫu, 7/8 chuyện người gán nhãn nằm nửa trên, 1.01 USD; DM.5 chưa đạt). README còn ghi "8/8, 0.95 USD" | E8 | Agent | ⬜ |

**Xong giai đoạn 0 khi:** người ngoài cài được từ R2, trang lên domain, license mới trong mọi file.

### Giai đoạn 1: Bán cho dev, audience A1 (E11)

| ID | Việc | Epic | Ai | Trạng thái |
|---|---|---|---|---|
| S1.1 | Mở store Lemon Squeezy, sản phẩm 1 license trọn đời, bật license key | E11 | Anh | ⬜ |
| S1.2 | Worker `license` nhận webhook Lemon Squeezy, lưu key vào D1; endpoint kích hoạt | E11 | Agent | ⬜ |
| S1.3 | CLI: `momentry activate <key>`, kiểm nhẹ (lưu cache, offline grace); không khoá chặt, JS đọc được nên key chỉ chặn người trung thực | E11 | Agent | ⬜ |
| S1.4 | Email sau mua: key + lệnh cài + link docs | E11 | Agent soạn, anh cấu hình | ⬜ |
| S1.5 | Gắn `{{CHECKOUT_URL}}`, `{{DOWNLOAD_BASE}}`, `{{REFUND_POLICY}}` thật vào trang | E11 | Agent | ⬜ |
| S1.6 | (Nếu bán quốc tế) prompt tiếng Anh cho title/hook | E11 | Agent | ⬜ chờ câu hỏi 6 |
| S1.7 | Build in public chính momentry bằng momentry: mỗi tuần 1–2 bài X/LinkedIn từ hộp chuyện của repo này | E11 | Anh viết, momentry nhặt | ⬜ |
| S1.8 | Kênh: Show HN, r/ClaudeAI, r/ChatGPTCoding, nhóm dev Việt, X build-in-public | E11 | Anh | ⬜ |
| S1.9 | Gom phản hồi người mua đầu: dùng moment làm gì, thiếu gì; ghi vào `selling-points.md` | E11, E8 | Anh + agent | ⬜ |

**Tín hiệu đi tiếp:** có người trả tiền thật và họ hỏi bước biến moment thành bài viết. Nếu sau 2–4 tuần dưới ~20 người quan tâm: dừng, xem lại audience trước khi xây Pro.

### Giai đoạn 2: Tính năng Pro (E13, chồng một phần E6)

| ID | Việc | Ai |
|---|---|---|
| S2.1 | Bản nháp bài từ moment: X, LinkedIn, Threads, newsletter, báo cáo tuần | Agent |
| S2.2 | Giọng văn riêng: học từ bài người dùng đã đăng | Agent |
| S2.3 | Giảm chi phí LLM: model rẻ lọc trước, model mạnh chỉ chấm đoạn nóng; mục tiêu dưới ~1 USD/phiên | Agent |
| S2.4 | Quyết epic nào giữ việc soạn nháp (E6 hay E13) khi mở | Anh |

### Giai đoạn 3: Kiểm chứng A2 vibe coder, chưa code app (E14)

| ID | Việc | Ai |
|---|---|---|
| S3.1 | Landing page riêng cho vibe coder/creator, câu chủ đạo "You're not short of ideas. You forgot what you did." | Team agent |
| S3.2 | Waitlist trên Cloudflare (Worker + D1 + Turnstile), giá dự kiến 15–20 USD/tháng | Agent |
| S3.3 | Đo: vài trăm đăng ký thì sang giai đoạn 4 | Anh |

### Giai đoạn 4: Sản phẩm hosted (E15), chính là bước tiến về CIS

| ID | Việc |
|---|---|
| S4.1 | App desktop hoặc web, không CLI; moment thành thẻ, bấm ra nháp, copy hoặc lên lịch |
| S4.2 | Nguồn đọc mới: Cursor, Lovable, Bolt; export ChatGPT/Claude; sau đó browser extension |
| S4.3 | Backend: tài khoản, thuê bao, LLM chạy phía mình |
| S4.4 | Quyền riêng tư lên trang bán, chính sách dữ liệu |
| S4.5 | Onboarding dưới 2 phút, có moment đầu tiên ngay lần đầu |

### Chạy song song suốt quá trình (E8)

- Bổ sung pain point, selling point vào [selling-points.md](../../website/content/selling-points.md).
- Giữ [audiences.md](../../website/content/audiences.md) đúng với tín hiệu thật.
- Theo dõi đối thủ: Taplio, Typefully, Castmagic, Supergrow.

## Landing page v2: luồng chạy (lặp lại luồng đêm 2026-11-03)

Nhánh `website-v2`, xuất bản thành artifact riêng để so với v1 (https://claude.ai/artifact/8Kuiq9N5a297D561nYWYC1).

1. Agent nội dung (coreyhaines31/marketingskills: product-marketing, copywriting, cro): cập nhật `product-marketing.md` sang bản bán, viết lại `copy.md`, `wireframe.md`.
2. Agent design (anthropics frontend-design + impeccable): giữ kết cấu v1, **đổi hẳn bảng màu**; v1 bị chê "màu tệ, boring".
3. Hai reviewer song song: CRO + đối chiếu sự thật; design/a11y + Playwright (390, 1440, sáng/tối).
4. Gộp review thành một đợt sửa; tự kiểm Copy, tab, tràn ngang.
5. Publish artifact riêng; anh chọn; merge vào main, gắn `site-v2` khi lên Cloudflare.
