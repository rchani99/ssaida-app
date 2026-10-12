# Temporary manual tasks in the approved DEV project; remove only these fixtures in finally.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$DeviceId,
    [Parameter(Mandatory)][guid]$PlanId
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$artifactDir = Join-Path $projectRoot 'output\study-next-test'
$adbPath = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
$fixtureOne = [guid]::NewGuid().ToString()
$fixtureTwo = [guid]::NewGuid().ToString()
$date = Get-Date -Format 'yyyy-MM-dd'
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
if ((Get-Content (Join-Path $projectRoot 'supabase\.temp\project-ref')).Trim() -ne 'ffnxodulitwzuqswlaga') {
    throw 'This test only supports the approved DEV project.'
}
function Sql([string]$statement) {
    $file = Join-Path $artifactDir 'query.sql'
    Set-Content -LiteralPath $file -Value $statement -Encoding utf8
    $result = & pnpm dlx supabase db query --linked --file $file --output json
    if ($LASTEXITCODE -ne 0) { throw 'DEV SQL query failed.' }
    return (($result -join "`n") | ConvertFrom-Json).rows
}
function Adb([string[]]$arguments) {
    $result = & $adbPath -s $DeviceId @arguments
    if ($LASTEXITCODE -ne 0) { throw "ADB failed: $($arguments[0])" }
    return $result
}
function Read-Ui {
    Adb @('shell', 'uiautomator', 'dump', '/sdcard/ssaida-study-next.xml') | Out-Null
    $xmlText = (Adb @('shell', 'cat', '/sdcard/ssaida-study-next.xml')) -join "`n"
    Set-Content (Join-Path $artifactDir 'latest.xml') -Value $xmlText -Encoding utf8
    return ,([xml]$xmlText)
}
function Find-Node($ui, [string]$label) {
    return $ui.SelectNodes('//node') | Where-Object { $_.text -eq $label -or $_.'content-desc' -eq $label } | Select-Object -First 1
}
function Wait-Ui([string]$label) {
    $deadline = (Get-Date).AddSeconds(50)
    do {
        $ui = Read-Ui
        if (Find-Node $ui $label) { return ,$ui }
        Start-Sleep -Milliseconds 700
    } while ((Get-Date) -lt $deadline)
    throw "Missing device UI: $label"
}
function Tap($ui, [string]$label) {
    $node = Find-Node $ui $label
    if (!$node -or $node.enabled -eq 'false') { throw "Unavailable action: $label" }
    if ($node.bounds -notmatch '^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$') { throw 'Missing bounds.' }
    if ([int]$Matches[3] -le [int]$Matches[1] -or [int]$Matches[4] -le [int]$Matches[2]) { throw "Action is outside the visible screen: $label" }
    $tapX = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
    $tapY = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
    Adb @('shell', 'input', 'tap', "$tapX", "$tapY") | Out-Null
}
function Capture([string]$name, $ui) {
    Set-Content (Join-Path $artifactDir "$name.xml") -Value $ui.OuterXml -Encoding utf8
    Adb @('shell', 'screencap', '-p', '/sdcard/ssaida-study-next.png') | Out-Null
    Adb @('pull', '/sdcard/ssaida-study-next.png', (Join-Path $artifactDir "$name.png")) | Out-Null
}
$cleanup = @"
do `$`$ begin
  if exists(select 1 from public.daily_tasks where id in ('$fixtureOne', '$fixtureTwo') and (source_type <> 'MANUAL' or name_snapshot not in ('DEV 이어가기 테스트 1','DEV 이어가기 테스트 2') or parent_verified_at is not null)) then
    raise exception 'Fixtures changed concurrently; do not remove confirmed data';
  end if;
end `$`$;
delete from public.daily_tasks where id in ('$fixtureOne', '$fixtureTwo') returning id;
"@
Set-Content (Join-Path $artifactDir 'cleanup.sql') -Value $cleanup -Encoding utf8
Push-Location $projectRoot
try {
    $plans = @(Sql "select id, child_id, plan_date from public.daily_plans where id = '$PlanId' and plan_date = '$date';")
    if ($plans.Count -ne 1) { throw 'Expected a current-day DEV plan.' }
    $childId = $plans[0].child_id
    $snapshotQuery = "select id,status,progress_points,completed_at,revealed_at from public.child_collectibles where child_id = '$childId' order by id;"
    $originalGrowth = @(Sql $snapshotQuery) | ConvertTo-Json -Depth 6 -Compress
    $unfinished = @(Sql "select id from public.daily_tasks where daily_plan_id = '$PlanId' and not excluded_for_today and status in ('PLANNED','IN_PROGRESS','RETRY');")
    if ($unfinished.Count -ne 0) { throw 'Real studies are unfinished; do not interrupt them.' }
    $created = $false
    try {
        # Also clean up after an unknown SQL response if the insert committed.
        $created = $true
        Sql "insert into public.daily_tasks(id,daily_plan_id,source_type,item_type,name_snapshot,planned_minutes,growth_weight,sort_order) values ('$fixtureOne','$PlanId','MANUAL','ACTIVITY','DEV 이어가기 테스트 1',1,0.1,30000),('$fixtureTwo','$PlanId','MANUAL','ACTIVITY','DEV 이어가기 테스트 2',1,0.1,30001) returning id;" | Out-Null
        Adb @('reverse', 'tcp:8081', 'tcp:8081') | Out-Null
        Adb @('shell', 'am', 'force-stop', 'com.ssaida.app') | Out-Null
        Adb @('shell', 'am', 'start', '-n', 'com.ssaida.app/.MainActivity') | Out-Null
        $ui = Wait-Ui 'DEV 이어가기 테스트 1 공부 시작'
        Tap $ui 'DEV 이어가기 테스트 1 공부 시작'
        $ui = Wait-Ui '완료'
        if (!(Find-Node $ui '공부 목록 보기')) { throw 'Missing explicit list action while studying.' }
        Capture 'studying' $ui
        Tap $ui '완료'
        $ui = Wait-Ui '다음 공부 시작'
        if (!(Find-Node $ui 'DEV 이어가기 테스트 2')) { throw 'Wrong next study preview.' }
        Capture 'next-study' $ui
        Write-Host 'PASS device: completion shows the next study and direct start action.'
        Tap $ui '다음 공부 시작'
        $ui = Wait-Ui '완료'
        if (!(Find-Node $ui 'DEV 이어가기 테스트 2')) { throw 'Wrong study opened.' }
        $rows = @(Sql "select id,status from public.daily_tasks where id = '$fixtureTwo';")
        if ($rows.Count -ne 1 -or $rows[0].status -ne 'IN_PROGRESS') { throw 'Next study was not started on the server.' }
        Capture 'next-started' $ui
        Write-Host 'PASS device: next study starts on the server and opens without going back.'
        Tap $ui '완료'
        $ui = Wait-Ui '내 컬렉션 보기'
        if (!(Find-Node $ui '오늘 할 공부를 마쳤어요!')) { throw 'Missing last-study celebration.' }
        if (Find-Node $ui '다음 공부 시작') { throw 'Unexpected next action after the final study.' }
        Capture 'finished' $ui
        Tap $ui '내 컬렉션 보기'
        $ui = Wait-Ui '테마 · 도감'
        Capture 'collection' $ui
        $finalGrowth = @(Sql $snapshotQuery) | ConvertTo-Json -Depth 6 -Compress
        if ($originalGrowth -ne $finalGrowth) { throw 'Collection growth changed before parent verification.' }
        Write-Host 'PASS device: final completion opens the collection; growth remains unchanged.'
    } finally {
        if ($created) {
            Sql $cleanup | Out-Null
            $remaining = @(Sql "select id from public.daily_tasks where id in ('$fixtureOne','$fixtureTwo');")
            if ($remaining.Count -ne 0) { throw 'Fixture cleanup incomplete.' }
            Write-Host 'REMOVED only the two temporary DEV study fixtures.'
            Adb @('shell', 'input', 'keyevent', 'KEYCODE_HOME') | Out-Null
            Adb @('shell', 'am', 'start', '-n', 'com.ssaida.app/.MainActivity') | Out-Null
        }
    }
} finally {
    Pop-Location
}
