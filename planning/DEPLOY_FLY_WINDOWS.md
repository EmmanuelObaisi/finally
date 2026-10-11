# Deploy FinAlly from Windows to Fly.io

This script builds the current source using the unchanged project Dockerfile on
Fly's remote builder. Local Docker Desktop is not required. It creates/reuses an
app and a 1 GB `finally_data` volume mounted at `/app/db`, imports runtime settings
from `.env`, deploys one Machine, and checks the public health endpoint.

## Run

Install the [Fly CLI](https://fly.io/docs/flyctl/install/) and sign in to a Fly
account with billing enabled:

```powershell
fly auth login
.\scripts\deploy_fly_windows.ps1 -AppName finally-your-unique-name
```

Choose a globally unique app name. The default region is `lhr` (London). The
public address will be `https://finally-your-unique-name.fly.dev`.

If PowerShell blocks unsigned scripts on your machine, run it in a process with
an execution-policy override (this does not change the system policy):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy_fly_windows.ps1 -AppName finally-your-unique-name
```

```powershell
# Choose a region and organization if needed.
.\scripts\deploy_fly_windows.ps1 -AppName finally-your-unique-name -Region lhr -Organization personal

# Generate/review the config without contacting Fly or reading secrets.
.\scripts\deploy_fly_windows.ps1 -AppName finally-your-unique-name -PrepareOnly

# Redeploy current source using secrets already stored on Fly.
.\scripts\deploy_fly_windows.ps1 -AppName finally-your-unique-name -SkipSecrets
```

The generated config is `planning/fly.<app-name>.toml`. The script uses
`planning/fly-persistent.toml`; the older ephemeral deployment files remain
available separately. Repeat the same command and region for updates.

## Runtime settings and data

Only `OPENROUTER_API_KEY`, `MASSIVE_API_KEY`, `LLM_MOCK`, and
`MASSIVE_POLL_INTERVAL_SECONDS`, plus `AUTH_USERNAME` and `AUTH_PASSWORD`, are imported from `.env`. Values go to Fly secrets
over stdin, never CLI arguments or the generated config. Use one-line dotenv
values; enclosing quotes are removed. The app uses simulated prices when the
Massive key is empty. Set `LLM_MOCK=false` and provide the OpenRouter key for real
AI chat. `-SkipSecrets` requires that necessary secrets are already set on Fly.

The hosted app starts with a fresh database. Your local Docker volume and current
portfolio are **not copied**. Hosted state persists on the Fly volume across
redeployments. Keep a single Machine while using this SQLite database. Volume
storage is regional; changing region requires a deliberate data migration.

The Machine can stop when idle and starts when a request arrives. Active streaming
connections can keep it running. Fly bills compute and storage; this script does
not promise a free deployment. A single Machine has brief downtime during updates.

FinAlly requires the owner username and password before accessing the portfolio,
trades, watchlist, streaming prices, or AI chat. Configure `AUTH_USERNAME` and a
strong `AUTH_PASSWORD` (at least 16 characters) in `.env` before deployment. The
script imports both as Fly secrets. Fly uses HTTPS-only session cookies. Local
HTTP uses ordinary HttpOnly cookies. Sessions last 12 hours; sign-out revokes the
session, and changing either credential invalidates existing sessions. This is a
single-owner portfolio, not separate accounts for multiple users. Do not set
`AUTH_DISABLED=true` on a public deployment. The Fly configuration forces it false.

## Inspect

```powershell
fly status --app finally-your-unique-name
fly logs --app finally-your-unique-name
fly volumes list --app finally-your-unique-name
Invoke-RestMethod https://finally-your-unique-name.fly.dev/api/health
```

If a command fails, the script stops rather than claiming success. Resources
created before a failure remain available for inspection and a repeat deployment.
The script does not delete Machines, volumes, or apps.

References: [deployment CLI](https://fly.io/docs/flyctl/deploy/),
[persistent volumes](https://fly.io/docs/flyctl/volumes-create/), and
[app configuration](https://fly.io/docs/reference/configuration/).
