# Chạy thật pipeline cho DM.3–DM.5 (2026-11-04)

**Mục đích:** ghi bằng chứng chạy thật cho các dòng DM.3, DM.4, DM.5 ở [PRD mục 9](../../prd.md#9-việc). Trước lần này, README nói pipeline "đã chạy thật một lần" nhưng repo không có bản ghi.

**Kết quả thô** (hộp, sổ, đầu ra model) nằm ngoài repo vì chứa nội dung phiên, và đã mất khi thư mục nháp của phiên bị dọn. Số dưới đây chép từ đầu ra `--json` của lệnh.

## 1. Thiết lập

- **Mã:** `bin/momentry.mjs` ở `fe0c41d` (main), không dùng bản cài v0.1.0.
- **Phiên:** `claude:95ca719b` (repo `obsidian-pkm-automation`), dòng 1–4405, cùng cửa sổ với [thí nghiệm harvest](../2026-11-03-harvest/README.md).
- **Cô lập:** repo git rỗng trong thư mục nháp có `.momentry.json`, `MOMENTRY_CACHE` trỏ vào thư mục nháp. Hộp và sổ thật không bị chạm. Nguồn chặn riêng tư: cấu hình thật của user (`names.txt`).
- **Cấu hình:** mặc định: `harvest.runs` 1, harvest `haiku`, chấm và người ngoài `sonnet`.
- **Lệnh:**

  ```sh
  momentry harvest --transcript <95ca719b.jsonl> --to-line 4405 --runs 1 --repo <nháp> --json
  ```

  chạy hai lần liên tiếp trên cùng repo và sổ; sau đó `list --rank` và `check`.
- **Chấm:** người viết bản ghi này so tiêu đề và tóm tắt với 7 chuyện đáp án và 8 nhãn `t` của user (`docs/_private/label-95ca719b.md`). Không dùng LLM chấm `full`/`partial` như thí nghiệm.

## 2. Kết quả

| Đo | Lần 1 | Lần 2 |
|---|---|---|
| Entry sau rút gọn | 1017 (harness: 1018) | |
| Điểm nóng | 28, thiếu 0 | 28, thiếu 0 |
| Chuyện thô | 36 | 20 |
| Cụm | 38 | 35 |
| Ghi mới / gộp | 38 / 0 | 0 / 25 |
| Chặn riêng tư | 0 | 0 |
| Thời gian | 246 s | 293 s |
| Chi phí | 1,01 USD | 1,14 USD |

`dry-run` ước tính 0,54 USD cho một lần; thật gần gấp đôi. `check` sau hai lần: 38 chuyện, sạch.

**Đáp án 7 chuyện** (tìm thấy / hạng trong `list --rank`, 38 chuyện):

| Đáp án | Thấy | Hạng |
|---|---|---|
| mot-ky-tu-unicode | có | 1 |
| do-tim-kiem-tieng-viet | có | 3 |
| tu-dien-lam-te-hon | có | 4 |
| hybrid-lan-at-y-nghia | có | 5 |
| may-soan-nguoi-duyet | có | 2, 17 |
| lo-rieng-tu-trong-commit | có | 11 |
| pkill | có | 21 |

**8 nhãn `t` của user** (dòng ở file nhãn): 7 nằm ở nửa trên (hạng ≤ 19): dòng 1, 2, 3, 4, 5, 6, 8. Dòng 18 (máy đề xuất viết tắt, người duyệt nhận 10/11) đứng hạng 26: tension `none`, stakes 2.

## 3. Đối chiếu tiêu chí PRD

| ID | Tiêu chí | Kết quả |
|---|---|---|
| DM.3 | Cùng 28 điểm nóng như harness | Đạt về số (28). Chưa so từng điểm vì đầu ra harness nằm ngoài repo. Phần Codex (đọc rollout thật ra exit code, `paths`, `op: shell`) chưa làm ở lần này |
| DM.4 | ≥ 6/7 đáp án; trả lời 28/28 điểm nóng | Đạt: 7/7 (chấm tay theo tiêu đề), 28/28 không cần gọi bù |
| DM.5 | Lần hai không ghi gì; `list --rank` đưa đủ 8 chuyện `t` vào nửa trên | Lần hai: 0 chuyện mới, gộp 25 vào chuyện cũ (cập nhật `hits`). Xếp hạng: 7/8, **chưa đạt** |

## 4. Đọc kết quả

- Lần hai gộp được hết vào chuyện cũ, nhưng vẫn gọi model đủ các bước, tốn thêm 1,14 USD. Đây là đúng thiết kế khi truyền `--to-line` (cửa sổ tường minh luôn chạy lại); `scan` và hook dựa vào `lastLine` trong sổ nên không gom lại.
- Chuyện `t` bị rớt có tension `none`: bước 7 không thấy giằng xé, nên đứng sau mọi chuyện có tension. Đây là dữ liệu cho DM.10 (kiểm lại stakes và cách xếp), không phải lỗi mã.
- Ước tính chi phí của `dry-run` thấp khoảng 2 lần.

## 5. Giới hạn

- Một lần chạy (`runs = 1`), một phiên, phiên đã sinh ra giả thuyết tension và stakes: đây là kiểm hồi quy, như PRD ghi ở DM.5.
- Chấm bằng tay theo tiêu đề, một người chấm.

## 6. Codex: đọc rollout thật (phần Codex của DM.3)

Chạy `readEntries` của `lib/sources/codex.mjs` trên cả 6 rollout trong `~/.codex/sessions` (Codex 0.144.6, 0.145.0, 0.164.0), chỉ đếm trường, không in nội dung.

| Rollout | Codex | Entry | `op: shell` | trong đó lệnh git | có exit code | `isError` | `op: write` |
|---|---|---|---|---|---|---|---|
| 2026-07-25 13:45 | 0.145.0 | 32 | 8 | 6 | 0 | 0 | 0 |
| 2026-07-25 13:17 | 0.144.6 | 83 | 9 | 1 | 1 | 0 | 0 |
| 2026-07-27 03:59 | 0.145.0 | 52 | 19 | 5 | 4 (2, 1, 1, 128) | 1 | 0 |
| 3 rollout ngắn (2026-10) | 0.145.0, 0.164.0 | 1–2 | 0 | 0 | 0 | 0 | 0 |

- **Lệnh git ra `op: shell`:** đạt.
- **Exit code:** công cụ `exec` của Codex 0.144–0.145 không có trường exit code; đầu ra chỉ có dòng "Script completed" hoặc "Script failed". momentry lấy exit code từ chữ trong đầu ra khi có ("Process exited with code N"), và đặt `isError` khi gặp "Script failed". Lệnh chạy xong không in mã thì không có exit code: `nonzeroExit` chỉ bắt được khi đầu ra có in mã.
- **`apply_patch` ra `paths`:** không kiểm được trên dữ liệu thật, vì không rollout nào trong máy có lời gọi `apply_patch`. Chỉ có test với fixture (`test/sources.test.mjs`).
