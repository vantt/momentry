// The command surface: one definition drives the parser, `--help`, `help --json` and docs/cli-reference.md.
// Every command here must have a handler in lib/cli.mjs (test/commands.test.mjs checks both ways).

const S = (desc, extra = {}) => ({ type: 'string', desc, ...extra });
const B = (desc, extra = {}) => ({ type: 'boolean', desc, ...extra });
const I = (desc, extra = {}) => ({ type: 'string', int: true, desc, ...extra });

/** Flags every command accepts, with the same meaning everywhere. */
export const GLOBAL_FLAGS = {
  json: B('in kết quả dạng JSON {schema,ok,data,error,next} ra stdout, kể cả khi lỗi'),
  yes: B('đồng ý mọi thay đổi, không hỏi (bắt buộc khi không có TTY cho lệnh có thay đổi)', { short: 'y' }),
  'dry-run': B('chỉ in sẽ làm gì, không ghi gì'),
  quiet: B('bớt thông báo phụ trên stderr', { short: 'q' }),
  verbose: B('thêm thông tin chẩn đoán trên stderr', { short: 'v' }),
  'no-color': B('không dùng màu (cũng theo biến NO_COLOR)'),
  config: S('file cấu hình người dùng thay cho mặc định (như MOMENTRY_CONFIG)', { short: 'c', arg: 'FILE' }),
  help: B('trợ giúp của lệnh', { short: 'h' }),
};

const EXIT_COMMON = { 0: 'xong', 1: 'lỗi (xem dòng "sửa")', 2: 'sai cú pháp lệnh hoặc cờ' };
const REPO = S('repo cần làm (mặc định: git root của thư mục hiện tại)', { arg: 'DIR' });

/**
 * @typedef {object} FlagDef
 * @property {'string'|'boolean'} type
 * @property {string} desc
 * @property {string} [short]
 * @property {boolean} [int]       string parsed as an integer ≥ 0
 * @property {string} [arg]        placeholder in help
 * @property {string|number|boolean} [default]
 *
 * @typedef {object} CommandDef
 * @property {string} summary       one line
 * @property {string} [changes]     what it changes on disk
 * @property {string} [prereq]
 * @property {Record<string, FlagDef>} flags
 * @property {{min: number, max: number, names?: string}} [positionals]
 * @property {string[]} examples    2-4, one non-interactive
 * @property {Record<number, string>} exit
 * @property {string} [next]        what to run next
 * @property {string[]} [aliases]
 * @property {boolean} [hidden]
 * @property {'start'|'daily'|'maintain'|'advanced'} group
 */

/** @type {Record<string, CommandDef>} */
export const COMMANDS = {
  init: {
    group: 'start',
    summary: 'Bật momentry cho repo này: tạo .momentry.json và hộp chuyện, cài hook, lệnh momentry-bip/momentry-ui và skill momentry cho các agent tìm thấy, rồi chạy doctor.',
    changes: '<repo>/.momentry.json, thư mục hộp <repo>/docs/storytelling-material, <config>/projects.json (danh sách dự án trên máy), <cache>/metrics.json (lần đầu: thời điểm cài, chỉ nằm trên máy); phần của agent như momentry connect (ví dụ ~/.claude/settings.json khoá hooks, ~/.claude/commands/momentry-bip.md, ~/.codex/hooks.json, ~/.agents/skills/momentry-bip/), có sao lưu *.momentry-bak-*. Chạy lại không đổi gì nếu đã đủ.',
    prereq: 'git repo; Node ≥ 20; `claude` CLI đã đăng nhập; privacy.sources trong cấu hình người dùng (init chỉ cách khai báo nếu thiếu).',
    flags: { repo: REPO, 'no-connect': B('không cài hook, lệnh và skill cho agent') },
    examples: ['momentry init', 'momentry init --yes --json        # không hỏi, cho agent/CI', 'momentry init --dry-run           # xem sẽ thay đổi gì', 'momentry init --no-connect        # chỉ bật repo, không đụng ~/.claude'],
    exit: { ...EXIT_COMMON, 1: 'còn check chưa đạt (xem "sửa"; thường là thiếu privacy.sources)' },
    next: 'momentry scan --max-sessions 1',
  },
  doctor: {
    group: 'start',
    summary: 'Kiểm momentry có chạy được không: Node, git, claude, cấu hình, nguồn chặn riêng tư, repo, hộp, hook, bản cài. Chỉ đọc, trừ khi có --fix.',
    changes: 'không gì; với --fix: sửa cái đã có nhưng hỏng (quyền cache, khoá chết, hook dạng cũ). Không tạo repo/hộp mới (đó là việc của init).',
    flags: { repo: REPO, fix: B('sửa những gì sửa được rồi kiểm lại (tối đa 3 vòng)') },
    examples: ['momentry doctor', 'momentry doctor --json            # cho agent: chạy mọi lệnh trong "fix"', 'momentry doctor --fix --yes'],
    exit: { 0: 'mọi check quan trọng đều đạt', 1: 'có check quan trọng chưa đạt', 2: 'sai cú pháp' },
    next: 'chạy lệnh ở cột "sửa" của từng check chưa đạt, rồi momentry doctor lại',
  },
  status: {
    group: 'start',
    summary: 'Tóm tắt nhanh (không gọi claude) và đúng một lệnh nên chạy tiếp, kèm repo có đang tạm dừng gom chuyện không; --json kèm số đo trên máy (thời gian từ cài tới chuyện đầu, tỉ lệ Use trong top 5).',
    flags: { repo: REPO },
    examples: ['momentry status', 'momentry status --json'],
    exit: { 0: 'ổn', 1: 'có việc cần làm (xem "tiếp")', 2: 'sai cú pháp' },
  },
  scan: {
    group: 'daily',
    summary: 'Gom mọi phiên Claude Code, Codex, pi, omp, Antigravity của repo chưa gom hết, ở mọi profile (bỏ qua phiên đang mở).',
    changes: '<box>/*.md (chuyện mới hoặc gộp), <cache>/ledger.json, <cache>/runs/, <config>/projects.json (thêm repo vào danh sách dự án), <cache>/metrics.json (lúc có chuyện đầu tiên).',
    prereq: 'repo đã init; `claude` CLI; tốn ~1 USD cho phiên cỡ 150k token.',
    flags: {
      repo: REPO, claude: B('chỉ phiên Claude Code'), codex: B('chỉ phiên Codex'), pi: B('chỉ phiên pi'), omp: B('chỉ phiên omp (oh-my-pi)'), agy: B('chỉ phiên Antigravity'),
      'quiet-minutes': I('bỏ qua phiên có ghi trong N phút gần đây', { default: 30, arg: 'N' }),
      'max-sessions': I('gom tối đa N phiên (0 = không giới hạn)', { arg: 'N' }),
      except: S('bỏ qua phiên này', { arg: 'ID' }), auto: B('chế độ hook: giới hạn chi phí, lần đầu chỉ đánh dấu mốc'),
    },
    examples: ['momentry scan --dry-run            # xem sẽ gom gì, không tốn tiền', 'momentry scan --max-sessions 1', 'momentry scan --codex'],
    exit: { 0: 'xong', 1: 'lỗi', 2: 'sai cú pháp', 3: 'có chuyện giữ ngoài repo vì chưa có nguồn chặn', 4: 'model lỗi', 5: 'phiên đang bị khoá' },
    next: 'momentry list --rank',
  },
  list: {
    group: 'daily',
    summary: 'Bảng chuyện trong hộp: code (mã M-XXXX), id, date, status, hook, tension, stakes, strength, hits.',
    flags: {
      rank: B('xếp theo độ mạnh'), status: S('lọc theo status', { arg: 'S' }), thread: S('lọc theo thread', { arg: 'T' }),
      session: S('lọc theo phiên', { arg: 'ID' }), box: S('thư mục hộp', { arg: 'DIR' }), repo: REPO,
    },
    examples: ['momentry list --rank', 'momentry list --status picked --json'],
    exit: { 0: 'xong', 1: 'không có hộp (chạy momentry init)', 2: 'sai cú pháp' },
  },
  ui: {
    group: 'daily',
    summary: 'Mở giao diện web trên máy (đọc chuyện, chọn chuyện, riêng tư, chi phí, sức khoẻ, thiết lập). Một tiến trình, nghe 127.0.0.1 và địa chỉ Tailscale của máy (tắt bằng momentry config set ui.tailscale false), tự tắt khi không còn tab nào mở.',
    changes: '<cache>/ui.json (cổng, mã truy cập, pid của tiến trình đang chạy), <cache>/ui-open.html (trang mở có mã truy cập, chỉ bạn đọc được), <cache>/ui-state.json (chuyện đã đọc, để sau). Mọi thay đổi khác do bạn bấm trên giao diện.',
    flags: {
      'no-open': B('không mở trình duyệt, chỉ in đường dẫn file mở giao diện (mã truy cập nằm trong file, không in ra)'),
      port: I('cổng muốn dùng', { default: 4825, arg: 'N' }),
      remote: B('in link có mã truy cập để mở từ máy khác trong tailnet (không mở trình duyệt)'),
      serve: B('chạy tiến trình web ngay trong terminal này (thường do momentry ui tự gọi)'),
    },
    examples: ['momentry ui', 'momentry ui --remote                # link cho điện thoại hoặc máy khác trong tailnet', 'momentry ui --no-open --json       # cho agent: in file mở giao diện để đưa người dùng'],
    exit: EXIT_COMMON,
  },
  show: {
    group: 'daily',
    summary: 'In đầy đủ một chuyện trong hộp: mã, tiêu đề, trạng thái, các phần (bối cảnh, chuyện gì xảy ra, bài học…). Nhận id hoặc mã chuyện (M-XXXX, hoa thường đều được, M- có thể bỏ). Chỉ đọc.',
    positionals: { min: 1, max: 1, names: '<id|mã>' },
    flags: { repo: REPO },
    examples: ['momentry show 2026-11-04-cache-lru', 'momentry show M-7K3Q', 'momentry show 7k3q --json                  # cho agent (skill momentry)'],
    exit: { 0: 'xong', 1: 'không có chuyện này trong hộp, hoặc file chuyện sai khuôn', 2: 'sai cú pháp hoặc id sai khuôn' },
  },
  mark: {
    group: 'daily',
    summary: 'Đánh dấu một chuyện (theo id hoặc mã M-XXXX): use (sẽ dùng, status picked), later (để sau, chỉ ghi trên máy này), drop (bỏ, status dropped).',
    changes: 'use/drop: dòng status trong <box>/<id>.md; later: <cache>/ui-state.json; quyết định kèm hạng của chuyện lúc đó: <cache>/metrics.json (chỉ nằm trên máy).',
    positionals: { min: 2, max: 2, names: '<id|mã> <use|later|drop>' },
    flags: { repo: REPO },
    examples: ['momentry mark 2026-11-04-cache-lru use', 'momentry mark M-7K3Q drop --json'],
    exit: { 0: 'xong', 1: 'không có chuyện này trong hộp, mã trùng, hoặc file chuyện sai khuôn', 2: 'sai cú pháp, id hoặc nhãn sai' },
  },
  add: {
    group: 'daily',
    summary: 'Ghi một chuyện tay (lệnh momentry-bip của agent gọi lệnh này). Qua kiểm riêng tư.',
    changes: '<box>/<date>-<slug>.md, hoặc <cache>/quarantine/ nếu vi phạm hay chưa có nguồn chặn; với --by live: <cache>/metrics.json (lúc có chuyện đầu tiên).',
    flags: { title: S('tiêu đề một dòng'), note: S('ghi chú 2-4 câu'), by: S('human hoặc live', { default: 'human' }), session: S('phiên liên quan', { arg: 'ID' }), repo: REPO },
    examples: ['momentry add --title "Cache LRU" --note "p95 800ms → 90ms sau khi đổi Map sang LRU"'],
    exit: { 0: 'đã ghi', 1: 'vi phạm riêng tư (chuyện vào quarantine)', 2: 'sai cú pháp', 3: 'chưa có nguồn chặn (chuyện vào quarantine)' },
  },
  check: {
    group: 'daily',
    summary: 'Kiểm khuôn frontmatter, id khớp tên file, link không gãy, mã chuyện không trùng, và riêng tư. Dùng được làm git pre-commit hook.',
    changes: 'không gì; với --fix: thêm code và aliases (mã chuyện M-XXXX) vào chuyện chưa có, đúng mã chúng đang mang.',
    flags: { box: S('thư mục hộp', { arg: 'DIR' }), staged: B('chỉ file đã git add'), fix: B('ghi mã chuyện vào file chưa có (code, aliases) rồi kiểm'), repo: REPO },
    examples: ['momentry check', 'momentry check --staged            # trong .git/hooks/pre-commit', 'momentry check --fix               # ghi mã M-XXXX vào chuyện cũ'],
    exit: { 0: 'sạch', 1: 'có lỗi khuôn hoặc vi phạm riêng tư', 2: 'sai cú pháp', 3: 'khuôn sạch nhưng chưa kiểm được riêng tư (không có nguồn chặn)' },
  },
  pause: {
    group: 'daily',
    summary: 'Tạm dừng gom chuyện cho repo này trên máy này: hook không tự gom, scan --auto bỏ qua, đầu phiên không nhắc. Giữ .momentry.json, hộp và chuyện cũ. Lối tắt của momentry config set paused true --project.',
    changes: '<config>/projects.json (dấu tạm dừng của repo; chỉ nằm trên máy, repo không tự đặt hay gỡ được).',
    prereq: 'repo đã init (hoặc nằm trong MOMENTRY_REPOS).',
    flags: { repo: REPO },
    examples: ['momentry pause', 'momentry pause --repo ~/code/du-an --json', 'momentry pause --dry-run'],
    exit: { 0: 'đã tạm dừng (hoặc đã dừng sẵn)', 1: 'không ở trong repo được quan sát, hoặc danh sách dự án hỏng', 2: 'sai cú pháp' },
    next: 'momentry status',
  },
  resume: {
    group: 'daily',
    summary: 'Bật lại gom chuyện cho repo đã tạm dừng. Phiên trong lúc dừng không tự gom; muốn gom thì chạy tay momentry scan. Lối tắt của momentry config set paused false --project.',
    changes: '<config>/projects.json (bỏ dấu tạm dừng, ghi lúc bật lại).',
    flags: { repo: REPO },
    examples: ['momentry resume', 'momentry resume --repo ~/code/du-an --json'],
    exit: { 0: 'đã bật lại (hoặc vốn không tạm dừng)', 1: 'không ở trong git repo, hoặc danh sách dự án hỏng', 2: 'sai cú pháp' },
    next: 'momentry status',
  },
  harvest: {
    group: 'advanced',
    summary: 'Gom một phiên hoặc một file transcript (bước 1–11 của pipeline).',
    changes: 'như scan, cho một phiên.',
    flags: {
      session: S('id phiên dạng claude:xxxxxxxx hoặc codex:xxxxxxxx', { arg: 'ID' }), transcript: S('file transcript', { arg: 'FILE' }),
      'from-line': I('từ dòng', { arg: 'N' }), 'to-line': I('tới dòng', { arg: 'N' }), runs: I('số lần chạy harvest', { arg: 'N' }),
      'no-outsider': B('bỏ bước người ngoài'), 'save-prompts': S('giữ prompt và đầu ra thô vào DIR', { arg: 'DIR' }),
      'fake-llm': S('đọc đầu ra model từ DIR thay vì gọi claude', { arg: 'DIR' }), 'save-llm': S('ghi đầu ra model vào DIR', { arg: 'DIR' }),
      blind: B('không ghi hộp, không ghi sổ'), repo: REPO,
    },
    examples: ['momentry harvest --session claude:1a2b3c4d', 'momentry harvest --transcript ~/.claude/projects/x/abc.jsonl --dry-run'],
    exit: { 0: 'xong (kể cả partial)', 1: 'lỗi', 2: 'sai cú pháp', 3: 'có chuyện giữ ngoài repo vì chưa có nguồn chặn', 4: 'model lỗi', 5: 'phiên đang bị khoá' },
  },
  rescore: {
    group: 'advanced',
    summary: 'Chấm lại các chuyện status: raw của một phiên.',
    flags: { session: S('id phiên', { arg: 'ID' }), 'no-outsider': B('bỏ bước người ngoài'), 'fake-llm': S('đầu ra model giả', { arg: 'DIR' }), repo: REPO },
    examples: ['momentry rescore --session claude:1a2b3c4d'],
    exit: { 0: 'xong', 1: 'lỗi', 2: 'sai cú pháp', 3: 'chưa có nguồn chặn', 4: 'model lỗi', 5: 'phiên đang bị khoá' },
  },
  angle: {
    group: 'advanced',
    summary: 'Viết xương chuyện và góc kể cho chuyện đã có trong hộp mà chưa có góc kể: mặc định các chuyện đầu bảng xếp hạng. Góc kể mở bằng bối cảnh (dự án gì, người làm đang cố làm gì), rồi điều người ta tưởng, điều hoá ra, vì sao người nghe nên quan tâm. Cùng bước mà harvest chạy sau khi xếp hạng.',
    changes: '<box>/<id>.md (trường angle, audience, spine_*, completeness và dòng **Góc kể:** trong thân; angle: none khi không có góc kể), hoặc <cache>/quarantine/ nếu vi phạm riêng tư hay chưa có nguồn chặn; <cache>/profiles/ (hồ sơ dự án, sửa tay được); <cache>/ledger.json (chi phí, tính vào ngân sách ngày); <cache>/runs/angle/.',
    prereq: 'repo đã init; `claude` CLI; transcript của phiên còn trên máy. Mỗi chuyện một lần gọi model (angle.model); mỗi dự án thêm một lần gọi (angle.profileModel) khi chưa có hồ sơ hoặc README/docs đã đổi.',
    flags: {
      top: I('xét N chuyện đầu bảng xếp hạng của cả hộp (mặc định: angle.topN)', { arg: 'N' }),
      story: S('chỉ chuyện này (id hoặc mã M-XXXX)', { arg: 'ID' }),
      force: B('viết lại cả góc kể đã có (kể cả angle: none)'),
      repo: REPO,
    },
    examples: ['momentry angle --dry-run             # xem chuyện nào sẽ được viết góc kể, ước tính chi phí', 'momentry angle --top 5', 'momentry angle --story M-7K3Q --force --json'],
    exit: { 0: 'xong', 1: 'không có chuyện này trong hộp, hoặc lỗi', 2: 'sai cú pháp', 3: 'có góc kể giữ ngoài repo vì chưa có nguồn chặn', 4: 'model lỗi ở ít nhất một chuyện (chuyện đó chưa có góc kể)', 5: 'phiên của ít nhất một chuyện đang được gom, chuyện đó bỏ qua (chạy lại sau)' },
    next: 'momentry list --rank',
  },
  quarantine: {
    group: 'advanced',
    summary: 'Liệt kê chuyện bị giữ ngoài repo; --release ID|all thả chuyện qua được kiểm riêng tư vào hộp.',
    changes: '--release: ghi chuyện vào hộp và xoá bản giữ trong <cache>/quarantine, <cache>/metrics.json (lúc có chuyện đầu tiên); chuyện còn vi phạm vẫn bị giữ.',
    flags: { release: S('id chuyện cần thả, hoặc all để thử thả mọi chuyện đang giữ', { arg: 'ID|all' }), repo: REPO },
    examples: ['momentry quarantine', 'momentry quarantine --release 2026-01-10-gop-nhanh-lai-cham', 'momentry quarantine --release all --json'],
    exit: { 0: 'xong (với all: mọi chuyện đã thả, hoặc không có gì đang giữ)', 1: 'còn chuyện vi phạm hoặc lỗi (vẫn bị giữ)', 2: 'sai cú pháp', 3: 'chưa có nguồn chặn' },
  },
  reduce: {
    group: 'advanced',
    summary: 'In văn bản rút gọn và điểm nóng của một transcript (gỡ lỗi).',
    flags: { transcript: S('file transcript', { arg: 'FILE' }), 'from-line': I('từ dòng', { arg: 'N' }), 'to-line': I('tới dòng', { arg: 'N' }), out: S('ghi reduced.txt, hotspots.txt vào DIR', { arg: 'DIR' }) },
    examples: ['momentry reduce --transcript session.jsonl --out /tmp/r'],
    exit: EXIT_COMMON,
  },
  ledger: {
    group: 'advanced',
    summary: 'Xem sổ các phiên đã gom, hoặc quên một phiên để gom lại.',
    changes: 'với --forget: <cache>/ledger.json.',
    flags: { show: B('in sổ (mặc định)'), forget: S('quên phiên này', { arg: 'ID' }) },
    examples: ['momentry ledger --json', 'momentry ledger --forget claude:1a2b3c4d'],
    exit: EXIT_COMMON,
  },
  connect: {
    group: 'maintain',
    summary: 'Cài (hoặc --remove gỡ) hook/extension, lệnh momentry-bip, momentry-ui và skill momentry cho Claude Code, Codex, pi, omp, Antigravity, ở mọi profile tìm thấy. init đã gọi bước này.',
    changes: 'Mỗi profile tìm thấy (~/.claude; ~/.codex, ~/.codex-*; ~/.pi/agent, ~/.pi/accounts/*; ~/.omp/agent, ~/.omp/profiles/*/agent; ~/.gemini, ~/.agy-homes/*/.gemini): Claude: khoá hooks trong settings.json, commands/{momentry-bip,momentry-ui}.md, skills/momentry/SKILL.md; Codex: khoá hooks trong hooks.json; pi: extensions/momentry.ts, prompts/{momentry-bip,momentry-ui}.md; omp: extensions/momentry.ts, commands/{momentry-bip,momentry-ui}.md, skills/momentry/SKILL.md; Antigravity: nhóm "momentry" trong config/hooks.json và config/skills/{momentry-bip,momentry-ui,momentry}/SKILL.md. Một lần cho mọi profile: ~/.agents/skills/{momentry-bip,momentry-ui}/ (Codex) và ~/.agents/skills/momentry/ (Codex, pi). Gỡ file cũ của momentry mà bạn chưa sửa: bí danh /bip, ~/.codex/prompts/bip.md, skill trong ~/.codex*/skills, ~/.pi/agent/skills/momentry. Sao lưu *.momentry-bak-* trước khi sửa; chỉ đụng phần của momentry.',
    positionals: { min: 0, max: 1, names: '[claude|codex|pi|omp|agy]' },
    flags: { remove: B('gỡ phần momentry đã cài') },
    examples: ['momentry connect --dry-run', 'momentry connect claude --yes', 'momentry connect --remove --yes'],
    exit: { 0: 'xong', 1: 'không sửa được (file hỏng, file bị đổi giữa chừng, host chưa cài)', 2: 'sai cú pháp hoặc thiếu --yes khi không có TTY' },
    next: 'momentry doctor',
  },
  hooks: {
    group: 'advanced',
    summary: 'In đoạn cấu hình hook và mẫu lệnh momentry-bip, momentry-ui để tự dán (thay cho connect).',
    flags: { print: B('in ra'), claude: B('cho Claude Code (mặc định)'), codex: B('cho Codex') },
    examples: ['momentry hooks --print --claude'],
    exit: EXIT_COMMON,
  },
  config: {
    group: 'maintain',
    summary: 'Lệnh duy nhất để xem và đổi mọi cài đặt: path | show | get KEY | set KEY VALUE | unset KEY | default | privacy-add TÊN…. Không có --project: cấu hình người dùng, chung mọi dự án. Có --project: cài đặt riêng của repo đang đứng (hoặc --repo DIR): box (thư mục chuyện; trong repo ghi vào .momentry.json, ngoài repo chỉ ghi trên máy này), repo (tên dự án trên chuyện), budget.dailyUsd (ngân sách mỗi ngày riêng của dự án), private (chế độ riêng tư), paused (tạm dừng gom chuyện; pause/resume là lối tắt). show --project in từng khoá kèm nơi đặt: repo, dự án trên máy này, người dùng, mặc định hoặc env. Giao diện web ghi qua đúng các hàm này.',
    changes: 'set/unset: file cấu hình người dùng (ghi atomic, giữ quyền file). Với --project: box/repo vào <repo>/.momentry.json (box ngoài repo vào <config>/projects.json), budget.dailyUsd và private vào cấu hình người dùng theo đường dẫn repo, paused vào <config>/projects.json; khoá chỉ của máy này không bao giờ ghi vào repo. privacy-add: thêm tên vào <config>/names.txt (0600) và khai báo file đó trong privacy.sources.',
    prereq: 'với --project: ở trong git repo (hoặc --repo DIR); đặt box trong repo, repo hay paused true cần repo đã init.',
    positionals: { min: 1, max: 100, names: '<path|show|get|set|unset|default|privacy-add> [KEY] [VALUE | TÊN…]' },
    flags: { repo: REPO, project: B('cài đặt riêng của repo (box, repo, budget.dailyUsd, private, paused) thay cho cấu hình người dùng; dùng với show, get, set, unset') },
    examples: [
      'momentry config show',
      'momentry config set harvest.runs 2',
      'momentry config privacy-add "Trần Văn A" "du-an-bi-mat"   # tên cần chặn khỏi repo',
      'momentry config show --project --json',
      'momentry config set box ~/Documents/momentry-chuyen --project   # thư mục chuyện ngoài repo, chỉ trên máy này',
      'momentry config set budget.dailyUsd 1 --project --repo ~/code/du-an',
      'momentry config unset box --project --dry-run',
    ],
    exit: { 0: 'xong', 1: 'khoá lạ, giá trị sai, khoá không đặt riêng được cho dự án, repo chưa init, không ở trong git repo hoặc file hỏng', 2: 'sai cú pháp' },
  },
  paths: {
    group: 'maintain',
    summary: 'In mọi đường dẫn momentry dùng: cấu hình, cache, bản cài, shim, Claude, Codex.',
    flags: {},
    examples: ['momentry paths', 'momentry paths --json'],
    exit: EXIT_COMMON,
  },
  version: {
    group: 'maintain',
    summary: 'In phiên bản (--json: kèm commit, Node, nền tảng, nơi cài).',
    flags: {},
    examples: ['momentry --version', 'momentry version --json'],
    exit: EXIT_COMMON,
  },
  update: {
    group: 'maintain',
    aliases: ['upgrade'],
    summary: 'Cập nhật momentry lên bản mới nhất (hoặc --version). Kiểm checksum, thử bản mới, lỗi thì quay lại bản cũ.',
    changes: '<install>/versions/, <install>/current; giữ cấu hình, cache, hộp. Sau khi đổi, chạy doctor --after-update trong bản mới.',
    prereq: 'momentry được cài bằng install.sh/install.ps1 (có .momentry-managed). Bản chạy từ git checkout: dùng git pull.',
    flags: { check: B('chỉ kiểm có bản mới không'), version: S('cài đúng bản này (được phép hạ cấp)', { arg: 'vX.Y.Z' }), force: B('cài lại kể cả khi cùng bản') },
    examples: ['momentry update --check', 'momentry update --yes', 'momentry update --version v0.1.0 --yes'],
    exit: { 0: 'đã mới nhất hoặc đã cập nhật', 1: 'lỗi (bản cũ vẫn giữ nguyên)', 2: 'sai cú pháp', 10: '--check: có bản mới' },
    next: 'momentry doctor',
  },
  uninstall: {
    group: 'maintain',
    aliases: ['remove'],
    summary: 'Gỡ momentry: hook, lệnh agent và skill, shim, bản cài. Giữ cấu hình, cache, hộp chuyện trừ khi --purge.',
    changes: 'gỡ mục "momentry hook" khỏi ~/.claude/settings.json, ~/.codex/hooks.json và các host khác; xoá file lệnh và skill do momentry ghi mà bạn chưa sửa (cả ~/.agents/skills, bí danh /bip cũ và chỗ cũ ~/.codex*/skills); xoá shim và <install>. --purge: xoá thêm thư mục cấu hình và cache. Không đụng hộp chuyện và .momentry.json trong các repo.',
    flags: { purge: B('xoá cả cấu hình và cache') },
    examples: ['momentry uninstall --dry-run', 'momentry uninstall --yes', 'momentry uninstall --purge --yes'],
    exit: { 0: 'đã gỡ', 1: 'có bước lỗi (các bước sau bị bỏ qua)', 2: 'sai cú pháp hoặc thiếu --yes khi không có TTY' },
  },
  help: {
    group: 'maintain',
    summary: 'Trợ giúp chung hoặc của một lệnh (--json: toàn bộ lệnh và cờ).',
    positionals: { min: 0, max: 1, names: '[lệnh]' },
    flags: {},
    examples: ['momentry help init', 'momentry help --json'],
    exit: EXIT_COMMON,
  },
  hook: {
    group: 'advanced',
    hidden: true,
    summary: 'Gọi từ hook của các agent (pre-compact, session-end, session-start). Tách nền, luôn thoát 0. Chỉ session-start in một dòng nhắc (chuyện mới, phiên chờ ngân sách, lỗi cần sửa) khi có gì để nói.',
    positionals: { min: 1, max: 1, names: '<event>' },
    flags: { codex: B('gọi từ Codex'), pi: B('gọi từ extension pi'), omp: B('gọi từ extension omp'), agy: B('gọi từ hook Antigravity (luôn in một object JSON ra stdout)'), 'user-home': S('home thật của user khi host chạy với HOME khác (profile ~/.agy-homes/*)', { arg: 'DIR' }) },
    examples: ['momentry hook session-end < payload.json'],
    exit: { 0: 'luôn luôn' },
  },
};

/** Canonical name for a command or alias, or null. @param {string} name */
export function resolveCommand(name) {
  if (Object.hasOwn(COMMANDS, name)) return name;
  for (const [k, c] of Object.entries(COMMANDS)) if (c.aliases?.includes(name)) return k;
  return null;
}

/** Levenshtein distance (small inputs). */
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** Closest candidate within distance 2 (or a prefix match), else null. @param {string} word @param {string[]} candidates */
export function didYouMean(word, candidates) {
  let best = null, bestD = 3;
  for (const c of candidates) {
    const dd = c.startsWith(word) && word.length >= 2 ? 1 : distance(word, c);
    if (dd < bestD) { best = c; bestD = dd; }
  }
  return best;
}

const flagLine = (name, f) => {
  const short = f.short ? `-${f.short}, ` : '    ';
  const arg = f.type === 'string' ? ` ${f.arg ?? 'X'}` : '';
  const def = f.default !== undefined ? ` (mặc định: ${f.default})` : '';
  return `  ${short}--${name}${arg}`.padEnd(30) + ` ${f.desc}${def}`;
};

/** `momentry <cmd> --help` text. @param {string} name */
export function renderCommandHelp(name) {
  const c = COMMANDS[name];
  const pos = c.positionals?.names ? ` ${c.positionals.names}` : '';
  const out = [`momentry ${name}${pos} [cờ]`, '', c.summary];
  if (c.aliases?.length) out.push(`Tên khác: ${c.aliases.join(', ')}`);
  if (c.changes) out.push('', `Thay đổi: ${c.changes}`);
  if (c.prereq) out.push('', `Cần: ${c.prereq}`);
  const flags = Object.entries(c.flags);
  if (flags.length) out.push('', 'Cờ:', ...flags.map(([k, f]) => flagLine(k, f)));
  out.push('', 'Cờ chung: --json, -y/--yes, --dry-run, -q/--quiet, -v/--verbose, --no-color, -c/--config FILE, -h/--help');
  out.push('', 'Ví dụ:', ...c.examples.map((e) => `  ${e}`));
  out.push('', 'Mã thoát:', ...Object.entries(c.exit).map(([k, v]) => `  ${k}  ${v}`));
  if (c.next) out.push('', `Tiếp theo: ${c.next}`);
  return out.join('\n');
}

const GROUPS = { start: 'Thiết lập', daily: 'Dùng hằng ngày', maintain: 'Bảo trì', advanced: 'Nâng cao' };

/** Top-level help (no arguments, `--help`, `help`). */
export function renderMainHelp() {
  const out = [
    'momentry: tự nhặt chuyện đáng kể từ phiên Claude Code/Codex của bạn, ghi thành markdown, xếp hạng để bạn chọn.',
    '',
    'Bắt đầu:',
    '  1. momentry init                     bật cho repo này, cài hook và lệnh agent, kiểm mọi thứ',
    '  2. momentry scan --max-sessions 1    gom phiên gần nhất (~1 USD cho phiên 150k token)',
    '  3. momentry list --rank              xem chuyện đã xếp hạng',
    '  Có vấn đề: momentry doctor',
  ];
  for (const [g, title] of Object.entries(GROUPS)) {
    const rows = Object.entries(COMMANDS).filter(([, c]) => c.group === g && !c.hidden);
    out.push('', `${title}:`, ...rows.map(([k, c]) => `  ${k.padEnd(11)} ${c.summary.split(/(?<=\.) /)[0]}`));
  }
  out.push(
    '',
    'Agents / tự động hoá:',
    '  momentry init --yes --json; rồi lặp: momentry doctor --json, chạy mọi lệnh trong data.checks[].fix và next[], tối đa 3 vòng, tới khi ok=true.',
    '  Mọi --json có dạng {"schema":1,"ok":bool,"data":…,"error":{"code","why","fix"}|null,"next":["lệnh",…]}. momentry help --json liệt kê lệnh và cờ.',
    '  Không có TTY thì không lệnh nào hỏi; lệnh có thay đổi cần --yes.',
    '',
    'Mã thoát chung: 0 xong; 1 lỗi; 2 sai cú pháp; 3 chưa kiểm được riêng tư; 4 model lỗi; 5 phiên đang khoá; 10 có bản mới (update --check).',
    'Chi tiết một lệnh: momentry <lệnh> --help',
  );
  return out.join('\n');
}

/** Machine-readable command surface for `help --json`. */
export function describeSurface() {
  return {
    global: GLOBAL_FLAGS,
    commands: Object.fromEntries(Object.entries(COMMANDS).filter(([, c]) => !c.hidden)),
    agentLoop: ['momentry init --yes --json', 'momentry doctor --json', 'run every data.checks[].fix and next[] while ok=false (≤3 rounds)'],
  };
}
