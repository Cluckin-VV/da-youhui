$ErrorActionPreference = 'Stop'
$nodeExe = 'C:\Users\CluckinVV\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$projectDir = 'D:\AAAmindstorm'
Set-Location -LiteralPath $projectDir
& $nodeExe 'maintenance\run-cycle.js'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

