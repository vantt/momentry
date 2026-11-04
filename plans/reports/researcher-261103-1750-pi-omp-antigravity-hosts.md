# pi, omp, Antigravity as momentry hosts

Date: 2026-11-03 (Asia/Saigon). Installed: pi 1.4.0 (`@earendil-works/pi-coding-agent`, repo moved from badlogic/pi-mono to earendil-works/pi), omp 18.12.6, agy 1.4.4. Local files were inspected for key names, types and record counts only; no message text was read.

## Verdict

pi and omp can both be supported with one shared JSONL reader and one shared TypeScript extension file. Their data is rich: user, assistant, tool calls, tool results, `isError`, and exit codes recoverable from text. Confidence is high for both, so build them first.

Antigravity (`agy`) comes second and is weaker. Its official shell hooks and a readable `transcript.jsonl` exist, but there is no session-end or compaction event, transcripts carry no cwd, and tool results are only inferable. It is still worth doing, after pi and omp, through a hook-written session index. Do not parse `conversations/*.db` (SQLite with protobuf blobs) or IDE `.pb` files.

A cross-cutting finding: all three hosts, and current Codex as well, use UUIDv7 session ids. The first 8 hex digits of a UUIDv7 are a timestamp that only changes about every 65 seconds. Locally, three omp sessions share the prefix `01a1681b`, and pi has sessions with the same prefix. So `<host>:<first 8>` (what `codex.mjs` does today) collides. For pi, omp and agy, use the last 8 hex digits, which are random. Codex should be checked for the same problem; the local Codex rollout id is also UUIDv7 (`01a12e1c-…`).

A user-specific risk: this machine runs every host per account. pi uses `PI_CODING_AGENT_DIR=~/.pi/accounts/<acct>`, omp uses `--profile=<acct>`, and agy uses `HOME=~/.agy-homes/<acct>`. Extensions, prompts, hooks and sessions are all per-account directories. Evidence: the existing herdr extension and agy hook are installed only in the default directories, so they are inactive for most accounts. momentry must therefore install into a list of directories, not a single one.

## Per-host table

| | pi | omp | agy (CLI and IDE) |
|---|---|---|---|
| Transcripts | `<agentDir>/sessions/--<cwd: leading sep dropped, / \ : replaced by ->--/<ISO-ts>_<uuidv7>.jsonl`. `agentDir` is `$PI_CODING_AGENT_DIR` or `~/.pi/agent`. `PI_CODING_AGENT_SESSION_DIR`, the `sessionDir` setting or `--session-dir` replace the directory with a flat one (no per-cwd bucket). JSONL tree, v3. The file is created lazily at the first assistant message. | `<agentDir>/sessions/<bucket>/<ts>_<uuidv7>.jsonl`. `agentDir` is `~/.omp/agent`, or `~/.omp/profiles/<p>/agent` for a named profile. Bucket is `-<rel>` under home, `-tmp-<rel>` under tmp, otherwise `--abs--`. Same entry model as pi plus extra types. Line 1 is a 256-byte padded `{"type":"title"}` slot. Files may be fully rewritten. `omp gc --apply` can archive cold sessions to `.jsonl.gz`. | `<HOME>/.gemini/antigravity-cli/brain/<convId>/.system_generated/logs/transcript.jsonl` plus `transcript_full.jsonl` (untruncated, line-aligned). For the IDE, the directory is `antigravity-ide/` (`antigravity/` for "Antigravity 2.0"). There is no cwd in the file. Real state lives in `conversations/<id>.db` (SQLite with protobuf blobs; workspace URIs only appear there). |
| Hooks | TypeScript extension `<agentDir>/extensions/*.ts`. Events: `session_start{reason}`, `session_before_compact`, `session_shutdown{reason: quit\|reload\|new\|resume\|fork}`. `ctx.cwd`, `ctx.sessionManager.getSessionFile()` and `getSessionId()`. User directory, no trust prompt. | Same API: `<agentDir>/extensions/*.ts` or `hooks/pre\|post/*.ts`. Same three events. `session_shutdown` handlers get a 2-second budget. Runs on Bun, so `process.execPath` is the omp binary, not node. No shell-command hooks. | Shell hooks in `~/.gemini/config/hooks.json` (global, shared by CLI and IDE) or `<ws>/.agents/hooks.json` (needs folder trust). Events: `SessionStart`, `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation`, `Stop`. There is no SessionEnd or PreCompact. Stdin is camelCase JSON; stdout must be a JSON object. Hooks run synchronously and block the agent loop. |
| /bip | Prompt template `<agentDir>/prompts/bip.md`, with `description` and `argument-hint` frontmatter and `$ARGUMENTS` or `$@`. Expanded before the agent sees it, so the transcript holds the expanded text, not `/bip`. | `~/.agents/commands/bip.md`, which is profile-independent and needs no opt-in. Alternatively `<agentDir>/commands/bip.md` per profile. Supports `$ARGUMENTS` and `$@`. | Global skill `~/.gemini/config/skills/bip/SKILL.md` with `name`, `description` and `disable-model-invocation: true`. Workflows (`~/.gemini/config/global_workflows/*.md`) are deprecated. How arguments are passed is unverified. |
| Confidence | High (docs, source at tag v1.4.0, 14 local files, local extension) | High (docs at tag v18.12.6, 37 local files across profiles, local extension). The `~/.agents/commands` route is medium-high (docs only). | Medium. Hooks are high (official docs plus docs embedded in the binary plus a working local hook). The transcript mapping is medium (embedded docs, 5 tiny local files). The /bip argument handling is low. |

## Entry mapping

### pi (`lib/sources/pi.mjs`, shared with omp)

- `{"type":"session", cwd, id}` (first line for pi; second physical line for current omp files) gives `cwd` and the session id. Skip it.
- `type:"message"` entries carry `message.role`:
  - `user`: `content` is a string or an array of `{type:"text",text}`. Map it to kind `user`.
  - `assistant`: text blocks map to kind `assistant`. Each `{type:"toolCall", name, arguments}` block maps to one kind `tool`. Drop `thinking` blocks.
  - `toolResult` (`toolName`, `content[]`, `isError`) maps to kind `result`.
  - `bashExecution` (the user's `!cmd`, which has `command`, `output` and `exitCode`) maps to a tool plus a result.
  - Drop `system` and `custom`.
- Tool classification:
  - `bash` with `{command, timeout}` maps to op `shell`.
  - `write` with `{path, content}` and `edit` with `{path, edits[]}` map to op `write` with `paths=[path]`.
  - Everything else maps to `other`.
- Exit code: pi's bash appends `Command exited with code N` and sets `isError:true` when N is not 0. A success has neither, so derive `exitCode = isError ? N : 0` from that text. This comes from source `tools/bash.ts`.
- `ts`: use the entry's ISO `timestamp`.
- Drop `compaction`, `branch_summary`, `model_change`, `thinking_level_change`, `custom`, `custom_message`, `label`, `session_info`, `usage` and `context_edit`.
- Branches: the file is a tree, so abandoned branches stay in it. Reading linearly is fine for story harvesting, since line order equals time order.

### omp (same reader with omp switches)

- Skip the physical `{"type":"title",…,"pad":…}` line.
- Drop user messages that have `attribution:"agent"`; locally that is 576 of 636 user messages, injected by the system or subagents. Keep `attribution:"user"`. Drop the `developer` role.
- Drop `custom` entries with `customType:"tool_execution_start"`; locally there are 6,315 of these, pure noise.
- Tool classification:
  - `bash` with `{command, cwd?, i?, async?…}` maps to `shell`.
  - `write` with `{path, content}` maps to `write`.
  - `edit` with `{input}` uses hashline patches with a `[PATH#TAG]` header, or apply_patch `*** Update File:`. Take paths from the matching `toolResult.details.path` (present on 714 of 874 edit results), falling back to parsing the headers with the existing `patchPaths`.
  - `eval`, `task`, `todo`, etc. map to `other`.
- Exit code: `exited with code N` in the result text plus `isError`.
- Read only depth-1 `*.jsonl` in each bucket. Subagent sessions live in nested artifact directories; skip them or include them later.

### agy (`lib/sources/agy.mjs`)

Each line has `{step_index, source, type, status, created_at, content?, thinking?, tool_calls?:[{name,args}], truncated_fields?}`.

- `USER_INPUT` with `source:USER_EXPLICIT` maps to kind `user`.
- `PLANNER_RESPONSE` with `content` maps to kind `assistant`. With `tool_calls` it maps to one kind `tool` per call:
  - `run_command` `{CommandLine, Cwd?}` maps to `shell`.
  - `write_to_file`, `replace_file_content` and `multi_replace_file_content` `{TargetFile}` map to `write`. These tool names come from binary strings and are not seen in local data.
- A `GENERIC` step directly after a tool call is the tool response; this is a structural inference from all 5 local files. Map it to kind `result` with `isError = status==='ERROR'`, and `exitCode` parsed from the text if present, otherwise null.
- Drop `SYSTEM_MESSAGE`.
- `ts` comes from `created_at`.
- Read `transcript_full.jsonl` when it exists. Its lines are 1:1 with `transcript.jsonl` locally, and per the embedded docs `transcript.jsonl` truncates fields.

## Recommended integration design

### Shared momentry changes

1. Add `lib/sources/pi.mjs` exporting a factory `piFamily({source:'pi'|'omp', roots(env)})` so pi and omp share one reader. Add `lib/sources/agy.mjs`. Register `pi`, `omp` and `agy` in `pipeline.mjs` `SOURCES`, `transcriptDirs`, and the `scan --pi/--omp/--agy` flags.
2. Session id: use `<host>:<last 8 hex of uuid>` for the three new hosts.
3. `sourceOf(file)` currently treats anything that is not `rollout-*` as Claude. Make it path-based instead:
   - `/brain/…/transcript*.jsonl` is agy.
   - A file under a known omp root, or whose first line is `{"type":"title"`, is omp.
   - Otherwise `<ts>_<uuid>.jsonl` with a `type:session` header is pi.
   Hooks always pass the runtime explicitly, so the sniff only serves manual `--transcript`.
4. `handleHook`: add runtimes `--pi`, `--omp` and `--agy`. For agy:
   - Normalise the payload: `conversationId` becomes the session id, `transcriptPath` becomes the transcript path, `workspacePaths[0]` becomes cwd.
   - Print `{}` on stdout. The documented contract and the herdr script both require a JSON object, and `handleHook` currently never writes stdout.
5. `hosts.mjs`: change from one config file per host to a list of target directories per host.
   - pi: `[$PI_CODING_AGENT_DIR || ~/.pi/agent, …--dir]`.
   - omp: `~/.omp/agent` plus `~/.omp/profiles/*/agent`.
   - agy: `[$HOME, …--home]`.
   Reuse the existing owned-file marker and `writeOwnedText` for the `.ts` extension, the same way `bip.md` is handled. `doctor` should flag directories without the integration, for example a newly created profile.

### pi and omp: one extension file, written to `<agentDir>/extensions/momentry.ts`

```ts
// momentry: generated by `momentry connect pi|omp`. Edits are kept; delete the file to get the momentry version back.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
const NODE = "<abs node path resolved at connect>";      // NOT process.execPath: omp runs on Bun
const BIN = "<abs …/bin/momentry.mjs>";                  // NOT the .cmd shim: Node refuses to spawn .cmd without a shell on Windows
const HOST = "pi";                                       // or "omp"
function fire(event: string, ctx: any) {
  if (process.env.STORY_HARVEST === "1") return;
  try {
    const sm = ctx?.sessionManager;
    const file = sm?.getSessionFile?.();
    if (event !== "session-start" && (!file || !existsSync(file))) return; // lazy file: nothing to harvest yet
    const payload = JSON.stringify({ session_id: sm?.getSessionId?.(), transcript_path: file, cwd: ctx.cwd });
    const c = spawn(NODE, [BIN, "hook", event, `--${HOST}`], { detached: true, stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
    c.on("error", () => {}); c.stdin?.end(payload); c.unref();
  } catch { /* never break the session */ }
}
export default function (pi: any) {
  pi.on("session_start", (_e: any, ctx: any) => fire("session-start", ctx));
  pi.on("session_before_compact", (_e: any, ctx: any) => { fire("pre-compact", ctx); }); // return undefined: do not cancel
  pi.on("session_shutdown", (e: any, ctx: any) => { if (e?.reason !== "reload") fire("session-end", ctx); });
}
```

- The file has no imports from the host package, so the same file works for both hosts. The handler shape `(event, ctx)` and the `sessionManager` getters are confirmed in pi `extensions/types.ts` and in the local herdr extensions for both hosts.
- `/bip` goes in `<agentDir>/prompts/bip.md` for pi and `~/.agents/commands/bip.md` for omp. The existing `prompts/bip.md` body works as-is, since both expand `$ARGUMENTS`.
- `/bip` cannot be detected in pi or omp transcripts, because the template is expanded before it is logged. Treat it like Codex, where `add` is the only path. Optionally, detect the template's fixed first sentence and set `bip:true`.

### agy: hooks.json entry and skill

Merge into `<HOME>/.gemini/config/hooks.json`. `SessionStart` and `Stop` take a flat list of handlers, not Claude's `{matcher, hooks}` groups:

```json
{ "momentry": { "SessionStart": [ { "type": "command", "command": "\"<shim>\" hook session-start --agy", "timeout": 10 } ] } }
```

- On `SessionStart`, the hook appends `{conversationId, transcriptPath, workspacePaths, at}` to `<cache>/agy-sessions.jsonl`, prints `{}`, and spawns `scan --agy --except agy:<id8>`. `agy.listTranscripts(repoRoot)` reads that index, because the transcript has no cwd.
- Do not wire `Stop` to harvest. It fires after every turn and blocks the loop, and momentry has no debounce, so it would trigger an LLM harvest per turn. The accepted trade-off is that a conversation is harvested when the next agy session starts in that repo, or by a manual `momentry scan --agy`.
- The second-ranked alternative is `Stop` with `fullyIdle` plus a new momentry throttle (for example, at least N new lines and at least X minutes). That is more code, so build it only if the lag hurts.
- Sessions that started before connect are invisible unless someone parses `trajectory_metadata_blob` protobuf. That is not worth it, and Node 20 has no `node:sqlite` anyway.
- `/bip` goes in `<HOME>/.gemini/config/skills/bip/SKILL.md`, with frontmatter `name: bip`, a description, and `disable-model-invocation: true`. Without that flag, the skill can be auto-invoked semantically and would write spurious stories. Because placeholder support is unknown, the body should say "user's note = the text typed after /bip, if any" instead of `$ARGUMENTS`.
- The IDE is covered by the same global `hooks.json`. Its payload `transcriptPath` points into `antigravity-ide/`, so the reader needs no IDE-specific code. The IDE is not installed locally, so this is unverified.

## Fragility and Windows

- **pi**:
  - `--no-extensions` or a missing per-account directory silently disables the integration.
  - A custom `sessionDir` produces a flat directory, so the backfill scan needs those roots too; hooks pass the path, so they are unaffected.
  - On Windows, the bash tool is Git Bash, so `/bip`'s `momentry` (a `.cmd` shim) may not resolve by bare name. Needs a test.
- **omp**:
  - Named profiles ignore `PI_CODING_AGENT_DIR`.
  - A file rewrite (migration, discard, contested lease, or move) can shift line numbers without shrinking the file. The ledger only resets on shrink, so a window could misalign. This is rare; mitigate later by storing the header id plus the line count.
  - Interactive extensions may bind after the composer opens. `session_start` is still delivered.
  - `.jsonl.gz` archives are skipped.
- **agy**:
  - Hooks are synchronous. Keep the hook under the 10-second timeout; it already returns in about 100 ms.
  - On Windows, hooks run via `cmd /c`, with cwd set to the `hooks.json` directory, never the repo. Always use `workspacePaths`.
  - The workspace `.agents/hooks.json` needs folder trust; global hooks do not.
  - The transcript format is undocumented beyond the embedded agent docs and may change.

## Unknowns (resolve before or while implementing)

1. agy: does `SessionStart` fire on `--conversation` or `-c` resume, and does it fire for subagent conversations?
2. agy: does a skill slash command receive the typed arguments, and how? Test with `/bip hello`.
3. agy: are tool-result steps always `GENERIC`, or are they typed (`RUN_COMMAND`…) in other versions? Is an exit code present in the text?
4. pi and omp: confirm with a live test that `ctx.sessionManager` in `session_shutdown` (reason `new` or `resume`) still points at the old session.
5. Windows: Git Bash resolving the `momentry.cmd` shim for `/bip` in pi and omp, and Bun's `spawn(..., {detached:true})` on Windows.
6. Codex: does its UUIDv7 first-8 sid collide in practice? It is the same risk, and out of this scope.

## Sources

- pi docs at tag v1.4.0: `packages/coding-agent/docs/{session-format,message-types,extensions,prompt-templates,environment-variables,security,windows,settings}.md`. Source: `src/core/session-manager.ts` (`getDefaultSessionDirPath`, lazy `_persist`), `src/core/extensions/types.ts` (session events), `src/core/tools/{bash,edit,write}.ts`, `src/config.ts`. https://github.com/earendil-works/pi
- omp docs at tag v18.12.6: `docs/{session,extensions,extension-loading,hooks,slash-command-internals,config-usage,environment-variables}.md`, `packages/coding-agent/src/edit/schemas.ts`, `src/session/session-paths.ts`, `src/discovery/agents.ts`. https://github.com/can1357/oh-my-pi
- Antigravity hooks, official: https://antigravity.google/docs/hooks?tab=cli and https://antigravity.google/docs/hooks?tab=ide. Also the docs embedded in the `~/.local/bin/agy` 1.4.4 binary (hooks contract, transcript schema, workflow and skill paths, `disable-model-invocation`). Third-party and lower weight: https://github.com/dyoshikawa/rulesync/pull/2091
- Local structure (key names and counts only): `~/.pi/accounts/*/sessions`, `~/.omp/profiles/*/agent/sessions`, `~/.agy-homes/tetnu/.gemini/antigravity-cli/{brain,conversations}`, `~/.pi/agent/extensions/herdr-agent-state.ts`, `~/.omp/agent/extensions/herdr-omp-agent-state.ts`, `~/.gemini/config/hooks.json`, and the zsh wrappers `pi`, `omp` and `agy`.
- momentry: `lib/sources/{claude,codex}.mjs`, `lib/hook.mjs`, `lib/hosts.mjs`, `lib/pipeline.mjs` (`sourceOf`, `SOURCES`), `lib/ledger.mjs` (`nextWindow` resets only on shrink), `prompts/bip.md`.
