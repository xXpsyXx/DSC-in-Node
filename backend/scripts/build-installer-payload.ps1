param(
    [string]$NodeVersion = "v22.14.0",
    [string]$Arch = "x64",
    [switch]$ExcludeEnv
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$payloadRoot = Join-Path $repoRoot "installer\payload"
$appRoot = Join-Path $payloadRoot "app"
$runtimeRoot = Join-Path $payloadRoot "runtime"
$serviceWrapperRoot = Join-Path $payloadRoot "service-wrapper"
$actionsSource = Join-Path $repoRoot "installer\actions"
$actionsDest = Join-Path $payloadRoot "installer-actions"
$winswSourceDir = Join-Path $repoRoot "installer\winsw"
$winswConfigSource = Join-Path $winswSourceDir "DigitalSignatureService.xml"

$winswDownloadUrl = "https://github.com/winsw/winsw/releases/latest/download/WinSW-x64.exe"
$winswExePath = Join-Path $serviceWrapperRoot "DigitalSignatureService.exe"
$winswConfigDest = Join-Path $serviceWrapperRoot "DigitalSignatureService.xml"

$normalizedNodeVersion = if ($NodeVersion.StartsWith("v")) { $NodeVersion } else { "v$NodeVersion" }
$nodeZipName = "node-$normalizedNodeVersion-win-$Arch.zip"
$nodeUrl = "https://nodejs.org/dist/$normalizedNodeVersion/$nodeZipName"
$nodeZipPath = Join-Path $payloadRoot $nodeZipName
$nodeExtractedDir = Join-Path $payloadRoot "node-$normalizedNodeVersion-win-$Arch"

Write-Host "Building and obfuscating source code..."
Push-Location $repoRoot
try {
    npm run build:obfuscated
    if ($LASTEXITCODE -ne 0) {
        throw "Build and obfuscation failed"
    }
} finally {
    Pop-Location
}

Write-Host "Preparing installer payload at $payloadRoot"

if (Test-Path $payloadRoot) {
    Remove-Item -Path $payloadRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $appRoot -Force | Out-Null
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
New-Item -ItemType Directory -Path $serviceWrapperRoot -Force | Out-Null

$requiredItems = @(
    "dist",
    "package.json",
    "package-lock.json"
)

foreach ($item in $requiredItems) {
    $sourcePath = Join-Path $repoRoot $item
    if (!(Test-Path $sourcePath)) {
        throw "Missing required item for installer payload: $sourcePath"
    }

    $destinationPath = Join-Path $appRoot $item
    if ($item -eq "package.json") {
        Copy-Item -Path $sourcePath -Destination $destinationPath -Force
        Write-Host "Patching package.json start script to run compiled JS..."
        $pkgJson = Get-Content -Raw -Path $destinationPath | ConvertFrom-Json
        if (-not $pkgJson.scripts) { $pkgJson | Add-Member -MemberType NoteProperty -Name scripts -Value @{ } -Force }
        $pkgJson.scripts.start = "node dist/server.js"
        $pkgJson.main = "dist/server.js"
        # Mark staged package as ESM to run emitted ESM JS
        # Ensure package type is set to module so Node treats emitted JS as ESM
        $pkgJson | Add-Member -MemberType NoteProperty -Name type -Value "module" -Force
        $pkgJson | ConvertTo-Json -Depth 100 | Set-Content -Path $destinationPath -Encoding UTF8
    } else {
        Copy-Item -Path $sourcePath -Destination $destinationPath -Recurse -Force
    }
}

foreach ($item in $optionalItems) {
    $sourcePath = Join-Path $repoRoot $item
    if (Test-Path $sourcePath) {
        if ($item -eq ".env" -and $ExcludeEnv) {
            Write-Host "ExcludeEnv specified, skipping .env"
            continue
        }
        $destinationPath = Join-Path $appRoot $item
        Copy-Item -Path $sourcePath -Destination $destinationPath -Force
        Write-Host "Included optional file: $item"
    } else {
        Write-Host "Optional item not found, skipping: $item"
    }
}

if (!(Test-Path $actionsSource)) {
    throw "Installer action scripts folder not found: $actionsSource"
}

Copy-Item -Path $actionsSource -Destination $actionsDest -Recurse -Force

if (!(Test-Path $winswConfigSource)) {
    throw "WinSW service config template not found: $winswConfigSource"
}

Write-Host "Downloading WinSW wrapper from $winswDownloadUrl"
Invoke-WebRequest -Uri $winswDownloadUrl -OutFile $winswExePath
Copy-Item -Path $winswConfigSource -Destination $winswConfigDest -Force

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (!$npmCmd) {
    throw "npm is not installed or not in PATH."
}

Push-Location $appRoot
try {
    Write-Host "Installing production dependencies in staged app..."
    npm install --omit=dev --no-audit --no-fund
} finally {
    Pop-Location
}

Write-Host "Downloading Node runtime from $nodeUrl"
Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZipPath

Write-Host "Extracting Node runtime..."
Expand-Archive -Path $nodeZipPath -DestinationPath $payloadRoot -Force

if (!(Test-Path $nodeExtractedDir)) {
    throw "Node runtime extraction failed: $nodeExtractedDir not found"
}

Copy-Item -Path (Join-Path $nodeExtractedDir "*") -Destination $runtimeRoot -Recurse -Force

Remove-Item -Path $nodeZipPath -Force
Remove-Item -Path $nodeExtractedDir -Recurse -Force

Write-Host "Installer payload prepared successfully."
Write-Host "- App payload: $appRoot"
Write-Host "- Runtime payload: $runtimeRoot"
Write-Host "- Installer actions: $actionsDest"
Write-Host "- Service wrapper payload: $serviceWrapperRoot"
