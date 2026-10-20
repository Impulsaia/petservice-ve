# PetService VE — Informe de Seguridad (Anti-Hackeos)

**Fecha:** 2026-10-19 · **Alcance:** toda la app (APIs, sesiones, vistas, datos)
**Suite ejecutable:** `bun tests/security-check.ts` (49 pruebas automatizadas contra el servidor)
**Resultado: 49/49 PASARON ✅**

---

## 1) Modelo de amenazas cubierto

| Amenaza | Mitigación implementada | Prueba |
|---|---|---|
| Fuerza bruta en login | Rate limit en memoria: 8 intentos/15 min por IP + 5/15 min por cuenta (sliding window) | `RATE_LIMIT_LOGIN` |
| Enumeración de cuentas | Mensaje idéntico para "usuario inexistente" y "contraseña mala"; misma latencia | `ANTI_ENUMERACION` |
| Robo de sesión por XSS | Cookie `HttpOnly` (inalcanzable por JavaScript) + `SameSite=Strict` | `COOKIE_HTTPONLY`, `COOKIE_SAMESITE_STRICT` |
| Falsificación de sesión | Token firmado HMAC-SHA256 (secreto de 256 bits en `db/.auth-secret` o `AUTH_SECRET`), comparación `timingSafeEqual`, expiración de 7 días | `TOKEN_TAMPERED_REJECT`, `TOKEN_FORGED_REJECT`, `COOKIE_JUNK_REJECT` |
| Contraseñas filtradas | Hash **scrypt** con salt aleatorio de 16 bytes por usuario; el hash nunca sale en ninguna API | `NO_HASH_LEAK` |
| IDOR (acceso a datos ajenos) | Toda mutación/lectura verifica propiedad: mascotas, reservas, pagos, reseñas, notificaciones. Respuesta 404 (no filtra existencia) | `IDOR_MASCOTA_AJENA_403`, `IDOR_RESERVA_AJENA_404`, `IDOR_RESENA_AJENA_404`, `IDOR_PAGO_AJENO_404`, `PROVIDER_SOLO_SUS_RESERVAS` |
| Escalación de privilegios | Guardas de rol en `/api/admin/*`, `/api/settings` (PUT), `/api/demo/reseed`, conciliación de pagos y moderación de reseñas | `ADMIN_*_403`, `MODERATE_AS_CLIENT_403`, `RESEED_AS_CLIENT_403` |
| CSRF | Cookies `SameSite=Strict` + verificación de cabecera `Origin` en toda mutación | `CSRF_ORIGIN_403` |
| Inyección SQL | Prisma con consultas parametrizadas (sin SQL crudo); payloads de prueba no alteran la DB | `SQLI_Q_PARAM`, `SQLI_LOGIN` |
| XSS almacenado | React escapa todo el contenido por defecto (sin `dangerouslySetInnerHTML` con datos de usuario); sanitización de caracteres de control + límites de longitud en entrada | `XSS_RESENA_RECHAZADA_POR_ROL`, `XSS_BUSQUEDA_INOFENSIVA` |
| DoS por cuerpos enormes | Límite de tamaño JSON (16–32 KB según ruta) validado antes de parsear | `CUERPO_ENORME_RECHAZADO` |
| Abuso de la IA (LLM) | Rate limit por IP en `/api/ai/chat` (20/min) y `/api/ai/search` (30/min) + recorte de mensajes a 1000 caracteres | (verificado manualmente) |
| Clickjacking / sniffing | Cabeceras: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` | `HEADER_*` |
| Entradas malformadas | Validación de formatos (email, teléfono, fecha ISO, hora, método de pago, enums) y longitudes en todas las rutas | `VALIDACION_FECHA_SLOTS`, `REGISTRO_*`, `METODO_PAGO_INVALIDO_400` |

## 2) Cómo se pruéban los 3 logins

Pantalla de **login con cuentas demo** (botón "Iniciar sesión" del header):

| Rol | Correo | Contraseña |
|---|---|---|
| Cliente | `maria@demo.ve` | `demo1234` |
| Prestador | `carlos@petservice.ve` | `demo1234` |
| Administrador | `admin@petservice.ve` | `admin1234` |

Cada tarjeta de rol entra con un clic. También hay formulario manual y **registro público** (los prestadores nuevos quedan `PENDING` hasta verificación del admin).

## 3) Arquitectura de la sesión

```
Login → scrypt(contraseña, salt) → verifyPassword (timingSafeEqual)
      → token = base64url({uid, iat, exp}) + "." + HMAC_SHA256(secreto)
      → cookie psve_session (HttpOnly, SameSite=Strict, Secure en producción, 7 días)
Cada request → verifySessionToken (firma + exp) → usuario fresco en DB (rol actual)
Logout → Set-Cookie vacía (Max-Age=0, HttpOnly)
```

- El rol **siempre** se lee de la base de datos en cada petición (un usuario suspendido pierde acceso de inmediato).
- Ninguna API acepta identidad por parámetro (`?email=` fue eliminado por completo — era un hueco IDOR total).

## 4) Cómo ejecutar la suite

```bash
# con el servidor corriendo en :3000
bun tests/security-check.ts
```

La suite crea IPs simuladas por corrida (respeta `X-Forwarded-For`), usa fixtures reales de la DB
y sale con código 1 si alguna prueba falla (útil para CI).

## 5) Notas y mejoras futuras

- **Rate limiting en memoria**: en un despliegue multi-instancia convendría moverlo a Redis (aquí es un proceso único con SQLite).
- **Rotación de secreto**: el secreto HMAC vive en `db/.auth-secret` (600). En producción usar `AUTH_SECRET` desde el gestor de secretos y rotarlo invalida todas las sesiones.
- **Revocación inmediata**: el logout borra la cookie del navegador; para revocación server-side inmediata de todos los dispositivos se puede añadir un `tokenVersion` por usuario.
- **2FA**: siguiente paso natural para cuentas de administrador.
