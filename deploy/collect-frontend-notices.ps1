# Run from the repository root after npm ci in frontend. Reads installed package
# metadata/licences only and updates the owned third-party notices document.
$ErrorActionPreference = 'Stop'
$repositoryPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$frontendPath = Join-Path $repositoryPath 'frontend'
$noticePath = Join-Path $repositoryPath 'THIRD_PARTY_NOTICES.md'
$moduleRoot = [IO.Path]::GetFullPath((Join-Path $frontendPath 'node_modules'))
Push-Location -LiteralPath $frontendPath
try {
    $dependencyTree = npm ls --omit=dev --all --json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'npm dependency tree inspection failed' }
} finally { Pop-Location }
$packageNames = [Collections.Generic.HashSet[string]]::new()
function Read-DependencyNames($node) {
    if ($node.dependencies) {
        foreach ($entry in $node.dependencies.PSObject.Properties) {
            # npm may include an empty object for an uninstalled optional peer.
            if ($entry.Value.version) { [void]$packageNames.Add($entry.Name) }
            Read-DependencyNames $entry.Value
        }
    }
}
Read-DependencyNames $dependencyTree
$document = [IO.File]::ReadAllText($noticePath)
$marker = '## Frontend package notices'
$markerIndex = $document.IndexOf($marker)
if ($markerIndex -lt 0) { throw 'Expected notices section missing' }
$result = [Text.StringBuilder]::new()
[void]$result.Append($document.Substring(0, $markerIndex))
[void]$result.AppendLine($marker)
[void]$result.AppendLine('')
[void]$result.AppendLine('Installed runtime package notices reproduced from their licence files. Font software notices include the SIL Open Font License. Keep this document with compiled distributions.')
$missing = @()
foreach ($packageName in ($packageNames | Sort-Object)) {
    if ($packageName -notmatch '^(?:@[A-Za-z0-9_.-]+/)?[A-Za-z0-9_.-]+$') { throw 'Unexpected package name' }
    $packagePath = [IO.Path]::GetFullPath((Join-Path $moduleRoot $packageName))
    if (-not $packagePath.StartsWith($moduleRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Unexpected package path' }
    $metadataPath = Join-Path $packagePath 'package.json'
    if (-not (Test-Path -LiteralPath $metadataPath)) { $missing += $packageName; continue }
    $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
    $licences = @(Get-ChildItem -LiteralPath $packagePath -File | Where-Object { $_.Name -match '^(LICENSE|LICENCE|COPYING)(\..*)?$' })
    if ($licences.Count -eq 0 -and $packageName -eq '@emotion/is-prop-valid') {
        $sourceLicence = Join-Path $repositoryPath 'deploy\licences\emotion-MIT.txt'
        if (Test-Path -LiteralPath $sourceLicence) { $licences = @(Get-Item -LiteralPath $sourceLicence) }
    }
    [void]$result.AppendLine('')
    [void]$result.AppendLine(('### ' + $packageName + ' ' + $metadata.version))
    [void]$result.AppendLine('')
    if ($licences.Count -eq 0) {
        [void]$result.AppendLine(('Package-declared licence: ' + $metadata.license + '. Refer to the package source distribution for any additional notices.'))
        $missing += $packageName
    } else {
        foreach ($licence in $licences) {
            [void]$result.AppendLine([IO.File]::ReadAllText($licence.FullName))
        }
    }
}
[IO.File]::WriteAllText($noticePath, $result.ToString().TrimEnd() + "`n", [Text.UTF8Encoding]::new($false))
Write-Output ('Runtime packages inspected: ' + $packageNames.Count)
Write-Output ('Packages without a root licence file: ' + ($missing -join ', '))
