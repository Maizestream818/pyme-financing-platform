param()

$ErrorActionPreference = 'Stop'

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$EnvFile = Join-Path $ProjectRoot '.env'
$EnvExampleFile = Join-Path $ProjectRoot '.env.example'
$LoadEnvScript = Join-Path $ProjectRoot 'scripts\load-env.ps1'
$ApiScript = Join-Path $ProjectRoot 'scripts\start-api.ps1'
$WebScript = Join-Path $ProjectRoot 'scripts\start-web.ps1'

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  Write-Host ""
  Write-Host "==> $Label" -ForegroundColor Cyan
  & $Command @Arguments

  if ($LASTEXITCODE -ne 0) {
    throw "Fallo el paso: $Label"
  }
}

function Wait-Postgres {
  $databaseName = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'pyme_financing' }
  $databaseUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'pyme' }

  Write-Host ""
  Write-Host "==> Esperando PostgreSQL" -ForegroundColor Cyan

  for ($attempt = 1; $attempt -le 30; $attempt++) {
    docker compose exec -T postgres pg_isready -U $databaseUser -d $databaseName | Out-Host

    if ($LASTEXITCODE -eq 0) {
      return
    }

    Start-Sleep -Seconds 2
  }

  throw 'PostgreSQL no quedo listo despues de 60 segundos.'
}

Set-Location -LiteralPath $ProjectRoot

if (-not (Test-Path -LiteralPath $EnvFile)) {
  if (-not (Test-Path -LiteralPath $EnvExampleFile)) {
    throw 'No existe .env.example para crear .env.'
  }

  Copy-Item -LiteralPath $EnvExampleFile -Destination $EnvFile
  Write-Host "Se creo .env desde .env.example" -ForegroundColor Yellow
}

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

Invoke-Step 'Levantando PostgreSQL y pgAdmin' 'docker' @('compose', 'up', '-d', 'postgres', 'pgadmin')
Wait-Postgres
Invoke-Step 'Instalando dependencias' 'corepack' @('pnpm', 'install')
Invoke-Step 'Generando Prisma Client' 'corepack' @('pnpm', '--filter', '@pyme/database', 'db:generate')
Invoke-Step 'Aplicando migraciones' 'corepack' @('pnpm', '--filter', '@pyme/database', 'db:migrate')
Invoke-Step 'Cargando datos demo' 'corepack' @('pnpm', '--filter', '@pyme/database', 'db:seed')

Write-Host ""
Write-Host "==> Abriendo API y Web en nuevas ventanas PowerShell" -ForegroundColor Cyan
Start-Process -FilePath 'powershell.exe' -WorkingDirectory $ProjectRoot -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', "`"$ApiScript`"")
Start-Process -FilePath 'powershell.exe' -WorkingDirectory $ProjectRoot -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', "`"$WebScript`"")

Write-Host ""
Write-Host "Entorno local iniciado." -ForegroundColor Green
Write-Host "Web:     http://localhost:3000"
Write-Host "API:     http://localhost:3001/api"
Write-Host "pgAdmin: http://localhost:5050"
Write-Host ""
Write-Host "Usuarios demo:"
Write-Host "operador@demo.com / Password123!"
Write-Host "applicant@demo.com / Password123!"
