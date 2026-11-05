# Offline lifecycle of install.ps1 on Windows in a throwaway profile:
# package two versions -> install -> init --yes --json (hooks, agent commands, skill) -> session-start reminder (and a missing
# shim counted) -> doctor -> update --check (10) -> update (removes what older versions installed, keeps edited files) -> uninstall.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-installer.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$work = Join-Path ([IO.Path]::GetTempPath()) ('momentry-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null

function Fail([string]$m) { [Console]::Error.WriteLine("FAIL: $m"); exit 1 }
function Step([string]$m) { Write-Host "== $m" }

try {
    $userHome = Join-Path $work 'home'
    foreach ($d in '.claude', '.codex', '.pi\agent', '.omp\agent', '.gemini\config') { New-Item -ItemType Directory -Path (Join-Path $userHome $d) -Force | Out-Null }
    foreach ($v in 'XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME','CLAUDE_CONFIG_DIR','CODEX_HOME','MOMENTRY_CONFIG','MOMENTRY_CACHE','MOMENTRY_RELEASE_BASE','MOMENTRY_VERSION') { Remove-Item "Env:$v" -ErrorAction SilentlyContinue }
    $env:USERPROFILE = $userHome
    $env:HOME = $userHome
    $env:APPDATA = Join-Path $userHome 'AppData\Roaming'
    $env:LOCALAPPDATA = Join-Path $userHome 'AppData\Local'
    $env:MOMENTRY_NO_MODIFY_PATH = '1'
    $env:MOMENTRY_YES = '1'
    $env:MOMENTRY_ALLOW_ROOT = '1'   # GitHub's Windows runners run as Administrator

    # a `claude` that answers --version, as claude.cmd (Windows cannot run the shebang fixture directly)
    $fake = Join-Path $work 'fakebin'
    New-Item -ItemType Directory -Path $fake | Out-Null
    Set-Content -LiteralPath (Join-Path $fake 'claude.cmd') -Value "@node `"$root\test\fixtures\fake-claude\claude`" %*" -Encoding ASCII
    $env:PATH = "$fake;$env:PATH"

    $v1 = ([regex]::Match((Get-Content -Raw (Join-Path $root 'lib\version.mjs')), "VERSION = '([^']+)'")).Groups[1].Value
    $p = $v1.Split('.'); $v2 = "$($p[0]).$($p[1]).$([int]($p[2] -replace '\D.*$','') + 1)"
    $r1 = Join-Path $work 'r1'; $r2 = Join-Path $work 'r2'
    $pkg = ([Uri](Join-Path $root 'scripts\package-release.mjs')).AbsoluteUri
    & node --input-type=module -e "const m = await import('$pkg'); m.buildRelease({ out: String.raw``$r1`` }); m.buildRelease({ out: String.raw``$r2``, version: '$v2' });"
    if ($LASTEXITCODE -ne 0) { Fail 'packaging' }

    $bin = Join-Path $env:LOCALAPPDATA 'momentry\bin\momentry.cmd'

    Step "install v$v1"
    $env:MOMENTRY_RELEASE_BASE = $r1
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $r1 'install.ps1')
    if ($LASTEXITCODE -ne 0) { Fail 'install.ps1' }
    if ((& $bin --version) -ne "momentry $v1") { Fail 'installed version' }
    if (-not (Test-Path (Join-Path $env:LOCALAPPDATA 'momentry\bin\momentry'))) { Fail 'sh shim for Git Bash' }

    Step 'init'
    $repo = Join-Path $work 'repo'
    New-Item -ItemType Directory -Path $repo | Out-Null
    Push-Location $repo
    & git init -q
    # privacy-add takes plain names: PowerShell 5.1 strips the inner quotes of a JSON argument to a native command
    & $bin config privacy-add 'Tran Thi Bich Ngoc' | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'config privacy-add' }
    $init = (& $bin init --yes --json) -join "`n" | ConvertFrom-Json
    if (-not $init.ok) { Fail ('init: ' + ($init | ConvertTo-Json -Depth 6)) }
    $settings = Get-Content -Raw (Join-Path $userHome '.claude\settings.json')
    if ($settings -notmatch 'momentry\.cmd\\" hook session-end') { Fail 'hook registered through momentry.cmd' }
    if ((Get-Content -Raw (Join-Path $userHome '.pi\agent\extensions\momentry.ts')) -notmatch 'SHIM_CMD = ".*momentry\.cmd"') { Fail 'pi extension does not use the cmd shim' }
    # Codex and pi read the shared ~/.agents/skills: their skills sit there once, for every profile
    $agentFiles = @(
        '.pi\agent\extensions\momentry.ts', '.omp\agent\extensions\momentry.ts',
        '.claude\commands\momentry-bip.md', '.claude\commands\momentry-ui.md', '.claude\skills\momentry\SKILL.md',
        '.agents\skills\momentry-bip\SKILL.md', '.agents\skills\momentry-bip\agents\openai.yaml', '.agents\skills\momentry-ui\SKILL.md', '.agents\skills\momentry\SKILL.md',
        '.pi\agent\prompts\momentry-bip.md', '.pi\agent\prompts\momentry-ui.md',
        '.omp\agent\commands\momentry-bip.md', '.omp\agent\commands\momentry-ui.md', '.omp\agent\skills\momentry\SKILL.md',
        '.gemini\config\skills\momentry-bip\SKILL.md', '.gemini\config\skills\momentry-ui\SKILL.md', '.gemini\config\skills\momentry\SKILL.md')
    foreach ($f in $agentFiles) {
        if (-not (Test-Path (Join-Path $userHome $f))) { Fail "init did not install $f" }
    }
    $aliasFiles = @('.claude\commands\bip.md', '.pi\agent\prompts\bip.md', '.omp\agent\commands\bip.md', '.gemini\config\skills\bip')
    $oldFiles = $aliasFiles + @('.codex\skills', '.pi\agent\skills')
    foreach ($f in $oldFiles) {
        if (Test-Path (Join-Path $userHome $f)) { Fail "init installed $f (the /bip alias is gone; Codex and pi skills live in ~/.agents/skills)" }
    }
    if ($settings -notmatch 'hook session-start"') { Fail 'Claude SessionStart hook missing' }
    if ((Get-Content -Raw (Join-Path $userHome '.codex\hooks.json')) -notmatch 'hook session-start --codex') { Fail 'Codex SessionStart hook missing' }
    if ((Get-Content -Raw (Join-Path $userHome '.gemini\config\hooks.json')) -notmatch 'hook session-start --agy') { Fail 'Antigravity SessionStart hook missing' }
    if ((Get-Content -Raw (Join-Path $userHome '.pi\agent\extensions\momentry.ts')) -notmatch 'ui\?\.notify') { Fail 'pi extension does not show the reminder' }

    Step 'session-start reminder'
    # the hook prints ASCII-only JSON, so the console code page cannot garble the Vietnamese text
    $story = Join-Path $repo 'docs\storytelling-material\2026-11-05-thu.md'
    [IO.File]::WriteAllText($story, "---`nid: 2026-11-05-thu`nstatus: raw`n---`n`n# thu`n")
    $out = (@{ cwd = $repo; source = 'startup' } | ConvertTo-Json -Compress) | & $bin hook session-start
    if ($LASTEXITCODE -ne 0) { Fail "hook exit $LASTEXITCODE" }
    if (-not $out) {
        $log = Join-Path $env:LOCALAPPDATA 'momentry\cache\hook.log'
        if (Test-Path $log) { Get-Content -Tail 20 $log | Write-Host }
        Write-Host "repo: $repo; git root: $(& git rev-parse --show-toplevel)"
        & $bin list --json | Write-Host
        Fail 'Claude reminder: no output'
    }
    $j = ($out -join "`n") | ConvertFrom-Json
    if (-not "$($j.hookSpecificOutput.additionalContext)".StartsWith('momentry: 1 chuy')) { Fail "Claude reminder: $out" }
    if (-not $j.systemMessage.Contains('(/momentry-ui)')) { Fail "Claude reminder command: $out" }
    $out = (@{ cwd = $repo } | ConvertTo-Json -Compress) | & $bin hook session-start --codex
    if (-not ((($out -join "`n") | ConvertFrom-Json).systemMessage.Contains('($momentry-ui)'))) { Fail "Codex reminder: $out" }
    $out = (@{ cwd = $repo; source = 'compact' } | ConvertTo-Json -Compress) | & $bin hook session-start
    if ($out) { Fail "reminder repeated after compaction: $out" }
    Remove-Item -LiteralPath $story

    # a missing shim is a problem to fix (the installed copy still runs the hook here, as pi's extension falls back to it)
    $app = Join-Path $env:LOCALAPPDATA "momentry\app\versions\v$v1\bin\momentry.mjs"
    Move-Item -LiteralPath $bin -Destination (Join-Path $work 'shim.bak')
    $out = (@{ cwd = $repo; source = 'startup' } | ConvertTo-Json -Compress) | & node $app hook session-start
    if (-not $out -or ((($out -join "`n") | ConvertFrom-Json).systemMessage -ne "momentry: 1 l$([char]0x1ED7)i c$([char]0x1EA7)n s$([char]0x1EED)a (momentry doctor)")) { Fail "missing shim not counted: $out" }
    & node $app doctor --fix | Out-Null
    if (-not (Test-Path $bin)) { Fail 'doctor --fix did not write the shim back' }

    $doc =(& $bin doctor --json) -join "`n" | ConvertFrom-Json
    if (-not $doc.ok) { Fail 'doctor' }

    Step 'update (cleans what older versions installed, keeps edited files)'
    $h = { param($f) Join-Path $userHome $f }
    Copy-Item (& $h '.claude\commands\momentry-bip.md') (& $h '.claude\commands\bip.md')
    Copy-Item (& $h '.pi\agent\prompts\momentry-bip.md') (& $h '.pi\agent\prompts\bip.md')
    New-Item -ItemType Directory -Path (& $h '.codex\skills'), (& $h '.pi\agent\skills') -Force | Out-Null
    Copy-Item (& $h '.agents\skills\momentry-bip'), (& $h '.agents\skills\momentry') (& $h '.codex\skills') -Recurse
    Copy-Item (& $h '.agents\skills\momentry') (& $h '.pi\agent\skills') -Recurse
    # an old file the user edited (body changed, marker kept): read and written as UTF-8 bytes, no BOM
    $edited = [IO.File]::ReadAllText((& $h '.omp\agent\commands\momentry-bip.md')).Replace('User ', 'EDITED User ')
    [IO.File]::WriteAllText((& $h '.omp\agent\commands\bip.md'), $edited, (New-Object Text.UTF8Encoding $false))
    $env:MOMENTRY_RELEASE_BASE = $r2
    & $bin update --check | Out-Null
    if ($LASTEXITCODE -ne 10) { Fail "update --check exit $LASTEXITCODE" }
    & $bin update --yes
    if ($LASTEXITCODE -ne 0) { Fail 'update' }
    if ((& $bin --version) -ne "momentry $v2") { Fail 'updated version' }
    foreach ($f in '.claude\commands\bip.md', '.pi\agent\prompts\bip.md', '.codex\skills\momentry-bip', '.codex\skills\momentry', '.pi\agent\skills\momentry') {
        if (Test-Path (& $h $f)) { Fail "update left $f" }
    }
    if ([IO.File]::ReadAllText((& $h '.omp\agent\commands\bip.md')) -notmatch 'EDITED') { Fail 'update removed an edited file' }
    Remove-Item -LiteralPath (& $h '.omp\agent\commands\bip.md')

    Step 'uninstall'
    & $bin uninstall --yes
    if ($LASTEXITCODE -ne 0) { Fail 'uninstall' }
    Pop-Location
    Start-Sleep -Seconds 6   # files of the running shim are removed by a deferred cmd.exe
    if (Test-Path (Join-Path $env:LOCALAPPDATA 'momentry\app')) { Fail 'install dir left' }
    if (Test-Path (Join-Path $env:LOCALAPPDATA 'momentry\bin\momentry.cmd')) { Fail 'shim left' }
    if ((Get-Content -Raw (Join-Path $userHome '.claude\settings.json')) -match 'momentry') { Fail 'hooks left' }
    if ((Get-Content -Raw (Join-Path $userHome '.codex\hooks.json')) -match 'momentry') { Fail 'Codex hooks left' }
    foreach ($f in $agentFiles + $aliasFiles) {
        if (Test-Path (Join-Path $userHome $f)) { Fail "uninstall left $f" }
    }
    if (-not (Test-Path (Join-Path $env:APPDATA 'momentry\config.json'))) { Fail 'config removed without --purge' }
    Write-Host 'OK: installer lifecycle (Windows)'
} finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
