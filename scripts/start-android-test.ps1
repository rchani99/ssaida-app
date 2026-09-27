# Windows PowerShell 5.1 / PowerShell 7. No pnpm or global Expo CLI required.
[CmdletBinding()]
param(
    [string]$ConnectTo,
    [string]$DeviceId,
    [switch]$ClearCache,
    [switch]$Help
)

if ($Help) {
    Write-Host 'Usage: .\scripts\start-android-test.ps1 [-ConnectTo IP:PORT] [-DeviceId SERIAL] [-ClearCache]'
    Write-Host 'Enable wireless debugging on the same Wi-Fi first. Pair the phone once if needed.'
    Write-Host 'Uses the existing .env and installed APK. Does not build, install, or change Supabase.'
    return
}

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Find-Executable {
    param([string]$Name, [string[]]$Candidates)
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return $candidate }
    }
    throw "$Name not found. Install Node.js / Android SDK platform-tools, then retry."
}

function Invoke-Adb {
    param([string[]]$Arguments)
    # ADB daemon startup messages can be written to stderr on Windows PowerShell.
    $ErrorActionPreference = 'Continue'
    $result = & $adbPath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "ADB failed: $($Arguments[0]). Check the connection and phone authorization." }
    return $result
}

Push-Location $projectRoot
try {
    $nodePath = Find-Executable 'node.exe' @("$env:ProgramFiles\nodejs\node.exe")
    $adbPath = Find-Executable 'adb.exe' @(
        "$env:ANDROID_HOME\platform-tools\adb.exe",
        "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe",
        "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
    )
    $expoCli = Join-Path $projectRoot 'node_modules\expo\bin\cli'
    if (-not (Test-Path -LiteralPath $expoCli)) { throw 'Local Expo CLI missing. Install project dependencies first.' }
    if (-not (Test-Path -LiteralPath '.env')) { throw '.env missing. Configure the DEV Supabase URL and publishable key first.' }

    # Do not silently choose another port or terminate an existing Metro process.
    $connection = New-Object System.Net.Sockets.TcpClient
    try {
        $pending = $connection.ConnectAsync('127.0.0.1', 8081)
        try { $null = $pending.Wait(500) } catch { }
        if ($connection.Connected) { throw 'Port 8081 is already in use. Stop the existing Metro with Ctrl+C, then retry.' }
    } finally { $connection.Dispose() }

    if ($ConnectTo) {
        if ($ConnectTo -notmatch '^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$') { throw 'ConnectTo must be the wireless debugging IPv4:PORT (not the pairing port).' }
        Invoke-Adb @('connect', $ConnectTo) | Out-Host
    }

    $devices = @(Invoke-Adb @('devices', '-l') | ForEach-Object {
        if ($_ -match '^(?<serial>.+?)\s+device\s+(?<details>.*)$') {
            [pscustomobject]@{ Serial = $Matches.serial.Trim(); Details = $Matches.details }
        }
    })
    if ($devices.Count -eq 0 -and -not $ConnectTo) {
        $endpoint = Read-Host 'No online device. Enter wireless debugging IP:PORT (Enter to cancel)'
        if (-not $endpoint) { throw 'No device selected. Enable wireless debugging and retry.' }
        if ($endpoint -notmatch '^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$') { throw 'Expected IPv4:PORT.' }
        Invoke-Adb @('connect', $endpoint) | Out-Host
        $devices = @(Invoke-Adb @('devices', '-l') | ForEach-Object {
            if ($_ -match '^(?<serial>.+?)\s+device\s+(?<details>.*)$') {
                [pscustomobject]@{ Serial = $Matches.serial.Trim(); Details = $Matches.details }
            }
        })
    }
    if ($devices.Count -eq 0) { throw 'No online device. Check pairing, Wi-Fi, and the phone authorization prompt.' }

    if ($DeviceId) {
        $selected = $devices | Where-Object { $_.Serial -eq $DeviceId } | Select-Object -First 1
        if (-not $selected) { throw 'The specified DeviceId is not online.' }
    } elseif ($devices.Count -eq 1) {
        $selected = $devices[0]
    } else {
        for ($i = 0; $i -lt $devices.Count; $i++) {
            Write-Host "[$($i + 1)] $($devices[$i].Serial) $($devices[$i].Details)"
        }
        $choice = Read-Host 'Select the phone number from the list'
        $index = 0
        if (-not [int]::TryParse($choice, [ref]$index) -or $index -lt 1 -or $index -gt $devices.Count) { throw 'Invalid device selection.' }
        $selected = $devices[$index - 1]
    }

    Write-Host "Using device: $($selected.Serial)"
    $packageName = (Get-Content app.json -Raw | ConvertFrom-Json).expo.android.package
    if ($packageName -notmatch '^[A-Za-z0-9_.]+$') { throw 'Invalid Android package in app.json.' }
    $installed = Invoke-Adb @('-s', $selected.Serial, 'shell', 'pm', 'path', $packageName)
    if (-not ($installed -match '^package:')) { throw 'The debug APK is not installed on this device. Install it first; do not use Expo Go.' }

    Invoke-Adb @('-s', $selected.Serial, 'reverse', 'tcp:8081', 'tcp:8081') | Out-Host
    Invoke-Adb @('-s', $selected.Serial, 'reverse', '--list') | Out-Host
    Invoke-Adb @('-s', $selected.Serial, 'shell', 'am', 'start', '-n', "$packageName/.MainActivity") | Out-Host

    Write-Host 'Starting Metro. Keep this terminal open; Ctrl+C stops it.'
    Write-Host 'Use the installed ssaida-app, NOT the Expo Go QR code. Reload/open the app after Metro is ready.'
    $expoArguments = @('--dns-result-order=ipv4first', $expoCli, 'start', '--localhost', '--port', '8081')
    if ($ClearCache) { $expoArguments += '--clear' }
    & $nodePath @expoArguments
    if ($LASTEXITCODE -ne 0) { throw "Metro exited with code $LASTEXITCODE." }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
