
## ⚡ Despliegue con un comando

Ahora también puedes desplegar con un solo comando usando el CLI y un token:

```bash
# Railway (recomendado: app + SQLite persistente + datos demo automáticos)
./deploy.sh railway TU_TOKEN_RAILWAY

# Vercel (demo efímera, o DB externa con DATABASE_URL_EXT="libsql://..." ./deploy.sh vercel TU_TOKEN)
./deploy.sh vercel TU_TOKEN_VERCEL
```

Tokens gratis: [railway.com/account](https://railway.com/account) · [vercel.com/account/tokens](https://vercel.com/account/tokens)

---
# 🚀 Guía de despliegue — PetService VE

> Recomendación corta: **Vercel** para la app + **Turso** (o Neon) para la base de datos.
> Si prefieres no tocar nada de código y mantener SQLite tal cual, usa **Railway** o **Render** con volumen persistente.

---

## 1) ¿Dónde desplegar? Comparativa honesta

| Plataforma | Veredicto | Por qué |
|---|---|---|
| **Vercel** ⭐ recomendada | Mejor opción general | Hecha por los creadores de Next.js: deploy automático desde GitHub, preview por PR, edge network, HTTPS y dominio gratis. **Ojo:** en serverless el filesystem es efímero → la DB SQLite del repo NO persiste entre requests; conecta una DB externa (Turso/Neon) o usa Railway/Render. |
| **Railway** | Mejor “todo en uno” sin cambiar código | Te da un volumen persistente + despliega Next.js con `bun`/`node` nativo. SQLite sigue funcionando porque el archivo vive en el volumen. Precio por uso (~$5/mín). |
| **Render** | Alternativa sólida | Igual que Railway: web service + disco persistente (disco en plan de pago). Deploy desde GitHub. |
| **Fly.io** | Para control fino | VMs con volumen; más configuración (fly.toml), ideal si luego quieres multi-región. |
| **Netlify** | Posible pero menos ideal | Soporta Next.js vía adaptador; la experiencia con App Router 16 es más limitada que Vercel. |

**Resumen:** app + DB gestionada → **Vercel + Turso**. Cero cambios de código y SQLite → **Railway**.

---

## 2) Desplegar en Vercel (paso a paso)

### 2.1 Prepara la base de datos con Turso (SQLite compatible)

Turso es SQLite distribuido basado en libSQL — el schema de Prisma funciona casi igual.

1. Crea cuenta gratis en [turso.tech](https://turso.tech) e instala la CLI:
   ```bash
   curl -sSfL https://get.turso.tech | bash
   turso auth signup
   ```
2. Crea la base y obtén las credenciales:
   ```bash
   turso db create petservice-ve
   turso db show petservice-ve --url          # → libsql://petservice-ve-<algo>.turso.io
   turso db tokens create petservice-ve       # → token JWT (guárdalo)
   ```
3. Cambia el provider de Prisma (`prisma/schema.prisma`):
   ```prisma
   datasource db {
     provider = "sqlite"            // Turso usa driver sqlite+libsql
     url      = env("DATABASE_URL")
   }
   ```
   e instala el adaptador:
   ```bash
   bun add @prisma/adapter-libsql libsql
   ```
4. En `src/lib/db.ts` instancia el cliente con el adaptador (hay ejemplos oficiales de Prisma + Turso en docs.prisma.io). Para una demo sin adaptador también puedes usar `DATABASE_URL="file:/tmp/app.db"` sabiendo que los datos se borran con cada deploy (útil solo para probar).

> 💡 Alternativa 100 % gestionada: **Neon** (Postgres). Cambiarías `provider = "postgresql"` en el schema; los tipos Prisma usados aquí (String/Float/DateTime/Boolean) son idénticos.

### 2.2 Sube el repo a GitHub (ver [docs/github.md](github.md)) y luego:

1. Entra a [vercel.com](https://vercel.com) con **Continue with GitHub**.
2. **Add New… → Project** → importa el repositorio `petservice-ve`.
3. Vercel detecta Next.js automáticamente. Revisa:
   - **Framework preset:** Next.js
   - **Build command:** `npm run build` (por defecto)
   - **Install command:** `npm install`
4. **Environment Variables** (en el paso de import o luego en Settings → Environment Variables):

   | Variable | Valor | Entorno |
   |---|---|---|
   | `DATABASE_URL` | `libsql://petservice-ve-xxx.turso.io?authToken=eyJ...` | Production, Preview |
   | `AUTH_SECRET` | `openssl rand -hex 32` (un secreto largo, distinto al de dev) | Production, Preview |

5. **Deploy**. En ~2 minutos tendrás `https://tu-proyecto.vercel.app`.
6. **Crea las tablas y el seed** (una sola vez). Desde tu máquina, apuntando a la DB remota:
   ```bash
   DATABASE_URL="libsql://...?authToken=..." npx prisma db push
   DATABASE_URL="libsql://...?authToken=..." npx tsx prisma/seed.ts
   ```
7. (Opcional) **Dominio propio:** Settings → Domains → añade `petserviceve.com` y apunta los DNS que te indique.

### 2.3 Checklist post-deploy en Vercel

- [ ] Entra con `admin@petservice.ve / admin1234` y **cambia la contraseña** del admin en producción (o crea un admin nuevo y borra el demo).
- [ ] Re-ejecuta el seed solo si quieres datos demo; en producción real, mejor vacío.
- [ ] Las cookies usan `SameSite=None; Secure` — funcionan de serie en el dominio HTTPS de Vercel.
- [ ] El rate limiting va en memoria por instancia; si escalas a muchas instancias, muévelo a Upstash Redis.
- [ ] El secreto `AUTH_SECRET` de producción debe ser único y estar guardado en el vault de Vercel.

---

## 3) Desplegar en Railway (SQLite sin cambios)

1. Crea cuenta en [railway.com](https://railway.com) con GitHub → **New Project → Deploy from GitHub repo**.
2. Railway detecta Next.js. En **Variables** añade:
   - `DATABASE_URL=file:/data/petservice.db`
   - `AUTH_SECRET=<openssl rand -hex 32>`
3. En **Settings → Volumes**: monta un volumen en `/data` (persistente entre deploys).
4. Genera el cliente + schema en el start (añade un script o usa `bun run build && bun prisma db push && ...`). Puedes definir:
   - **Build:** `bun install && bun run build`
   - **Start:** `bun prisma db push && bun prisma/seed.ts && bun .next/standalone/server.js` (seed solo la primera vez).
5. **Settings → Networking → Generate Domain** → URL pública HTTPS.

## 4) Desplegar en Render

1. [render.com](https://render.com) → **New → Web Service** → conecta el repo.
2. Runtime **Node**, Build: `npm install && npm run build && npx prisma db push`, Start: `npm run start`.
3. Añade las mismas variables de entorno (`DATABASE_URL` apuntando a un **Render Disk** montado en `/data`, `AUTH_SECRET`).
4. Health check path: `/api/route` (o `/`).

---

## 5) Variables de entorno (referencia)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | ✅ | `file:./db/custom.db` en dev; `libsql://…` (Turso) o `postgresql://…` (Neon) en prod |
| `AUTH_SECRET` | ✅ en prod | Secreto HMAC de las sesiones. `openssl rand -hex 32`. Si falta en dev, se autogenera en `db/.auth-secret` |

## 6) Mantenimiento

- **Backups:** en Turso, `turso db export` programado; en Railway/Render, snapshot del volumen.
- **Logs:** Vercel → Deployments → Functions; Railway/Render → Logs en vivo.
- **Tasa USD/Bs y comisión:** se editan en vivo desde el panel admin (Config) — no requieren redeploy.
- **Actualizaciones:** push a `main` → deploy automático; las PR generan preview URLs.
