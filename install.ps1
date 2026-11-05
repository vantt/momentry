# momentry installer for Windows (PowerShell 5.1 or later; no admin, no Git Bash needed). Needs Node >= 20.
#
#   irm https://github.com/vantt/momentry/releases/latest/download/install.ps1 | iex
#
# Same contract as install.sh: reads checksums.txt, which must list exactly one momentry-v*.tar.gz,
# verifies its sha256 by exact file name, unpacks it with System32 tar.exe into
# %LOCALAPPDATA%\momentry\app\versions\<v>, checks `node bin\momentry.mjs --version`, then lets the new version
# write `current`, the shims (momentry.cmd + momentry for Git Bash) and the marker (`momentry _activate`).
# PATH: the bin dir is added to the user PATH (HKCU\Environment, REG_EXPAND_SZ kept) unless
# MOMENTRY_NO_MODIFY_PATH=1. Messages are ASCII on purpose (PowerShell 5.1 + iex mangle UTF-8).
#
# Environment (same names and meaning as install.sh):
#   MOMENTRY_VERSION        vX.Y.Z to install (default: the version stamped into this installer, else latest)
#   MOMENTRY_INSTALL_DIR    where the shims go (default: %LOCALAPPDATA%\momentry\bin)
#   MOMENTRY_HOME           where versions live (default: %LOCALAPPDATA%\momentry\app)
#   MOMENTRY_RELEASE_BASE   release base URL, or a local dir holding the assets (tests)
#   MOMENTRY_NO_MODIFY_PATH=1, MOMENTRY_UNINSTALL=1, MOMENTRY_YES=1, MOMENTRY_ALLOW_ROOT=1, MOMENTRY_DRY_RUN=1

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Runs a native command and returns its first stdout line. With $ErrorActionPreference = 'Stop', PowerShell 5.1
# turns any stderr line of a native command into a terminating error; relax it just for this call.
function Invoke-Quiet([scriptblock]$Block) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { return (& $Block 2>$null | Select-Object -First 1) } finally { $ErrorActionPreference = $prev }
}

function Install-Momentry {
    $repo = 'vantt/momentry'
    $stamped = '@VERSION@'
    $shimTag = 'momentry shim: managed by momentry'

    if ($env:OS -eq 'Windows_NT' -and $env:MOMENTRY_ALLOW_ROOT -ne '1') {
        $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
        if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
            throw 'refusing to run from an elevated (Administrator) session; momentry installs per user. Set MOMENTRY_ALLOW_ROOT=1 to allow.'
        }
    }
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

    $local = $env:LOCALAPPDATA
    if (-not $local) { $local = Join-Path $HOME 'AppData\Local' }
    # app (versions), bin (shims) and cache are siblings under %LOCALAPPDATA%\momentry (lib/paths.mjs)
    $homeDir = if ($env:MOMENTRY_HOME) { $env:MOMENTRY_HOME } else { Join-Path $local 'momentry\app' }
    $binDir = if ($env:MOMENTRY_INSTALL_DIR) { $env:MOMENTRY_INSTALL_DIR } else { Join-Path $local 'momentry\bin' }
    $shim = Join-Path $binDir 'momentry.cmd'
    $env:MOMENTRY_HOME = $homeDir
    $env:MOMENTRY_INSTALL_DIR = $binDir

    if ($env:MOMENTRY_UNINSTALL -eq '1') {
        if ((Test-Path -LiteralPath $shim) -and (Select-String -LiteralPath $shim -SimpleMatch $shimTag -Quiet)) {
            $args2 = @('uninstall')
            if ($env:MOMENTRY_DRY_RUN -eq '1') { $args2 += '--dry-run' } else { $args2 += '--yes' }
            & $shim @args2
            if ($LASTEXITCODE -ne 0) { throw "momentry uninstall failed (exit $LASTEXITCODE)" }
            return
        }
        throw "no momentry install found at $homeDir"
    }

    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw 'node not found on PATH. momentry needs Node >= 20: winget install OpenJS.NodeJS.LTS (or https://nodejs.org), then re-run.' }
    # double-quoted for PowerShell so node receives the inner '.' quotes intact (PS 5.1 drops embedded ")
    $major = [int]((& node -p "process.versions.node.split('.')[0]") | Select-Object -First 1)
    if ($major -lt 20) { throw "Node $(& node --version) is too old; momentry needs Node >= 20: winget install OpenJS.NodeJS.LTS" }

    if ((Test-Path -LiteralPath $shim) -and -not (Select-String -LiteralPath $shim -SimpleMatch $shimTag -Quiet)) {
        throw "$shim exists and was not installed by momentry; remove it or set MOMENTRY_INSTALL_DIR"
    }

    $version = if ($env:MOMENTRY_VERSION) { $env:MOMENTRY_VERSION } elseif ($stamped -notlike '@*@') { $stamped } else { 'latest' }
    if ($version -match '^[0-9]') { $version = "v$version" }
    if ($version -ne 'latest' -and $version -notmatch '^v[0-9][0-9A-Za-z.-]*$') { throw "invalid version '$version'" }

    $base = if ($env:MOMENTRY_RELEASE_BASE) { $env:MOMENTRY_RELEASE_BASE.TrimEnd('/', '\') } else { "https://github.com/$repo/releases" }
    $isLocal = -not ($base -match '^https?://')
    if ($base -match '^http://') { throw "downloads must use HTTPS: $base" }
    function Get-AssetPath([string]$Name) {
        if ($isLocal) { return (Join-Path $base $Name) }
        if ($version -eq 'latest') { return "$base/latest/download/$Name" }
        return "$base/download/$version/$Name"
    }
    function Get-Asset([string]$Name, [string]$Dest) {
        $src = Get-AssetPath $Name
        try {
            if ($isLocal) { Copy-Item -LiteralPath $src -Destination $Dest -Force }
            else { Invoke-WebRequest -Uri $src -OutFile $Dest -UseBasicParsing -TimeoutSec 120 | Out-Null }
        } catch { throw "download failed: $src ($($_.Exception.Message))" }
    }

    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('momentry-install-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
        $sums = Join-Path $tmp 'checksums.txt'
        Get-Asset 'checksums.txt' $sums
        $entries = @()
        foreach ($line in [IO.File]::ReadAllLines($sums)) {
            $f = $line.Trim() -split '\s+'
            if ($f.Count -lt 2) { continue }
            $n = $f[1].TrimStart('*')
            if ($n -cmatch '^momentry-v[0-9][0-9A-Za-z.-]*\.tar\.gz$' -and $f[0] -match '^[0-9A-Fa-f]{64}$') { $entries += ,@($n, $f[0]) }
        }
        if ($entries.Count -ne 1) { throw "checksums.txt must list exactly one momentry-v*.tar.gz (found $($entries.Count))" }
        $asset = $entries[0][0]; $expected = $entries[0][1]
        $got = $asset.Substring(9, $asset.Length - 9 - 7)
        if ($version -ne 'latest' -and $got -ne $version) { throw "checksums.txt for $version points at $asset" }
        $version = $got

        $current = $null
        $currentFile = Join-Path $homeDir 'current'
        if (Test-Path -LiteralPath $currentFile) { $current = (Get-Content -LiteralPath $currentFile -TotalCount 1).Trim() }
        $dest = Join-Path $homeDir "versions\$version"
        $activeRuns = $false
        if ($current -eq $version -and (Test-Path -LiteralPath (Join-Path $homeDir '.momentry-managed')) -and (Test-Path -LiteralPath (Join-Path $dest 'bin\momentry.mjs'))) {
            $activeRuns = ((Invoke-Quiet { & node (Join-Path $dest 'bin\momentry.mjs') --version }) -eq "momentry $($version.Substring(1))")
        }
        if ($activeRuns) {
            Write-Host "momentry $version is already installed; nothing to do"
        } else {
            $archive = Join-Path $tmp $asset
            Get-Asset $asset $archive
            $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
            if ($actual -ine $expected) { throw "sha256 mismatch for $asset (download corrupted or tampered); retry" }
            Write-Host "verified sha256 of $asset (signature not checked)"
            if ($env:MOMENTRY_DRY_RUN -eq '1') {
                Write-Host "dry-run: would unpack $asset into $dest and write $currentFile and $shim"
                return
            }

            $tarExe = $null
            if ($env:SystemRoot) { $c = Join-Path $env:SystemRoot 'System32\tar.exe'; if (Test-Path -LiteralPath $c) { $tarExe = $c } }
            if (-not $tarExe) { throw 'tar.exe not found (ships with Windows 10 1803 and later)' }
            $listing = & $tarExe -tzf $archive
            if ($LASTEXITCODE -ne 0) { throw "cannot read $asset" }
            $top = "momentry-$version"
            foreach ($m in $listing) {
                if ($m -match '(^/|^[A-Za-z]:|\.\.)') { throw "unsafe path in archive: $m" }
                if ($m -notmatch "^$([Regex]::Escape($top))/(bin|lib|prompts|ui)(/|$)" -and $m -notmatch "^$([Regex]::Escape($top))/(BUILD|LICENSE|README\.md)?$") { throw "unexpected entry in archive: $m" }
            }
            $verbose = & $tarExe -tvzf $archive
            foreach ($v in $verbose) { if ($v -match '^[lhcbp]') { throw 'archive contains links or special files; refused' } }

            $versions = Join-Path $homeDir 'versions'
            New-Item -ItemType Directory -Path $versions -Force | Out-Null
            $stage = Join-Path $versions (".$version.tmp.$PID")
            if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
            New-Item -ItemType Directory -Path $stage | Out-Null
            & $tarExe -xzf $archive -C $stage
            if ($LASTEXITCODE -ne 0) { throw "failed to extract $asset" }
            $entry = Join-Path $stage "$top\bin\momentry.mjs"
            $reported = Invoke-Quiet { & node $entry --version }
            if ($reported -ne "momentry $($version.Substring(1))") {
                Remove-Item -LiteralPath $stage -Recurse -Force
                throw "the downloaded version does not run here ($reported)"
            }
            $old = $null
            if (Test-Path -LiteralPath $dest) { $old = "$dest.old.$PID"; Move-Item -LiteralPath $dest -Destination $old }
            Move-Item -LiteralPath (Join-Path $stage $top) -Destination $dest
            if ($old) { Remove-Item -LiteralPath $old -Recurse -Force -ErrorAction SilentlyContinue }
            Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
            & node (Join-Path $dest 'bin\momentry.mjs') _activate
            if ($LASTEXITCODE -ne 0) {
                if ($current) { Set-Content -LiteralPath $currentFile -Value $current -NoNewline }
                throw "activating $version failed; previous version kept"
            }
        }

        $clean = $binDir.TrimEnd('\', '/')
        $onPath = $false
        foreach ($e in ($env:PATH -split ';')) { if ($e -and $e.TrimEnd('\', '/') -ieq $clean) { $onPath = $true; break } }
        if (-not $onPath) {
            if ($env:MOMENTRY_NO_MODIFY_PATH -eq '1') {
                Write-Host "PATH: add it for your user:  [Environment]::SetEnvironmentVariable('Path', `"$clean;`" + [Environment]::GetEnvironmentVariable('Path','User'), 'User')"
            } else {
                $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
                try {
                    $old = $key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
                    $kind = if ($old) { $key.GetValueKind('Path') } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }
                    $parts = @($old -split ';' | Where-Object { $_ })
                    if (-not ($parts | Where-Object { $_.TrimEnd('\') -ieq $clean })) {
                        $key.SetValue('Path', (@($clean) + $parts) -join ';', $kind)
                        Write-Host "PATH: added $clean to your user PATH (new terminals pick it up)"
                    }
                } finally { $key.Close() }
                if (-not ('Win32.MomentryEnv' -as [type])) {
                    Add-Type -Namespace Win32 -Name MomentryEnv -MemberDefinition '[DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);'
                }
                $r = [UIntPtr]::Zero
                [void][Win32.MomentryEnv]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$r)
                $env:PATH = "$clean;$env:PATH"
            }
        }
        Write-Host ''
        Write-Host "installed: $(& $shim --version)"
        Write-Host 'Next:'
        Write-Host '  1. momentry init'
        Write-Host '  2. momentry scan --max-sessions 1'
        Write-Host '  3. momentry list --rank'
    } finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

try {
    Install-Momentry
} catch {
    [Console]::Error.WriteLine("error: $($_.Exception.Message)")
    if ($PSCommandPath) { exit 1 } else { $global:LASTEXITCODE = 1 }
}
