#!/usr/bin/env bash
# Deploy-Helper für den Hetzner-Host.
#
# Holt den gewünschten Branch, baut das rentenv-Image neu und startet den
# Container. Idempotent — beliebig oft ausführbar.
#
# Nutzung (im Repo-Verzeichnis mit docker-compose.yml):
#   ./deploy.sh                      # deployt 'main'
#   ./deploy.sh <branch>             # deployt einen bestimmten Branch
#   BRANCH=<branch> ./deploy.sh      # alternativ per Env
#
# Beispiel für den aktuellen Fix:
#   ./deploy.sh claude/session-start-vyf1uy
set -euo pipefail

cd "$(dirname "$0")"

BRANCH="${1:-${BRANCH:-main}}"

echo "[deploy] Branch: ${BRANCH}"
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "[deploy] Baue Image…"
docker compose build rentenv

echo "[deploy] Starte Container…"
docker compose up -d rentenv

echo "[deploy] Letzte Logs (erwartet u.a. '[server] temp base: …'):"
docker compose logs --tail=30 rentenv
