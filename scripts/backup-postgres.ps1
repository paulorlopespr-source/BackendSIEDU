param(
  [Parameter(Mandatory = $true)] [string]$DatabaseUrl,
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\backups')
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  throw 'pg_dump não foi encontrado. Instale as ferramentas cliente do PostgreSQL.'
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
$backupPath = Join-Path $resolvedOutput ("siedu-{0}.dump" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

& pg_dump --dbname=$DatabaseUrl --format=custom --no-owner --no-privileges --file=$backupPath
if ($LASTEXITCODE -ne 0) { throw "O backup falhou com código $LASTEXITCODE." }

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath
Write-Output ([pscustomobject]@{ Backup = $backupPath; Sha256 = $hash.Hash; CreatedAt = (Get-Date).ToString('o') })

