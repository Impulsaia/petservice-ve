#!/bin/bash
# PetService VE — arranque en Railway (con volumen persistente /data)
# 1) Si la DB no existe en el volumen, crea esquema + datos demo (una sola vez)
# 2) Arranca el servidor Next.js standalone
set -e

mkdir -p /data
DB="/data/custom.db"

if [ ! -f "$DB" ]; then
  echo "🌱 Primera vez en este volumen: creando esquema y datos demo..."
  (bunx prisma db push --skip-generate || npx prisma db push --skip-generate)
  (bun prisma/seed.ts || npx tsx prisma/seed.ts)
  echo "✅ Datos demo listos (29 prestadores, 4 ciudades de Bolívar)"
else
  echo "📦 Base de datos existente encontrada en el volumen"
fi

echo "🚀 Iniciando PetService VE en el puerto $PORT..."
exec node .next/standalone/server.js
