// Dựng prompt cho từng biến thể thí nghiệm. node prompts.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2];
const read = f => fs.readFileSync(path.join(outDir, f), 'utf8');
const reduced = read('reduced.txt');
const hotspots = read('hotspots.txt');

const head = reduced => `Dưới đây là transcript đã rút gọn của một phiên làm việc giữa user và coding agent (Claude Code). Mỗi dòng có nhãn [Lnnn] là số dòng trong transcript gốc.

<transcript>
${reduced}
</transcript>
`;

// Bản B, mục 6.2 + README hộp chứa: tín hiệu, khuôn, riêng tư, "ghi thừa còn hơn bỏ sót".
const BASE = `
Nhiệm vụ: nhặt "chất liệu build in public" từ phiên này: những chuyện người ngoài sẽ thấy đáng đọc, để sau gom thành bài. Hộp chứa hiện đang rỗng.

Tín hiệu gợi ý (để nhận ra, không phải ngưỡng):
1. Số trước, số sau: một phép đo đổi rõ (điểm tìm kiếm, thời gian, số note).
2. Nguyên nhân bất ngờ: lỗi to mà gốc nhỏ, hoặc gốc nằm ở chỗ không ai nghi.
3. Đảo quyết định có lý do: làm A, đo thấy tệ, bỏ A; điều tưởng đúng hoá sai.
4. Người duyệt thứ máy soạn: bảng duyệt, hàng chờ, vòng lặp người với máy chạy được thật.
5. Ràng buộc định hình thiết kế: riêng tư, chạy trên máy, chỉ JS hay Rust... buộc chọn cách khác thường.
6. Artefact nhìn được: bảng, biểu đồ, màn hình đáng chụp.
Không khớp tín hiệu nào mà thấy hay, thấy lạ: vẫn ghi, signals: ["khác"].
Nguyên tắc: ghi thừa còn hơn bỏ sót.

Riêng tư: chỉ ghi cơ chế, con số, tên công cụ. Không ghi tên note, đường dẫn trong vault, câu hỏi thật của golden set, nội dung vault, tên người.

Mỗi chuyện: title (một dòng như tiêu đề bài), signals, lines (các [Lnnn] làm bằng chứng), context (1-2 câu), what_happened (3-5 câu, có con số), lesson (một câu người khác dùng được), artefact (thứ chụp hay dán được, phải che gì).`;

const ANTI_FILTER = `
Quan trọng: KHÔNG tự lọc. Chuyện nhỏ, vui, hỏng rồi sửa xong là quên, sự cố vặt của agent, lỗi quy trình, việc lặt vặt mà có điều bất ngờ: vẫn ghi thành chuyện riêng. Việc chấm và bỏ làm ở bước sau, không phải ở đây. Trước khi trả lời, rà lại toàn bộ transcript một lượt nữa tìm những chuyện nhỏ đã bỏ qua.`;

const OUTSIDER_SHORT = `
Thêm một câu hỏi: có việc nào user (hoặc agent) làm trơn tru, coi là bình thường, nhưng một dev làm một mình, dùng AI hằng ngày, không rành lĩnh vực này sẽ hỏi lại "làm sao vậy?" không? Nếu có, ghi thành chuyện (signals có "người ngoài").`;

const OUTSIDER_STRUCT = `
Bước người ngoài (bắt buộc, trả trong trường "outsider"):
Người đọc: dev làm một mình, dùng AI hằng ngày, không rành lĩnh vực của phiên này.
Liệt kê ít nhất 3 việc user hoặc agent làm trơn tru, coi là hiển nhiên, không ai trong phiên ngạc nhiên. Với mỗi việc: what (việc gì), common_practice (người thường làm việc này thế nào), gap (khác ở đâu, vì sao người đọc sẽ hỏi "làm sao vậy?"), lines. Việc nào đủ khoảng cách thì cũng ghi thành chuyện trong "stories" (signals có "người ngoài").`;

const HOTSPOT = hotspots => `
Điểm nóng do script tính (exit code khác 0, cặp số trước/sau, git đảo hướng, ghi file cấu hình agent). Với TỪNG điểm nóng, trả trong "hotspots": id, verdict ("story" nếu thành chuyện hoặc góp vào chuyện, "skip" nếu không), story_title hoặc reason (vì sao không đáng, một câu). Không được bỏ qua điểm nóng nào.
<hotspots>
${hotspots}
</hotspots>`;

// Chỉ đưa danh sách làm gợi ý, không bắt trả lời từng điểm (tách tác dụng của phần b).
const HOTSPOT_HINT = `
Chỗ đáng xem kỹ do script tính (exit code khác 0, cặp số trước/sau, git đảo hướng, ghi file cấu hình agent). Đây chỉ là gợi ý nơi có thể có chuyện:
<hotspots>
${hotspots}
</hotspots>`;

const FORMAT = (extra) => `
Chỉ trả về một JSON object, không có chữ nào khác, dạng:
{"stories":[{"title":"","signals":[],"lines":[],"context":"","what_happened":"","lesson":"","artefact":""}]${extra}}`;

const variants = {
  e1: BASE + FORMAT(''),
  e2: BASE + ANTI_FILTER + FORMAT(''),
  e3a: BASE + ANTI_FILTER + OUTSIDER_SHORT + FORMAT(''),
  e3b: BASE + ANTI_FILTER + OUTSIDER_STRUCT + FORMAT(',"outsider":[{"what":"","common_practice":"","gap":"","lines":[]}]'),
  e4: BASE + ANTI_FILTER + OUTSIDER_STRUCT + HOTSPOT(hotspots) +
    FORMAT(',"outsider":[{"what":"","common_practice":"","gap":"","lines":[]}],"hotspots":[{"id":"H1","verdict":"story|skip","story_title":"","reason":""}]'),
  e4n: BASE + ANTI_FILTER + OUTSIDER_STRUCT + HOTSPOT_HINT +
    FORMAT(',"outsider":[{"what":"","common_practice":"","gap":"","lines":[]}]'),
};
for (const [k, v] of Object.entries(variants)) fs.writeFileSync(path.join(outDir, `prompt-${k}.txt`), head(reduced) + v);

// Thí nghiệm 5: như e4 nhưng bỏ bản tóm tắt compact khỏi input.
fs.writeFileSync(path.join(outDir, 'prompt-e5.txt'), head(read('reduced-nocompact.txt')) + BASE + ANTI_FILTER + OUTSIDER_STRUCT +
  HOTSPOT(read('hotspots-nocompact.txt')) +
  FORMAT(',"outsider":[{"what":"","common_practice":"","gap":"","lines":[]}],"hotspots":[{"id":"H1","verdict":"story|skip","story_title":"","reason":""}]'));

// Bước người ngoài tách riêng: đọc transcript + danh sách chuyện đã nhặt (từ một lần e4), chỉ làm phần (c).
const picked = JSON.parse(read('parsed-e4-2.json')).stories.map((s, i) => `S${i + 1}. ${s.title}`).join('\n');
fs.writeFileSync(path.join(outDir, 'prompt-out.txt'), head(reduced) + `
Một lượt trước đã nhặt các chuyện sau từ phiên này:
<picked>
${picked}
</picked>

Nhiệm vụ của bạn chỉ là bước người ngoài. Người đọc: dev làm một mình, dùng AI hằng ngày, không rành lĩnh vực của phiên này.
Tìm những việc user hoặc agent làm trơn tru, coi là hiển nhiên, không ai trong phiên ngạc nhiên, nhưng người đọc kia sẽ hỏi lại "làm sao vậy?" hoặc "tôi cũng muốn có cái đó". Bỏ qua những việc mà dev bình thường đã làm (chạy test, commit, đọc log...). Với mỗi việc, so với cách làm phổ biến thật sự ngoài đời, không so với chuẩn chuyên gia.
Liệt kê 3-8 việc. Mỗi việc: what, common_practice, gap (khác ở đâu, vì sao người đọc muốn biết), lines, already_picked (S-id nếu trùng chuyện đã nhặt, không thì null).
Riêng tư: không ghi tên note, đường dẫn trong vault, câu hỏi thật, tên người.
Chỉ trả JSON: {"outsider":[{"what":"","common_practice":"","gap":"","lines":[],"already_picked":null}]}`);
console.log(Object.keys(variants).join(' '), 'e5 out');
console.log(Object.keys(variants).join(' '));
