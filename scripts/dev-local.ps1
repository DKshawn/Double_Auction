$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    $env:LOCAL_ONLY = '1'
    $env:DATABASE_URL = ''
    $env:LOCAL_DATABASE_URL = ''
    $env:REALTIME_DATABASE_URL = ''
    $env:VERCEL = ''
    $env:TEACHER_ACCESS_KEY = ''
    $env:PGLITE_DATA_DIR = Join-Path $projectRoot '.data/platform-verification'
    $env:LOCAL_NEXT_DIST_DIR = '.next-emh-platform'
    npm run dev -- --hostname 127.0.0.1 --port 3200
    if ($LASTEXITCODE -ne 0) { throw "Local development server exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
