param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Path)) {
  throw "No existe el archivo de entorno: $Path"
}

foreach ($rawLine in Get-Content -LiteralPath $Path) {
  $line = $rawLine.Trim()

  if ($line -eq '' -or $line.StartsWith('#')) {
    continue
  }

  $separatorIndex = $line.IndexOf('=')

  if ($separatorIndex -lt 1) {
    continue
  }

  $name = $line.Substring(0, $separatorIndex).Trim()
  $value = $line.Substring($separatorIndex + 1).Trim()

  if ($name -eq '' -or $name.StartsWith('#')) {
    continue
  }

  if (
    $value.Length -ge 2 -and
    (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    )
  ) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}
