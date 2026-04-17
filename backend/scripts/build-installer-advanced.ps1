param(
    [string]$NodeVersion = "v22.14.0",
    [string]$Arch = "x64",
    [string]$InnoCompilerPath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Write-Host "Building bundle and obfuscating (advanced pipeline)..."
Push-Location $repoRoot
try {
    npm run build:bundle-obfuscate

    # After obfuscation, place bundle as dist/server.js so existing installer/service config works
    $bundleObf = Join-Path $repoRoot "dist\bundle.obf.js"
    $targetServer = Join-Path $repoRoot "dist\server.js"
    if (Test-Path $bundleObf) {
        Copy-Item -Path $bundleObf -Destination $targetServer -Force
        Write-Host "Copied obfuscated bundle to dist/server.js"
    } else {
        throw "Obfuscated bundle not found: $bundleObf"
    }
} finally {
    Pop-Location
}

Write-Host "Preparing payload (excluding plain .env)..."
& powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-installer-payload.ps1 -NodeVersion $NodeVersion -Arch $Arch -ExcludeEnv
if ($LASTEXITCODE -ne 0) { throw "Payload preparation failed." }

# Build installer using the advanced ISS (falls back to default build script behavior if ISCC not found)
$advancedIss = Join-Path $repoRoot "installer\setup.advanced.iss"
if (!(Test-Path $advancedIss)) {
    # Fallback: copy existing iss and modify OutputBaseFilename
    $origIss = Join-Path $repoRoot "installer\setup.iss"
    $advancedIss = Join-Path $repoRoot "installer\setup.advanced.iss"
    $text = Get-Content -Raw -Path $origIss
    $text = $text -replace "OutputBaseFilename=DSCBackendSetup","OutputBaseFilename=DSCBackendSetup-advanced"
    $text | Set-Content -Path $advancedIss -Encoding UTF8
}

function Resolve-InnoCompilerPath {
    param([string]$ExplicitPath)
    if (-not [string]::IsNullOrWhiteSpace($ExplicitPath) -and (Test-Path $ExplicitPath)) { return $ExplicitPath }
    if (-not [string]::IsNullOrWhiteSpace($env:ISCC_PATH) -and (Test-Path $env:ISCC_PATH)) { return $env:ISCC_PATH }
    $candidatePaths = @("$env:ProgramFiles(x86)\Inno Setup 6\ISCC.exe","$env:ProgramFiles\Inno Setup 6\ISCC.exe","$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe")
    foreach ($candidate in $candidatePaths) { if (Test-Path $candidate) { return $candidate } }
    $pathCommand = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($pathCommand -and $pathCommand.Source -and (Test-Path $pathCommand.Source)) { return $pathCommand.Source }
    return ""
}

$InnoCompilerPath = Resolve-InnoCompilerPath -ExplicitPath $InnoCompilerPath
if ([string]::IsNullOrWhiteSpace($InnoCompilerPath) -or !(Test-Path $InnoCompilerPath)) {
    throw "Inno Setup compiler (ISCC.exe) not found. Install Inno Setup 6 or pass -InnoCompilerPath (or set ISCC_PATH)."
}

Write-Host "Building advanced installer with $InnoCompilerPath"
& $InnoCompilerPath $advancedIss
if ($LASTEXITCODE -ne 0) { throw "Advanced installer build failed." }

Write-Host "Advanced installer build completed. Output: installer\output\DSCBackendSetup-advanced.exe"
