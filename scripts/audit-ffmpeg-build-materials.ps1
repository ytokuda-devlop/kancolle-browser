$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$evidenceDir = Join-Path $projectRoot 'licenses/ffmpeg/win32-x64'
$sources = Get-Content -Raw -Encoding UTF8 (Join-Path $evidenceDir 'sources.json') | ConvertFrom-Json
$archives = @(@{ name = 'FFmpeg'; archive = $sources.ffmpeg.localArchive; sha256 = $sources.ffmpeg.sha256 })
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $evidenceDir 'library-sources') -Filter '*.json') {
    $entry = Get-Content -Raw -Encoding UTF8 $file.FullName | ConvertFrom-Json
    if ($entry.status -eq 'upstream-candidate-acquired') {
        $archives += @{ name = $entry.name; archive = $entry.archive; sha256 = $entry.sha256 }
    }
}
$inventory = @()
foreach ($archive in $archives) {
    $full = Join-Path $projectRoot $archive.archive
    $actual = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $archive.sha256) { throw "Source hash mismatch: $($archive.name)" }
    $entries = @(& tar -tf $full)
    if ($LASTEXITCODE -ne 0) { throw "Cannot read source archive: $full" }
    $files = @($entries | Where-Object { -not $_.EndsWith('/') })
    $buildFiles = @($files | Where-Object { $_ -match '(?i)(^|/)(configure([.]ac|[.]in)?|Makefile([.][^/]+)?|CMakeLists[.]txt|meson[.]build|meson_options[.]txt|autogen[.]sh|bootstrap[^/]*|build[^/]*[.](sh|bat|ps1)|multilib[.]sh)$|[.]cmake$' })
    $documents = @($files | Where-Object { $_ -match '(?i)(^|/)(INSTALL|BUILDING|README)([^/]*)$|(^|/)doc/(platform|build_system)[.]texi$' })
    $patchCandidates = @($files | Where-Object { $_ -match '(?i)[.](patch|diff)$|(^|/)patches/' })
    $inventory += [ordered]@{
        name = $archive.name; archive = $archive.archive; sha256 = $actual
        buildFiles = $buildFiles; documents = $documents; patchFileCandidates = $patchCandidates
        generatedConfigurationCandidates = @($files | Where-Object { $_ -match '(^|/)(config[.]log|config[.]mak|config[.]h|CMakeCache[.]txt)$' })
        providerUsageConfirmed = $false
        appliedPatchesStatus = 'unknown; archive filenames do not establish which patches were applied'
    }
}
$capture = Get-Content -Raw -Encoding UTF8 (Join-Path $evidenceDir 'capture.json') | ConvertFrom-Json
$record = [ordered]@{
    checkedAt = [DateTime]::UtcNow.ToString('o'); platform = 'win32'; arch = 'x64'
    binarySha256 = $capture.sha256
    binaryBuildInformation = $capture.runs | Where-Object { $_.arg -in @('-version', '-buildconf') }
    archiveCount = $inventory.Count; archives = $inventory
    complete = $false
    limitations = @('Filename inventory of verified upstream archives; not proof of provider usage.',
        'Patch files may be tests, examples or third-party integration files. No patch is classified as applied.',
        'No matching provider build recipe, full package manifest, environment or build log has been obtained.',
        'No compilation or reproduction has been performed.')
}
$output = Join-Path $evidenceDir 'build-materials.json'
[IO.File]::WriteAllText($output, ($record | ConvertTo-Json -Depth 12) + "`n", (New-Object Text.UTF8Encoding $false))
Write-Output "Verified and inventoried $($inventory.Count) source archives: $output"
