# Register available artwork in the approved DEV database. Existing records are preserved.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    if ((Get-Content -LiteralPath 'supabase\.temp\project-ref').Trim() -ne 'ffnxodulitwzuqswlaga') {
        throw 'Collection sync is limited to the approved development project.'
    }
    & pnpm dlx supabase db query --linked --file supabase/seed.sql
    if ($LASTEXITCODE -ne 0) { throw 'DEV catalog sync failed.' }
    & pnpm dlx supabase db query --linked "select theme_code, count(*) as total, min(growth_goal) as min_goal, max(growth_goal) as max_goal from public.collectible_catalog where is_active group by theme_code order by theme_code;"
    if ($LASTEXITCODE -ne 0) { throw 'DEV catalog verification failed.' }
} finally {
    Pop-Location
}
