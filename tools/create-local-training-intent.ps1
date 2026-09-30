param(
  [string]$ApiBaseUrl = 'http://localhost:3000',
  [string]$ChatId = '01a07c21-e485-7407-9c20-55ca7feb2287'
)

$ErrorActionPreference = 'Stop'
$athleteToken = if ($env:LOCAL_AUTH_TOKEN) {
  $env:LOCAL_AUTH_TOKEN
} else {
  'molokh-local-athlete-token'
}
$partnerToken = if ($env:LOCAL_DISCOVERY_AUTH_TOKEN) {
  $env:LOCAL_DISCOVERY_AUTH_TOKEN
} else {
  'molokh-local-discovery-token'
}

function Invoke-IntentCommand {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [Parameter(Mandatory)] [string]$Token,
    [Parameter(Mandatory)] [string]$IdempotencyKey,
    [Parameter(Mandatory)] [int]$Version,
    [Parameter(Mandatory)] [hashtable]$Body
  )

  Invoke-RestMethod `
    -Method Post `
    -Uri "$ApiBaseUrl$Path" `
    -Headers @{
      Authorization = "Bearer $Token"
      'Idempotency-Key' = $IdempotencyKey
      'If-Match' = '"' + [string]$Version + '"'
    } `
    -ContentType 'application/json; charset=utf-8' `
    -Body ($Body | ConvertTo-Json -Compress)
}

$options = Invoke-RestMethod `
  -Method Get `
  -Uri "$ApiBaseUrl/api/v1/chats/$ChatId/training-options" `
  -Headers @{ Authorization = "Bearer $athleteToken" }

$booking = $options.data.activeIntent.booking
if (-not $booking) {
  $slot = $options.data.slots | Select-Object -First 1
  if (-not $slot) { throw 'No published personal Slot is available.' }
  $selected = Invoke-IntentCommand `
    -Path '/api/v1/bookings' `
    -Token $athleteToken `
    -IdempotencyKey "local-intent-$ChatId-$($slot.slotId)-select-v1" `
    -Version 0 `
    -Body @{
      chatId = $ChatId
      slotId = $slot.slotId
      commercialVersion = $slot.commercialVersion
    }
  $booking = (Invoke-IntentCommand `
    -Path "/api/v1/bookings/$($selected.data.bookingId)/select-same" `
    -Token $partnerToken `
    -IdempotencyKey "local-intent-$ChatId-$($slot.slotId)-confirm-v1" `
    -Version $selected.data.version `
    -Body @{ commercialVersion = $slot.commercialVersion }).data
}

$groupPlan = $options.data.activeIntent.groupPlan
if (-not $groupPlan) {
  $offering = $options.data.groupOfferings | Select-Object -First 1
  if (-not $offering) { throw 'No published GroupOffering is available.' }
  $proposed = Invoke-IntentCommand `
    -Path '/api/v1/group-plans' `
    -Token $athleteToken `
    -IdempotencyKey "local-intent-$ChatId-$($offering.groupOfferingId)-propose-v1" `
    -Version 0 `
    -Body @{
      chatId = $ChatId
      groupOfferingId = $offering.groupOfferingId
      offeringVersion = $offering.version
    }
  $groupPlan = (Invoke-IntentCommand `
    -Path "/api/v1/group-plans/$($proposed.data.groupPlanId)/confirm" `
    -Token $partnerToken `
    -IdempotencyKey "local-intent-$ChatId-$($offering.groupOfferingId)-confirm-v1" `
    -Version $proposed.data.version `
    -Body @{}).data
}

[pscustomobject]@{
  BookingId = $booking.bookingId
  BookingState = $booking.state
  SlotReserved = $false
  GroupPlanId = $groupPlan.groupPlanId
  GroupPlanState = $groupPlan.state
  GroupCapacityReserved = $false
} | Format-List
