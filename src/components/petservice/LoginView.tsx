"use client";

import { useState } from "react";
import { PawPrint, LogIn, UserPlus, Sparkles, ShieldCheck, Store, Dog } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export function LoginView() {
  const setUser = useAppStore((s) => s.setUser);
  const setView = useAppStore((s) => s.setView);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Registro
  const [regRole, setRegRole] = useState<"CLIENT" | "PROVIDER">("CLIENT");
  const [reg, setReg] = useState({ name: "", email: "", phone: "", password: "", businessName: "", city: "Puerto Ordaz", zoneName: "" });

  function afterAuth(u: AuthResponse["user"], welcome?: string) {
    setUser(u);
    toast.success(welcome ?? `¡Hola, ${u.name.split(" ")[0]}! 🐾`);
    setView(ROLE_HOME[u.role]);
  }

  async function doLogin(em: string, pw: string, key: string) {
    setError(null);
    setLoading(key);
    try {
      const res = await apiPost<AuthResponse>("/api/auth/login", { email: em, password: pw });
      afterAuth(res.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(null);
    }
  }

  async function doRegister() {
    setError(null);
    setLoading("register");
    try {
      const res = await apiPost<AuthResponse>("/api/auth/register", { ...reg, role: regRole });
      afterAuth(res.user, `¡Cuenta creada! Bienvenido, ${res.user.name.split(" ")[0]} 🎉`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la cuenta");
    } finally {
      setLoading(null);
    }
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
          El marketplace de servicios para mascotas del <strong>estado Bolívar</strong>: peluquería, paseos, pet sitting y más — a domicilio y con prestadores verificados.
        </p>
        <ul className="mt-6 space-y-2.5 text-sm text-white/90">
          <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Sesiones seguras con cookies HttpOnly</li>
          <li className="flex items-center gap-2"><Store className="h-4 w-4" /> {CATEGORIES.length} categorías de servicio a domicilio</li>
          <li className="flex items-center gap-2"><Dog className="h-4 w-4" /> Cobertura: Puerto Ordaz · San Félix · Ciudad Bolívar · Upata</li>
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
                  {acc.emoji}
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

          {/* ── Login manual ── */}
          <TabsContent value="login" className="mt-4">
            <form
              className="space-y-4 rounded-3xl border border-border/70 bg-card p-6"
              onSubmit={(e) => {
                e.preventDefault();
                doLogin(email, password, "form");
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="login-email">Correo electrónico</Label>
                <Input id="login-email" type="email" autoComplete="email" placeholder="tucorreo@ejemplo.ve" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password">Contraseña</Label>
                <Input id="login-password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={128} />
              </div>
              {error && (
                <p role="alert" className="rounded-xl bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  ⚠️ {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading !== null}>
                {loading === "form" ? "Entrando…" : <><LogIn className="mr-2 h-4 w-4" /> Entrar</>}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                🔐 Tu sesión viaja en una cookie HttpOnly firmada con HMAC — no accesible por JavaScript.
              </p>
            </form>
          </TabsContent>

          {/* ── Registro ── */}
          <TabsContent value="register" className="mt-4">
            <form
              className="space-y-4 rounded-3xl border border-border/70 bg-card p-6"
              onSubmit={(e) => {
                e.preventDefault();
                doRegister();
              }}
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
                  <Input id="reg-name" value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} placeholder="Ana Rodríguez" required maxLength={80} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-phone">Teléfono (WhatsApp)</Label>
                  <Input id="reg-phone" value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} placeholder="+58 412 555 0000" required maxLength={24} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-email">Correo electrónico</Label>
                <Input id="reg-email" type="email" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} placeholder="tucorreo@ejemplo.ve" required maxLength={254} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-password">Contraseña</Label>
                <Input id="reg-password" type="password" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} placeholder="Mínimo 8 caracteres, con letras y números" required maxLength={128} />
              </div>

              {regRole === "PROVIDER" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-biz">Nombre del negocio</Label>
                    <Input id="reg-biz" value={reg.businessName} onChange={(e) => setReg({ ...reg, businessName: e.target.value })} placeholder="Ej: Grooming Caroní" required maxLength={60} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-city">Ciudad</Label>
                      <Select value={reg.city} onValueChange={(v) => setReg({ ...reg, city: v, zoneName: "" })}>
                        <SelectTrigger id="reg-city"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CITIES.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-zone">Zona</Label>
                      <Select value={reg.zoneName} onValueChange={(v) => setReg({ ...reg, zoneName: v })}>
                        <SelectTrigger id="reg-zone"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
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

              {error && (
                <p role="alert" className="rounded-xl bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  ⚠️ {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading !== null}>
                {loading === "register" ? "Creando cuenta…" : <><UserPlus className="mr-2 h-4 w-4" /> Crear cuenta</>}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
