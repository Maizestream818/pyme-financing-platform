param()

$ErrorActionPreference = 'Stop'

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$EnvFile = Join-Path $ProjectRoot '.env'
$LoadEnvScript = Join-Path $ProjectRoot 'scripts\load-env.ps1'

Set-Location -LiteralPath $ProjectRoot
. $LoadEnvScript -Path $EnvFile

if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
  throw 'DATABASE_URL no esta definida en .env.'
}

if (
  -not $env:DATABASE_URL.StartsWith('postgresql://') -and
  -not $env:DATABASE_URL.StartsWith('postgres://')
) {
  throw "DATABASE_URL debe iniciar con postgresql:// o postgres://. Valor recibido: $($env:DATABASE_URL)"
}

Write-Host "DATABASE_URL cargada para API: $($env:DATABASE_URL)" -ForegroundColor Green
corepack pnpm --filter @pyme/api start:dev
