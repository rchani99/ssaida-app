param(
    [Parameter(Mandatory = $true)][string]$Apk,
    [Parameter(Mandatory = $true)][string]$ReleaseNotesFile,
    [switch]$Distribute,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
if ($env:FIREBASE_APP_ID -notmatch '^1:[0-9]+:android:[a-fA-F0-9]+$') {
    throw 'Set FIREBASE_APP_ID to the registered com.ssaida.app Firebase Android App ID.'
}
if ($env:FIREBASE_PROJECT_ID -notmatch '^[a-z][a-z0-9-]{4,28}[a-z0-9]$') {
    throw 'Set FIREBASE_PROJECT_ID to the intended Firebase project ID.'
}
$apkFile = Get-Item -LiteralPath $Apk
$notesFile = Get-Item -LiteralPath $ReleaseNotesFile
if ($apkFile.PSIsContainer -or $apkFile.Extension -ne '.apk' -or $apkFile.Length -eq 0) {
    throw 'A nonempty, verified release APK is required.'
}
if ($notesFile.PSIsContainer -or $notesFile.Length -eq 0 -or $notesFile.Length -gt 16384) {
    throw 'Release notes must be a nonempty UTF-8 text file of at most 16 KiB.'
}

$firebaseArguments = @(
    'appdistribution:distribute', $apkFile.FullName,
    '--app', $env:FIREBASE_APP_ID,
    '--project', $env:FIREBASE_PROJECT_ID,
    '--release-notes-file', $notesFile.FullName,
    '--non-interactive'
)
# Default is upload only. Distribution/notification to the configured tester group
# requires an explicit manual -Distribute invocation after device smoke testing.
if ($Distribute) { $firebaseArguments += @('--groups', 'ssaida-beta') }
if ($DryRun) {
    [pscustomobject]@{
        Project = $env:FIREBASE_PROJECT_ID
        App = $env:FIREBASE_APP_ID
        Apk = $apkFile.FullName
        ReleaseNotes = $notesFile.FullName
        Group = $(if ($Distribute) { 'ssaida-beta' } else { '(upload only)' })
    }
    return
}

if ($env:FIREBASE_CLI_PATH) {
    & node $env:FIREBASE_CLI_PATH @firebaseArguments
} else {
    $firebaseCommand = Get-Command firebase -ErrorAction Stop
    & $firebaseCommand.Source @firebaseArguments
}
if ($LASTEXITCODE -ne 0) { throw 'Firebase upload failed. Check authentication, app registration and App Distribution access.' }
