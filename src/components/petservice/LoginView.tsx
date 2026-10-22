"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PawPrint, LogIn, UserPlus, Sparkles, ShieldCheck, Store, Dog, Eye, EyeOff, KeyRound, Mail, TriangleAlert, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAppStore, type Role } from "@/lib/petservice/store";
import { apiPost } from "@/lib/petservice/api";
import { DEMO_ACCOUNTS, ZONES, CATEGORIES, CITIES } from "@/lib/petservice/constants";
import type { DemoAccount } from "@/lib/petservice/constants";

interface AuthResponse {
  user: { id: string; email: string; name: string; role: Role; phone: string | null };
  error?: string;
}

const ROLE_HOME: Record<Role, "home" | "providerDash" | "admin"> = {
  CLIENT: "home",
  PROVIDER: "providerDash",
  ADMIN: "admin",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function LoginView() {
  const setUser = useAppStore((s) => s.setUser);
  const setView = useAppStore((s) => s.setView);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  // Aviso OAuth: llega como /?loginError=google_no_configurado tras el redirect de /api/auth/google
  const [oauthNotice, setOauthNotice] = useState(false);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("loginError") === "google_no_configurado") {
        setOauthNotice(true);
        // Limpia la URL para que el error no quede pegado en el historial
        params.delete("loginError");
        const qs = params.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      }
    } catch {
      /* entorno sin history (raro) — ignorar */
    }
  }, []);

  // Registro
  const [regRole, setRegRole] = useState<"CLIENT" | "PROVIDER">("CLIENT");
  const [reg, setReg] = useState({ name: "", email: "", phone: "", password: "", businessName: "", city: "Puerto Ordaz", zoneName: "" });
  const [regError, setRegError] = useState<string | null>(null);
  const [showRegPw, setShowRegPw] = useState(false);

  // Recuperación de contraseña
  const [forgotOpen, setForgotOpen] = useState(false);
  // Enlace real del email: /restablecer?token=… (rewrite → “/” con pathname intacto)
  const [resetToken, setResetToken] = useState<string | null>(null);
  useEffect(() => {
    try {
      if (window.location.pathname !== "/restablecer") return;
      const params = new URLSearchParams(window.location.search);
      const t = params.get("token");
      if (t) {
        setResetToken(t);
        setForgotOpen(true);
        // Limpia la query para que el token no quede en el historial
        window.history.replaceState(null, "", "/");
      }
    } catch {
      /* entorno sin history (raro) — ignorar */
    }
  }, []);

  function afterAuth(u: AuthResponse["user"], welcome?: string) {
    setUser(u);
    toast.success(welcome ?? `¡Hola, ${u.name.split(" ")[0]}! 🐾`);
    setView(ROLE_HOME[u.role]);
  }

  async function doLogin(em: string, pw: string, key: string) {
    setLoginError(null);
    setLoading(key);
    try {
      const res = await apiPost<AuthResponse>("/api/auth/login", { email: em, password: pw });
      afterAuth(res.user);
    } catch (e) {
      // Mensaje genérico del backend (anti-enumeración): no revela si el correo existe
      setLoginError(e instanceof Error ? e.message : "No se pudo iniciar sesión. Intenta de nuevo.");
    } finally {
      setLoading(null);
    }
  }

  function submitLogin(e: FormEvent) {
    e.preventDefault();
    const em = email.trim();
    let ok = true;
    if (!em) {
      setEmailErr("Escribe tu correo para entrar · ej: maria@demo.ve");
      ok = false;
    } else if (!EMAIL_RE.test(em)) {
      setEmailErr("Ese correo no parece válido · ej: maria@demo.ve");
      ok = false;
    } else {
      setEmailErr(null);
    }
    if (!password) {
      setPwErr("Escribe tu contraseña");
      ok = false;
    } else {
      setPwErr(null);
    }
    if (ok) doLogin(em, password, "form");
  }

  function goGoogle() {
    setLoading("google");
    window.location.href = "/api/auth/google";
  }

  function submitRegister(e: FormEvent) {
    e.preventDefault();
    const em = reg.email.trim();
    if (!EMAIL_RE.test(em)) {
      setRegError("Escribe un correo válido · ej: tucorreo@ejemplo.ve");
      return;
    }
    if (reg.password.length < 8 || !/[A-Za-z]/.test(reg.password) || !/\d/.test(reg.password)) {
      setRegError("La contraseña debe tener mínimo 8 caracteres, con letras y números");
      return;
    }
    doRegister();
  }

  async function doRegister() {
    setRegError(null);
    setLoading("register");
    try {
      const res = await apiPost<AuthResponse>("/api/auth/register", { ...reg, role: regRole });
      afterAuth(res.user, `¡Cuenta creada! Bienvenido, ${res.user.name.split(" ")[0]} 🎉`);
    } catch (e) {
      setRegError(e instanceof Error ? e.message : "No se pudo crear la cuenta");
    } finally {
      setLoading(null);
    }
  }

  /** Éxito del reset: cerrar dialog + toast + prellenar email para el login */
  function onResetDone(em: string) {
    setForgotOpen(false);
    toast.success("¡Contraseña actualizada! Ingresa con tu nueva clave");
    if (em) {
      setEmail(em);
      setEmailErr(null);
    }
    setPassword("");
    setPwErr(null);
    setLoginError(null);
  }

  const zonesOfCity = ZONES.filter((z) => z.city === reg.city);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 py-4 lg:grid-cols-[1fr_1.1fr] lg:gap-12">
      {/* ───────── Panel de marca (divertido) ───────── */}
      <section className="relative hidden flex-col justify-center overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-teal-600 via-teal-500 to-emerald-500 p-10 text-white shadow-warm lg:flex" aria-label="Presentación de PetService VE">
        <div className="bg-paw-dots pointer-events-none absolute inset-0 opacity-20" aria-hidden />
        <span className="absolute right-8 top-8 animate-floaty text-5xl" aria-hidden>🐾</span>
        <span className="absolute bottom-24 right-16 animate-floaty text-3xl [animation-delay:1.2s]" aria-hidden>🦴</span>
        <span className="absolute bottom-10 left-10 animate-floaty text-3xl [animation-delay:0.6s]" aria-hidden>🐕</span>
        <span className="absolute left-16 top-16 animate-floaty text-2xl [animation-delay:1.8s]" aria-hidden>🐈</span>

        <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
          <PawPrint className="h-8 w-8 animate-wiggle" />
        </span>
        <h1 className="font-display text-4xl font-black leading-tight">
          ¡Bienvenido a<br />PetService <span className="rounded-xl bg-white/20 px-2">VE</span>!
        </h1>
        <p className="mt-4 max-w-sm text-white/90">
          El marketplace de servicios para mascotas en <strong>toda Venezuela</strong> 🇻🇪: peluquería, paseos, pet sitting y más — a domicilio y con prestadores verificados.
        </p>
        <ul className="mt-6 space-y-2.5 text-sm text-white/90">
          <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Sesiones seguras con cookies HttpOnly</li>
          <li className="flex items-center gap-2"><Store className="h-4 w-4" /> {CATEGORIES.length} categorías de servicio a domicilio</li>
          <li className="flex items-center gap-2"><Dog className="h-4 w-4" /> Activos hoy en Bolívar · llegando a 29 ciudades (Caracas, Maracaibo, Valencia…)</li>
        </ul>
        <div className="mt-8 rounded-2xl bg-white/10 p-4 text-xs text-white/80 backdrop-blur">
          🧪 <strong>Modo demo:</strong> usa una de las cuentas de prueba de la derecha para entrar con un clic. Los datos son sintéticos.
        </div>
      </section>

      {/* ───────── Tarjeta de acceso ───────── */}
      <section className="flex flex-col justify-center">
        <div className="mb-6 flex items-center gap-3 lg:hidden">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white shadow-warm">
            <PawPrint className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-xl font-black">PetService VE</h1>
            <p className="text-xs text-muted-foreground">Estado Bolívar · Venezuela 🇻🇪</p>
          </div>
        </div>

        {/* Aviso OAuth (Google sin configurar) */}
        {oauthNotice && (
          <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Google no está configurado en este entorno. El administrador debe definir{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px] dark:bg-amber-900/60">GOOGLE_CLIENT_ID</code> y{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px] dark:bg-amber-900/60">GOOGLE_CLIENT_SECRET</code>{" "}
              (ver docs/despliegue.md).
            </span>
          </div>
        )}

        {/* Cuentas demo de un clic */}
        <div className="mb-6 rounded-3xl border border-accent/50 bg-accent/10 p-5">
          <h2 className="flex items-center gap-2 font-display text-sm font-black uppercase tracking-wide text-accent-foreground">
            <Sparkles className="h-4 w-4" /> Probar el login — cuentas demo
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Un clic para entrar con cada rol. Credenciales visibles para la prueba.</p>
          <div className="mt-4 grid gap-2.5">
            {DEMO_ACCOUNTS.map((acc: DemoAccount) => (
              <button
                key={acc.email}
                onClick={() => doLogin(acc.email, acc.password, acc.role)}
                disabled={loading !== null}
                className={cn(
                  "group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-warm disabled:opacity-60"
                )}
                aria-label={`Entrar como ${acc.label}: ${acc.name}`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-xl transition-transform group-hover:scale-110" aria-hidden>
                  {loading === acc.role ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : acc.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-display text-sm font-extrabold">{acc.label}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black uppercase", acc.chip)}>{acc.role}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{acc.desc}</span>
                  <span className="mt-0.5 block font-mono text-[11px] font-semibold text-primary">
                    {acc.email} · {acc.password}
                  </span>
                </span>
                <LogIn className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
              </button>
            ))}
          </div>
        </div>

        <Tabs defaultValue="login">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Iniciar sesión</TabsTrigger>
            <TabsTrigger value="register">Crear cuenta</TabsTrigger>
          </TabsList>

          {/* ── Login manual + Google ── */}
          <TabsContent value="login" className="mt-4">
            <div className="space-y-4 rounded-3xl border border-border/70 bg-card p-6">
              <Button
                type="button"
                variant="outline"
                onClick={goGoogle}
                disabled={loading !== null}
                className="h-11 w-full rounded-xl border-border bg-card font-bold text-foreground hover:bg-secondary"
              >
                {loading === "google" ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirigiendo a Google…</>
                ) : (
                  <><GoogleIcon className="mr-2.5 h-5 w-5" /> Continuar con Google</>
                )}
              </Button>
              <p className="-mt-2 text-center text-[11px] text-muted-foreground">También puedes entrar con tus credenciales</p>

              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">o</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <form noValidate className="space-y-4" onSubmit={submitLogin}>
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">Correo electrónico</Label>
                  <Input
                    id="login-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="maria@demo.ve"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailErr(null);
                      setLoginError(null);
                    }}
                    className={cn("h-11 rounded-xl", emailErr && "border-rose-400 focus-visible:ring-rose-300")}
                    aria-invalid={!!emailErr}
                    maxLength={254}
                  />
                  {emailErr && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{emailErr}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-password">Contraseña</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPw ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setPwErr(null);
                        setLoginError(null);
                      }}
                      className={cn("h-11 rounded-xl pr-12", pwErr && "border-rose-400 focus-visible:ring-rose-300")}
                      aria-invalid={!!pwErr}
                      maxLength={128}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                      title={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                      className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                  {pwErr && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{pwErr}</p>}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setForgotOpen(true)}
                      className="rounded px-1 py-1 text-xs font-bold text-primary underline-offset-2 hover:underline"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                </div>

                {loginError && (
                  <p role="alert" className="rounded-xl bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    ⚠️ {loginError}
                  </p>
                )}
                <Button type="submit" className="h-11 w-full rounded-xl font-bold shadow-warm" disabled={loading !== null}>
                  {loading === "form" ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Entrando…</>
                  ) : (
                    <><LogIn className="mr-2 h-4 w-4" /> Entrar</>
                  )}
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  🔐 Tu sesión viaja en una cookie HttpOnly firmada con HMAC — no accesible por JavaScript.
                </p>
              </form>
            </div>
          </TabsContent>

          {/* ── Registro ── */}
          <TabsContent value="register" className="mt-4">
            <form
              noValidate
              className="space-y-4 rounded-3xl border border-border/70 bg-card p-6"
              onSubmit={submitRegister}
            >
              <div className="grid grid-cols-2 gap-2">
                {(["CLIENT", "PROVIDER"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRegRole(r)}
                    className={cn(
                      "rounded-2xl border px-3 py-2.5 text-sm font-bold transition-all",
                      regRole === r ? "border-primary bg-primary/10 text-primary shadow-warm" : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {r === "CLIENT" ? "👩 Soy cliente" : "🧑‍🎨 Soy prestador"}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-name">Nombre completo</Label>
                  <Input id="reg-name" value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} placeholder="Ana Rodríguez" required maxLength={80} className="h-11 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-phone">Teléfono (WhatsApp)</Label>
                  <Input id="reg-phone" value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} placeholder="+58 412 555 0000" required maxLength={24} className="h-11 rounded-xl" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-email">Correo electrónico</Label>
                <Input id="reg-email" type="email" inputMode="email" value={reg.email} onChange={(e) => { setReg({ ...reg, email: e.target.value }); setRegError(null); }} placeholder="tucorreo@ejemplo.ve" required maxLength={254} className="h-11 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-password">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="reg-password"
                    type={showRegPw ? "text" : "password"}
                    autoComplete="new-password"
                    value={reg.password}
                    onChange={(e) => { setReg({ ...reg, password: e.target.value }); setRegError(null); }}
                    placeholder="Mínimo 8 caracteres, con letras y números"
                    required
                    maxLength={128}
                    className="h-11 rounded-xl pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPw((v) => !v)}
                    aria-label={showRegPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                    title={showRegPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    {showRegPw ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>

              {regRole === "PROVIDER" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-biz">Nombre del negocio</Label>
                    <Input id="reg-biz" value={reg.businessName} onChange={(e) => setReg({ ...reg, businessName: e.target.value })} placeholder="Ej: Grooming Caroní" required maxLength={60} className="h-11 rounded-xl" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-city">Ciudad</Label>
                      <Select value={reg.city} onValueChange={(v) => setReg({ ...reg, city: v, zoneName: "" })}>
                        <SelectTrigger id="reg-city" className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CITIES.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-zone">Zona</Label>
                      <Select value={reg.zoneName} onValueChange={(v) => setReg({ ...reg, zoneName: v })}>
                        <SelectTrigger id="reg-zone" className="h-11 rounded-xl"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                        <SelectContent>
                          {zonesOfCity.map((z) => <SelectItem key={z.name} value={z.name}>{z.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    🛡️ Tu negocio queda <strong>en verificación</strong> (PENDING) hasta que el admin lo apruebe.
                  </p>
                </>
              )}

              {regError && (
                <p role="alert" className="rounded-xl bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  ⚠️ {regError}
                </p>
              )}
              <Button type="submit" className="h-11 w-full rounded-xl font-bold shadow-warm" disabled={loading !== null}>
                {loading === "register" ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creando cuenta…</>
                ) : (
                  <><UserPlus className="mr-2 h-4 w-4" /> Crear cuenta</>
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </section>

      {/* ── Dialog de recuperación de contraseña (2 pasos) ── */}
      <ForgotPasswordDialog
        open={forgotOpen}
        onOpenChange={(v) => { setForgotOpen(v); if (!v) setResetToken(null); }}
        onDone={onResetDone}
        initialToken={resetToken}
      />
    </div>
  );
}

// ───────────────────────── Icono oficial de Google (4 colores) ─────────────────────────

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.05-3.71 1.05-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

// ───────────────────────── Recuperación de contraseña (2 pasos) ─────────────────────────

function ForgotPasswordDialog({ open, onOpenChange, onDone, initialToken }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: (email: string) => void;
  /** Token del enlace email (/restablecer?token=…): abre directo en el paso 2 */
  initialToken?: string | null;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [sentMsg, setSentMsg] = useState<string | null>(null);
  const [demoUrl, setDemoUrl] = useState<string | null>(null);
  const [step1Err, setStep1Err] = useState<string | null>(null);

  const [token, setToken] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [step2Err, setStep2Err] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset completo cada vez que se abre
  useEffect(() => {
    if (!open) return;
    if (initialToken) {
      // Llegada desde el email: directo al paso 2 con el token precargado
      setStep(2);
      setToken(initialToken);
      setEmailErr(null);
      setSentMsg(null);
      setDemoUrl(null);
      setStep1Err(null);
      setPw("");
      setPw2("");
      setShowPw(false);
      setStep2Err(null);
      setBusy(false);
      return;
    }
    setStep(1);
    setEmail("");
    setEmailErr(null);
    setSentMsg(null);
    setDemoUrl(null);
    setStep1Err(null);
    setToken("");
    setPw("");
    setPw2("");
    setShowPw(false);
    setStep2Err(null);
    setBusy(false);
  }, [open, initialToken]);

  async function sendLink() {
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) {
      setEmailErr("Escribe un correo válido · ej: maria@demo.ve");
      return;
    }
    setEmailErr(null);
    setStep1Err(null);
    setBusy(true);
    try {
      const res = await apiPost<{ ok: boolean; message: string; demo?: boolean; resetUrl?: string }>("/api/auth/forgot-password", { email: em });
      // Éxito SIEMPRE genérico (anti-enumeración): no se revela si el correo existe o no
      setSentMsg(res.message || "Si ese correo está registrado, recibirás el enlace para restablecer tu contraseña.");
      if (res.demo && res.resetUrl) setDemoUrl(res.resetUrl);
    } catch (e) {
      setStep1Err(e instanceof Error ? e.message : "No se pudo enviar el enlace. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  function goStep2WithToken(url: string) {
    const m = url.match(/token=([A-Za-z0-9._-]+)/);
    setToken(m?.[1] ?? "");
    setStep2Err(null);
    setStep(2);
  }

  async function doReset() {
    const t = token.trim();
    if (!t) {
      setStep2Err("Pega el token del enlace (o vuelve al paso 1 para pedirlo)");
      return;
    }
    if (pw.length < 8) {
      setStep2Err("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
      setStep2Err("Usa letras y números: mínimo 8 caracteres");
      return;
    }
    if (pw !== pw2) {
      setStep2Err("Las contraseñas no coinciden");
      return;
    }
    setStep2Err(null);
    setBusy(true);
    try {
      await apiPost("/api/auth/reset-password", { token: t, password: pw });
      onDone(email.trim().toLowerCase());
    } catch (e) {
      // Token inválido/expirado/usado → error inline en rojo
      setStep2Err(e instanceof Error ? e.message : "No se pudo actualizar la contraseña. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onOpenChange(false); }}>
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-3xl sm:max-w-md">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display font-black"><KeyRound className="h-5 w-5 text-primary" /> Recuperar contraseña</DialogTitle>
              <DialogDescription>Paso 1 de 2 — te enviaremos un enlace mágico para crear una clave nueva.</DialogDescription>
            </DialogHeader>
            <form
              noValidate
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                sendLink();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="fp-email">Correo de tu cuenta</Label>
                <Input
                  id="fp-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="maria@demo.ve"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailErr(null);
                    setStep1Err(null);
                  }}
                  className={cn("h-11 rounded-xl", emailErr && "border-rose-400 focus-visible:ring-rose-300")}
                  aria-invalid={!!emailErr}
                  maxLength={254}
                />
                {emailErr && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{emailErr}</p>}
              </div>

              {step1Err && (
                <p role="alert" className="rounded-xl bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  ⚠️ {step1Err}
                </p>
              )}

              <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-primary font-bold shadow-warm">
                {busy ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando…</>
                ) : (
                  <><Mail className="mr-2 h-4 w-4" /> Enviar enlace</>
                )}
              </Button>

              {sentMsg && (
                <div className="rounded-xl bg-emerald-100 px-3 py-2.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  ✅ {sentMsg} Revisa tu bandeja (y el spam) — el enlace vence en 30 minutos.
                </div>
              )}

              {sentMsg && !demoUrl && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  🧪 <strong>Modo demo:</strong> no se envían correos reales todavía. Si tu cuenta existe, el enlace
                  aparece aquí mismo en verde. ¿No apareció? Ese correo no está registrado en la demo — crea tu cuenta
                  en la pestaña <strong>"Crear cuenta"</strong> e inténtalo de nuevo.
                </p>
              )}

              {demoUrl && (
                <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-3.5 dark:border-amber-500/40 dark:bg-amber-950/40">
                  <p className="text-xs font-black text-amber-800 dark:text-amber-300">🧪 Modo demo: aquí está tu enlace directo</p>
                  <p className="mt-1.5 break-all font-mono text-[10px] leading-relaxed text-amber-700 dark:text-amber-300/80">{demoUrl}</p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => goStep2WithToken(demoUrl)}
                    className="mt-2.5 h-9 w-full rounded-lg bg-amber-500 font-bold text-white hover:bg-amber-600"
                  >
                    Crear mi nueva contraseña →
                  </Button>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setStep2Err(null);
                  setStep(2);
                }}
                className="w-full rounded px-1 py-1.5 text-center text-[11px] font-bold text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
              >
                ¿Ya tienes un enlace o token? Continúa aquí
              </button>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display font-black"><KeyRound className="h-5 w-5 text-primary" /> Crea tu nueva contraseña</DialogTitle>
              <DialogDescription>Paso 2 de 2 — mínimo 8 caracteres, con letras y números.</DialogDescription>
            </DialogHeader>
            <form
              noValidate
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                doReset();
              }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">Token de un solo uso · vence en 30 min</p>
                <button
                  type="button"
                  onClick={() => {
                    setStep2Err(null);
                    setStep(1);
                  }}
                  className="rounded px-1 py-0.5 text-xs font-bold text-primary hover:underline"
                >
                  ← Volver
                </button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fp-token">Token del enlace</Label>
                <Input
                  id="fp-token"
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value);
                    setStep2Err(null);
                  }}
                  placeholder="Pega aquí el token que recibiste"
                  spellCheck={false}
                  maxLength={128}
                  className="h-11 rounded-xl font-mono text-xs"
                  aria-invalid={!!step2Err}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fp-pw">Nueva contraseña</Label>
                <div className="relative">
                  <Input
                    id="fp-pw"
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Mínimo 8 caracteres"
                    value={pw}
                    onChange={(e) => {
                      setPw(e.target.value);
                      setStep2Err(null);
                    }}
                    className="h-11 rounded-xl pr-12"
                    maxLength={128}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                    title={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    {showPw ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fp-pw2">Confirmar contraseña</Label>
                <Input
                  id="fp-pw2"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Repite la clave"
                  value={pw2}
                  onChange={(e) => {
                    setPw2(e.target.value);
                    setStep2Err(null);
                  }}
                  className="h-11 rounded-xl"
                  maxLength={128}
                />
              </div>

              {step2Err && (
                <p role="alert" className="rounded-xl bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  ⚠️ {step2Err}
                </p>
              )}

              <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-primary font-bold shadow-warm">
                {busy ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Actualizando…</>
                ) : (
                  "Guardar nueva contraseña"
                )}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
