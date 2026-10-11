<# Deploy the existing Dockerfile to Fly.io. Requires an authenticated fly CLI.
   -PrepareOnly writes the configuration without contacting Fly or importing secrets.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$')]
  [string]$AppName,
  [ValidatePattern('^[a-z]{3}$')]
  [string]$Region = 'lhr',
  [string]$Organization,
  [string]$EnvFile = '.env',
  [ValidateRange(1, 100)]
  [int]$VolumeSizeGB = 1,
  [switch]$SkipSecrets,
  [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'
$RootDir = Split-Path -Parent $PSScriptRoot
$ConfigPath = Join-Path $RootDir "planning/fly.$AppName.toml"
$TemplatePath = Join-Path $RootDir 'planning/fly-persistent.toml'
$config = "app = `"$AppName`"`nprimary_region = `"$Region`"`n`n" + [IO.File]::ReadAllText($TemplatePath)
[IO.File]::WriteAllText($ConfigPath, $config, (New-Object Text.UTF8Encoding($false)))
Write-Host "Configuration: $ConfigPath"
if ($PrepareOnly) { return }

$FlyCommand = Get-Command flyctl, fly -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $FlyCommand) {
  $candidate = Join-Path $env:USERPROFILE '.fly/bin/flyctl.exe'
  if (Test-Path -LiteralPath $candidate) { $FlyBin = $candidate }
  else { throw 'Install the Fly CLI (https://fly.io/docs/flyctl/install/), then run fly auth login.' }
} else { $FlyBin = $FlyCommand.Source }

function Invoke-Fly {
  param([string[]]$Arguments)
  & $FlyBin @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Fly command failed: $($Arguments -join ' ')" }
}

# Validate local secrets before provisioning billable resources.
$secretLines = @()
if (-not $SkipSecrets) {
  if (-not [IO.Path]::IsPathRooted($EnvFile)) { $EnvFile = Join-Path $RootDir $EnvFile }
  if (-not (Test-Path -LiteralPath $EnvFile)) { throw "Env file not found: $EnvFile. Use -SkipSecrets if Fly secrets are already configured." }
  $allowed = @('OPENROUTER_API_KEY', 'MASSIVE_API_KEY', 'LLM_MOCK', 'MASSIVE_POLL_INTERVAL_SECONDS', 'AUTH_USERNAME', 'AUTH_PASSWORD')
  foreach ($line in [IO.File]::ReadAllLines($EnvFile)) {
    if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
      $key = $Matches[1]
      $value = $Matches[2]
      if ($allowed -notcontains $key) { continue }
      if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      if ($value -match '[\r\n]') { throw "Multiline values are unsupported for $key." }
      if ($key -eq 'OPENROUTER_API_KEY' -and $value -match '^your[-_]') { throw 'Replace the placeholder OPENROUTER_API_KEY in your env file.' }
      $secretLines += "$key=$value"
    }
  }
  if (-not ($secretLines | Where-Object { $_ -match '^AUTH_USERNAME=.+' }) -or -not ($secretLines | Where-Object { $_ -match '^AUTH_PASSWORD=.{16,}$' })) {
    throw 'Set AUTH_USERNAME and AUTH_PASSWORD (at least 16 characters) in your env file before deploying.'
  }
}

Push-Location $RootDir
try {
  Invoke-Fly -Arguments @('auth', 'whoami')
  $apps = (Invoke-Fly -Arguments @('apps', 'list', '--json')) -join "`n" | ConvertFrom-Json
  if (-not ($apps | Where-Object { $_.Name -eq $AppName })) {
    $createArgs = @('apps', 'create', $AppName)
    if ($Organization) { $createArgs += @('--org', $Organization) }
    Invoke-Fly -Arguments $createArgs
  }

  $machines = @(((Invoke-Fly -Arguments @('machine', 'list', '--app', $AppName, '--json')) -join "`n") | ConvertFrom-Json)
  if ($machines.Count -gt 1) { throw 'This SQLite deployment requires a single Machine. Use a new app name or resolve the existing multi-Machine setup first.' }

  $volumes = ((Invoke-Fly -Arguments @('volumes', 'list', '--app', $AppName, '--json')) -join "`n") | ConvertFrom-Json
  $dataVolumes = @($volumes | Where-Object { $_.Name -eq 'finally_data' })
  if ($dataVolumes.Count -gt 1) { throw 'Multiple finally_data volumes exist; choose the correct volume before deploying.' }
  if ($dataVolumes.Count -eq 1 -and $dataVolumes[0].Region -ne $Region) { throw 'The existing data volume is in another region. Rerun with its region to preserve the database.' }
  if ($dataVolumes.Count -eq 0) {
    Invoke-Fly -Arguments @('volumes', 'create', 'finally_data', '--app', $AppName, '--region', $Region, '--size', "$VolumeSizeGB", '--yes')
  }

  if ($secretLines.Count -gt 0) {
    Write-Host 'Importing runtime settings through stdin (values are hidden)...'
    $secretLines -join "`n" | & $FlyBin secrets import --app $AppName --stage
    if ($LASTEXITCODE -ne 0) { throw 'Fly secret import failed.' }
  }
  # Disable spare Machines: separate SQLite files must not serve the same app.
  Invoke-Fly -Arguments @('deploy', $RootDir, '--app', $AppName, '--config', $ConfigPath, '--dockerfile', (Join-Path $RootDir 'Dockerfile'), '--remote-only', '--ha=false', '--yes')
  Invoke-Fly -Arguments @('status', '--app', $AppName)
  $url = "https://$AppName.fly.dev"
  $healthy = $false
  for ($attempt = 0; $attempt -lt 12; $attempt++) {
    try {
      $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 15
      if ($health.status -eq 'ok') { $healthy = $true; break }
    } catch { }
    Start-Sleep -Seconds 5
  }
  if (-not $healthy) { throw "Deployment finished but the public health check failed. Inspect: fly logs --app $AppName" }
  Write-Host "FinAlly is live: $url"
} finally {
  $secretLines = @()
  Pop-Location
}
