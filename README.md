# momentry

**English** · [Tiếng Việt](README.vi.md)

*Picks `build-in-public` story material out of your Claude Code, Codex, pi, omp and Antigravity sessions.*

**Stop trying to remember what was worth telling this week: momentry picks it out of your coding-agent sessions for you. One markdown file per moment, ranked by hook, tension and stakes.**

Keep working with your coding agent as usual. After each session, momentry reads the transcript and looks for the moments that matter: a number that moved, a surprising root cause, a decision that got reversed, an approach outsiders would want to learn. Each one is written as a markdown file in your repo and ranked by hook, tension and stakes. Built for people who build in public, write technical blogs or put together weekly reports and don't want to lose the material.

[Quick start](#quick-start) · [CLI reference](docs/cli-reference.md) · [Installation details](docs/installation.md) · [Specification](docs/prd.md)



> The CLI output and the documents under `docs/` are currently in Vietnamese.

## Quick start

From zero to a ranked list of stories in about 5 minutes. You need **Node ≥ 20**, **git**, and a **logged-in `claude` CLI** (momentry uses it to read sessions; a session of roughly 150k tokens costs about 1 USD).

**1. Install** (Linux, macOS, WSL):

```sh
curl -fsSL https://github.com/vantt/momentry/releases/latest/download/install.sh | sh
```

<details>
<summary>Windows (PowerShell)</summary>

```powershell
irm https://github.com/vantt/momentry/releases/latest/download/install.ps1 | iex
```

The installer adds `%LOCALAPPDATA%\momentry\bin` to your user PATH; open a new terminal after installing.
</details>

**2. Enable it for your repo.** `init` creates `.momentry.json` and the story box, installs the hooks (or extension) and the `/bip` command for Claude Code, Codex, pi, omp and Antigravity, in every profile it finds (with backups), then checks everything. On first run it asks you to declare the private names to block (people, project names…) so nothing leaks into the repo, using `momentry config privacy-add "<name>"`:

```sh
cd <your repo>
momentry init
```

**3. Harvest the latest session and see the result:**

```sh
momentry scan --max-sessions 1
momentry list --rank
```

From now on the hooks harvest after every session. To mark a moment yourself while you work, type `/bip <note>` in your agent.

<details>
<summary>Install with your agent</summary>

Paste into your agent (Claude Code, Codex, pi, omp, Antigravity):

> Install momentry from https://github.com/vantt/momentry (install.sh, or install.ps1 on Windows), then in this repo follow `momentry init --help` and `momentry doctor --help` until `momentry doctor --json` returns `"ok": true`. If a private-names file is needed, ask me which names to block.

Then say: "harvest the last session with momentry and show me the 3 strongest stories".
</details>

## What it does

- **Harvests after each session.** `SessionEnd`, `PreCompact` and `SessionStart` hooks (Claude Code, Codex), a `momentry.ts` extension (pi, omp) and a `SessionStart` hook (Antigravity, harvested when the next session opens) run in the background, never slow the session down, and only run in repos that have been `init`ed.
- **Manual marking with `/bip`.** The agent writes 2–4 sentences about what just happened and saves it to the box.
- **Privacy is a hard gate.** Stories that contain a blocked name are kept out of the repo (`momentry quarantine`). `momentry check --staged` works as a git pre-commit hook.
- **Capture everything, filter later.** Nothing is deleted; you change a story's `status` (`raw`, `picked`, `drafted`, `published`, `dropped`).

## Update

```sh
momentry update --check     # exits 10 if a new version is available
momentry update --yes
```

`update` verifies the sha256, tries the new version before switching, and keeps the old one if anything fails. Config, cache and the story box stay untouched.

## Configuration

The defaults are enough; the only thing you must declare is the private names to block from the repo:

```sh
momentry config privacy-add "Jane Doe" "secret-project"   # writes to names.txt and registers the block source
momentry config show        # effective values and the layer that set each one
momentry config default     # every key and its default value
```

Precedence: flag > environment variable > `<repo>/.momentry.json` > user config > default. Keys, environment variables and where each thing is stored: [docs/installation.md](docs/installation.md).

## Uninstall

```sh
momentry uninstall --dry-run   # show what would be removed
momentry uninstall --yes       # remove hooks, /bip, the command and the install; keep config, cache, story box
momentry uninstall --purge --yes   # also remove config and cache
```

## Troubleshooting

```sh
momentry doctor          # checks Node, git, claude, config, block sources, repo, hooks, install
momentry doctor --fix --yes
```

Every failing check comes with a `sửa:` (fix) line containing a runnable command. Hooks log their results to `~/.cache/momentry/hook.log`.

## `gh` commands for maintainers

The repo is private: the commands below need `gh` logged in with write access. Runners check out from GitHub, so push your code first.

Install from a private release (while `curl … | sh` is unavailable):

```sh
gh release download v0.2.0 --repo vantt/momentry --dir ~/momentry-rel
sh ~/momentry-rel/install.sh --local-fixture ~/momentry-rel --yes
```

Windows: download as above into `$HOME\momentry-rel`, then `$env:MOMENTRY_RELEASE_BASE = "$HOME\momentry-rel"` and run `install.ps1` from that folder.

CI (push and PR run Linux plus one Windows job; the full matrix with macOS runs on tags or manual runs):

```sh
gh workflow run ci.yml --ref main                    # Linux x Node 20/22/24 (Windows/macOS off for now)
gh workflow run windows-hook-probe.yml --ref main    # check hooks on real Windows; only after changing the Windows hook code
gh run list --limit 5                                # latest runs
gh run watch <run-id> --exit-status                  # follow until done
gh run view <run-id> --log-failed                    # logs of failed jobs
```

Release: a tag equal to `lib/version.mjs` makes `release.yml` run full CI, create a draft, smoke-test it and publish:

```sh
git tag v0.3.0 && git push origin v0.3.0
gh run watch $(gh run list --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId') --exit-status
```

## Documentation

- [docs/cli-reference.md](docs/cli-reference.md): every command, flag, exit code and `--json` shape (generated from code).
- [docs/installation.md](docs/installation.md): platforms, directories, environment variables, PATH, Windows and WSL.
- [docs/development.md](docs/development.md): running from source, tests, `--fake-llm`, module contracts, releasing.
- [docs/prd.md](docs/prd.md): specification; [docs/README.md](docs/README.md): documentation index.

Status: the harvest-and-score pipeline is tested with fake data and has been run for real once (28/28 hotspots, 8/8 human-labelled stories, 0.95 USD). Hooks have been verified with the real agents: Claude Code, Codex, pi and omp on Linux and Windows, Antigravity on Linux (details in [docs/installation.md](docs/installation.md#host-được-hỗ-trợ)).

License: [LICENSE](LICENSE).
