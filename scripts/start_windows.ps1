# Start FinAlly in Docker. Builds the image if missing or when -Build is passed.
param([switch]$Build)
Set-Location (Split-Path $PSScriptRoot -Parent)

$Image = "finally"
$Container = "finally"
$Url = "http://localhost:8000"

docker image inspect $Image *> $null
if ($Build -or $LASTEXITCODE -ne 0) {
    docker build -t $Image .
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

docker rm -f $Container *> $null
docker run -d --name $Container -v finally-data:/app/db -p 8000:8000 --env-file .env $Image | Out-Null
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "FinAlly is running at $Url"
Start-Process $Url
