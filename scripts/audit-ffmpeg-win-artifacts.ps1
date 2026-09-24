$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sevenZip = Join-Path $projectRoot 'node_modules/electron-winstaller/vendor/7z-x64.exe'
$capture = Get-Content -Raw -Encoding UTF8 (Join-Path $projectRoot 'licenses/ffmpeg/win32-x64/capture.json') | ConvertFrom-Json
$auditDir = Join-Path $projectRoot ('release/ffmpeg-artifact-audit/' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $auditDir -Force | Out-Null
function Get-Sha256([string] $File) {
    return (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()
}
$binaryRelative = 'resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe'
$records = @()
foreach ($item in @(
    @{ File = 'kancolle-browser_Setup_1.0.0_x64.exe'; Kind = 'nsis' },
    @{ File = 'kancolle-browser_1.0.0_x64.exe'; Kind = 'portable' }
)) {
    $artifactRelative = 'release/' + $item.File
    $artifact = Join-Path $projectRoot $artifactRelative
    $artifactHash = Get-Sha256 $artifact
    $destination = Join-Path $auditDir $item.Kind
    # Read the installer as an archive. Do not run or install it.
    & $sevenZip x $artifact '-y' "-o$destination" '$PLUGINSDIR\app-64.7z' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Cannot extract payload: $artifact" }
    $payload = Join-Path $destination '$PLUGINSDIR/app-64.7z'
    $appDir = Join-Path $destination 'app'
    & $sevenZip x $payload '-y' "-o$appDir" $binaryRelative | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Cannot extract FFmpeg: $artifact" }
    $binary = Join-Path $appDir $binaryRelative
    $binaryHash = Get-Sha256 $binary
    if ($binaryHash -ne $capture.sha256) { throw "FFmpeg differs from upstream capture: $artifact" }
    if ((Get-Sha256 $artifact) -ne $artifactHash) { throw "Artifact changed during audit: $artifact" }
    $records += [ordered]@{
        artifact = $artifactRelative
        type = $item.Kind
        artifactBytes = (Get-Item -LiteralPath $artifact).Length
        artifactSha256 = $artifactHash
        payloadPath = '$PLUGINSDIR/app-64.7z'
        payloadSha256 = Get-Sha256 $payload
        binaryPathInPayload = $binaryRelative
        binaryBytes = (Get-Item -LiteralPath $binary).Length
        binarySha256 = $binaryHash
        matchesUpstream = $true
    }
}
$unpacked = Join-Path $projectRoot ('release/win-unpacked/' + $binaryRelative)
$unpackedHash = Get-Sha256 $unpacked
if ($unpackedHash -ne $capture.sha256) { throw 'Unpacked FFmpeg differs from upstream capture' }
$record = [ordered]@{
    auditedAt = [DateTime]::UtcNow.ToString('o')
    platform = 'win32'
    arch = 'x64'
    scope = 'Existing Windows x64 NSIS, portable and unpacked artifacts; macOS excluded; arm64 unsupported.'
    provider = 'Gyan Doshi / gyan.dev'
    redistributor = 'eugeneware/ffmpeg-static b6.1.1'
    upstream = $capture.upstream
    upstreamEvidence = 'capture.json'
    extractor = 'node_modules/electron-winstaller/vendor/7z-x64.exe'
    extractorSha256 = Get-Sha256 $sevenZip
    extractionDirectory = $auditDir
    artifacts = $records
    unpacked = @{ binary = 'release/win-unpacked/' + $binaryRelative; sha256 = $unpackedHash }
    limitation = 'Hashes identify only the artifacts audited here. Re-run after rebuilding or signing. Complete corresponding source availability is a separate unfinished task.'
}
$output = Join-Path $projectRoot 'licenses/ffmpeg/win32-x64/artifacts.json'
[IO.File]::WriteAllText($output, ($record | ConvertTo-Json -Depth 10) + "`n", (New-Object Text.UTF8Encoding $false))
Write-Output "Verified NSIS, portable and unpacked FFmpeg: $unpackedHash"
Write-Output "Evidence: $output"
