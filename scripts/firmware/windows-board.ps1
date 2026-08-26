param(
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet("setup", "compile", "ports", "upload", "monitor")]
    [string]$Action,

    [string]$Port,

    [switch]$PlanJson
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    throw "Bun is not on PATH. Install Bun 1.3.14, then reopen PowerShell."
}
$ExpectedBunVersion = "1.3.14"
$InstalledBunVersion = (& bun --version | Select-Object -First 1).Trim()
if ($LASTEXITCODE -ne 0 -or $InstalledBunVersion -ne $ExpectedBunVersion) {
    throw "Bun $ExpectedBunVersion is required; found $InstalledBunVersion."
}

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Arguments = @("scripts/firmware/windows-board.mjs", $Action)
if ($Port) {
    $Arguments += @("--port", $Port)
}
if ($PlanJson) {
    $Arguments += "--plan-json"
}

Push-Location $ProjectRoot
try {
    & bun @Arguments
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
