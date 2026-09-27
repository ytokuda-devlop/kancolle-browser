# Save upstream source candidates; successful download does not prove build correspondence.
param([string[]] $Names)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$plan = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'library-source-plan.json') | ConvertFrom-Json
$destination = Join-Path $projectRoot 'third_party/ffmpeg/win32-x64/libraries'
$evidence = Join-Path $projectRoot 'licenses/ffmpeg/win32-x64/library-sources'
$staging = Join-Path $projectRoot 'release/library-source-check'
New-Item -ItemType Directory -Force $destination, $evidence, $staging | Out-Null
function Save-Json($Value, [string] $File) {
    [IO.File]::WriteAllText($File, ($Value | ConvertTo-Json -Depth 8) + "`n", (New-Object Text.UTF8Encoding $false))
}
foreach ($item in $plan) {
    if ($Names -and $item.name -notin $Names) { continue }
    $recordPath = Join-Path $evidence ($item.name + '.json')
    if (Test-Path -LiteralPath $recordPath) {
        $old = Get-Content -Raw -Encoding UTF8 $recordPath | ConvertFrom-Json
        if ($old.status -eq 'upstream-candidate-acquired') {
            $oldFile = Join-Path $projectRoot $old.archive
            if ((Test-Path -LiteralPath $oldFile) -and (Get-FileHash -LiteralPath $oldFile -Algorithm SHA256).Hash.ToLowerInvariant() -eq $old.sha256) {
                Write-Output "Already verified: $($item.name)"
                continue
            }
            if (Test-Path -LiteralPath $oldFile) { throw "Saved archive changed: $oldFile" }
            # A fresh clone contains the records but not the ignored archives.
            # Restore by the recorded URL/hash, without resolving a moving tag again.
            $restore = Join-Path $staging ($item.name + '-restore.download')
            & curl.exe -L --fail --silent --show-error --max-time 180 $old.url -o $restore
            if ($LASTEXITCODE -ne 0) { throw "Cannot restore recorded source: $($item.name)" }
            $restoredHash = (Get-FileHash -LiteralPath $restore -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($restoredHash -ne $old.sha256) { throw "Restored source differs from recorded SHA-256: $($item.name)" }
            Copy-Item -LiteralPath $restore -Destination $oldFile
            Write-Output "Restored and verified: $($item.name)"
            continue
        }
    }
    $record = [ordered]@{ name = $item.name; checkedAt = [DateTime]::UtcNow.ToString('o'); status = 'unresolved'; plan = $item; patchStatus = 'unverified' }
    try {
        $url = $item.url
        if ($item.repo) {
            $revision = $item.ref
            if ($item.parent) {
                $parent = Get-Content -Raw -Encoding UTF8 (Join-Path $evidence ($item.parent + '.json')) | ConvertFrom-Json
                $submoduleApi = "https://api.github.com/repos/$($parent.plan.repo)/contents/$($item.submodulePath)?ref=$($parent.commit)"
                $submoduleTemp = Join-Path $staging ($item.name + '-submodule.json')
                & curl.exe -L --fail --silent --show-error --max-time 45 $submoduleApi -o $submoduleTemp
                if ($LASTEXITCODE -ne 0) { throw "Submodule resolution failed: $submoduleApi" }
                $submodule = Get-Content -Raw -Encoding UTF8 $submoduleTemp | ConvertFrom-Json
                if (-not $submodule.submodule_git_url -or $submodule.sha -notmatch '^[a-f0-9]{40}$') { throw 'No pinned submodule commit' }
                $revision = $submodule.sha
                $record.submodule = @{ parent = $item.parent; path = $item.submodulePath; parentCommit = $parent.commit; url = $submodule.submodule_git_url; commit = $revision }
            }
            $api = "https://api.github.com/repos/$($item.repo)/commits/$revision"
            $temp = Join-Path $staging ($item.name + '-resolve.json')
            & curl.exe -L --fail --silent --show-error --max-time 45 $api -o $temp
            if ($LASTEXITCODE -ne 0) { throw "Commit resolution failed: $api" }
            $resolved = Get-Content -Raw -Encoding UTF8 $temp | ConvertFrom-Json
            if ($resolved.sha -notmatch '^[a-f0-9]{40}$') { throw 'No full commit SHA' }
            $record.commit = $resolved.sha
            $record.commitUrl = $resolved.html_url
            $record.commitDate = $resolved.commit.committer.date
            $url = "https://codeload.github.com/$($item.repo)/tar.gz/$($resolved.sha)"
        }
        $record.url = $url
        $extension = if ($item.extension) { $item.extension } else { 'tar.gz' }
        $fileName = $item.name + '-source.' + $extension
        $download = Join-Path $staging ($fileName + '.download')
        & curl.exe -L --fail --silent --show-error --max-time 180 $url -o $download
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $url" }
        $entries = @(& tar -tf $download)
        if ($LASTEXITCODE -ne 0 -or $entries.Count -lt 2) { throw 'Invalid or empty source archive' }
        $licenses = @($entries | Where-Object { $_ -match '(?i)(^|/)(copying[^/]*|licen[cs]e[^/]*|copyright[^/]*)$' })
        if ($item.licenseHeader) {
            $header = @($entries | Where-Object { $_.EndsWith('/' + $item.licenseHeader) })
            if ($header.Count -ne 1) { throw 'Missing or ambiguous license header' }
            $headerText = (& tar -xOf $download $header[0]) -join "`n"
            if ($LASTEXITCODE -ne 0 -or $headerText -notmatch 'Copyright' -or $headerText -notmatch 'Permission is hereby granted') { throw 'License header verification failed' }
            $licenses += $header[0]
            $record.licenseNote = 'License notice is embedded in this header, not a standalone LICENSE file. Other headers retain their original notices.'
        }
        if ($licenses.Count -eq 0) { throw 'No license entry found; manual review required' }
        $saved = Join-Path $destination $fileName
        Copy-Item -LiteralPath $download -Destination $saved
        $record.archive = 'third_party/ffmpeg/win32-x64/libraries/' + $fileName
        $record.sha256 = (Get-FileHash -LiteralPath $saved -Algorithm SHA256).Hash.ToLowerInvariant()
        $record.bytes = (Get-Item -LiteralPath $saved).Length
        $record.archiveEntryCount = $entries.Count
        $record.licenseEntries = $licenses
        $record.submoduleFiles = @($entries | Where-Object { $_ -match '(^|/)\.gitmodules$' })
        $record.status = 'upstream-candidate-acquired'
    } catch {
        $record.error = $_.Exception.Message
    }
    Save-Json $record $recordPath
    Write-Output "$($item.name): $($record.status) $($record.error)"
}
