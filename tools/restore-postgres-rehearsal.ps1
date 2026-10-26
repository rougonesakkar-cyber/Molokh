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
$notificationProjectionQuery = @'
with expected as (
  select
    (item.value ->> 'notificationId')::uuid as notification_id,
    (item.value ->> 'recipientUserId')::uuid as recipient_user_id,
    message.event_id as source_event_id,
    item.value ->> 'category' as category,
    item.value ->> 'renderKey' as render_key,
    item.value -> 'actionTarget' as action_target,
    item.value -> 'payload' as payload,
    case when item.value ->> 'deadlineAt' is null then null
      else (item.value ->> 'deadlineAt')::timestamptz end as deadline_at
  from platform.outbox_messages message
  cross join lateral jsonb_array_elements(message.payload -> 'notifications')
    with ordinality item(value, ordinal)
  where message.topic = 'notification.in_app.v1'
), actual as (
  select notification_id, recipient_user_id, source_event_id, category,
    render_key, action_target, payload, deadline_at
  from platform.notifications
), expected_summary as (
  select count(*)::bigint as row_count,
    md5(coalesce(string_agg(jsonb_build_object(
      'notificationId', notification_id,
      'recipientUserId', recipient_user_id,
      'sourceEventId', source_event_id,
      'category', category,
      'renderKey', render_key,
      'actionTarget', action_target,
      'payload', payload,
      'deadlineEpoch', extract(epoch from deadline_at)
    )::text, '|' order by notification_id), '')) as projection_hash
  from expected
), actual_summary as (
  select count(*)::bigint as row_count,
    md5(coalesce(string_agg(jsonb_build_object(
      'notificationId', notification_id,
      'recipientUserId', recipient_user_id,
      'sourceEventId', source_event_id,
      'category', category,
      'renderKey', render_key,
      'actionTarget', action_target,
      'payload', payload,
      'deadlineEpoch', extract(epoch from deadline_at)
    )::text, '|' order by notification_id), '')) as projection_hash
  from actual
)
select json_build_object(
  'expectedCount', expected_summary.row_count,
  'actualCount', actual_summary.row_count,
  'expectedHash', expected_summary.projection_hash,
  'actualHash', actual_summary.projection_hash,
  'missingReceipts', (select count(*) from (
    select distinct event_id from platform.outbox_messages
    where topic = 'notification.in_app.v1'
    except
    select event_id from platform.inbox_receipts
    where consumer_name = 'notification-inbox-v1'
  ) missing)
)::text
from expected_summary cross join actual_summary;
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

  $projectionJson = (& docker compose -f $composeFile exec -T postgres psql `
    --username $DatabaseUser --dbname $TargetDatabase --tuples-only --no-align `
    --command $notificationProjectionQuery | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $projectionJson) {
    throw 'Notification shadow-rebuild query failed.'
  }
  $projection = $projectionJson | ConvertFrom-Json
  if (
    [int64]$projection.expectedCount -ne [int64]$projection.actualCount `
    -or $projection.expectedHash -ne $projection.actualHash `
    -or [int64]$projection.missingReceipts -ne 0
  ) {
    throw "Notification shadow rebuild differs from the stored projection: $projectionJson"
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
  Write-Host "Notification shadow rebuild: $($projection.actualCount) rows; hash $($projection.actualHash); missing receipts 0"
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
