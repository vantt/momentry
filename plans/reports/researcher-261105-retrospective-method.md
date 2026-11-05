# Phương pháp nhìn lại (retrospective) làm bằng tay, làm đầu vào cho M.4

Ngày 2026-11-05. Dựng lại sự thật về cách một loạt 6 bài nhìn lại được làm cho một plan tài liệu chạy nhiều tuần của một dự án khác, viết để so với một công cụ gom chuyện tự động (momentry v0.3.0). Tất cả mã commit, id quyết định, tên file, đường dẫn và lời trích đã bị lược; chỉ giữ cách làm, số đo và lớp lỗi. **Đây là bản ghi trạng thái ở thời điểm đó**, không phải đặc tả của momentry. Dùng cho [M.4](../261105-story-material/plan.md) (chế độ nhìn lại, mạch nhiều phiên). Đọc kèm [phản hồi chọn chuyện](researcher-261105-story-picking-feedback.md) (ý S1 và S6).

## 1. Pipeline đã chạy

Tổng khoảng 31 phút, khoảng 1,78M token subagent. Mọi worker là một lời gọi agent trong cùng tiến trình.

| # | Giai đoạn | Cỡ |
|---|---|---|
| 0 | Lead kiểm trước: các mốc thời gian cần ghim, kích thước dữ liệu bằng chứng | khoảng 15 giây |
| 1 | 5 agent nghiên cứu chỉ-đọc, chạy song song (sonnet) | khoảng 4,5 phút; 0,85M token |
| 2 | Lead tự giải hai điểm mở bằng lệnh git | vài giây |
| 3 | Một người viết (opus) dựng bản tổng hợp bằng chứng cộng 6 bài | khoảng 7 phút; 0,46M token |
| 4 | Kiểm chứng vòng 1: một reviewer khác loại agent (opus) kiểm từng claim | khoảng 12 phút (39% tổng); 0,47M token cùng vòng 2 |
| 5 | Người viết sửa theo số thứ tự lỗi | khoảng 3 phút |
| 6 | Lead kiểm nhanh bằng grep | vài giây |
| 7 | Kiểm chứng vòng 2: chỉ đoạn đã đổi | khoảng 2 phút |
| 8 | Lead áp một sửa còn lại, merge, commit theo pathspec, mở xem trước | khoảng 40 giây |

**Năm lát nghiên cứu**: ba lát cắt theo **thời kỳ** (khởi đầu, giai đoạn lớn dần, điều khởi động plan), hai lát cắt theo **câu hỏi** (đã xây gì và được gì, tốn bao nhiêu). Mọi brief mang cùng ràng buộc: chỉ git đọc, không ghi; mỗi claim cần mã commit kèm ngày, đường dẫn, hoặc báo cáo có ngày, không thì ghi "chưa kiểm"; trích nguyên văn khi câu chữ quan trọng; không đọc file bí mật; giới hạn lệnh git vì ổ đĩa chậm; trần 300–450 dòng; mục cố định (bảng timeline, mục theo chủ đề, câu hỏi mở); kết thúc bằng dòng trạng thái.

**Nguồn đã dùng:** git (trên main và trên một tag lưu nhánh làm việc), file plan/phase/quyết định, nhật ký board (grep), báo cáo có ngày, ghi chú memory, một lần chạy công cụ kiểm tài liệu. **Không dùng: transcript phiên.** Nên nguồn gốc của đề xuất ban đầu (một cuộc chat) vẫn "chưa kiểm". Transcript lại là nguồn đầu tiên mà công cụ harvest tự động đọc.

## 2. Chọn chất liệu

- **Cái gì được tính là bằng chứng:** artefact gốc đọc lại được (mã commit kèm ngày và tiêu đề, `<sha>:<path>` kèm số dòng, đường dẫn trên tag, báo cáo có ngày, ghi chú memory cho lời người dùng). **Báo cáo nghiên cứu chỉ là chỉ đường, không phải bằng chứng**; reviewer được dặn như vậy.
- **Claim lấy trích dẫn thế nào:** trích dẫn được ghi ngay lúc nghiên cứu, người viết trích lại trong bài và theo từng hàng của bản tổng hợp.
- **Chuỗi nhân quả** (12 mắt) được dựng từ hợp các lát nghiên cứu; **timeline** (55 dòng) là hợp các bảng timeline, xếp theo giờ commit. Chính cách xếp theo giờ commit này sinh ra lỗi thứ tự sự kiện (mục 4).
- **Cái bị bỏ:** 10 mục vào "sổ claim bỏ", mỗi mục vì không tìm được nguồn gốc hoặc reviewer không tái hiện được. Quy tắc xuyên suốt: điều lát nghiên cứu ghi "chưa kiểm" thì bỏ hoặc giữ kèm nhãn UNVERIFIED.

## 3. Chọn và định hình chuyện

- **Mạch 6 bài** không chọn ngày làm: nó đến từ một đặc tả viết 16 ngày trước theo yêu cầu của chủ dự án (4–6 bài, cung gợi ý: khởi nguồn, trôi dạt, điều khởi động, phương pháp và vì sao chậm, giá phải trả, kết quả và bài học). Cung theo thời gian và nhân quả, **không phải xếp hạng các khoảnh khắc thú vị**.
- **Giằng xé phần lớn do Lead gieo**, không do pipeline tìm ra: brief liệt kê 5 sai lầm lấy từ trí nhớ và memory của Lead (copy thay vì move, review từng cạnh không hội tụ, Doer nới lỏng chính thước đo, hai lần người dùng phàn nàn về nhịp, một cơ chế khoá xây rồi xoá).
- **Nghiên cứu đóng góp:** phát hiện "không có sự cố khởi động" thành bước đảo ngược của một bài; các con số bất ngờ của giai đoạn giữa thành số liệu bài khác.
- **Hook:** không có bước chọn hook riêng, người viết tự chọn mỗi câu mở (tương phản quy mô, phương pháp, đảo ngược, nguyên tắc, khung trung thực, hai câu hỏi).
- **Điều làm bài thú vị, theo trọng số:** (1) chi phí tự gây; (2) đảo ngược; (3) số bất ngờ; (4) lời người dùng, làm giằng xé con người; (5) kết quả nói cạnh phần còn mở. Bài cuối gắn mỗi bài học với một sự kiện có tên.

## 4. Vòng kiểm chứng

**Rubric** của reviewer: kiểm từng claim với nguồn đã dẫn (ngày và tiêu đề commit bằng `git show -s`, đường dẫn ở commit đó, chạy lại ít nhất 10 số đầu bảng, trích dẫn bằng `git grep`/`git show`, ngày giờ); phân loại VERIFIED / WRONG / UNSUPPORTED / OVERSTATED; gắn cờ mọi ước lượng hay mục chưa kiểm xuất hiện như sự thật ở chỗ khác; kết luận REWORK nếu có WRONG hoặc UNSUPPORTED, kèm danh sách sửa chính xác. Reviewer khác loại agent với người viết.

**Vòng 1:** 102 claim: 80 đúng, 13 sai, 2 không nguồn, 7 nói quá. Mọi mã commit được dẫn và mọi số đầu bảng đều tái hiện được. **Vòng 2:** kiểm lại 20 đoạn đã sửa: 19 đúng, 1 sai; lỗi đó nằm ngay trong câu chữ do reviewer đề xuất ở vòng 1 (dùng sai một dải id).

**Các lớp lỗi và gốc (đều ở "mắt nối", không ở số liệu):**

| Lớp lỗi | Gốc |
|---|---|
| Sai commit gốc của plan | Mốc nêu trong brief là bản sao trên main, thật ra gốc nằm trên nhánh làm việc; nghiên cứu đọc bản trên main |
| Sai thứ tự sự kiện | Timeline xếp theo giờ commit; thứ tự nhân quả chỉ đọc được từ chữ trong tài liệu |
| "Kết cục" báo sai hoặc khác thực tế | Đọc một phần file quyết định hoặc báo cáo thử nghiệm dài; tiền đề trong brief mồi kết luận |
| Khoảng thời gian tính tay | Không tính từ timestamp commit |
| Suy luận nhân quả viết như sự thật | Suy từ thông điệp commit mà không kiểm commit sinh ra thứ đó |
| Đếm thiếu số quyết định của người dùng | Nhãn trên tiêu đề được lấy mẫu, không liệt kê |
| Số đếm không tái hiện được | Regex lỏng trên nhiều file |
| Diễn giải viết như đo đạc | Nhãn ước lượng rơi mất giữa đường vào bài |
| Cận dưới viết như ước lượng; số cũ | Một loạt id bị bỏ sót; số đếm lúc cutover trình bày như số hôm nay |
| Dùng ước lượng khi đã có số đo | Trích ước lượng trong báo cáo lập kế hoạch thay vì đo commit thật |
| Diễn đạt nói quá, danh sách thiếu mục | Diễn giải trôi so với câu gốc |
| Rơi hedge giữa các bài | Nhãn "cách đọc của người viết" hoặc nửa sau câu trích giữ ở bài này, rơi ở bài kia |

**Mẫu hình:** mọi mã commit và số đầu bảng đúng; mọi lỗi nằm ở keo dán tự sự: thứ tự, kết cục, ai quyết, cách nhau bao lâu. Gốc: đọc một phần các bản ghi Markdown dài, xếp theo giờ commit thay cho thứ tự nhân quả, và tiền đề do Lead và đặc tả viết vào brief. Trong 22 claim không đạt, nguồn là lát chi phí 5, lát đã xây 5, lát điều khởi động 4, lát giữa 2, người viết 5, chung 1; tiền đề trong brief đồng gây ra 3. Lát khởi đầu không gây lỗi nào.

## 5. Điểm yếu

- **Không đo được:** các lượt worker và reviewer của plan (hàng nghìn bản ghi toàn máy, không quy được), giờ/token/chi phí tiền, lần chạy lại do ổ đĩa chậm, số link chết trong khoảng trôi, và cuộc chat thiết kế ban đầu (vì transcript nằm ngoài nguồn).
- **Vượt độ dài:** brief xin 600–1 200 từ; bài 3–6 dài 1 388–1 734 từ. Sửa lỗi làm văn bản nở thêm; không có lượt cắt độ dài.
- **Một claim cũ lọt qua trong cùng commit:** hai bài ghi một file trạng thái còn "đang làm" trong khi cùng commit đã sửa thành hoàn tất; không có kiểm lại sau lần sửa cuối.
- **Vòng kiểm chưa đóng:** một sửa còn lại của vòng 2 do reviewer đề xuất và Lead áp mà không có vòng 3; câu chữ reviewer đề xuất cũng sai một lần, nên văn bản reviewer gợi ý cần được kiểm.
- **Chậm và thừa:** vòng 1 chiếm 39% thời gian vì dựng lại các sự thật lát nghiên cứu đã nêu nguồn (đúng cho tính độc lập nhưng nhân đôi lượt đọc git); hai lát đọc cùng các file dài một phần và gây phần lớn lỗi; việc gộp và việc viết bản tổng hợp do cùng một agent làm nên bước gộp không có kiểm độc lập.
- **Chọn chuyện chủ yếu ở thượng nguồn:** mạch đến từ đặc tả cũ và các khoảnh khắc "thú vị" do Lead liệt kê theo trí nhớ. Pipeline kiểm và làm giàu một câu chuyện đã chọn sẵn, **không tìm ứng viên rồi xếp hạng**.
- **Chưa làm:** chủ dự án chưa duyệt, chưa đăng.

## 6. Phương pháp rút gọn (đầu vào cho chế độ nhìn lại của momentry)

1. Đầu vào: phạm vi (repo, khoảng thời gian, mã plan), cung muốn có (N bài, mỗi bài một câu hỏi), danh sách nguồn cho phép (git, bản ghi plan, file quyết định, nhật ký board, memory, **transcript**), danh sách cấm (không ghi, không bí mật).
2. **Tìm ứng viên từ chất liệu, xếp hạng chúng, rồi mới chọn mạch**; không lấy mạch từ trí nhớ người chỉ huy. Chuyện momentry đã harvest là kho ứng viên.
3. Tự ghim các sự thật neo trước: commit gốc **trên nhánh làm việc** (không phải bản trên main), đỉnh lúc đáp, chỗ bằng chứng nằm. Đưa vào mọi brief như sự thật "Lead đã kiểm".
4. Cắt nghiên cứu thành 3–5 lát đọc song song, theo thời kỳ cho nhân quả và theo câu hỏi cho "đã xây, được gì, tốn bao nhiêu"; mỗi lát có mục cố định và trần dòng.
5. Quy tắc bằng chứng: mỗi hàng có mã commit kèm ngày, `<sha>:<path>:dòng`, hoặc báo cáo có ngày; trích nguyên văn; điều chưa chứng minh gắn UNVERIFIED; câu hỏi mở là mục bắt buộc.
6. Xếp sự kiện theo chữ nhân quả, không theo giờ commit; tính mọi khoảng thời gian từ timestamp; liệt kê (không lấy mẫu) nhãn "ai quyết"; đọc file quyết định và báo cáo thử nghiệm dài đến cùng, gồm cả phán quyết cuối; số từ nguồn thiếu thì viết "ít nhất N"; đếm bằng script.
7. **Brief chỉ chứa câu hỏi, không chứa kết luận** ("X kết thúc thế nào?", không phải "X đã chuyển vào checker").
8. Một người viết dựng bản tổng hợp bằng chứng (timeline, chuỗi nhân quả, bảng chi phí, trạng thái còn mở, sổ claim bỏ), rồi các bài. Mỗi bài một câu hỏi, nguồn trong dòng cho mọi claim, ước lượng và cách đọc gắn nhãn đồng nhất ở mọi bài.
9. Kiểm hook: mỗi câu mở nêu một bất ngờ đo được, một đảo ngược, hoặc một chi phí, kèm nguồn.
10. Cổng A, kiểm chứng độc lập: agent khác dựng lại mọi claim từ nguồn gốc, phân VERIFIED / WRONG / UNSUPPORTED / OVERSTATED; có WRONG hoặc UNSUPPORTED là REWORK kèm danh sách sửa chính xác.
11. Người viết áp sửa theo số. Cổng B: reviewer kiểm lại các đoạn đã đổi, **gồm cả câu chữ do chính họ đề xuất**; lặp đến khi hết WRONG và UNSUPPORTED.
12. Cổng C, lượt cắt độ dài: mỗi bài vừa ngân sách từ sau khi sửa; cắt, không nối thêm.
13. Cổng D, đóng băng: không sửa repo làm đổi một sự thật đã dẫn sau lần kiểm cuối; nếu cần, kiểm lại các claim bị ảnh hưởng trước khi commit.
14. Commit theo pathspec, xem trước, chờ chủ dự án duyệt trước khi đăng.

## Câu hỏi còn mở

- Đơn vị đo độ dài tiếng Việt (âm tiết hay token) ảnh hưởng con số vượt độ dài.
- Thêm transcript làm nguồn có xác minh được nguồn gốc đề xuất ban đầu không? Chưa kiểm; đây chính là điều M.4 nên thử.
