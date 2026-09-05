$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$composeFile = Join-Path $projectRoot 'infra\compose.yaml'
$testDatabase = 'molokh_test'
$testConnectionString = "postgres://molokh:local-only-password@localhost:5432/$testDatabase"

Push-Location $projectRoot
try {
  docker compose -f $composeFile up -d --wait postgres
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  $exists = docker compose -f $composeFile exec -T postgres `
    psql -U molokh -d postgres -tAc "select 1 from pg_database where datname = '$testDatabase'"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  if ([string]::IsNullOrWhiteSpace($exists)) {
    docker compose -f $composeFile exec -T postgres createdb -U molokh $testDatabase
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }

  $env:DATABASE_TEST_URL = $testConnectionString
  pnpm --filter '@molokh/db' test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}
