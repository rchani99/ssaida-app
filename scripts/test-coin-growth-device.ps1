# Temporary state fixtures for a connected DEV Android app; always restore in finally.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$DeviceId,
    [Parameter(Mandatory)][guid]$CollectibleId,
    [ValidateRange(1, 5)][int[]]$Stages = @(1, 2, 3, 4, 5)
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
$artifactDir = Join-Path $projectRoot 'output\growth-test'
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
if ((Get-Content (Join-Path $projectRoot 'supabase\.temp\project-ref')).Trim() -ne 'ffnxodulitwzuqswlaga') {
    throw 'This test only supports the approved DEV project.'
}
function Sql([string]$statement) {
    $sqlFile = Join-Path $artifactDir 'query.sql'
    Set-Content -LiteralPath $sqlFile -Value $statement -Encoding utf8
    $result = & pnpm dlx supabase db query --linked --file $sqlFile --output json
    if ($LASTEXITCODE -ne 0) { throw 'DEV SQL query failed.' }
    return (($result -join "`n") | ConvertFrom-Json).rows
}
function Adb([string[]]$arguments) {
    $result = & $adb -s $DeviceId @arguments
    if ($LASTEXITCODE -ne 0) { throw "ADB failed: $($arguments[0])" }
    return $result
}
function Refresh-Garden {
    Adb @('shell', 'input', 'keyevent', 'KEYCODE_HOME') | Out-Null
    Start-Sleep -Milliseconds 500
    Adb @('shell', 'am', 'start', '-n', 'com.ssaida.app/.MainActivity') | Out-Null
    Start-Sleep -Seconds 3
}
Push-Location $projectRoot
try {
    $initial = @(Sql "select item.id, item.status, item.progress_points, item.growth_goal_snapshot, item.completed_at, item.revealed_at, catalog.code from public.child_collectibles item join public.collectible_catalog catalog on catalog.id = item.collectible_catalog_id where item.id = '$CollectibleId'::uuid;")
    if ($initial.Count -ne 1 -or $initial[0].code -ne 'DEV_COIN_03' -or $initial[0].status -ne 'GROWING' -or [decimal]$initial[0].growth_goal_snapshot -ne 24) {
        throw 'Expected the current growing DEV_COIN_03 with goal 24.'
    }
    $original = $initial[0]
    $original | ConvertTo-Json | Set-Content (Join-Path $artifactDir 'original-state.json') -Encoding utf8
    $restoreSql = "update public.child_collectibles set progress_points = $($original.progress_points), status = 'GROWING', completed_at = null, updated_at = now() where id = '$CollectibleId'::uuid and revealed_at is null and growth_goal_snapshot = 24 returning progress_points, status;"
    Set-Content (Join-Path $artifactDir 'restore.sql') -Value $restoreSql -Encoding utf8
    $expectedPoints = $original.progress_points
    $expectedStatus = 'GROWING'
    $changed = $false
    $results = @()
    try {
        foreach ($stage in $Stages) {
            $points = ($stage - 1) * 6
            $status = if ($stage -eq 5) { 'COMPLETED' } else { 'GROWING' }
            $completed = if ($stage -eq 5) { 'now()' } else { 'null' }
            $rows = @(Sql "update public.child_collectibles set progress_points = $points, status = '$status', completed_at = $completed, updated_at = now() where id = '$CollectibleId'::uuid and progress_points = $expectedPoints and status = '$expectedStatus' and revealed_at is null and growth_goal_snapshot = 24 returning progress_points, status;")
            if ($rows.Count -ne 1) { throw 'State changed concurrently; test stopped.' }
            $changed = $true
            $expectedPoints = $points
            $expectedStatus = $status
            Refresh-Garden
            if ($stage -eq 5) {
                # The ready badge makes the card taller; scroll to its progress and CTA.
                Adb @('shell', 'input', 'swipe', '540', '1800', '540', '1200', '350') | Out-Null
                Start-Sleep -Seconds 1
            }
            Adb @('shell', 'uiautomator', 'dump', '/sdcard/ssaida-growth-ui.xml') | Out-Null
            $xmlText = (Adb @('shell', 'cat', '/sdcard/ssaida-growth-ui.xml')) -join "`n"
            $ui = [xml]$xmlText
            $texts = @($ui.SelectNodes('//node') | ForEach-Object { $_.text; $_.'content-desc' }) -join ' '
            $percent = ($stage - 1) * 25
            if (-not $texts.Contains("$points / 24") -or -not $texts.Contains("확정된 성장 $percent%")) {
                throw "Stage $stage did not show the expected $points/24 and $percent%."
            }
            $readyShown = $texts.Contains('완성! 공개해보세요')
            if ($readyShown -ne ($stage -eq 5)) { throw 'Reveal-ready display appeared at the wrong stage.' }
            if ($stage -eq 5 -and -not $texts.Contains('새 친구 공개하기')) { throw 'Missing reveal CTA at completion.' }
            Set-Content (Join-Path $artifactDir "stage-$stage.xml") -Value $xmlText -Encoding utf8
            Adb @('shell', 'screencap', '-p', '/sdcard/ssaida-growth.png') | Out-Null
            Adb @('pull', '/sdcard/ssaida-growth.png', (Join-Path $artifactDir "stage-$stage.png")) | Out-Null
            $results += [pscustomobject]@{stage=$stage; points=$points; percent=$percent; ready=$readyShown}
            Write-Host "PASS actual device: stage $stage, $points / 24, $percent%, ready=$readyShown"
        }
    } finally {
        if ($changed) {
            $restored = @(Sql ($restoreSql -replace ' returning ', " and progress_points = $expectedPoints and status = '$expectedStatus' returning "))
            if ($restored.Count -ne 1) { throw 'Concurrent state change prevented restoration. See output/growth-test/original-state.json.' }
            Refresh-Garden
            if (5 -in $Stages) {
                Adb @('shell', 'input', 'swipe', '540', '900', '540', '1850', '350') | Out-Null
                Start-Sleep -Seconds 1
            }
            Adb @('shell', 'screencap', '-p', '/sdcard/ssaida-growth.png') | Out-Null
            Adb @('pull', '/sdcard/ssaida-growth.png', (Join-Path $artifactDir 'restored.png')) | Out-Null
            Write-Host "RESTORED original $($original.progress_points) / 24, GROWING, unrevealed"
        }
    }
    $results | ConvertTo-Json | Set-Content (Join-Path $artifactDir 'results.json') -Encoding utf8
} finally {
    Pop-Location
}
