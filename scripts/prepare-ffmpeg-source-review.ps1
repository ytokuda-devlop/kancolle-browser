# Creates a LOCAL INCOMPLETE review bundle, never a release-ready source package.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$recordDir = Join-Path $projectRoot 'licenses/ffmpeg/win32-x64'
$sources = Get-Content -Raw -Encoding UTF8 (Join-Path $recordDir 'sources.json') | ConvertFrom-Json
$artifacts = Get-Content -Raw -Encoding UTF8 (Join-Path $recordDir 'artifacts.json') | ConvertFrom-Json
$capture = Get-Content -Raw -Encoding UTF8 (Join-Path $recordDir 'capture.json') | ConvertFrom-Json
function Hash([string] $File) { (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant() }
function Resolve-ProjectFile([string] $Relative) {
    if ([IO.Path]::IsPathRooted($Relative) -or $Relative -match '(^|[\\/])[.][.]([\\/]|$)|[\r\n]') { throw "Unsafe path: $Relative" }
    $resolved = [IO.Path]::GetFullPath((Join-Path $projectRoot $Relative))
    if (-not $resolved.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path outside project' }
    $item = Get-Item -LiteralPath $resolved
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Expected regular file: $Relative" }
    return $resolved
}
$inputs = @(@{ path = $sources.ffmpeg.localArchive; sha256 = $sources.ffmpeg.sha256; role = 'upstream-source-candidate' })
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $recordDir 'library-sources') -Filter '*.json') {
    $entry = Get-Content -Raw -Encoding UTF8 $file.FullName | ConvertFrom-Json
    if ($entry.status -eq 'upstream-candidate-acquired') {
        $inputs += @{ path = $entry.archive; sha256 = $entry.sha256; role = 'upstream-source-candidate' }
    }
}
$candidateCount = $inputs.Count
foreach ($artifact in $artifacts.artifacts) {
    if ((Hash (Resolve-ProjectFile $artifact.artifact)) -ne $artifact.artifactSha256) { throw "Artifact changed: $($artifact.artifact)" }
    if ($artifact.binarySha256 -ne $capture.sha256) { throw 'Artifact and captured FFmpeg differ' }
}
$extra = @('licenses/GPL-3.0.txt', 'licenses/ffmpeg-static-GPL-3.0.txt', 'licenses/FFmpeg-SOURCE.txt',
    'licenses/DISTRIBUTION-NOTES.txt', 'third_party/ffmpeg/win32-x64/README.md',
    'third_party/ffmpeg/win32-x64/libraries/README.md', 'scripts/library-source-plan.json',
    'scripts/acquire-library-sources.ps1', 'scripts/prepare-ffmpeg-source-review.ps1')
$extra += Get-ChildItem -LiteralPath $recordDir -File -Recurse | ForEach-Object { $_.FullName.Substring($projectRoot.Length + 1).Replace('\', '/') }
foreach ($file in $extra) { $inputs += @{ path = $file; sha256 = Hash (Resolve-ProjectFile $file); role = 'evidence-or-instructions' } }
foreach ($inputFile in $inputs) {
    if ((Hash (Resolve-ProjectFile $inputFile.path)) -ne $inputFile.sha256) { throw "Source hash mismatch: $($inputFile.path)" }
}
$outputDir = Join-Path $projectRoot ('release/source-review/' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$manifest = [ordered]@{
    createdAt = [DateTime]::UtcNow.ToString('o'); complete = $false; releaseReady = $false
    purpose = 'LOCAL INCOMPLETE FFmpeg source-candidate review bundle; not complete corresponding source'
    platform = 'win32'; arch = 'x64'; ffmpegSha256 = $capture.sha256
    auditedArtifacts = $artifacts.artifacts; sourceCandidateArchiveCount = $candidateCount; files = $inputs
    blockers = @('x265 source/version conflict', 'oneVPL exact source revision unresolved',
        'Other library revisions and transitive dependencies not fully verified',
        'Provider patches, build recipe and environment not obtained',
        'Application combined-work source and matching build provenance not included',
        'Final source assets and public URLs not established; anonymous download not verified')
}
$utf8 = New-Object Text.UTF8Encoding $false
[IO.File]::WriteAllText((Join-Path $outputDir 'MANIFEST.json'), ($manifest | ConvertTo-Json -Depth 12) + "`n", $utf8)
[IO.File]::WriteAllText((Join-Path $outputDir 'INCOMPLETE-README.txt'), @"
LOCAL REVIEW ONLY - INCOMPLETE SOURCE CANDIDATES
This is NOT complete corresponding source and is NOT ready for release.
Read MANIFEST.json for unresolved blockers and checksums of each included file.
The x265 archive is an unconfirmed candidate, not verified corresponding source.
Application combined-work source is not included. No public source offer is made.
All upstream license and copyright files remain within their original archives.
Paths in MANIFEST.json are relative to the root of this review archive.
After extraction, verify each file using Get-FileHash -Algorithm SHA256.
"@, $utf8)
$listFile = Join-Path $outputDir 'inputs.txt'
[IO.File]::WriteAllLines($listFile, [string[]]($inputs | ForEach-Object { $_.path }), $utf8)
$archive = Join-Path $outputDir 'ffmpeg-win32-x64-INCOMPLETE-review.tar'
& tar -cf $archive -C $projectRoot -T $listFile
if ($LASTEXITCODE -ne 0) { throw 'Review archive creation failed' }
& tar -rf $archive -C $outputDir MANIFEST.json INCOMPLETE-README.txt
if ($LASTEXITCODE -ne 0) { throw 'Review metadata append failed' }
$entries = @(& tar -tf $archive)
if ($LASTEXITCODE -ne 0) { throw 'Review archive cannot be read' }
$expected = @($inputs | ForEach-Object { $_.path.Replace('\', '/') }) + @('MANIFEST.json', 'INCOMPLETE-README.txt')
if (Compare-Object ($expected | Sort-Object) ($entries | Sort-Object)) { throw 'Unexpected archive entries' }
# Detect concurrent edits while tar was reading the source files.
foreach ($inputFile in $inputs) {
    if ((Hash (Resolve-ProjectFile $inputFile.path)) -ne $inputFile.sha256) { throw "Input changed while archiving: $($inputFile.path)" }
}
[IO.File]::WriteAllText((Join-Path $outputDir 'SHA256SUMS.txt'), (Hash $archive) + '  ' + [IO.Path]::GetFileName($archive) + "`n", $utf8)
Write-Output "INCOMPLETE review bundle: $archive"
Write-Output "Verified $candidateCount source candidates, $($inputs.Count) input files; public release remains blocked."
