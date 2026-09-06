$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$apiBaseUrl = if ($env:MOLOKH_API_URL) { $env:MOLOKH_API_URL.TrimEnd('/') } else { 'http://localhost:3000' }
$centralToken = if ($env:LOCAL_CENTRAL_AUTH_TOKEN) { $env:LOCAL_CENTRAL_AUTH_TOKEN } else { 'molokh-local-central-token' }
$venueId = '0199a1b2-1234-7000-8000-000000000501'
$adminUserId = '0199a1b2-1234-7000-8000-000000000509'
$coachUserId = '0199a1b2-1234-7000-8000-000000000508'
$client = [System.Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $centralToken)

function Read-RoleSummary {
  $response = $client.GetAsync("$apiBaseUrl/api/v1/central/venues/$venueId/roles").GetAwaiter().GetResult()
  [void]$response.EnsureSuccessStatusCode()
  return $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
}

function Send-JsonCommand {
  param(
    [Parameter(Mandatory = $true)][System.Net.Http.HttpMethod]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$IdempotencyKey,
    [Parameter(Mandatory = $true)][hashtable]$Body,
    [Nullable[int]]$ExpectedVersion = $null
  )

  $request = [System.Net.Http.HttpRequestMessage]::new($Method, "$apiBaseUrl$Path")
  [void]$request.Headers.TryAddWithoutValidation('Idempotency-Key', $IdempotencyKey)
  if ($null -ne $ExpectedVersion) {
    [void]$request.Headers.TryAddWithoutValidation('If-Match', [string]$ExpectedVersion)
  }
  $request.Content = [System.Net.Http.StringContent]::new(
    ($Body | ConvertTo-Json -Compress),
    [System.Text.Encoding]::UTF8,
    'application/json'
  )
  $response = $client.SendAsync($request).GetAwaiter().GetResult()
  [void]$response.EnsureSuccessStatusCode()
  return $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
}

try {
  $summary = Read-RoleSummary
  foreach ($userId in @($adminUserId, $coachUserId)) {
    $activeAdmin = @($summary.data.activeGrants) |
      Where-Object { $_.role -eq 'GYM_ADMIN' -and $_.userId -eq $userId } |
      Select-Object -First 1
    if (-not $activeAdmin) {
      [void](Send-JsonCommand `
        -Method ([System.Net.Http.HttpMethod]::Post) `
        -Path "/api/v1/central/venues/$venueId/admins" `
        -IdempotencyKey "local-pilot-gym-admin:$userId" `
        -Body @{ userId = $userId; reasonCode = 'PILOT_VENUE_ADMIN' })
      $summary = Read-RoleSummary
    }
  }

  $currentPrimary = @($summary.data.activeGrants) |
    Where-Object { $_.role -eq 'PRIMARY_ADMIN' } |
    Select-Object -First 1
  if (-not $currentPrimary -or $currentPrimary.userId -ne $adminUserId) {
    $version = [int]$summary.data.primaryAdminVersion
    [void](Send-JsonCommand `
      -Method ([System.Net.Http.HttpMethod]::Put) `
      -Path "/api/v1/central/venues/$venueId/primary-admin" `
      -IdempotencyKey "local-pilot-primary-admin:$adminUserId`:v$version" `
      -ExpectedVersion $version `
      -Body @{ userId = $adminUserId; reasonCode = 'PILOT_PRIMARY_ADMIN' })
    $summary = Read-RoleSummary
  }

  $primary = @($summary.data.activeGrants) |
    Where-Object { $_.role -eq 'PRIMARY_ADMIN' } |
    Select-Object -First 1
  [pscustomobject]@{
    VenueId = $summary.data.venueId
    PrimaryAdminUserId = $primary.userId
    PrimaryAdminVersion = $summary.data.primaryAdminVersion
    ActiveGymAdminCount = @($summary.data.activeGrants | Where-Object { $_.role -eq 'GYM_ADMIN' }).Count
    ActivePrimaryAdminCount = @($summary.data.activeGrants | Where-Object { $_.role -eq 'PRIMARY_ADMIN' }).Count
  }
} finally {
  $client.Dispose()
}
