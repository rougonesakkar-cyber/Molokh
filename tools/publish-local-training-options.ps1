param(
  [string]$ApiBaseUrl = 'http://localhost:3000'
)

$ErrorActionPreference = 'Stop'
$venueId = '0199a1b2-1234-7000-8000-000000000501'
$coachUserId = '0199a1b2-1234-7000-8000-000000000508'
$adminToken = if ($env:LOCAL_ADMIN_AUTH_TOKEN) {
  $env:LOCAL_ADMIN_AUTH_TOKEN
} else {
  'molokh-local-admin-token'
}

function Publish-TrainingResource {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [Parameter(Mandatory)] [string]$IdempotencyKey,
    [Parameter(Mandatory)] [hashtable]$Body
  )

  Invoke-RestMethod `
    -Method Post `
    -Uri "$ApiBaseUrl$Path" `
    -Headers @{
      Authorization = "Bearer $adminToken"
      'Idempotency-Key' = $IdempotencyKey
      'If-Match' = '0'
    } `
    -ContentType 'application/json; charset=utf-8' `
    -Body ($Body | ConvertTo-Json -Compress)
}

$utcToday = (Get-Date).ToUniversalTime().Date
$slotStart = $utcToday.AddDays(2).AddHours(17)
$slotEnd = $slotStart.AddHours(1)
$groupStart = $utcToday.AddDays(3).AddHours(18)
$groupEnd = $groupStart.AddHours(1)
$dateKey = $utcToday.ToString('yyyy-MM-dd')

try {
  $slot = Publish-TrainingResource `
    -Path "/api/v1/venues/$venueId/slots" `
    -IdempotencyKey "local-pilot-slot-$dateKey-v1" `
    -Body @{
      coachUserId = $coachUserId
      startAt = $slotStart.ToString('o')
      endAt = $slotEnd.ToString('o')
      priceAmount = '1500.00'
      priceCurrency = 'RUB'
      priceText = 'Оплата напрямую залу'
      cancellationTermsText = 'Условия переноса уточните у зала'
    }
  $group = Publish-TrainingResource `
    -Path "/api/v1/venues/$venueId/group-offerings" `
    -IdempotencyKey "local-pilot-group-$dateKey-v1" `
    -Body @{
      sportCode = 'BOXING'
      classLabel = 'Открытая групповая тренировка по боксу'
      startAt = $groupStart.ToString('o')
      endAt = $groupEnd.ToString('o')
      coachDisplayName = 'Пилотный тренер'
      priceText = 'Стоимость и свободные места уточните у зала'
    }

  [pscustomobject]@{
    SlotId = $slot.data.slotId
    SlotStart = $slot.data.startAt
    SlotReplayed = $slot.meta.replayed
    GroupOfferingId = $group.data.groupOfferingId
    GroupStart = $group.data.startAt
    GroupReplayed = $group.meta.replayed
  } | Format-List
} catch {
  $details = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
  Write-Error "Could not publish schedule. Run activate-local-coach.ps1 and configure-local-venue-admins.ps1 first while the API is running. $details"
}
