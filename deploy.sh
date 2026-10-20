#!/usr/bin/env bash
# 🚀 PetService VE — Despliegue con un solo comando
#
# Uso:
#   ./deploy.sh railway <TOKEN_RAILWAY>   → app completa + SQLite persistente (recomendado)
#   ./deploy.sh vercel  <TOKEN_VERCEL>    → app en *.vercel.app (requiere DB externa, ver nota)
#   ./deploy.sh status                    → estado de la app local
#
# Cómo obtener los tokens (gratis, ~60 segundos):
#   Railway: https://railway.com/account  → Tokens → Create Token
#   Vercel:  https://vercel.com/account/tokens → Create Token
set -euo pipefail

MODE="${1:-help}"
TOKEN="${2:-}"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
say() { echo -e "${CYAN}[$GREEN PetService VE $NC$CYAN]$NC $1"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

gen_secret() { openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

# ─────────────────────────────────────────────────────────────
deploy_railway() {
  command -v railway >/dev/null 2>&1 || { npm i -g @railway/cli >/dev/null 2>&1 || bun add -g @railway/cli >/dev/null; }
  say "Autenticando con Railway..."
  railway login --token "$TOKEN" >/dev/null 2>&1
  say "Autenticado como: $(railway whoami 2>/dev/null || echo OK)"

  local SVC="petservice-ve"
  say "Creando proyecto y servicio '${SVC}'..."
  railway init --name "$SVC" 2>/dev/null || railway link --service "$SVC" 2>/dev/null || true

  say "Configurando variables de entorno..."
  railway variables --set "NODE_ENV=production" 2>/dev/null || true
  railway variables --set "AUTH_SECRET=$(gen_secret)" 2>/dev/null || true
  # DATABASE_URL se establece después de crear el volumen

  say "Creando volumen persistente en /data (para la SQLite)..."
  if ! railway volume add --service "$SVC" --mount-path /data --skip-wait 2>/dev/null; then
    warn "No se pudo crear el volumen por CLI. Créalo manualmente:"
    warn "  Railway Dashboard → tu proyecto → ${SVC} → Volumes → New Volume → mount path: /data"
    warn "Luego define la variable DATABASE_URL=file:/data/custom.db"
  fi
  railway variables --set "DATABASE_URL=file:/data/custom.db" 2>/dev/null || true

  say "Subiendo y construyendo la app (2–4 min la primera vez)..."
  railway up --detach
  say "Abriendo el dominio público..."
  sleep 5
  railway domain 2>/dev/null || warn "Genera el dominio en: Dashboard → Settings → Networking → Generate Domain"

  echo ""
  say "${GREEN}🎉 Despliegue iniciado. Ver el progreso:${NC} railway logs  (o el Dashboard)"
  say "La primera arranque crea el esquema + datos demo automáticamente (scripts/railway-start.sh)"
}

# ─────────────────────────────────────────────────────────────
deploy_vercel() {
  command -v vercel >/dev/null 2>&1 || { npm i -g vercel >/dev/null 2>&1 || bun add -g vercel >/dev/null; }
  say "Autenticando con Vercel..."
  vercel whoami --token "$TOKEN" >/dev/null 2>&1 || { echo -e "${RED}✗ Token de Vercel inválido${NC}"; exit 1; }
  say "Autenticado como: $(vercel whoami --token "$TOKEN" 2>/dev/null)"

  echo ""
  warn "IMPORTANTÍSIMO — Vercel es serverless: el filesystem es efímero."
  warn "La SQLite del repo NO persiste entre requests. Opciones:"
  warn "  A) Demo efímera (solo para ver la UI): creamos la DB en /tmp al hacer build."
  warn "  B) RECOMENDADO: DB externa gratis → Turso (SQLite distribuido) o Neon (Postgres)."
  warn "     Pasos: https://turso.tech → crear DB → pega aquí la URL cuando la tengas."
  echo ""

  if [ -z "${DATABASE_URL_EXT:-}" ]; then
    say "Sin DATABASE_URL_EXT definida → desplegando en MODO DEMO efímero (A)..."
    say "Añadiendo variables de entorno..."
    echo "file:/tmp/petservice-demo.db" | vercel env add DATABASE_URL production --token "$TOKEN" 2>/dev/null || true
    echo "file:/tmp/petservice-demo.db" | vercel env add DATABASE_URL preview --token "$TOKEN" 2>/dev/null || true
    echo "$(gen_secret)" | vercel env add AUTH_SECRET production --token "$TOKEN" 2>/dev/null || true
    echo "$(gen_secret)" | vercel env add AUTH_SECRET preview --token "$TOKEN" 2>/dev/null || true
  else
    say "Usando DATABASE_URL externa proporcionada (Turso/Neon)..."
    echo "$DATABASE_URL_EXT" | vercel env add DATABASE_URL production --token "$TOKEN" 2>/dev/null || true
    echo "$DATABASE_URL_EXT" | vercel env add DATABASE_URL preview --token "$TOKEN" 2>/dev/null || true
    echo "$(gen_secret)" | vercel env add AUTH_SECRET production --token "$TOKEN" 2>/dev/null || true
  fi

  say "Desplegando a producción..."
  vercel deploy --prod --yes --token "$TOKEN"
  say "${GREEN}🎉 Listo. URL pública arriba ↑${NC}"
}

# ─────────────────────────────────────────────────────────────
case "$MODE" in
  railway)
    [ -z "$TOKEN" ] && { echo -e "${RED}Falta el token. Uso: ./deploy.sh railway <TOKEN>${NC}"; exit 1; }
    deploy_railway ;;
  vercel)
    [ -z "$TOKEN" ] && { echo -e "${RED}Falta el token. Uso: ./deploy.sh vercel <TOKEN>${NC}"; exit 1; }
    deploy_vercel ;;
  status)
    curl -s -o /dev/null -w "App local (preview): HTTP %{http_code}\n" http://localhost:3000/ ;;
  *)
    echo ""
    echo "  🚀 PetService VE — Despliegue"
    echo ""
    echo "  ./deploy.sh railway <TOKEN>   # TODO-EN-UNO: app + DB persistente + datos demo (recomendado)"
    echo "  ./deploy.sh vercel  <TOKEN>   # Vercel (modos: demo efímero o DB externa con DATABASE_URL_EXT)"
    echo "  ./deploy.sh status            # comprobar la app local"
    echo ""
    echo "  Tokens gratis:"
    echo "    Railway → https://railway.com/account (Tokens)"
    echo "    Vercel  → https://vercel.com/account/tokens"
    echo ""
    ;;
esac
