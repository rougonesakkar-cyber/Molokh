param(
  [string]$ApiBaseUrl = 'http://localhost:3000'
)

$ErrorActionPreference = 'Stop'
$candidateId = '0199a1b2-1234-7000-8000-000000000554'
$athleteId = '0199a1b2-1234-7000-8000-000000000101'
$athleteToken = if ($env:LOCAL_AUTH_TOKEN) {
  $env:LOCAL_AUTH_TOKEN
} else {
  'molokh-local-athlete-token'
}
$candidateToken = if ($env:LOCAL_DISCOVERY_AUTH_TOKEN) {
  $env:LOCAL_DISCOVERY_AUTH_TOKEN
} else {
  'molokh-local-discovery-token'
}

function Invoke-LocalLike {
  param(
    [Parameter(Mandatory)] [string]$Token,
    [Parameter(Mandatory)] [string]$TargetUserId,
    [Parameter(Mandatory)] [string]$IdempotencyKey
  )

  Invoke-RestMethod `
    -Method Post `
    -Uri "$ApiBaseUrl/api/v1/discovery/$TargetUserId/like" `
    -Headers @{
      Authorization = "Bearer $Token"
      'Idempotency-Key' = $IdempotencyKey
      'If-Match' = '0'
    } `
    -ContentType 'application/json; charset=utf-8' `
    -Body '{}'
}

$first = Invoke-LocalLike `
  -Token $athleteToken `
  -TargetUserId $candidateId `
  -IdempotencyKey 'local-demo-athlete-likes-candidate-v1'
$second = Invoke-LocalLike `
  -Token $candidateToken `
  -TargetUserId $athleteId `
  -IdempotencyKey 'local-demo-candidate-likes-athlete-v1'

[pscustomobject]@{
  FirstAction = $first.data.action
  SecondAction = $second.data.action
  MatchId = $second.data.match.matchId
  ChatId = $second.data.match.chatId
  Replayed = $second.meta.replayed
} | Format-List
