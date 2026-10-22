# 🐙 Guía GitHub — PetService VE

Todo lo necesario para llevar el proyecto a GitHub ya está creado en el repo:

| Archivo | Para qué sirve |
|---|---|
| `README.md` | Portada del proyecto: features, cuentas demo, setup, stack, cobertura, seguridad |
| `LICENSE` | Licencia MIT (permite uso/ modifica / distribuye con atribución) |
| `.gitignore` | Ya excluye `.env`, `db/*.db`, `db/.auth-secret`, `node_modules`, `.next`, logs e internals del sandbox |
| `.env.example` | Plantilla de variables para quien clone el repo |
| `.github/workflows/ci.yml` | CI: instala, genera Prisma, lint + build y verifica que no haya secretos commiteados |
| `docs/` | Arquitectura, seguridad, decisiones de negocio VE, despliegue y esta guía |

---

## 1) Revisa antes de publicar (30 segundos)

```bash
# 1. No debe existir un .env real trackeado
git status --short | grep -i "\.env$"   # → no debe salir nada

# 2. La DB y el secreto de sesión están ignorados
git check-ignore db/custom.db db/.auth-secret && echo "✔ protegidos"
```

> ⚠️ Si alguna vez commiteaste la DB o el `.env`, bórralos del historial con `git rm --cached` antes del primer push (los `.gitignore` de este repo ya los cubren desde el inicio).

## 2) Crear el repo y hacer el primer push

### Opción A — con GitHub CLI (más rápido)

```bash
brew install gh   # o: winget install GitHub.cli / apt install gh
gh auth login

cd petservice-ve
gh repo create petservice-ve --public --source=. --remote=origin --push \
  --description "Marketplace de servicios para mascotas del estado Bolívar, Venezuela 🐾"
```

### Opción B — clásica (web)

1. Entra a [github.com/new](https://github.com/new):
   - **Repository name:** `petservice-ve`
   - Visibilidad: `Public` (o `Private` si prefieres)
   - **NO** marques "Add a README" ni ".gitignore" ni licencia (ya los tenemos → evitaría conflictos).
2. En tu máquina:

```bash
cd petservice-ve

git init                          # si aún no es repo (en este sandbox ya lo es, rama main)
git add .
git commit -m "🐾 PetService VE: marketplace de servicios para mascotas del estado Bolívar

- Marketplpace con mapas SVG de Puerto Ordaz, San Félix, Ciudad Bolívar y Upata
- Reservas + pagos venezolanos (Pago Móvil, transferencia, Zelle, Binance, efectivo)
- Paneles por rol (cliente, prestador, admin) con Consultas IA
- Seguridad: sesiones HMAC, scrypt, rate limiting, anti-IDOR/CSRF
- IA: chat Toby con guardrails, búsqueda semántica en criollo, consultas NL sin SQL"

git branch -M main
git remote add origin https://github.com/TU_USUARIO/petservice-ve.git
git push -u origin main
```

3. Refresca la página del repo → verás el README renderizado con badges de estructura, el CI corriendo en la pestaña **Actions** y la licencia MIT al pie.

## 3) Sobre la IA de GitHub (Copilot)

GitHub Copilot puede ayudarte a mantener el repo, pero **no necesita nada especial**:

- **Copilot code review** (web, gratis en repos públicos): en la PR → pestaña *Files changed* → botón *Copilot review*.
- **Copilot chat en el repo**: pregunta “¿cómo funciona la conciliación de pagos?” y se apoya en el README y docs/.
- Para que Copilot entienda mejor el proyecto ya dejamos contexto en `README.md` + `docs/arquitectura.md`.

## 4) Buenas prácticas ya configuradas

- **CI en cada push/PR** (`.github/workflows/ci.yml`): lint + build + anti-secretos. Si falla, GitHub lo marca en rojo antes de que llegue a producción.
- **Protege `main`** (recomendado): Settings → Branches → Add rule → *Require a pull request before merging* + *Require status checks* → marca el job `lint-build`.
- **Topics sugeridos** para que el proyecto se encuentre: `nextjs`, `typescript`, `prisma`, `tailwindcss`, `venezuela`, `marketplace`, `pets`, `ai`.
- **Sobre el repo** (descripción corta): `🐾 Marketplace de servicios a domicilio para mascotas — estado Bolívar, Venezuela (Next.js 16 · Prisma · IA)`.

## 5) Actualizar el repo día a día

```bash
git add . && git commit -m "✨ cambio" && git push
```

- Cada push a `main` → CI + (si conectaste Vercel) deploy automático a producción.
- Cada PR → preview URL en Vercel + veredicto del CI.
- Tags de versión: `git tag -a v1.0 -m "Primera versión pública" && git push --tags`.

## 6) Clonar en otra máquina

```bash
git clone https://github.com/TU_USUARIO/petservice-ve.git
cd petservice-ve
cp .env.example .env          # ajusta DATABASE_URL / AUTH_SECRET
npm install
npx prisma db push
npx tsx prisma/seed.ts        # datos demo del estado Bolívar
npm run dev                   # http://localhost:3000
```
