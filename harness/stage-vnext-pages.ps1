[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDirectory,

  [Parameter(Mandatory = $true)]
  [string]$DestinationDirectory
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$runtimeFiles = @(
  "index.html",
  "style.css",
  "state.js",
  "screens.js",
  "controller.js",
  "app.js"
)

$source = [System.IO.Path]::GetFullPath($SourceDirectory)
$destination = [System.IO.Path]::GetFullPath($DestinationDirectory)

if (-not (Test-Path -LiteralPath $source -PathType Container)) {
  throw "Prototype source directory does not exist: $source"
}

if (Test-Path -LiteralPath $destination) {
  throw "Pages destination must not already exist: $destination"
}

if (
  $destination -eq $source -or
  $destination.StartsWith(
    $source + [System.IO.Path]::DirectorySeparatorChar,
    [System.StringComparison]::OrdinalIgnoreCase
  )
) {
  throw "Pages destination must be outside the prototype source directory"
}

New-Item -ItemType Directory -Path $destination | Out-Null

foreach ($file in $runtimeFiles) {
  $sourceFile = Join-Path $source $file
  if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
    throw "Required prototype runtime file is missing: $file"
  }

  Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $destination $file)
}

$publishedFiles = @(
  Get-ChildItem -LiteralPath $destination -File |
    Select-Object -ExpandProperty Name |
    Sort-Object
)
$expectedFiles = @($runtimeFiles | Sort-Object)

if (Compare-Object $expectedFiles $publishedFiles) {
  throw "Pages artifact does not match the runtime-file allowlist"
}
