[CmdletBinding()]
param(
  [string]$ApiBaseUrl = 'http://localhost:3000',
  [Parameter(Mandatory = $true)]
  [string]$ExpectedRelease,
  [string]$ExpectedWebOrigin
)

$ErrorActionPreference = 'Stop'

function Invoke-SuccessProbe([string]$Path, [hashtable]$Headers = @{}) {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "$ApiBaseUrl$Path" `
    -Headers $Headers -TimeoutSec 10
  if ($response.StatusCode -ne 200) {
    throw "$Path returned HTTP $($response.StatusCode), expected 200."
  }
  return $response
}

function Assert-Unauthorized([string]$Path) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$ApiBaseUrl$Path" -TimeoutSec 10
    throw "$Path returned HTTP $($response.StatusCode), expected 401 without credentials."
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -ne 401) { throw }
  }
}

try {
  $apiUri = [Uri]$ApiBaseUrl
} catch {
  throw 'ApiBaseUrl must be an absolute HTTP(S) URL.'
}
if (-not $apiUri.IsAbsoluteUri -or $apiUri.Scheme -notin @('http', 'https') `
  -or $apiUri.Query -or $apiUri.Fragment) {
  throw 'ApiBaseUrl must be an absolute HTTP(S) URL without query or fragment.'
}
$ApiBaseUrl = $ApiBaseUrl.TrimEnd('/')

if ($ExpectedRelease -ne 'development' -and $ExpectedRelease -notmatch '^[0-9a-f]{40}$') {
  throw 'ExpectedRelease must be development or a full lower-case Git commit SHA.'
}
if ($ExpectedWebOrigin) {
  try { $originUri = [Uri]$ExpectedWebOrigin } catch { throw 'ExpectedWebOrigin must be an absolute URL.' }
  if (-not $originUri.IsAbsoluteUri -or $originUri.Scheme -notin @('http', 'https') `
    -or $originUri.PathAndQuery -ne '/' -or $originUri.Fragment) {
    throw 'ExpectedWebOrigin must be an HTTP(S) origin without path, query or fragment.'
  }
  $ExpectedWebOrigin = $ExpectedWebOrigin.TrimEnd('/')
}

$live = Invoke-SuccessProbe '/health/live'
$livePayload = $live.Content | ConvertFrom-Json
if ($livePayload.status -ne 'ok' -or $livePayload.service -ne 'molokh-api' `
  -or [int]$livePayload.contractVersion -ne 1) {
  throw 'Liveness response does not match the Molokh health contract.'
}
if ($live.Headers['X-Content-Type-Options'] -ne 'nosniff') {
  throw 'API response is missing X-Content-Type-Options: nosniff.'
}
if (-not $live.Headers['X-Frame-Options']) {
  throw 'API response is missing X-Frame-Options.'
}

$ready = Invoke-SuccessProbe '/health/ready'
$readyPayload = $ready.Content | ConvertFrom-Json
if ($readyPayload.status -ne 'ok' -or $readyPayload.service -ne 'molokh-api') {
  throw 'Readiness response does not match the Molokh health contract.'
}

$runtimeHeaders = @{}
if ($ExpectedWebOrigin) { $runtimeHeaders.Origin = $ExpectedWebOrigin }
$runtime = Invoke-SuccessProbe '/v1/meta/runtime' $runtimeHeaders
$runtimePayload = $runtime.Content | ConvertFrom-Json
if ($runtimePayload.architecture -ne 'modular-monolith' `
  -or $runtimePayload.apiTransport -ne 'https+sse' `
  -or $runtimePayload.database -ne 'postgresql-18') {
  throw 'Runtime projection does not match the supported Molokh deployment contract.'
}
if ($runtimePayload.releaseSha -ne $ExpectedRelease) {
  throw "Release mismatch: expected $ExpectedRelease, received $($runtimePayload.releaseSha)."
}
if (@($runtimePayload.clients) -join ',' -ne 'web,ios,android') {
  throw 'Runtime projection does not advertise the complete universal client set.'
}
if ($ExpectedWebOrigin `
  -and $runtime.Headers['Access-Control-Allow-Origin'] -ne $ExpectedWebOrigin) {
  throw "CORS does not allow the expected Web origin $ExpectedWebOrigin."
}

Assert-Unauthorized '/api/v1/me'

Write-Host "Release canary passed for $ExpectedRelease at $ApiBaseUrl."
Write-Host 'Verified liveness, PostgreSQL readiness, runtime identity, security headers and auth boundary.'
if ($ExpectedWebOrigin) { Write-Host "Verified CORS origin: $ExpectedWebOrigin." }
