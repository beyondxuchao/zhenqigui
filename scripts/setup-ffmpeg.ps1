$ErrorActionPreference = "Stop"

$ffmpegUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$targetTriple = "x86_64-pc-windows-msvc"
$binDir = Join-Path $PSScriptRoot "..\src-tauri\bin"
$tempDir = Join-Path $PSScriptRoot "temp_ffmpeg"

if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir | Out-Null
}

$ffmpegDest = Join-Path $binDir "ffmpeg-$targetTriple.exe"
$ffprobeDest = Join-Path $binDir "ffprobe-$targetTriple.exe"

if ((Test-Path $ffmpegDest) -and (Test-Path $ffprobeDest)) {
    Write-Host "FFmpeg binaries already exist."
    exit 0
}

Write-Host "Downloading FFmpeg..."
if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir | Out-Null
}

$zipPath = Join-Path $tempDir "ffmpeg.zip"
Invoke-WebRequest -Uri $ffmpegUrl -OutFile $zipPath

Write-Host "Extracting..."
Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force

$extractedRoot = Get-ChildItem -Path $tempDir -Directory | Select-Object -First 1
$binSource = Join-Path $extractedRoot.FullName "bin"

Copy-Item -Path (Join-Path $binSource "ffmpeg.exe") -Destination $ffmpegDest
Copy-Item -Path (Join-Path $binSource "ffprobe.exe") -Destination $ffprobeDest

Write-Host "Cleaning up..."
Remove-Item -Path $tempDir -Recurse -Force

Write-Host "FFmpeg setup complete."
