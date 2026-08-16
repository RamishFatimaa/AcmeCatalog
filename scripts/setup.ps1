# One-command local setup for Windows: installs missing tooling, builds the
# solution, runs the NUnit suite, runs the Cypress suite against a locally
# started instance, then leaves the app running.
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$WebProject = Join-Path $RepoRoot "src\AcmeCatalog.Web"
$AppUrl = "http://localhost:5274"

Write-Host "==> Detected platform: Windows"

function Fail($msg) {
    Write-Error $msg
    exit 1
}

# ---------------------------------------------------------------------------
# 1. .NET SDK
# ---------------------------------------------------------------------------
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Host "==> .NET SDK not found."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "==> Installing .NET SDK via winget..."
        winget install --id Microsoft.DotNet.SDK.10 --accept-package-agreements --accept-source-agreements
    }
    else {
        Fail ".NET SDK is required. Install it from https://dotnet.microsoft.com/download then re-run this script."
    }
}
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Fail ".NET SDK still not on PATH after install attempt. Open a new terminal and try again."
}
Write-Host "==> dotnet: $(dotnet --version)"

# ---------------------------------------------------------------------------
# 2. Node.js / npm (for Cypress)
# ---------------------------------------------------------------------------
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "==> Node.js/npm not found."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "==> Installing Node.js via winget..."
        winget install --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    }
    else {
        Fail "Node.js is required for the Cypress suite. Install it from https://nodejs.org then re-run this script."
    }
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Fail "npm still not on PATH after install attempt. Open a new terminal and try again."
}
Write-Host "==> npm: $(npm --version)"

# ---------------------------------------------------------------------------
# 3. Build the solution
# ---------------------------------------------------------------------------
Write-Host "==> Restoring and building AcmeCatalog.slnx..."
dotnet build (Join-Path $RepoRoot "AcmeCatalog.slnx")
if ($LASTEXITCODE -ne 0) { Fail "Build failed." }

# ---------------------------------------------------------------------------
# 4. Unit tests (NUnit)
# ---------------------------------------------------------------------------
Write-Host "==> Running NUnit test suite..."
dotnet test (Join-Path $RepoRoot "tests\AcmeCatalog.Tests\AcmeCatalog.Tests.csproj") `
    --logger "trx;LogFileName=results.trx" --results-directory (Join-Path $RepoRoot "TestResults")
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Unit tests failed. Continuing so you can inspect the running app, but fix this before deploying."
}
else {
    Write-Host "==> Unit tests passed."
}

# ---------------------------------------------------------------------------
# 5. Cypress dependencies
# ---------------------------------------------------------------------------
Write-Host "==> Installing Cypress/npm dependencies..."
Push-Location $WebProject
npm ci
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "npm ci failed." }
Pop-Location

# ---------------------------------------------------------------------------
# 6. Start the app in the background
# ---------------------------------------------------------------------------
$existing = Get-NetTCPConnection -LocalPort 5274 -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "==> Something is already listening on port 5274 — stopping it first."
    $existing | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
}

Write-Host "==> Starting AcmeCatalog.Web in the background..."
Remove-Item -Path (Join-Path $WebProject "acmecatalog.db*") -ErrorAction SilentlyContinue
$env:ASPNETCORE_ENVIRONMENT = "Development"
$logFile = Join-Path $RepoRoot "app.log"
$appProcess = Start-Process -FilePath "dotnet" `
    -ArgumentList "run", "--no-launch-profile", "--urls", $AppUrl `
    -WorkingDirectory $WebProject `
    -RedirectStandardOutput $logFile -RedirectStandardError $logFile `
    -PassThru -WindowStyle Hidden

Write-Host "==> Waiting for the app to respond..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "$AppUrl/health" -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) { $ready = $true; break }
    }
    catch { Start-Sleep -Seconds 1 }
}

if (-not $ready) {
    Fail "App didn't come up within 30s. Check $logFile for details."
}
Write-Host "==> App is up at $AppUrl"

# ---------------------------------------------------------------------------
# 7. Cypress E2E tests, headless, against the running instance
# ---------------------------------------------------------------------------
Write-Host "==> Running Cypress E2E suite..."
Push-Location $WebProject
npx cypress run
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Cypress suite reported failures. See output above."
}
else {
    Write-Host "==> Cypress suite passed."
}
Pop-Location

Write-Host ""
Write-Host "============================================================"
Write-Host "AcmeCatalog is running at $AppUrl"
Write-Host "Swagger:  $AppUrl/swagger"
Write-Host "Health:   $AppUrl/health"
Write-Host "Demo login: testuser / Test123!"
Write-Host ""
Write-Host "Logs: $logFile"
Write-Host "Stop the app with: Stop-Process -Id $($appProcess.Id)"
Write-Host "============================================================"
