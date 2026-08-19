[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDirectory,

  [Parameter(Mandatory = $true)]
  [string]$DestinationDirectory,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9][a-z0-9-]*$')]
  [string]$PublicSubpath
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
$assetFiles = @(
  "compass-body.png",
  "compass-needle.png"
)

$source = [System.IO.Path]::GetFullPath($SourceDirectory)
$destination = [System.IO.Path]::GetFullPath($DestinationDirectory)
$publicDirectory = Join-Path $destination $PublicSubpath

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
New-Item -ItemType Directory -Path $publicDirectory | Out-Null

foreach ($file in $runtimeFiles) {
  $sourceFile = Join-Path $source $file
  if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
    throw "Required prototype runtime file is missing: $file"
  }

  Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $publicDirectory $file)
}

$sourceAssets = Join-Path $source "assets"
$publicAssets = Join-Path $publicDirectory "assets"
$hasAssets = Test-Path -LiteralPath $sourceAssets -PathType Container
if ($hasAssets) {
  New-Item -ItemType Directory -Path $publicAssets | Out-Null
  foreach ($file in $assetFiles) {
    $sourceFile = Join-Path $sourceAssets $file
    if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
      throw "Required prototype asset is missing: assets/$file"
    }

    Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $publicAssets $file)
  }
}

$publishedFiles = @(
  Get-ChildItem -LiteralPath $publicDirectory -File |
    Select-Object -ExpandProperty Name |
    Sort-Object
)
$expectedFiles = @($runtimeFiles | Sort-Object)

if (Compare-Object $expectedFiles $publishedFiles) {
  throw "Pages artifact does not match the runtime-file allowlist"
}

$publishedPublicEntries = @(
  Get-ChildItem -LiteralPath $publicDirectory |
    Select-Object -ExpandProperty Name |
    Sort-Object
)
$expectedPublicEntries = @($runtimeFiles)
if ($hasAssets) { $expectedPublicEntries += "assets" }
$expectedPublicEntries = @($expectedPublicEntries | Sort-Object)
if (Compare-Object $expectedPublicEntries $publishedPublicEntries) {
  throw "Pages artifact does not match the public-entry allowlist"
}

if ($hasAssets) {
  $publishedAssets = @(
    Get-ChildItem -LiteralPath $publicAssets -File |
      Select-Object -ExpandProperty Name |
      Sort-Object
  )
  $expectedAssets = @($assetFiles | Sort-Object)
  if (Compare-Object $expectedAssets $publishedAssets) {
    throw "Pages artifact does not match the asset allowlist"
  }
}

$publishedRootEntries = @(
  Get-ChildItem -LiteralPath $destination |
    Select-Object -ExpandProperty Name
)
if (Compare-Object @($PublicSubpath) $publishedRootEntries) {
  throw "Pages artifact root must contain only the isolated public subpath"
}
