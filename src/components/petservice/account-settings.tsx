"use client";

/**
 * Editores de perfil propios (Task 29):
 * - AccountProfileEditor: cuenta de cualquier rol (foto, nombre, teléfono WhatsApp,
 *   cambio de email con confirmación de clave, cambio de contraseña persistente).
 * - BusinessProfileEditor: negocio del prestador (foto/logo, nombre, bio, redes).
 * Ambos hablan con PATCH /api/account y PATCH /api/provider/profile.
 */

import { useEffect, useState } from "react";
import { Save, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { apiGet, apiPatch } from "@/lib/petservice/api";
import { useAppStore } from "@/lib/petservice/store";
import { PhotoPicker, Avatar } from "@/components/petservice/shared";

interface AccountResp {
  user: {
    id: string; email: string; name: string; phone: string | null; role: string;
    avatarUrl: string | null; createdAt: string;
    provider: {
      id: string; businessName: string; bio: string; status: string; city: string; zoneName: string;
      avatarUrl: string | null; instagram: string | null; facebook: string | null;
      tiktok: string | null; website: string | null; newUntil: string | null;
    } | null;
  };
}

// ───────────────────────── Mi cuenta (todos los roles) ─────────────────────────

export function AccountProfileEditor({ onSaved }: { onSaved?: () => void }) {
  const setUser = useAppStore((s) => s.setUser);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const [form, setForm] = useState({
    name: "", phone: "", email: "", avatarUrl: null as string | null,
    currentPassword: "", newPassword: "",
  });
  const [initialEmail, setInitialEmail] = useState("");

  useEffect(() => {
    apiGet<AccountResp>("/api/account")
      .then((d) => {
        setForm((f) => ({
          ...f,
          name: d.user.name,
          phone: d.user.phone ?? "",
          email: d.user.email,
          avatarUrl: d.user.avatarUrl,
        }));
        setInitialEmail(d.user.email);
        setLoading(false);
      })
      .catch(() => {
        toast.error("No se pudo cargar tu perfil");
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        phone: form.phone,
        avatarUrl: form.avatarUrl,
      };
      const emailChanged = form.email.trim().toLowerCase() !== initialEmail;
      if (emailChanged) {
        payload.email = form.email.trim().toLowerCase();
        payload.currentPassword = form.currentPassword;
      }
      if (form.newPassword) {
        payload.newPassword = form.newPassword;
        payload.currentPassword = form.currentPassword || payload.currentPassword;
      }
      const d = await apiPatch<{ user: { id: string; email: string; name: string; phone: string | null; role: string; avatarUrl: string | null } }>(
        "/api/account",
        payload
      );
      // Refresca la sesión en el store (nombre/foto cambian en el header al instante)
      setUser((prev) => (prev ? { ...prev, ...d.user } : prev));
      setForm((f) => ({ ...f, currentPassword: "", newPassword: "" }));
      setInitialEmail(d.user.email);
      toast.success("Perfil actualizado ✅ Los cambios quedan guardados en tu cuenta.");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 180) : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" /> Cargando tu perfil…
      </div>
    );
  }

  const needsPassword = form.email.trim().toLowerCase() !== initialEmail || form.newPassword.length > 0;

  return (
    <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div>
        <h3 className="font-display font-extrabold">👤 Mi cuenta</h3>
        <p className="text-xs text-muted-foreground">Tu foto, datos de contacto y claves. Todo queda guardado de forma permanente.</p>
      </div>

      <PhotoPicker
        value={form.avatarUrl}
        name={form.name || "Mi foto"}
        onChange={(v) => setForm((f) => ({ ...f, avatarUrl: v }))}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs font-bold">Nombre</Label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 rounded-xl" />
        </div>
        <div>
          <Label className="text-xs font-bold">Teléfono (WhatsApp)</Label>
          <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+58 412 555 0000" className="mt-1 rounded-xl" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs font-bold">Email</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="mt-1 rounded-xl"
            placeholder="tu@email.com"
          />
          {form.email.trim().toLowerCase() !== initialEmail && (
            <p className="mt-1 text-[11px] font-semibold text-amber-600">Al guardar, iniciarás sesión con este nuevo email.</p>
          )}
        </div>

        <div className="relative sm:col-span-2 rounded-xl border border-border/60 p-3 bg-secondary/30">
          <p className="text-xs font-bold">🔐 Cambiar contraseña</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <Label className="text-xs font-bold">Clave actual {needsPassword && <span className="text-destructive">*</span>}</Label>
              <Input
                type={showCur ? "text" : "password"}
                value={form.currentPassword}
                onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
                autoComplete="current-password"
                className="mt-1 rounded-xl pr-9"
                placeholder={needsPassword ? "Requerida para confirmar" : "Solo si deseas cambiarla"}
              />
              <button type="button" onClick={() => setShowCur((v) => !v)} aria-label="Mostrar u ocultar" className="absolute right-2 top-8 text-muted-foreground hover:text-foreground">
                {showCur ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="relative">
              <Label className="text-xs font-bold">Nueva clave</Label>
              <Input
                type={showNew ? "text" : "password"}
                value={form.newPassword}
                onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
                autoComplete="new-password"
                className="mt-1 rounded-xl pr-9"
                placeholder="Mín. 8 caracteres, letras y números"
              />
              <button type="button" onClick={() => setShowNew((v) => !v)} aria-label="Mostrar u ocultar" className="absolute right-2 top-8 text-muted-foreground hover:text-foreground">
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">El cambio de clave se guarda en la base de datos y permanece entre sesiones y dispositivos.</p>
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="w-full rounded-xl bg-primary font-bold sm:w-auto">
        {saving ? "Guardando…" : <><Save className="h-4 w-4" /> Guardar cambios</>}
      </Button>
    </div>
  );
}

// ───────────────────────── Negocio (prestador) ─────────────────────────

export function BusinessProfileEditor({ onSaved }: { onSaved?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    businessName: "", bio: "", avatarUrl: null as string | null,
    instagram: "", facebook: "", tiktok: "", website: "",
  });

  useEffect(() => {
    apiGet<AccountResp>("/api/account")
      .then((d) => {
        const p = d.user.provider;
        if (p) {
          setForm({
            businessName: p.businessName,
            bio: p.bio,
            avatarUrl: p.avatarUrl,
            instagram: p.instagram ?? "",
            facebook: p.facebook ?? "",
            tiktok: p.tiktok ?? "",
            website: p.website ?? "",
          });
        }
        setLoading(false);
      })
      .catch(() => {
        toast.error("No se pudo cargar tu negocio");
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true);
    try {
      await apiPatch("/api/provider/profile", {
        businessName: form.businessName,
        bio: form.bio,
        avatarUrl: form.avatarUrl,
        instagram: form.instagram,
        facebook: form.facebook,
        tiktok: form.tiktok,
        website: form.website,
      });
      toast.success("Negocio actualizado ✅ Tu perfil público ya muestra los cambios.");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message.slice(0, 160) : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" /> Cargando tu negocio…
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div>
        <h3 className="font-display font-extrabold">🏢 Mi negocio</h3>
        <p className="text-xs text-muted-foreground">Lo que ven los clientes en tu perfil público: foto, descripción y redes sociales.</p>
      </div>

      <PhotoPicker
        value={form.avatarUrl}
        name={form.businessName || "Mi negocio"}
        onChange={(v) => setForm((f) => ({ ...f, avatarUrl: v }))}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label className="text-xs font-bold">Nombre del negocio</Label>
          <Input value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} className="mt-1 rounded-xl" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs font-bold">Descripción</Label>
          <Textarea value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} rows={3} className="mt-1 rounded-2xl" placeholder="Cuéntale a los clientes qué hace tu negocio, experiencia, certificaciones…" />
        </div>
        <div>
          <Label className="text-xs font-bold">Instagram</Label>
          <Input value={form.instagram} onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))} placeholder="@munegrooming" className="mt-1 rounded-xl" />
        </div>
        <div>
          <Label className="text-xs font-bold">Facebook</Label>
          <Input value={form.facebook} onChange={(e) => setForm((f) => ({ ...f, facebook: e.target.value }))} placeholder="https://facebook.com/…" className="mt-1 rounded-xl" />
        </div>
        <div>
          <Label className="text-xs font-bold">TikTok</Label>
          <Input value={form.tiktok} onChange={(e) => setForm((f) => ({ ...f, tiktok: e.target.value }))} placeholder="@munegrooming" className="mt-1 rounded-xl" />
        </div>
        <div>
          <Label className="text-xs font-bold">Sitio web</Label>
          <Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://…" className="mt-1 rounded-xl" />
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="w-full rounded-xl bg-primary font-bold sm:w-auto">
        {saving ? "Guardando…" : <><Save className="h-4 w-4" /> Guardar negocio</>}
      </Button>
    </div>
  );
}

/** Avatar de cabecera con foto si existe (para Admin/Client/Provider headers) */
export function HeaderAvatar({ name, avatarUrl, className }: { name: string; avatarUrl?: string | null; className?: string }) {
  return <Avatar name={name} src={avatarUrl ?? undefined} className={className ?? "h-9 w-9 text-xs"} />;
}
