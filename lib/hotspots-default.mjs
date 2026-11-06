// Built-in hotspot vocabulary: the fallback when lib/rules/hotspots.json is missing or invalid (lib/hotspots.mjs loadRules).
// A safety net with the same shape as the shipped table, comments dropped. It need not follow every vocabulary
// change in lib/rules/hotspots.json; the table there is what runs.
export const DEFAULT_RULES = Object.freeze({
  version: 1,
  harnessText: {
    prefixes: [{"id":"tag","pattern":"<"},{"id":"cross-session","pattern":"Another Claude session sent"}],
  },
  blocked: {
    patterns: [{"id":"hook-veto","pattern":"PreToolUse:\\S+ hook error"},{"id":"tool-use-blocked","pattern":"^<tool_use_error>Blocked:"},{"id":"permission-denied","pattern":"Permission (?:for this command|to use [^\\n]{0,60}) (?:was |has been )?denied"},{"id":"worktree-guard","pattern":"isolated in the worktree"},{"id":"sandbox-blocked","pattern":"blocked by (?:the )?sandbox"},{"id":"sandbox-denied","pattern":"sandbox[^\\n]{0,40}(?:denied|blocked)"}],
  },
  metricPair: {
    connectors: {"symbols":["→","->","=>"],"vi":["lên","xuống","thành","tới"],"en":["to"]},
    rangeConnectors: {"vi":["tới"],"en":["to"]},
    positionWords: {"vi":["dòng","hàng","trang","ký tự"],"en":["rows?","lines?","pages?","bytes?","chars?"]},
    idPrefixes: {"any":[{"id":"letter-dash","pattern":"[A-Za-z]-"},{"id":"hash-underscore-slash","pattern":"[#_/]"}]},
    unitWords: {"vi":["dòng","hàng","ngày","tuần","tháng","trang"],"en":["[kmgt]?i?b","bytes?","rows?","lines?","files?","days?","weeks?","months?","pages?"]},
  },
  gitReversal: {
    commands: [{"id":"reset","pattern":"reset"},{"id":"revert","pattern":"revert"},{"id":"rebase","pattern":"rebase"},{"id":"restore","pattern":"restore"},{"id":"checkout-dashdash","pattern":"checkout\\s+--(?=\\s|$)"},{"id":"amend","pattern":"commit\\s+--amend"},{"id":"force-push","pattern":"push\\s+(?:-f|--force)"}],
    squashWords: ["squash"],
    rebaseRewriteFlags: ["-i","--interactive","--abort","--onto","--root","--exec","--autosquash"],
    lockfiles: ["package-lock\\.json","pnpm-lock\\.yaml","[^/]*\\.lock"],
    upstreams: ["origin\\/\\S+","upstream\\/\\S+","@\\{u(?:pstream)?\\}","main","master","develop","trunk"],
  },
  lessonWrite: {
    kinds: [{"id":"memory","label":"bài học","pattern":"(?:^|\\/)(?:memory\\/|MEMORY\\.md$)","flags":""},{"id":"decision","label":"quyết định","pattern":"(?:^|\\/)(?:decisions?\\/|adrs?\\/|ADR[-_]?\\d)","flags":"i"},{"id":"journal","label":"nhật ký","pattern":"(?:^|\\/)journals?\\/","flags":""},{"id":"changelog","label":"changelog","pattern":"(?:^|\\/)CHANGELOG(?:\\.md)?$","flags":"i"}],
    copyCommands: ["cp","mv","install"],
  },
  metaWrite: {
    paths: ["\\.claude\\/","\\.codex\\/","\\.agents\\/","AGENTS\\.md","CLAUDE\\.md","skills\\/","hooks?\\/","settings(?:\\.local)?\\.json"],
  },
  ownerVoice: {
    interrupt: [{"id":"interrupted","pattern":"\\[Request interrupted by user"}],
    choiceIds: {"any":["[A-Fa-f]\\d?","\\d[A-Fa-f]?"]},
    address: {"vi":["em","anh"]},
    choiceWords: {"vi":["chọn","đồng ý","duyệt","phương án","pa"],"en":["option","go with","pick","choose","approve"]},
    pushbackStart: {"vi":["không","khong","ko","dừng","đừng","sai"],"en":["no","nope","stop","wrong","why"]},
    pushbackAnywhere: {"vi":["sao (?:lại|mà|vẫn|chưa)","thông minh hơn","lâu quá","quá lâu","mãi (?:mà )?chưa","làm gì mà"],"en":["too slow","taking too long","why (?:did|are|is|do|would)","that'?s wrong"]},
  },
});
