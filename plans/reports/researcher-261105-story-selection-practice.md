# Chọn chuyện từ log kỹ thuật: thực hành và tiền lệ bên ngoài

Ngày 2026-11-05. Nghiên cứu ngoài repo, viết bằng trí nhớ của agent cộng tìm kiếm web. **Chỉ 4 link đã được mở lại để kiểm trong lần viết này** (Reagan, FActScore, CoVe, SelfCheckGPT). Mọi trích dẫn khác (Galtung và Ruge, Harcup và O'Neill, Olson, sách SRE, Park, Gao) viết theo trí nhớ: mở ra kiểm trước khi trích. Chưa có công cụ công bố nào khai thác transcript coding-agent làm chất liệu bài viết; ánh xạ từ các lĩnh vực lân cận là suy luận, chưa kiểm. Bản này chưa đối chiếu với tín hiệu và rubric hiện có của momentry ([bản đồ thuật toán](researcher-261105-pick-algorithm-map.md)). Đọc kèm [phản hồi chọn chuyện](researcher-261105-story-picking-feedback.md).

## 0. Kết luận xếp theo ưu tiên

1. **Chia pipeline làm ba tầng.** (a) Trích tín hiệu tất định ra khoảnh khắc ứng viên kèm con trỏ bằng chứng. (b) LLM gom khoảnh khắc thành cung và viết một dòng "claim + stakes". (c) Xếp hạng theo rubric nhỏ, chỉ viết nháp top-k. Rẻ nhất mà vẫn có phán đoán ở chỗ cần.
2. **Lấy đảo ngược, cung lỗi→sửa và quyết định rõ của con người làm nguồn ứng viên chính.** Rẻ để dò và nhiều giá trị chuyện nhất. Đột biến chi phí và bực bội là phụ: tăng cường hoặc phá hoà.
3. **Xếp hạng bằng rubric giá trị tin tức cộng cổng "so what".** Chuyện phải nêu được thứ người ngoài repo dùng lại được. Khoảnh khắc kịch tính nhưng vụn thì rớt cổng.
4. **Buộc mọi claim của bản nháp vào id bằng chứng, rồi chạy lượt tách-claim/kiểm độc lập.** Giữ sổ claim bị bỏ. Dùng cách nói cận dưới cho số đếm ("ít nhất 14 lần thử lại").
5. **Đánh giá bằng tỉ lệ trúng top-k do người gán nhãn trên một bộ nhỏ đóng băng, cộng ưu tiên theo cặp.** Khoảng 30 ứng viên gán nhãn một lần là đủ khởi đầu. Thêm thử nghiệm người đọc lạnh trên 5 bài đã đăng.

## 1. Chọn chất liệu từ log

### 1.1 Tín hiệu rẻ (tất định)

Tính được từ transcript và metadata git, không cần LLM.

| Tín hiệu | Cách dò | Giá trị chuyện |
|---|---|---|
| Đảo ngược | git: commit revert, file hoặc hàm thêm rồi xoá trong N ngày, cùng hunk sửa qua lại. Transcript: agent sửa file X rồi hoàn tác | Cao: "làm X rồi bỏ X" tự nó là một cung |
| Cung lỗi→sửa | Test/build/tool exit ≠0 rồi sau đó xanh trên cùng lệnh. Độ dài cung (lượt, phút, lần thử) là thước đo | Cao khi cung dài hoặc cách sửa không hiển nhiên |
| Thử lại/lặp | Cùng một lệnh tool hay cùng chuỗi lỗi lặp k lần (chuẩn hoá chuỗi bằng hash) | Trung bình: đánh dấu vật lộn; bài học cần LLM |
| Đột biến chi phí/thời gian | Token hoặc thời gian mỗi lượt vượt robust z-score (median/MAD) trong phiên hoặc lịch sử repo | Trung bình: tăng cường, không tự thành chuyện |
| Can thiệp của người | Tin nhắn người dùng sau một lượt tự chạy dài, interrupt, lệnh bị từ chối, từ vựng "không / dừng / đừng" | Cao: quyết định rõ của người là phần "lựa chọn" của chuyện |
| Phạm vi phình ra | File hoặc commit dự kiến so với thực tế; số mục plan đổi giữa chừng | Trung bình |
| Bất thường định lượng | Commit lệch cỡ, bùng nổ số phiên, chênh lệch số test, số hiệu năng trong output (regex "ms", "x faster", "%") | Trung bình–cao nếu có cặp trước/sau |
| Khoảng lặng | Dừng lâu rồi tiếp tục cùng chủ đề (hạt giống cung nhiều phiên) | Trung bình: hữu ích để nối phiên |
| Lần đầu/lần cuối | Lần đầu xuất hiện khái niệm, file, công cụ mới; mục sống lâu cuối cùng được đóng | Trung bình: mới lạ và kết thúc |
| Ghi quyết định/tài liệu | Commit chạm bản ghi quyết định, ADR, mục "lịch sử" của spec | Cao: con người đã tự đánh dấu là quan trọng |

Repo nào đã giữ mục lịch sử quyết định thì có thể đọc chúng như "bước ngoặt" gắn nhãn sẵn thay vì dò từ đầu.

### 1.2 Cần LLM

- **Vì sao quan trọng:** bất ngờ hoặc đổi niềm tin. "Dự kiến so với thực tế" cần đọc ngữ nghĩa.
- **Cách sửa có hiển nhiên không:** diff tất định, nhưng "hiển nhiên với ai" thì không.
- **Nối khoảnh khắc qua phiên thành một cung:** embedding chọn liên kết ứng viên, rồi LLM xác nhận.
- **Đặt tên giằng xé:** câu "muốn X, nhưng Y, nên Z".
- **Bực bội hay chỉnh sửa trung tính:** từ vựng cho recall, LLM lọc precision.
- **Bài học khái quát:** người ngoài dự án dùng lại được không.

Dùng embedding hoặc lọc từ vựng cắt khối lượng trước, rồi mới gọi LLM trên các cửa sổ còn lại.

### 1.3 Tiền lệ đáng mượn

- **Generative Agents** (Park và cộng sự, 2023, [arXiv 2304.03442](https://arxiv.org/abs/2304.03442)): bộ nhớ trên cả log, LLM gán điểm "quan trọng 1–10" cho từng sự kiện và một bước phản tư trên các mục đầu. Gần nhất với tầng chấm-rồi-tổng-hợp. Điểm yếu: điểm quan trọng không hiệu chuẩn giữa các lần chạy, nên chấm lại theo cặp.
- **Cung cảm xúc** (Reagan và cộng sự, [EPJ Data Science 2016](https://epjds.epj.org/articles/epjdata/abs/2016/01/13688_2016_Article_93/13688_2016_Article_93.html), [PDF](https://cdanfort.w3.uvm.edu/research/2016-reagan-epj.pdf)): chuỗi thời gian cảm xúc của truyện quy về sáu dạng cơ bản (hình thức hoá kiểu Vonnegut). Họ báo cáo vài dạng được tải nhiều hơn, nhưng đó là truyện hư cấu. Với log phiên, đường cảm xúc có thể gợi ứng viên bước ngoặt (tụt mạnh rồi hồi là dạng "người rơi xuống hố"). Coi là tín hiệu yếu.
- **Khai thác postmortem sự cố.** Cấu trúc: timeline, yếu tố góp phần, điều tốt, điều xấu, hành động. Xem [chương văn hoá postmortem](https://sre.google/sre-book/postmortem-culture/) của sách SRE (Google) và bài postmortem không đổ lỗi của Etsy (John Allspaw). Dùng làm lược đồ trích cho cung lỗi→sửa: so sánh được các cung và giữ phần "yếu tố góp phần" trung thực.
- **Dò điểm nổi bật** trong video và esports dùng bất thường cửa sổ ngắn của tín hiệu hoạt động, rồi người hoặc bộ phân loại duyệt. Tương tự ở đây: bùng nổ tần suất tool call, lỗi hoặc sửa trong cửa sổ ngắn.
- **Chọn chuyện trong báo chí dữ liệu** ("góc nhìn là gì") sàng ngoại lai hoặc thay đổi trước, rồi đối chiếu độ liên quan với người đọc. Khớp thiết kế hai tầng ở trên.
- **Tóm tắt sự kiện/timeline** là bài toán NLP lâu đời (bộ dữ liệu TLS như Timeline17, Crisis). Lỗi thường gặp: chọn theo tần suất thay vì tầm quan trọng. Cách sửa: xếp theo đổi trạng thái, không theo số lần được nhắc.

## 2. Khung chọn chuyện

### 2.1 Các khung và mức hữu dụng

| Khung | Dùng | Đánh giá |
|---|---|---|
| **Giá trị tin tức** (Galtung và Ruge 1965; Harcup và O'Neill 2001/2017: liên quan, bất ngờ, quy mô, xung đột, tin xấu/tốt, người quyền lực, theo tiếp, giải trí, dễ chia sẻ) | Chiều trực tiếp của rubric | Hợp nhất để xếp hạng. Điều chỉnh: "liên quan" = người đọc dùng lại được; "quy mô" = có số đo; "xung đột" = đảo ngược hoặc thất bại |
| **ABT (Và–Nhưng–Vì vậy)** (Randy Olson, *Houston, We Have a Narrative*) | Phép thử cấu trúc rẻ: nói được "Ta làm A và B, nhưng C, vì vậy D"? | Cổng tốt nhất. Thiếu "Nhưng" là không có giằng xé. LLM điền được, người liếc vài giây là kiểm |
| **Phép thử "so what"** | Bài học dùng lại được, nói trong một câu | Cổng bắt buộc. Chính nó loại khoảnh khắc kịch tính nhưng vụn |
| **Dạng Vonnegut / cung Reagan** | Phân loại cung: người rơi xuống hố (lỗi→sửa), Lọ Lem, Icarus (thành công rồi sụp), v.v. | Dùng làm nhãn dạng của bản nháp, không dùng để xếp hạng |
| **Kim tự tháp Freytag / Story Circle (Harmon)** | Dựng, leo thang, đỉnh, kết | Hữu ích làm dàn bài, quá nặng cho việc chọn |
| **Cấu trúc postmortem không đổ lỗi** | Timeline, yếu tố góp phần, bài học | Dùng cho chuyện xoay quanh thất bại. Tốt cho độ tin cậy với dân kỹ thuật |
| **Hook / tension / stakes** | Hai câu mở đầu | Kiểm trên bản nháp, không phải trên ứng viên |

### 2.2 Xếp hạng ứng viên

Rubric cụ thể, mỗi chiều 0–2 (hoặc LLM so cặp), cộng lại:

1. **Bài học người đọc dùng lại được** (so-what). Cổng cứng: 0 là loại.
2. **Giằng xé:** có "Nhưng" thật (đảo ngược, thất bại, trái kỳ vọng).
3. **Độ mạnh bằng chứng:** số con trỏ độc lập cộng cặp trước/sau đo được.
4. **Mới lạ:** chưa có trong bài đã đăng hay lời khuyên phổ biến.
5. **Stakes/quy mô:** chi phí, thời gian, rủi ro hoặc tác động lên sản phẩm.
6. **Tự đứng được:** kể được mà không cần 20 phút ngữ cảnh repo.

Phá hoà: có quyết định của người, cung nhiều phiên, hoặc có một con số.

### 2.3 Tránh chọn kịch tính mà vụn

- Cổng so-what đứng trước chấm điểm; chỉ chấm "giằng xé" sau khi qua cổng.
- Chặn trọng số của kịch tính thuần định lượng (đột biến chi phí hay thử lại) để nó không vượt bài học.
- Buộc phát biểu bài học *không dùng* danh từ riêng của repo. Không làm được thì có lẽ vụn hoặc quá cục bộ.
- Phạt ứng viên có nguyên nhân là lỗi công cụ tự gây mà người đọc không tái hiện được, trừ khi mẫu cách sửa khái quát được.
- Xếp trong các nhóm đa dạng (thất bại, quyết định, hiệu năng/số, quy trình) và lấy top-k mỗi nhóm để một thể loại không chiếm hết.

### 2.4 Cung nhiều phiên và khoảnh khắc đơn

- Khoảnh khắc đơn dễ dẫn chứng và ngắn để viết, nhưng hay thiếu "so what".
- Cung nhiều phiên chứa chuyện hay nhất (giả thuyết, thử hỏng, đảo ngược, thiết kế cuối), nhưng khó neo bằng chứng nhất, nên đòi ít nhất 3 neo bằng chứng qua ít nhất 2 phiên.
- Cách làm thực tế: khoảnh khắc ứng viên đi vào bước **nối cung** (cùng file hoặc symbol, cùng mã quyết định, độ giống embedding, độ gần thời gian). Chấm cung và khoảnh khắc cùng một rubric, và ưu tiên cung khi nó chứa khoảnh khắc và qua cổng.

## 3. Nền sự thật

### 3.1 Các lớp lỗi quen thuộc của bản tóm tắt LLM

- **Sai thứ tự và ngày:** đảo sự kiện, hoặc suy ra "rồi" mà không có timestamp. Thường do làm phẳng nhiều phiên.
- **Sai quy kết:** quyết định của người ghi cho agent hoặc ngược lại; gọi nhầm model, công cụ.
- **Thổi phồng số:** "hàng chục lần thử lại" khi chỉ có 7; làm tròn lên; tổng lấy từ cửa sổ thiếu.
- **Bịa quan hệ nhân quả:** thêm "vì" giữa các sự kiện chỉ đồng xuất hiện (lỗi chính của bài kiểu postmortem).
- **Làm mượt kết quả:** việc chưa xong hoặc mới sửa một phần kể thành chiến thắng gọn.
- **Trôi trích dẫn:** diễn đạt lại trình bày như trích nguyên văn.
- **Nén nhầm:** gộp hai sự cố giống nhau thành một.

### 3.2 Thực hành, xếp theo hiệu quả trên chi phí

1. **Sinh theo con trỏ bằng chứng trước.** Đưa người viết một bảng sự thật đánh số (id, timestamp, file/dòng nguồn, đoạn trích nguyên văn, số đếm tất định). Đòi marker `[F12]` trong dòng cho mỗi claim. Cùng ý với sinh có quy kết (ALCE, Gao và cộng sự 2023, [arXiv 2305.14627](https://arxiv.org/abs/2305.14627)).
2. **Số tất định.** Tính mọi số đếm, thời lượng, chi phí bằng code và đưa số đã xong; LLM chỉ trích, không tự suy.
3. **Tách claim, rồi kiểm bằng lượt độc lập.** Cắt bản nháp thành claim nguyên tử (ý của FActScore: [Min và cộng sự, arXiv 2305.14251](https://arxiv.org/abs/2305.14251), chấm tỉ lệ sự kiện nguyên tử được nguồn ủng hộ). Kiểm từng claim với bằng chứng đã dẫn bằng prompt hoặc model *khác* chỉ thấy claim và bằng chứng, không thấy câu chuyện. Chain-of-Verification (Dhuliawala và cộng sự 2023) là cách tự sửa liên quan nhưng dựa vào kiến thức của chính model, nên kiểm dựa trên bằng chứng mạnh hơn ở đây.
4. **Lấy mẫu nhất quán** (SelfCheckGPT, Manakul và cộng sự, [arXiv 2303.08896](https://arxiv.org/abs/2303.08896)): lấy mẫu lại phép kiểm claim và coi bất đồng là cờ. Không cần nguồn ngoài, nên là phép kiểm phụ, yếu hơn.
5. **Cách nói cận dưới.** Khi cửa sổ bằng chứng có thể thiếu (log bị cắt, mất phiên), viết "ít nhất N". Mã hoá luật: số đếm từ log thiếu luôn là cận dưới.
6. **Sổ claim bị bỏ.** Ghi mọi claim bị gỡ hoặc làm nhẹ, kèm lý do (không nguồn, bị bác, mơ hồ). Nó kiểm bộ kiểm và cho thấy người viết có lặp một loại lỗi không. Tỉ lệ bỏ một loại tăng dần là lỗi prompt.
7. **Kiểm thứ tự bằng code.** Xác minh thứ tự sự kiện trong bài khớp thứ tự timestamp của các id được dẫn. Phép kiểm tất định rẻ bắt lỗi LLM phổ biến nhất.
8. **Kiểm quy kết:** mỗi claim phải có trường người làm (người / agent / tool) lấy từ bằng chứng, không suy.
9. **Người duyệt mẫu** chỉ các claim bộ kiểm đánh dấu "ủng hộ một phần".

## 4. Đánh giá rẻ chất lượng chọn chuyện

- **Bộ ứng viên đóng băng.** Lấy 30–50 ứng viên từ log cũ. Chủ dự án gán mỗi cái đăng / có thể / bỏ một lần (khoảng 20–30 phút). Giữ cố định để so sánh các thay đổi prompt hay rubric.
- **Tỉ lệ trúng top-k.** Thước đo: trong các mục "đăng" của chủ dự án, bao nhiêu phần nằm trong top-k của hệ thống (k = 3 hoặc 5)? Báo cả precision@k. Rẻ và trực tiếp.
- **Ưu tiên theo cặp.** Cho chủ dự án xem cặp (top của hệ thống vs một mục hạng giữa); ghi tỉ lệ thắng. So cặp nhanh và ít nhiễu hơn chấm 1–5, và nuôi được xếp hạng kiểu Elo nếu muốn chỉnh trọng số.
- **LLM làm giám khảo chỉ để thay thế tạm.** Dùng để lặp nhanh, nhưng hiệu chuẩn trên nhãn người trước (kiểm mức đồng thuận). Dùng họ model khác với bộ chọn để tránh thiên vị chính mình.
- **Thử nghiệm người đọc ngoài.** Đưa 3–5 người (hoặc một phiên LLM mới không có ngữ cảnh repo) bản đã xong và hỏi hai câu: "một điều học được là gì?" và "có chia sẻ không?". Không nói được bài học là rớt cổng so-what.
- **Cắt bỏ từng phần.** Chạy lại khi bỏ một tín hiệu (ví dụ không đột biến chi phí, không bộ dò đảo ngược) và xem top-k có đổi không. Cho thấy tín hiệu rẻ nào xứng đáng ở lại.
- **Sau đăng.** Nếu bài được đăng, theo dõi lượt lưu và trả lời mỗi chuyện, nhưng mẫu nhỏ và nhiễu nên chỉ lấy hướng.
- **Thước nền sự thật làm phụ.** Theo dõi tỉ lệ claim được ủng hộ và tỉ lệ claim bị bỏ mỗi bản nháp.

## 5. Giới hạn của nghiên cứu này

- Không tìm thấy tiền lệ khai thác transcript agent làm chất liệu chuyện. Ánh xạ từ lĩnh vực lân cận (postmortem, giá trị tin tức, tóm tắt) là suy luận của tôi, không phải kết quả đã kiểm.
- Sáu cung của Reagan đến từ truyện hư cấu và chấm cảm xúc; chưa được kiểm trên log kỹ thuật.
- Chỉ link Reagan, FActScore, CoVe và SelfCheckGPT được xác nhận bằng tìm kiếm. Các link còn lại viết theo trí nhớ.
- Trọng số rubric là điểm khởi đầu chưa kiểm; chỉnh theo bộ nhãn ở mục 4.

## Câu hỏi còn mở

1. Công cụ đã trích tất định những gì? Điều đó quyết định hàng nào của 1.1 là bổ sung thật (xem [bản đồ thuật toán](researcher-261105-pick-algorithm-map.md), mục 2).
2. Độc giả đích là kỹ sư ngoài dự án hay công chúng? Cổng "người đọc dùng lại được" đổi theo.
3. Log đầy đủ hay bị cắt, thiếu? Điều đó quyết định luật cận dưới áp dụng rộng đến đâu.
4. Đã có sẵn tập chuyện đã đăng hoặc đã bị loại để làm bộ nhãn đóng băng chưa?
