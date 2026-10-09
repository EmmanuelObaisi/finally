param([switch]$Build, [switch]$NoOpen)

Set-Location (Split-Path -Parent $PSScriptRoot)

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Output "Docker is not running. Start Docker Desktop and try again."
    exit 1
}

$flags = @("up", "-d", "--wait")
if ($Build) { $flags += "--build" }
docker compose @flags
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$port = (docker compose port finally 8000) -replace '^.*:', ''
$url = "http://localhost:$port"
if (-not (Test-Path .env)) { Write-Output "No .env found: AI chat needs OPENROUTER_API_KEY in .env." }
Write-Output "FinAlly is running at $url"
if (-not $NoOpen) { Start-Process $url }
