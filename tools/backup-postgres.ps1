[CmdletBinding()]
param(
  [string]$Database = $(if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'molokh' }),
  [string]$DatabaseUser = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'molokh' }),
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'

function Get-Sha256Hex([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
      return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally {
      $algorithm.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$composeFile = Join-Path $projectRoot 'infra\compose.yaml'
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $projectRoot 'artifacts\backups'
}

if ($Database -notmatch '^[a-z][a-z0-9_]*$') {
  throw 'Database must contain only lower-case letters, digits and underscores.'
}
if ($DatabaseUser -notmatch '^[a-z][a-z0-9_]*$') {
  throw 'DatabaseUser must contain only lower-case letters, digits and underscores.'
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$fileName = "molokh-$Database-$timestamp.dump"
$backupPath = Join-Path $resolvedOutput $fileName
$containerPath = "/tmp/$fileName"

& docker compose -f $composeFile up -d --wait postgres | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL did not become healthy.' }

$containerId = (& docker compose -f $composeFile ps -q postgres | Out-String).Trim()
if (-not $containerId) { throw 'PostgreSQL container was not found.' }

try {
  & docker compose -f $composeFile exec -T postgres pg_dump `
    --username $DatabaseUser --dbname $Database --format custom --compress 9 `
    --no-owner --no-privileges --file $containerPath
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed.' }

  & docker compose -f $composeFile exec -T postgres pg_restore --list $containerPath | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'pg_restore could not read the generated archive.' }

  & docker cp "$containerId`:$containerPath" $backupPath | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not copy the archive from the PostgreSQL container.' }

  $hash = Get-Sha256Hex $backupPath
  Set-Content -LiteralPath "$backupPath.sha256" -Value "$hash  $fileName" -Encoding ascii
  Write-Host "Backup verified: $backupPath"
  Write-Host "SHA-256: $hash"
  Write-Output $backupPath
} finally {
  if ($containerPath -match '^/tmp/molokh-[a-z0-9_-]+\.dump$') {
    & docker compose -f $composeFile exec -T postgres rm -f -- $containerPath | Out-Null
  }
}
