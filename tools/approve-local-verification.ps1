$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$apiBaseUrl = if ($env:MOLOKH_API_URL) { $env:MOLOKH_API_URL.TrimEnd('/') } else { 'http://localhost:3000' }
$centralToken = if ($env:LOCAL_CENTRAL_AUTH_TOKEN) { $env:LOCAL_CENTRAL_AUTH_TOKEN } else { 'molokh-local-central-token' }
$client = [System.Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $centralToken)

try {
  $queueResponse = $client.GetAsync("$apiBaseUrl/api/v1/central/verifications").GetAwaiter().GetResult()
  [void]$queueResponse.EnsureSuccessStatusCode()
  $queue = $queueResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
  $verification = @($queue.data) | Select-Object -First 1
  if (-not $verification) {
    Write-Output 'No pending verification requests.'
    exit 0
  }

  $request = [System.Net.Http.HttpRequestMessage]::new(
    [System.Net.Http.HttpMethod]::Post,
    "$apiBaseUrl/api/v1/central/verifications/$($verification.verificationId)/approve"
  )
  [void]$request.Headers.TryAddWithoutValidation(
    'Idempotency-Key',
    "local-central-approve:$($verification.verificationId):v$($verification.version)"
  )
  [void]$request.Headers.TryAddWithoutValidation('If-Match', [string]$verification.version)
  $body = @{
    userId = $verification.userId
    moderationChecklistVersion = $verification.moderationChecklistVersion
  } | ConvertTo-Json -Compress
  $request.Content = [System.Net.Http.StringContent]::new(
    $body,
    [System.Text.Encoding]::UTF8,
    'application/json'
  )

  $approvalResponse = $client.SendAsync($request).GetAwaiter().GetResult()
  [void]$approvalResponse.EnsureSuccessStatusCode()
  $approval = $approvalResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
  [pscustomobject]@{
    VerificationId = $verification.verificationId
    UserId = $verification.userId
    DisplayName = $approval.data.displayName
    State = $approval.data.accountVerificationState
    EventId = $approval.meta.eventId
    Replayed = $approval.meta.replayed
  }
} finally {
  $client.Dispose()
}
