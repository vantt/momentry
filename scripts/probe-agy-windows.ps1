# Checks that Antigravity (agy) on this Windows machine calls momentry's SessionStart hook.
# Needs: Node >= 20, git, agy already logged in. Uses a little agy quota (one short prompt).
# Run in PowerShell:
#   irm https://raw.githubusercontent.com/vantt/momentry/main/scripts/probe-agy-windows.ps1 | iex
# It installs momentry if missing, connects agy, runs one agy prompt in a throwaway repo, prints the result,
# then removes momentry's agy hook again (set MOMENTRY_KEEP_HOOK=1 to keep it). Messages are ASCII on purpose.
$ErrorActionPreference = 'Stop'

function Invoke-Probe {
    $bin = Join-Path $env:LOCALAPPDATA 'momentry\bin\momentry.cmd'
    if (-not (Test-Path $bin)) {
        Write-Host '== installing momentry'
        irm https://github.com/vantt/momentry/releases/latest/download/install.ps1 | iex
    }
    Write-Host "== momentry: $(& $bin --version)"
    if (-not (Get-Command agy -ErrorAction SilentlyContinue)) { throw 'agy not found on PATH' }

    $repo = Join-Path ([IO.Path]::GetTempPath()) ('momentry-agy-probe-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path $repo | Out-Null
    Push-Location $repo
    try {
        & git init -q
        Set-Content -LiteralPath '.momentry.json' -Value '{}' -Encoding ASCII
        Write-Host '== connecting agy'
        & $bin connect agy --yes
        $cache = Join-Path $env:LOCALAPPDATA 'momentry\cache'
        $log = Join-Path $cache 'hook.log'
        $before = if (Test-Path $log) { (Get-Content $log).Count } else { 0 }

        Write-Host '== running one agy prompt in' $repo
        $out = & agy -p 'Reply with exactly one word: ok' --print-timeout 90s 2>&1
        Write-Host "agy said: $($out | Select-Object -Last 1)"
        Start-Sleep -Seconds 5

        $new = if (Test-Path $log) { Get-Content $log | Select-Object -Skip $before } else { @() }
        $hits = @($new | Where-Object { $_ -match '"event":"hook.spawned","runtime":"agy"' })
        $index = Join-Path $cache 'agy-sessions.jsonl'
        $recorded = (Test-Path $index) -and (Select-String -LiteralPath $index -SimpleMatch $repo.Replace('\', '\\') -Quiet)
        Write-Host ''
        Write-Host '== result (paste this back)'
        Write-Host "windows: $([Environment]::OSVersion.VersionString)"
        Write-Host "agy: $((& agy --version 2>&1) | Select-Object -First 1)"
        Write-Host "hook fired: $($hits.Count -gt 0)"
        Write-Host "session recorded for this repo: $recorded"
        $new | Select-Object -Last 5 | ForEach-Object { Write-Host "  $_" }
        if ($hits.Count -eq 0) { Write-Host "  diagnose: & '$bin' doctor --json" }
    } finally {
        if ($env:MOMENTRY_KEEP_HOOK -ne '1') { & $bin connect agy --remove --yes | Out-Null; Write-Host '== momentry agy hook removed again' }
        Pop-Location
    }
}

try { Invoke-Probe } catch { [Console]::Error.WriteLine("error: $($_.Exception.Message)") }
