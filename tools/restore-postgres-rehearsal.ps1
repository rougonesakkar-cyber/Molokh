[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [string]$SourceDatabase = $(if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'molokh' }),
  [string]$TargetDatabase = 'molokh_restore_rehearsal',
  [string]$DatabaseUser = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'molokh' }),
  [switch]$DropAfterVerification
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
$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath).Path

if ($SourceDatabase -notmatch '^[a-z][a-z0-9_]*$') {
  throw 'SourceDatabase must contain only lower-case letters, digits and underscores.'
}
if ($TargetDatabase -notmatch '^molokh_restore_[a-z0-9_]+$') {
  throw 'TargetDatabase must use the isolated molokh_restore_* namespace.'
}
if ($TargetDatabase -eq $SourceDatabase) {
  throw 'Refusing to restore over the source database.'
}
if ($DatabaseUser -notmatch '^[a-z][a-z0-9_]*$') {
  throw 'DatabaseUser must contain only lower-case letters, digits and underscores.'
}

$checksumPath = "$resolvedBackup.sha256"
if (Test-Path -LiteralPath $checksumPath) {
  $expectedHash = ((Get-Content -LiteralPath $checksumPath -Raw).Trim() -split '\s+')[0]
  $actualHash = Get-Sha256Hex $resolvedBackup
  if ($actualHash -ne $expectedHash.ToLowerInvariant()) {
    throw 'Backup SHA-256 does not match its sidecar.'
  }
}

& docker compose -f $composeFile up -d --wait postgres | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL did not become healthy.' }

$containerId = (& docker compose -f $composeFile ps -q postgres | Out-String).Trim()
if (-not $containerId) { throw 'PostgreSQL container was not found.' }

$existing = (& docker compose -f $composeFile exec -T postgres psql `
  --username $DatabaseUser --dbname postgres --tuples-only --no-align `
  --command "select 1 from pg_database where datname = '$TargetDatabase'" | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the rehearsal database namespace.' }
if ($existing) {
  throw "Refusing to overwrite existing database '$TargetDatabase'."
}

$containerPath = "/tmp/molokh-restore-$([Guid]::NewGuid().ToString('N')).dump"
$databaseCreated = $false
$verified = $false
$countQuery = @'
select 'identity.users|' || count(*) from identity.users
union all select 'platform.domain_events|' || count(*) from platform.domain_events
union all select 'platform.audit_events|' || count(*) from platform.audit_events
union all select 'platform.outbox_messages|' || count(*) from platform.outbox_messages
union all select 'platform.schema_migrations|' || count(*) from platform.schema_migrations
union all select 'social.chats|' || count(*) from social.chats
union all select 'scheduling.bookings|' || count(*) from scheduling.bookings
union all select 'scheduling.sessions|' || count(*) from scheduling.sessions
union all select 'competition.challenges|' || count(*) from competition.challenges
union all select 'competition.results|' || count(*) from competition.results
order by 1;
'@

try {
  & docker cp $resolvedBackup "$containerId`:$containerPath" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not copy the archive into the PostgreSQL container.' }

  & docker compose -f $composeFile exec -T postgres createdb `
    --username $DatabaseUser $TargetDatabase
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated rehearsal database.' }
  $databaseCreated = $true

  & docker compose -f $composeFile exec -T postgres pg_restore `
    --exit-on-error --no-owner --no-privileges --username $DatabaseUser `
    --dbname $TargetDatabase $containerPath
  if ($LASTEXITCODE -ne 0) { throw 'pg_restore failed.' }

  $sourceCounts = @(& docker compose -f $composeFile exec -T postgres psql `
    --username $DatabaseUser --dbname $SourceDatabase --tuples-only --no-align `
    --command $countQuery)
  if ($LASTEXITCODE -ne 0) { throw 'Could not read source verification counts.' }
  $restoredCounts = @(& docker compose -f $composeFile exec -T postgres psql `
    --username $DatabaseUser --dbname $TargetDatabase --tuples-only --no-align `
    --command $countQuery)
  if ($LASTEXITCODE -ne 0) { throw 'Could not read restored verification counts.' }

  if (($sourceCounts -join "`n") -ne ($restoredCounts -join "`n")) {
    throw "Restored critical-table counts differ from the quiescent source snapshot.`nSource:`n$($sourceCounts -join "`n")`nRestored:`n$($restoredCounts -join "`n")"
  }

  $verified = $true
  $serverVersion = (& docker compose -f $composeFile exec -T postgres psql `
    --username $DatabaseUser --dbname $TargetDatabase --tuples-only --no-align `
    --command 'show server_version' | Out-String).Trim()
  $migrationCeiling = (& docker compose -f $composeFile exec -T postgres psql `
    --username $DatabaseUser --dbname $TargetDatabase --tuples-only --no-align `
    --command 'select max(migration_name) from platform.schema_migrations' | Out-String).Trim()
  Write-Host "Restore verified in isolated database: $TargetDatabase"
  Write-Host "PostgreSQL: $serverVersion; migration ceiling: $migrationCeiling"
  $restoredCounts | ForEach-Object { Write-Host "  $_" }
} finally {
  if ($containerPath -match '^/tmp/molokh-restore-[a-f0-9]+\.dump$') {
    & docker compose -f $composeFile exec -T postgres rm -f -- $containerPath | Out-Null
  }
  if ($DropAfterVerification -and $databaseCreated -and $verified `
    -and $TargetDatabase -match '^molokh_restore_[a-z0-9_]+$') {
    & docker compose -f $composeFile exec -T postgres dropdb `
      --username $DatabaseUser --if-exists $TargetDatabase
    if ($LASTEXITCODE -ne 0) { throw 'Verified rehearsal database could not be removed.' }
    Write-Host "Removed verified rehearsal database: $TargetDatabase"
  }
}
