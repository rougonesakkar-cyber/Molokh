[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$TargetRef,
  [string]$Database = $(if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'molokh' }),
  [string]$DatabaseUser = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'molokh' })
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$composeFile = Join-Path $projectRoot 'infra\compose.yaml'

function Get-GitBlobSha256([string]$Commit, [string]$GitPath) {
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = 'git'
  $startInfo.WorkingDirectory = $projectRoot
  $startInfo.Arguments = "cat-file blob `"$Commit`:$GitPath`""
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw "Could not read $GitPath from target commit." }
  try {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
      $hash = $algorithm.ComputeHash($process.StandardOutput.BaseStream)
    } finally {
      $algorithm.Dispose()
    }
    $errorOutput = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
      throw "Could not read $GitPath from target commit: $errorOutput"
    }
    return ([System.BitConverter]::ToString($hash)).Replace('-', '').ToLowerInvariant()
  } finally {
    $process.Dispose()
  }
}

if ($Database -notmatch '^[a-z][a-z0-9_]*$') {
  throw 'Database must contain only lower-case letters, digits and underscores.'
}
if ($DatabaseUser -notmatch '^[a-z][a-z0-9_]*$') {
  throw 'DatabaseUser must contain only lower-case letters, digits and underscores.'
}

Push-Location $projectRoot
try {
  $resolvedTarget = (& git rev-parse --verify "$TargetRef^{commit}" | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $resolvedTarget -notmatch '^[0-9a-f]{40}$') {
    throw "TargetRef '$TargetRef' does not resolve to a local commit."
  }

  & docker compose -f $composeFile up -d --wait postgres | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL did not become healthy.' }

  $rows = & docker compose -f $composeFile exec -T postgres psql `
    --username $DatabaseUser --dbname $Database --tuples-only --no-align `
    --command "select migration_name || '|' || coalesce(migration_sha256, '') from platform.schema_migrations order by migration_name"
  if ($LASTEXITCODE -ne 0) { throw 'Could not read the applied migration ledger.' }

  $appliedMigrations = @($rows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($appliedMigrations.Count -eq 0) {
    throw 'The applied migration ledger is empty; rollback compatibility cannot be established.'
  }

  $targetPaths = @(& git ls-tree -r --name-only $resolvedTarget -- packages/db/migrations)
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect target migration files.' }
  $targetPathSet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($path in $targetPaths) { [void]$targetPathSet.Add($path) }

  $findings = [System.Collections.Generic.List[string]]::new()
  foreach ($row in $appliedMigrations) {
    $parts = $row -split '\|', 2
    $migrationName = $parts[0]
    $appliedChecksum = if ($parts.Count -gt 1) { $parts[1] } else { '' }
    if ($migrationName -notmatch '^\d{4}_.+\.sql$') {
      $findings.Add("Applied ledger contains an invalid migration name: $migrationName")
      continue
    }
    if ($appliedChecksum -notmatch '^[0-9a-f]{64}$') {
      $findings.Add("Applied migration has no valid SHA-256: $migrationName")
      continue
    }

    $gitPath = "packages/db/migrations/$migrationName"
    if (-not $targetPathSet.Contains($gitPath)) {
      $findings.Add("Target omits applied migration: $migrationName")
      continue
    }

    $targetChecksum = Get-GitBlobSha256 $resolvedTarget $gitPath
    if ($targetChecksum -ne $appliedChecksum) {
      $findings.Add("Target checksum differs from applied migration: $migrationName")
    }
  }

  if ($findings.Count -gt 0) {
    Write-Error ("Rollback compatibility FAILED for {0} ({1}):`n- {2}" -f `
      $TargetRef, $resolvedTarget.Substring(0, 12), ($findings -join "`n- "))
    exit 1
  }

  $ceiling = ($appliedMigrations[-1] -split '\|', 2)[0]
  Write-Host ("Rollback compatibility passed for {0} ({1})." -f `
    $TargetRef, $resolvedTarget.Substring(0, 12))
  Write-Host "Verified $($appliedMigrations.Count) applied migration(s); ceiling: $ceiling."
  Write-Host 'This gate validates immutable schema history only; deployment smoke and health gates are still required.'
} finally {
  Pop-Location
}
