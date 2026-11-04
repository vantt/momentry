# website/design: design canvas for the landing page

Design comps for the landing page, drawn before the page is coded. The files here are the source of a Claude Design canvas:

- Canvas (private, owner's claude.ai account): https://claude.ai/artifact/Ssd1ZShKo6wsp6S81hoKKF
- Source of truth: **git**. The canvas is the place to view, comment and hand-edit; every state worth keeping is committed here.

## Files

| File | What it is |
|---|---|
| `project/canvas.json` | Canvas index: artboard positions, sizes, titles, row titles |
| `project/Main.dc.html` | A · Contact sheet |
| `project/Editor.dc.html` | B · Editor's desk |
| `project/Pinboard.dc.html` | C · Story wall (original colors) |
| `project/PaperWall.dc.html` | C2 · Paper wall: C toned down, light |
| `project/NightWall.dc.html` | C3 · Night wall: C toned down, dark |
| `project/PastV1.dc.html`, `PastV1b.dc.html` | Built v1 (tag `site-v1`) as live HTML, two halves |
| `project/PastRiso.dc.html`, `PastPetrol.dc.html` | Built v2 variants as screenshots (uploaded assets on the canvas, not in git; regenerate from git history if needed) |

Each `.dc.html` is one self-contained artboard: inline styles, fonts from Google Fonts only, a `<script type="text/x-dc" data-dc-script>` block at the end. Keep that shape when editing by hand.

## Workflow

Ask Claude (in this repo) for any of these; the steps are what it does.

**Change a design from code:**
1. Edit `project/<board>.dc.html` (or add a board: new file plus its entry in `canvas.json` `boards` and `order`).
2. Publish to the canvas with the Artifact tool: `url` = the canvas link above, `root` = `website/design`, `file_path` = the changed file, other changed files in `files`. Send `canvas.json` only when boards are added, moved, resized or retitled.
3. Commit.

**Pull edits made on the canvas** (text edits, moves, comments resolved in the browser):
1. Read the files back from the canvas (Artifact `read` with `paths`).
2. Copy them over `website/design/project/`, review `git diff`, commit.

Pull before editing locally whenever the canvas may have been touched, so a publish never overwrites hand edits (the canvas refuses a stale publish and names the file to re-read).

**Move a chosen design into the real page:** the coded page is `website/src/index.html` (built by `website/build.mjs`). Copy and facts live in `website/content/`. Port the chosen board's tokens, type and components there; the canvas stays as the reference.
