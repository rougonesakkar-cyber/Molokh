[CmdletBinding()]
param(
  [string]$Database = $(if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'molokh' }),
  [string]$DatabaseUser = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'molokh' })
)

$ErrorActionPreference = 'Stop'
$startedAt = (Get-Date).ToUniversalTime()
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')
$targetDatabase = "molokh_restore_rehearsal_$stamp"
$backupPath = & (Join-Path $PSScriptRoot 'backup-postgres.ps1') `
  -Database $Database -DatabaseUser $DatabaseUser

& (Join-Path $PSScriptRoot 'restore-postgres-rehearsal.ps1') `
  -BackupPath $backupPath -SourceDatabase $Database `
  -TargetDatabase $targetDatabase -DatabaseUser $DatabaseUser -DropAfterVerification

$stopwatch.Stop()
Write-Host "Recovery rehearsal completed. Started UTC: $($startedAt.ToString('o')); RTO: $([Math]::Round($stopwatch.Elapsed.TotalSeconds, 2)) seconds."
