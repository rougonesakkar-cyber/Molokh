[CmdletBinding()]
param(
  [string]$ApiBaseUrl = 'http://localhost:3000',
  [string]$Database = $(if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'molokh' }),
  [string]$DatabaseUser = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'molokh' }),
  [int]$MaxPipelineDelaySeconds = 300,
  [int]$MaxReadyForCoachMinutes = 120,
  [int]$MaxBackupAgeHours = 25,
  [int]$MaxRetentionDelayHours = 26,
  [switch]$FailOnWarning
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$composeFile = Join-Path $projectRoot 'infra\compose.yaml'
$backupDirectory = Join-Path $projectRoot 'artifacts\backups'
$findings = [System.Collections.Generic.List[object]]::new()

function Add-Finding([string]$Severity, [string]$Check, [string]$Message) {
  $findings.Add([pscustomobject]@{ severity = $Severity; check = $Check; message = $Message })
}

function Test-HttpHealth([string]$Name, [string]$Path) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$ApiBaseUrl$Path" -TimeoutSec 5
    if ($response.StatusCode -ne 200) {
      Add-Finding 'CRITICAL' $Name "HTTP $($response.StatusCode)"
    }
  } catch {
    Add-Finding 'CRITICAL' $Name $_.Exception.Message
  }
}

if ($Database -notmatch '^[a-z][a-z0-9_]*$' -or $DatabaseUser -notmatch '^[a-z][a-z0-9_]*$') {
  throw 'Database and DatabaseUser must contain only lower-case letters, digits and underscores.'
}

Test-HttpHealth 'api_liveness' '/health/live'
Test-HttpHealth 'api_readiness' '/health/ready'

& docker compose -f $composeFile up -d --wait postgres | Out-Null
if ($LASTEXITCODE -ne 0) {
  Add-Finding 'CRITICAL' 'postgres_health' 'PostgreSQL did not become healthy.'
} else {
  $healthQuery = @"
select json_build_object(
  'pendingOutbox', (select count(*) from platform.outbox_messages where published_at is null),
  'oldestOutboxSeconds', (select coalesce(extract(epoch from clock_timestamp() - min(created_at)), 0)::bigint from platform.outbox_messages where published_at is null),
  'overdueJobs', (select count(*) from graphile_worker.jobs where run_at < clock_timestamp() - make_interval(secs => $MaxPipelineDelaySeconds) and locked_at is null),
  'stuckLockedJobs', (select count(*) from graphile_worker.jobs where locked_at < clock_timestamp() - make_interval(secs => $MaxPipelineDelaySeconds)),
  'overdueScheduledSessions', (select count(*) from scheduling.sessions where state = 'SCHEDULED' and scheduled_start_at < clock_timestamp() - make_interval(secs => $MaxPipelineDelaySeconds)),
  'staleReadyForCoach', (select count(*) from scheduling.sessions where state = 'READY_FOR_COACH' and actual_start_at is null and window_opened_at < clock_timestamp() - make_interval(mins => $MaxReadyForCoachMinutes)),
  'overdueResultPending', (select count(*) from competition.challenges where state = 'RESULT_PENDING' and updated_at < clock_timestamp() - interval '24 hours'),
  'overdueAppeals', (select count(*) from competition.appeals where state in ('SUBMITTED', 'UNDER_REVIEW') and sla_due_at < clock_timestamp()),
  'terminalStatusLocks', (select count(*) from competition.competitions competition join competition.results result on result.result_id = competition.status_lock_result_id where result.state in ('FINAL', 'REVERSED', 'ANNULLED', 'REPEAT_ORDERED')),
  'oldMissingResultReviews', (select count(*) from competition.missing_result_reviews where state in ('OPEN', 'UNDER_REVIEW', 'REVIEWER_ASSIGNED') and opened_at < clock_timestamp() - interval '48 hours'),
  'overdueChatPayloads', (
    select count(*) from social.chat_message_revisions revision
    join social.chat_messages message on message.message_id = revision.message_id
    join social.chats chat on chat.chat_id = message.chat_id
    join lateral (
      select policy.retention_seconds from platform.retention_policy_versions policy
      where policy.record_class = case chat.scope
        when 'PERSONAL_MATCH' then 'PERSONAL_CHAT' else 'SERVICE_CHAT' end
        and policy.effective_at <= clock_timestamp()
      order by policy.effective_at desc, policy.created_at desc, policy.policy_id desc limit 1
    ) policy on true
    where revision.payload is not null
      and not exists (select 1 from social.chat_message_reports report
        where report.message_id = message.message_id)
      and not exists (
        select 1 from social.chat_messages recent
        where recent.chat_id = chat.chat_id
          and recent.updated_at >= clock_timestamp()
            - make_interval(secs => policy.retention_seconds)
            - make_interval(hours => $MaxRetentionDelayHours)
      )
  )
)::text;
"@
  try {
    $healthJson = (& docker compose -f $composeFile exec -T postgres psql `
      --username $DatabaseUser --dbname $Database --tuples-only --no-align `
      --command $healthQuery | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $healthJson) {
      Add-Finding 'CRITICAL' 'postgres_query' 'Operational health query failed.'
    } else {
      $metrics = $healthJson | ConvertFrom-Json
      if ([int64]$metrics.oldestOutboxSeconds -gt $MaxPipelineDelaySeconds) {
        Add-Finding 'CRITICAL' 'outbox_delay' "$($metrics.pendingOutbox) pending; oldest is $($metrics.oldestOutboxSeconds)s."
      }
      if ([int64]$metrics.overdueJobs -gt 0) {
        Add-Finding 'CRITICAL' 'worker_overdue' "$($metrics.overdueJobs) unlocked jobs are overdue."
      }
      if ([int64]$metrics.stuckLockedJobs -gt 0) {
        Add-Finding 'CRITICAL' 'worker_locked' "$($metrics.stuckLockedJobs) jobs exceed the lock threshold."
      }
      if ([int64]$metrics.overdueScheduledSessions -gt 0) {
        Add-Finding 'CRITICAL' 'session_window' "$($metrics.overdueScheduledSessions) Sessions remain SCHEDULED after the grace threshold."
      }
      if ([int64]$metrics.staleReadyForCoach -gt 0) {
        Add-Finding 'WARNING' 'coach_action' "$($metrics.staleReadyForCoach) Sessions await Coach action beyond $MaxReadyForCoachMinutes minutes."
      }
      if ([int64]$metrics.overdueResultPending -gt 0) {
        Add-Finding 'CRITICAL' 'result_pending' "$($metrics.overdueResultPending) Challenges remain RESULT_PENDING beyond 24 hours."
      }
      if ([int64]$metrics.overdueAppeals -gt 0) {
        Add-Finding 'WARNING' 'appeal_sla' "$($metrics.overdueAppeals) Appeals exceeded the effective SLA."
      }
      if ([int64]$metrics.terminalStatusLocks -gt 0) {
        Add-Finding 'CRITICAL' 'status_lock' "$($metrics.terminalStatusLocks) terminal Results still hold Competition status locks."
      }
      if ([int64]$metrics.oldMissingResultReviews -gt 0) {
        Add-Finding 'WARNING' 'missing_result_review' "$($metrics.oldMissingResultReviews) Missing Result reviews are older than 48 hours."
      }
      if ([int64]$metrics.overdueChatPayloads -gt 0) {
        Add-Finding 'WARNING' 'chat_retention' "$($metrics.overdueChatPayloads) Chat revision payloads exceed retention plus the $MaxRetentionDelayHours-hour cleanup allowance."
      }
    }
  } catch {
    Add-Finding 'CRITICAL' 'postgres_query' $_.Exception.Message
  }
}

$latestBackup = if (Test-Path -LiteralPath $backupDirectory) {
  Get-ChildItem -LiteralPath $backupDirectory -Filter '*.dump' -File |
    Where-Object { Test-Path -LiteralPath "$($_.FullName).sha256" } |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
} else { $null }
if (-not $latestBackup) {
  Add-Finding 'WARNING' 'backup_freshness' 'No backup with SHA-256 sidecar was found.'
} else {
  $backupAge = (New-TimeSpan -Start $latestBackup.LastWriteTimeUtc -End (Get-Date).ToUniversalTime()).TotalHours
  if ($backupAge -gt $MaxBackupAgeHours) {
    Add-Finding 'WARNING' 'backup_freshness' "Latest verified backup is $([Math]::Round($backupAge, 1))h old."
  }
}

if ($findings.Count -eq 0) {
  Write-Host 'Pilot health: OK'
  exit 0
}

$findings | Sort-Object severity, check | Format-Table -AutoSize
$hasCritical = @($findings | Where-Object severity -eq 'CRITICAL').Count -gt 0
$hasWarning = @($findings | Where-Object severity -eq 'WARNING').Count -gt 0
if ($hasCritical -or ($FailOnWarning -and $hasWarning)) { exit 1 }
exit 0
