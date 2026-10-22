"use client";

import { create } from "zustand";
import type { CategoryKey } from "@/lib/petservice/constants";

export type View = "home" | "provider" | "client" | "providerDash" | "admin" | "login";
export type Role = "CLIENT" | "PROVIDER" | "ADMIN";

export type SortMode = "distance" | "rating" | "price_asc" | "price_desc";

export interface Filters {
  q: string;
  category: CategoryKey | null;
  zone: string | null;
  radiusKm: number;
  minRating: number;
  petType: string | null;
  onlyVerified: boolean;
  sort: SortMode;
}

export interface AppSettings {
  usdToBs: number;
  commissionPct: number;
  defaultRadiusKm: number;
  usdToBsSource?: string;
  usdToBsUpdatedAt?: string | null;
  autoRate?: boolean;
  gmapsApiKey?: string | null;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  /** Foto de perfil (data URL o https) — editable en Mi Perfil */
  avatarUrl?: string | null;
}

interface BookingDraftRef {
  providerId: string;
  serviceId: string;
}

interface AppState {
  view: View;
  selectedProviderId: string | null;
  filters: Filters;
  loc: { label: string; lat: number; lng: number };
  city: string;
  settings: AppSettings | null;
  /** ref para refrescar listados tras mutaciones */
  dataTick: number;
  bookingDraft: BookingDraftRef | null;
  /** usuario autenticado (sesión por cookie HttpOnly) */
  user: SessionUser | null;
  authLoaded: boolean;

  setView: (v: View) => void;
  openProvider: (id: string) => void;
  backToHome: () => void;
  setFilters: (partial: Partial<Filters>) => void;
  resetFilters: () => void;
  setLoc: (loc: { label: string; lat: number; lng: number }) => void;
  setCity: (city: string, center?: { label: string; lat: number; lng: number }) => void;
  setSettings: (s: AppSettings) => void;
  bumpData: () => void;
  openBooking: (ref: BookingDraftRef) => void;
  closeBooking: () => void;
  setUser: (u: SessionUser | null) => void;
  setAuthLoaded: (loaded: boolean) => void;
}

const defaultLoc = { label: "Alta Vista, Puerto Ordaz", lat: 8.2934, lng: -62.7454 };

const defaultFilters: Filters = {
  q: "",
  category: null,
  zone: null,
  radiusKm: 8,
  minRating: 0,
  petType: null,
  onlyVerified: true,
  sort: "distance",
};

export const useAppStore = create<AppState>((set) => ({
  view: "home",
  selectedProviderId: null,
  filters: defaultFilters,
  loc: defaultLoc,
  city: "Puerto Ordaz",
  settings: null,
  dataTick: 0,
  bookingDraft: null,
  user: null,
  authLoaded: false,

  setView: (v) => set({ view: v }),
  openProvider: (id) => set({ view: "provider", selectedProviderId: id }),
  backToHome: () => set({ view: "home", selectedProviderId: null }),
  setFilters: (partial) => set((s) => ({ filters: { ...s.filters, ...partial } })),
  resetFilters: () => set({ filters: defaultFilters }),
  setLoc: (loc) => set({ loc }),
  setCity: (city, center) => set({ city, ...(center ? { loc: center } : {}) }),
  setSettings: (settings) => set({ settings }),
  bumpData: () => set((s) => ({ dataTick: s.dataTick + 1 })),
  openBooking: (bookingDraft) => set({ bookingDraft }),
  closeBooking: () => set({ bookingDraft: null }),
  setUser: (user) => set({ user }),
  setAuthLoaded: (authLoaded) => set({ authLoaded }),
}));
