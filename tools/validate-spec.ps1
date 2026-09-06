[CmdletBinding()]
param(
    [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = Split-Path -Parent $PSScriptRoot
}
$specRoot = Join-Path $ProjectRoot 'core-engine-spec'
$errors = [System.Collections.Generic.List[string]]::new()

if (-not (Test-Path -LiteralPath $specRoot -PathType Container)) {
    throw "Spec directory not found: $specRoot"
}

$files = @(Get-ChildItem -LiteralPath $specRoot -Filter '*.md' -File)
$statePath = Join-Path $specRoot 'STATE_MACHINES.md'
$eventsPath = Join-Path $specRoot 'EVENTS_AND_INVARIANTS.md'
$acceptancePath = Join-Path $specRoot 'ACCEPTANCE_SCENARIOS.md'
$questionsPath = Join-Path $specRoot 'OPEN_QUESTIONS.md'

$stateLines = @(Get-Content -LiteralPath $statePath)
$transitionRows = @($stateLines | Where-Object { $_ -match '^\| ([A-Z]+-\d+) \|' })
$transitionIds = @($transitionRows | ForEach-Object {
    [regex]::Match($_, '^\| ([A-Z]+-\d+) \|').Groups[1].Value
})

$duplicateTransitions = @($transitionIds | Group-Object | Where-Object Count -gt 1)
foreach ($duplicate in $duplicateTransitions) {
    $errors.Add("Duplicate transition ID: $($duplicate.Name)")
}

$usedEvents = [System.Collections.Generic.HashSet[string]]::new()
foreach ($line in $transitionRows) {
    $parts = $line.Split('|')
    if ($parts.Count -le 6) {
        $errors.Add("Malformed transition row: $line")
        continue
    }

    $pattern = [char]96 + '([^' + [char]96 + ']*)' + [char]96
    foreach ($match in [regex]::Matches($parts[6], $pattern)) {
        $value = $match.Groups[1].Value
        $names = if ($value -match ' or ') { $value -split ' or ' } else { @($value) }
        foreach ($name in $names) {
            $normalized = ($name -replace '\(.*$', '').Trim()
            if ($normalized) {
                [void]$usedEvents.Add($normalized)
            }
        }
    }
}

$eventLines = @(Get-Content -LiteralPath $eventsPath)
$registryHeading = $eventLines | Select-String '^## 12\. Exact state-transition event registry' | Select-Object -First 1
if (-not $registryHeading) {
    $errors.Add('Exact event registry heading is missing')
    $registryStart = $eventLines.Count
} else {
    $registryStart = $registryHeading.LineNumber
}

$registryLines = @()
for ($index = $registryStart; $index -lt $eventLines.Count; $index++) {
    $value = $eventLines[$index].Trim()
    if ($value -match '^[A-Z][A-Za-z0-9]+$') {
        $registryLines += $value
    }
}

foreach ($duplicate in @($registryLines | Group-Object | Where-Object Count -gt 1)) {
    $errors.Add("Duplicate registry event: $($duplicate.Name)")
}

$registry = [System.Collections.Generic.HashSet[string]]::new()
foreach ($eventName in $registryLines) {
    [void]$registry.Add($eventName)
}
foreach ($eventName in $usedEvents) {
    if (-not $registry.Contains($eventName)) {
        $errors.Add("Transition event is not registered: $eventName")
    }
}

$acceptanceLines = @(Get-Content -LiteralPath $acceptancePath)
$acceptanceIds = @($acceptanceLines | ForEach-Object {
    if ($_ -match '^\| AC-(\d{3}) \|') { [int]$Matches[1] }
})
foreach ($duplicate in @($acceptanceIds | Group-Object | Where-Object Count -gt 1)) {
    $errors.Add("Duplicate acceptance ID: AC-$('{0:D3}' -f [int]$duplicate.Name)")
}
if ($acceptanceIds.Count -gt 0) {
    $maxAcceptance = ($acceptanceIds | Measure-Object -Maximum).Maximum
    foreach ($expected in 1..$maxAcceptance) {
        if ($expected -notin $acceptanceIds) {
            $errors.Add("Missing acceptance ID: AC-$('{0:D3}' -f $expected)")
        }
    }
} else {
    $maxAcceptance = 0
    $errors.Add('No acceptance scenarios found')
}

$brokenLinks = [System.Collections.Generic.List[string]]::new()
foreach ($file in $files) {
    $raw = Get-Content -LiteralPath $file.FullName -Raw
    $fenceCount = ([regex]::Matches($raw, '(?m)^```')).Count
    if ($fenceCount % 2 -ne 0) {
        $errors.Add("Unbalanced code fence: $($file.Name)")
    }
    if ($raw.Contains([char]0xFFFD)) {
        $errors.Add("Replacement character found: $($file.Name)")
    }

    foreach ($match in [regex]::Matches($raw, '\[[^\]]+\]\(([^)]+)\)')) {
        $target = $match.Groups[1].Value.Trim('<', '>')
        if ($target -match '^(https?://|#|codex:|mailto:)') { continue }
        $relativePath = ($target -split '#')[0]
        $resolved = Join-Path (Split-Path -Parent $file.FullName) $relativePath
        if (-not (Test-Path -LiteralPath $resolved)) {
            $brokenLinks.Add("$($file.Name): $target")
        }
    }
}
foreach ($broken in $brokenLinks) {
    $errors.Add("Broken relative link: $broken")
}

$openQuestionCount = (Select-String -LiteralPath $questionsPath -Pattern '^### OQ-' | Measure-Object).Count
$priorityCounts = @{}
foreach ($priority in 'P0', 'P1', 'P2') {
    $priorityCounts[$priority] = @($acceptanceLines | Where-Object { $_ -match "^\| AC-\d{3} \| $priority \|" }).Count
}

$summary = [ordered]@{
    MarkdownFiles = $files.Count
    TransitionRows = $transitionRows.Count
    TransitionEvents = $usedEvents.Count
    RegistryEvents = $registry.Count
    AcceptanceScenarios = $acceptanceIds.Count
    AcceptanceP0 = $priorityCounts.P0
    AcceptanceP1 = $priorityCounts.P1
    AcceptanceP2 = $priorityCounts.P2
    OpenQuestions = $openQuestionCount
    Errors = $errors.Count
}

[pscustomobject]$summary | Format-List

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host 'Specification validation passed.'
