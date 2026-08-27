param(
  [Parameter(Mandatory = $true)] [string]$BackupPath,
  [Parameter(Mandatory = $true)] [string]$TargetDatabaseUrl,
  [Parameter(Mandatory = $true)]
  [ValidateSet('RESTAURAR-BANCO-DE-TESTE')]
  [string]$Confirmation
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $BackupPath -PathType Leaf)) { throw 'O arquivo de backup não existe.' }
if (-not (Get-Command pg_restore -ErrorAction SilentlyContinue)) { throw 'pg_restore não foi encontrado.' }

$target = [System.Uri]$TargetDatabaseUrl
$databaseName = $target.AbsolutePath.Trim('/')
if ($databaseName -notmatch '(?i)(test|teste|restore|restauracao)') {
  throw 'A restauração só pode apontar para um banco isolado com test, teste, restore ou restauracao no nome.'
}

& pg_restore --dbname=$TargetDatabaseUrl --clean --if-exists --no-owner --no-privileges --exit-on-error $BackupPath
if ($LASTEXITCODE -ne 0) { throw "A restauração de teste falhou com código $LASTEXITCODE." }
Write-Output "Restauração concluída no banco isolado '$databaseName'."

