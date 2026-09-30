param(
  [string]$ApiBaseUrl = 'http://localhost:3000',
  [string]$CandidateId = '0199a1b2-1234-7000-8000-000000000554',
  [string]$AthleteId = '0199a1b2-1234-7000-8000-000000000101',
  [string]$AthleteToken = '',
  [string]$CandidateToken = '',
  [string]$RunKey = ''
)

$ErrorActionPreference = 'Stop'
$effectiveAthleteToken = if ($AthleteToken) {
  $AthleteToken
} elseif ($env:LOCAL_AUTH_TOKEN) {
  $env:LOCAL_AUTH_TOKEN
} else {
  'molokh-local-athlete-token'
}
$effectiveCandidateToken = if ($CandidateToken) {
  $CandidateToken
} elseif ($env:LOCAL_DISCOVERY_AUTH_TOKEN) {
  $env:LOCAL_DISCOVERY_AUTH_TOKEN
} else {
  'molokh-local-discovery-token'
}
$effectiveRunKey = if ($RunKey) {
  $RunKey
} else {
  [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString()
}

function Get-LocalMatches {
  param([Parameter(Mandatory)] [string]$Token)

  (Invoke-RestMethod `
    -Method Get `
    -Uri "$ApiBaseUrl/api/v1/matches" `
    -Headers @{ Authorization = "Bearer $Token" }).data
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

$existingMatch = Get-LocalMatches -Token $effectiveAthleteToken |
  Where-Object { $_.counterpartUserId -eq $CandidateId } |
  Select-Object -First 1
if ($existingMatch) {
  [pscustomobject]@{
    FirstAction = 'EXISTING_MATCH'
    SecondAction = 'EXISTING_MATCH'
    MatchId = $existingMatch.matchId
    ChatId = $existingMatch.chatId
    Replayed = $false
  } | Format-List
  exit 0
}

$first = Invoke-LocalLike `
  -Token $effectiveAthleteToken `
  -TargetUserId $CandidateId `
  -IdempotencyKey "local-demo-$AthleteId-likes-$CandidateId-$effectiveRunKey"
$second = Invoke-LocalLike `
  -Token $effectiveCandidateToken `
  -TargetUserId $AthleteId `
  -IdempotencyKey "local-demo-$CandidateId-likes-$AthleteId-$effectiveRunKey"

$activeMatch = Get-LocalMatches -Token $effectiveAthleteToken |
  Where-Object {
    $_.matchId -eq $second.data.match.matchId -and
    $_.counterpartUserId -eq $CandidateId
  } |
  Select-Object -First 1
if (-not $activeMatch) {
  throw 'The like commands did not produce an active Match. Check pair suppression and use another demo candidate if needed.'
}

[pscustomobject]@{
  FirstAction = $first.data.action
  SecondAction = $second.data.action
  MatchId = $activeMatch.matchId
  ChatId = $activeMatch.chatId
  Replayed = $second.meta.replayed
} | Format-List
