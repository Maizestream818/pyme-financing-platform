param()

$ErrorActionPreference = 'Stop'

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

Set-Location -LiteralPath $ProjectRoot
corepack pnpm --filter @pyme/web dev
