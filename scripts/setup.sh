#!/usr/bin/env bash
# One-command local setup for macOS and Linux: installs missing tooling,
# builds the solution, runs the NUnit suite, runs the Cypress suite against
# a locally-started instance, then leaves the app running.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_PROJECT="$REPO_ROOT/src/AcmeCatalog.Web"
APP_URL="http://localhost:5274"

OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM="macOS" ;;
  Linux)  PLATFORM="Linux" ;;
  *)      PLATFORM="$OS" ;;
esac
echo "==> Detected platform: $PLATFORM"

fail() { echo "ERROR: $1" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. .NET SDK
# ---------------------------------------------------------------------------
if ! command -v dotnet >/dev/null 2>&1; then
  echo "==> .NET SDK not found."
  if [ "$PLATFORM" = "macOS" ] && command -v brew >/dev/null 2>&1; then
    echo "==> Installing .NET SDK via Homebrew..."
    brew install --cask dotnet-sdk || fail "Homebrew install of dotnet-sdk failed. Install manually from https://dotnet.microsoft.com/download"
  elif command -v curl >/dev/null 2>&1; then
    echo "==> Installing .NET SDK via the official dotnet-install script..."
    curl -sSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
    bash /tmp/dotnet-install.sh --channel 10.0 --install-dir "$HOME/.dotnet"
    export PATH="$HOME/.dotnet:$PATH"
    echo "==> Add 'export PATH=\"\$HOME/.dotnet:\$PATH\"' to your shell profile to make this permanent."
  else
    fail ".NET SDK is required. Install it from https://dotnet.microsoft.com/download then re-run this script."
  fi
fi
command -v dotnet >/dev/null 2>&1 || fail ".NET SDK still not on PATH after install attempt."
echo "==> dotnet: $(dotnet --version)"

# ---------------------------------------------------------------------------
# 2. Node.js / npm (for Cypress)
# ---------------------------------------------------------------------------
if ! command -v npm >/dev/null 2>&1; then
  echo "==> Node.js/npm not found."
  if [ "$PLATFORM" = "macOS" ] && command -v brew >/dev/null 2>&1; then
    echo "==> Installing Node via Homebrew..."
    brew install node || fail "Homebrew install of node failed. Install manually from https://nodejs.org"
  else
    fail "Node.js is required for the Cypress suite. Install it from https://nodejs.org then re-run this script."
  fi
fi
command -v npm >/dev/null 2>&1 || fail "npm still not on PATH after install attempt."
echo "==> npm: $(npm --version)"

# ---------------------------------------------------------------------------
# 3. Build the solution
# ---------------------------------------------------------------------------
echo "==> Restoring and building AcmeCatalog.slnx..."
dotnet build "$REPO_ROOT/AcmeCatalog.slnx" || fail "Build failed."

# ---------------------------------------------------------------------------
# 4. Unit tests (NUnit)
# ---------------------------------------------------------------------------
echo "==> Running NUnit test suite..."
if dotnet test "$REPO_ROOT/tests/AcmeCatalog.Tests/AcmeCatalog.Tests.csproj" \
    --logger "trx;LogFileName=results.trx" --results-directory "$REPO_ROOT/TestResults"; then
  echo "==> Unit tests passed."
else
  echo "WARNING: Unit tests failed. Continuing so you can inspect the running app, but fix this before deploying." >&2
fi

# ---------------------------------------------------------------------------
# 5. Cypress dependencies
# ---------------------------------------------------------------------------
echo "==> Installing Cypress/npm dependencies..."
(cd "$WEB_PROJECT" && npm ci) || fail "npm ci failed."

# ---------------------------------------------------------------------------
# 6. Start the app in the background
# ---------------------------------------------------------------------------
if lsof -nP -iTCP:5274 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "==> Something is already listening on port 5274 — stopping it first."
  kill "$(lsof -nP -iTCP:5274 -sTCP:LISTEN -t)" 2>/dev/null || true
  sleep 1
fi

echo "==> Starting AcmeCatalog.Web in the background..."
rm -f "$WEB_PROJECT"/acmecatalog.db*
(cd "$WEB_PROJECT" && ASPNETCORE_ENVIRONMENT=Development nohup dotnet run --no-launch-profile --urls "$APP_URL" > "$REPO_ROOT/app.log" 2>&1 &)

echo "==> Waiting for the app to respond..."
READY=0
for _ in $(seq 1 30); do
  if curl -s -o /dev/null -w "%{http_code}" "$APP_URL/health" 2>/dev/null | grep -q "200"; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  fail "App didn't come up within 30s. Check $REPO_ROOT/app.log for details."
fi
echo "==> App is up at $APP_URL"

# ---------------------------------------------------------------------------
# 7. Cypress E2E tests, headless, against the running instance
# ---------------------------------------------------------------------------
echo "==> Running Cypress E2E suite..."
if (cd "$WEB_PROJECT" && npx cypress run); then
  echo "==> Cypress suite passed."
else
  echo "WARNING: Cypress suite reported failures. See output above." >&2
fi

APP_PID="$(lsof -nP -iTCP:5274 -sTCP:LISTEN -t 2>/dev/null | head -1)"
cat <<EOF

============================================================
AcmeCatalog is running at $APP_URL
Swagger:  $APP_URL/swagger
Health:   $APP_URL/health
Demo login: testuser / Test123!

Logs: $REPO_ROOT/app.log
Stop the app with: kill $APP_PID
============================================================
EOF
