$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$apiBaseUrl = if ($env:MOLOKH_API_URL) { $env:MOLOKH_API_URL.TrimEnd('/') } else { 'http://localhost:3000' }
$centralToken = if ($env:LOCAL_CENTRAL_AUTH_TOKEN) { $env:LOCAL_CENTRAL_AUTH_TOKEN } else { 'molokh-local-central-token' }
$coachToken = if ($env:LOCAL_COACH_AUTH_TOKEN) { $env:LOCAL_COACH_AUTH_TOKEN } else { 'molokh-local-coach-token' }
$communityId = '0199a1b2-1234-7000-8000-000000000502'
$coachUserId = '0199a1b2-1234-7000-8000-000000000508'
$centralClient = [System.Net.Http.HttpClient]::new()
$coachClient = [System.Net.Http.HttpClient]::new()
$centralClient.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $centralToken)
$coachClient.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $coachToken)

try {
  $contextResponse = $coachClient.GetAsync("$apiBaseUrl/api/v1/me/community").GetAwaiter().GetResult()
  [void]$contextResponse.EnsureSuccessStatusCode()
  $context = $contextResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
  $activeCoachGrant = @($context.data.activeRoleGrants) |
    Where-Object { $_.role -eq 'COACH' -and $_.scopeId -eq $communityId } |
    Select-Object -First 1
  if ($activeCoachGrant) {
    [pscustomobject]@{
      UserId = $coachUserId
      CommunityId = $communityId
      State = 'ACTIVE'
      ResultCapability = @($context.data.access.capabilities) -contains 'RECORD_COMMUNITY_RESULT'
      Changed = $false
    }
    exit 0
  }

  $queueResponse = $coachClient.GetAsync("$apiBaseUrl/api/v1/me/coach-invites").GetAwaiter().GetResult()
  [void]$queueResponse.EnsureSuccessStatusCode()
  $queue = $queueResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
  $invitation = @($queue.data) | Select-Object -First 1

  if (-not $invitation) {
    $inviteRequest = [System.Net.Http.HttpRequestMessage]::new(
      [System.Net.Http.HttpMethod]::Post,
      "$apiBaseUrl/api/v1/communities/$communityId/coach-invites"
    )
    [void]$inviteRequest.Headers.TryAddWithoutValidation(
      'Idempotency-Key',
      "local-pilot-coach-invite:$coachUserId"
    )
    $inviteBody = @{
      userId = $coachUserId
      reasonCode = 'PILOT_COACH'
    } | ConvertTo-Json -Compress
    $inviteRequest.Content = [System.Net.Http.StringContent]::new(
      $inviteBody,
      [System.Text.Encoding]::UTF8,
      'application/json'
    )
    $inviteResponse = $centralClient.SendAsync($inviteRequest).GetAwaiter().GetResult()
    [void]$inviteResponse.EnsureSuccessStatusCode()
    $inviteResult = $inviteResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
    $invitation = $inviteResult.data
  }

  $acceptRequest = [System.Net.Http.HttpRequestMessage]::new(
    [System.Net.Http.HttpMethod]::Post,
    "$apiBaseUrl/api/v1/me/coach-invites/$($invitation.grantId)/accept"
  )
  [void]$acceptRequest.Headers.TryAddWithoutValidation(
    'Idempotency-Key',
    "local-pilot-coach-accept:$($invitation.grantId):v$($invitation.version)"
  )
  [void]$acceptRequest.Headers.TryAddWithoutValidation('If-Match', [string]$invitation.version)
  $acceptRequest.Content = [System.Net.Http.StringContent]::new(
    '{}',
    [System.Text.Encoding]::UTF8,
    'application/json'
  )
  $acceptResponse = $coachClient.SendAsync($acceptRequest).GetAwaiter().GetResult()
  [void]$acceptResponse.EnsureSuccessStatusCode()
  $accepted = $acceptResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json

  [pscustomobject]@{
    GrantId = $accepted.data.grantId
    UserId = $accepted.data.userId
    CommunityId = $accepted.data.scopeId
    State = $accepted.data.state
    Version = $accepted.data.version
    EventId = $accepted.meta.eventId
    Replayed = $accepted.meta.replayed
    Changed = $true
  }
} finally {
  $centralClient.Dispose()
  $coachClient.Dispose()
}
