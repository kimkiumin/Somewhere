[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = try {
  (& git rev-parse --show-toplevel 2>$null | Select-Object -First 1).Trim()
} catch {
  (Get-Location).Path
}

if (-not $repoRoot) {
  $repoRoot = (Get-Location).Path
}

Set-Location $repoRoot

$prototypeFiles = @()
foreach ($pattern in @("prototype/*.html", "prototype/*.css", "prototype/*.js")) {
  $prototypeFiles += @(
    Get-ChildItem -Path $pattern -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -notlike "*.test.js" } |
      Sort-Object FullName |
      ForEach-Object { $_.FullName }
  )
}

$combined = ""
foreach ($file in $prototypeFiles) {
  if (Test-Path $file) {
    $combined += "`n--- $file ---`n"
    $combined += Get-Content -Raw $file
  }
}

$requiredControls = [ordered]@{
  "Start Adventure" = "(^|[^A-Za-z])Start Adventure([^A-Za-z]|$)"
  "Move closer" = "(^|[^A-Za-z])Move closer([^A-Za-z]|$)"
  "Reveal" = "(^|[^A-Za-z])Reveal([^A-Za-z]|$)"
  "Give Up" = "(^|[^A-Za-z])Give Up([^A-Za-z]|$)"
  "Reroll" = "(^|[^A-Za-z])Reroll([^A-Za-z]|$)"
}

$requiredStates = [ordered]@{
  "Idle" = "idle"
  "Selecting" = "selecting"
  "Hidden destination ready" = "Hidden destination ready|phase:\s*(`"hidden`"|'hidden')|phase\s*===\s*(`"hidden`"|'hidden')|destination is hidden"
  "Following" = "following"
  "Near" = "near"
  "Arrived" = "arrived"
  "Revealed" = "revealed"
  "Give up" = "give-up|Give Up|give up"
  "Reroll" = "reroll"
}

$forbiddenPatterns = @(
  "navigator\.geolocation",
  "google\.maps",
  "mapbox",
  "leaflet",
  "\breviews?\b",
  "\bratings?\b",
  "\brankings?\b"
)

$hasButtonMarker = $combined -match "(?i)<button|createElement\((`"button`"|'button')\)"
if ($hasButtonMarker) {
  $missingControls = @($requiredControls.GetEnumerator() | Where-Object { $combined -notmatch $_.Value } | ForEach-Object { $_.Key })
} else {
  $missingControls = @($requiredControls.Keys)
}
$missingStates = @($requiredStates.GetEnumerator() | Where-Object { $combined -notmatch $_.Value } | ForEach-Object { $_.Key })
$forbiddenHits = @()

foreach ($pattern in $forbiddenPatterns) {
  if ($combined -match $pattern) {
    $forbiddenHits += $pattern
  }
}

if ($missingControls.Count -eq 0 -and $missingStates.Count -eq 0 -and $forbiddenHits.Count -eq 0) {
  Write-Output "Prototype UX contract markers OK."
  exit 0
}

if ($missingControls.Count -gt 0) {
  Write-Output ("Missing controls: " + ($missingControls -join ", "))
}
if ($missingStates.Count -gt 0) {
  Write-Output ("Missing states: " + ($missingStates -join ", "))
}
if ($forbiddenHits.Count -gt 0) {
  Write-Output ("Forbidden prototype markers found: " + ($forbiddenHits -join ", "))
}

exit 1
