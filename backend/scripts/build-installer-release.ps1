param(
    [string]$NodeVersion = "v22.14.0",
    [string]$Arch = "x64",
    [string]$InnoCompilerPath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptROOT "..")).Path
$prepareScript = Join-Path $repoRoot "scripts\build-installer-payload.ps1"
$issFile = Join-Path $repoRoot "installer\setup.release.iss"

if (!(Test-Path $prepareScript)) {
    throw "Prepare payload script not found: $prepareScript"
}

if (!(Test-Path $issFile)) {
    throw "Inno Setup script not found: $issFile"
}

function Resolve-InnoCompilerPath {
    param(
        [string]$ExplicitPath
    )

    if (-not [string]::IsNullOrWhiteSpace($ExplicitPath) -and (Test-Path $ExplicitPath)) {
        return $ExplicitPath
    }

    if (-not [string]::IsNullOrWhiteSpace($env:ISCC_PATH) -and (Test-Path $env:ISCC_PATH)) {
        return $env:ISCC_PATH
    }

    $candidatePaths = @(
        "$env:ProgramFiles(x86)\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    )

    foreach ($candidate in $candidatePaths) {
        if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    $pathCommand = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($pathCommand -and $pathCommand.Source -and (Test-Path $pathCommand.Source)) {
        return $pathCommand.Source
    }

    return ""
}

Write-Host "Preparing payload (including .env) before release installer build..."
& powershell -NoProfile -ExecutionPolicy Bypass -File $prepareScript -NodeVersion $NodeVersion -Arch $Arch
if ($LASTEXITCODE -ne 0) { throw "Payload preparation failed." }

$InnoCompilerPath = Resolve-InnoCompilerPath -ExplicitPath $InnoCompilerPath

if ([string]::IsNullOrWhiteSpace($InnoCompilerPath) -or !(Test-Path $InnoCompilerPath)) {
    throw "Inno Setup compiler (ISCC.exe) not found. Install Inno Setup 6 or pass -InnoCompilerPath (or set ISCC_PATH)."
}

$outputDir = Join-Path $repoRoot "installer\output"
$outputExe = Join-Path $outputDir "Digital Signaure.exe"
if (Test-Path $outputExe) { Remove-Item -Path $outputExe -Force }

Write-Host "Building release installer with $InnoCompilerPath"
& $InnoCompilerPath $issFile
if ($LASTEXITCODE -ne 0) { throw "Installer build failed." }

Write-Host "Release installer build completed. Output folder: $outputDir"
