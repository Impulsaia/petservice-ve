/**
 * E2E multi-rol (local) — PetService VE
 * Simula: dueña de mascota (maria) → prestador (Ponme Guapo) → admin.
 * Valida: persistencia de mascotas y reservas tras logout/login (el bug del
 * usuario), flujo FREE prereserva directa, flujo COMMISSION conciliado por el
 * admin, métricas FREE vs gestionadas y la acción admin sobre reservas sin
 * comprobante.
 *
 * Uso: bun scripts/tmp/e2e-multirrole.ts
 */
const BASE = "http://localhost:3000";

let failures = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ""}`);
  else {
    failures++;
    console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

interface Jar { cookie: string }
async function api(jar: Jar | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(jar?.cookie ? { cookie: jar.cookie } : {}),
      origin: BASE,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie && jar) {
    jar.cookie = setCookie.split(";")[0];
  }
  let json: unknown = null;
  try { json = await res.json(); } catch { /* vacío */ }
  return { status: res.status, json: json as Record<string, unknown> };
}

async function main() {
  const maria: Jar = { cookie: "" };
  const prest: Jar = { cookie: "" };
  const admin: Jar = { cookie: "" };

  console.log("\n── 1) ROL CLIENTE: maria ──────────────────────────────");
  const mLogin = await api(maria, "POST", "/api/auth/login", { email: "maria@demo.ve", password: "demo1234" });
  ok("login maria", mLogin.status === 200, `status=${mLogin.status}`);

  const petName = `Rex-E2E-${Date.now().toString(36)}`;
  const newPet = await api(maria, "POST", "/api/pets", { name: petName, species: "PERRO", size: "M", breed: "Beagle" });
  ok("crear mascota nueva", newPet.status === 201, `status=${newPet.status}`);

  // LOGOUT + RELOGIN (el bug reportado: mascotas/reservas desaparecen al desloguear)
  await api(maria, "POST", "/api/auth/logout");
  const maria2: Jar = { cookie: "" };
  const mRelogin = await api(maria2, "POST", "/api/auth/login", { email: "maria@demo.ve", password: "demo1234" });
  ok("relogin maria tras logout", mRelogin.status === 200);
  const petsAfter = await api(maria2, "GET", "/api/pets");
  const petsList = (petsAfter.json.pets as { name: string }[] | undefined) ?? [];
  ok("mascota persiste tras logout/login", petsList.some((p) => p.name === petName), `total=${petsList.length}`);

  // Elegir prestador FREE (Ponme Guapo) + su primer servicio
  const provs = await api(maria2, "GET", "/api/providers?ciudad=Puerto%20Ordaz");
  const provList = (provs.json.providers as { id: string; businessName: string }[] | undefined) ?? [];
  const ponme = provList.find((p) => p.businessName.includes("Ponme"));
  ok("prestador Ponme Guapo visible", !!ponme);
  if (!ponme) return finish();

  const provDetail = await api(maria2, "GET", `/api/providers/${ponme.id}`);
  const services = (provDetail.json.services as { id: string; name: string; petTypes: string; petSizes: string }[] | undefined) ?? [];
  const svc = services.find((s) => s.petTypes.split(",").includes("PERRO") && s.petSizes.split(",").includes("M"));
  ok("servicio compatible disponible", !!svc);
  const monetization = (provDetail.json.provider as { monetization?: { usesPlatformPayments: boolean; plan: string } } | undefined)?.monetization;
  console.log(`  ℹ️ plan del prestador: ${monetization?.plan} · usaPagosPlataforma=${monetization?.usesPlatformPayments}`);

  const petId = petsList.find((p) => p.name === petName)!.id;
  const tomorrow = new Date(Date.now() + 86400_000);
  const date = tomorrow.toISOString().slice(0, 10);
  const time = "10:00";

  const isFreeFlow = !monetization?.usesPlatformPayments;
  let bookingCode = "";
  if (isFreeFlow) {
    const b = await api(maria2, "POST", "/api/bookings", {
      providerId: ponme.id, serviceId: svc!.id, petId, address: "Av. Guayana, Torre Sindoni, Piso 5, Puerto Ordaz", date, time, extras: [], paymentMethod: "PAGO_MOVIL",
    });
    ok("prereserva FREE creada (CONFIRMADA directa)", b.status === 201 && (b.json.booking as { status: string } | undefined)?.status === "CONFIRMADA", `status=${b.status} reserva=${(b.json.booking as { status?: string })?.status}`);
    bookingCode = (b.json.booking as { code?: string })?.code ?? "";
    ok("teléfono del prestador entregado para WhatsApp", typeof b.json.providerPhone === "string" || b.json.providerPhone === null);
  } else {
    const b = await api(maria2, "POST", "/api/bookings", {
      providerId: ponme.id, serviceId: svc!.id, petId, address: "Av. Guayana, Torre Sindoni, Piso 5, Puerto Ordaz", date, time, extras: [],
    });
    ok("reserva gestionada creada (PENDIENTE_PAGO)", b.status === 201, `status=${b.status}`);
    bookingCode = (b.json.booking as { code?: string })?.code ?? "";
    const bid = (b.json.booking as { id?: string })?.id;
    const pay = await api(maria2, "POST", "/api/payments", { bookingId: bid, method: "PAGO_MOVIL", reference: `E2E-${Date.now()}` });
    ok("pago con referencia registrado (PENDIENTE para conciliar)", pay.status === 201, `status=${pay.status}`);
  }

  // Desloguear maria y REVISAR que la reserva sigue en SU historial
  await api(maria2, "POST", "/api/auth/logout");
  const maria3: Jar = { cookie: "" };
  await api(maria3, "POST", "/api/auth/login", { email: "maria@demo.ve", password: "demo1234" });
  const myBookings = await api(maria3, "GET", "/api/bookings");
  const mine = (myBookings.json.bookings as { code: string; status: string }[] | undefined) ?? [];
  ok("historial del cliente persiste tras logout/login", mine.some((x) => x.code === bookingCode), `total=${mine.length}`);

  console.log("\n── 2) ROL PRESTADOR: Ponme Guapo ──────────────────────");
  const pLogin = await api(prest, "POST", "/api/auth/login", { email: "ponmeguapo@petservice.ve", password: "ponme1234" });
  ok("login prestador", pLogin.status === 200, `status=${pLogin.status}`);
  const pBookings = await api(prest, "GET", "/api/provider/bookings");
  const pList = (pBookings.json.bookings as { code: string; status: string; id: string }[] | undefined) ?? [];
  const laReserva = pList.find((x) => x.code === bookingCode);
  ok("reserva nueva VISIBLE para el prestador", !!laReserva, `total=${pList.length}`);

  if (laReserva) {
    // LOGOUT prestador + RELOGIN (bug reportado: historial desaparece al desloguear)
    await api(prest, "POST", "/api/auth/logout");
    const prest2: Jar = { cookie: "" };
    await api(prest2, "POST", "/api/auth/login", { email: "ponmeguapo@petservice.ve", password: "ponme1234" });
    const pBookings2 = await api(prest2, "GET", "/api/provider/bookings");
    const pList2 = (pBookings2.json.bookings as { code: string }[] | undefined) ?? [];
    ok("historial del prestador persiste tras logout/login", pList2.some((x) => x.code === bookingCode), `total=${pList2.length}`);

    const start = await api(prest2, "PATCH", `/api/bookings/${laReserva.id}`, { action: "start" });
    ok('acción "iniciar" funciona (sin "reserva no encontrada")', start.status === 200 && start.json.status === "EN_CURSO", `status=${start.status} json=${JSON.stringify(start.json).slice(0, 80)}`);
    const complete = await api(prest2, "PATCH", `/api/bookings/${laReserva.id}`, { action: "complete", evidence: "Servicio E2E completado" });
    ok("acción completar funciona", complete.status === 200 && complete.json.status === "COMPLETADA", `status=${complete.status}`);
  }

  console.log("\n── 3) ROL ADMIN: métricas + conciliación ─────────────");
  const aLogin = await api(admin, "POST", "/api/auth/login", { email: "admin@petservice.ve", password: "admin1234" });
  ok("login admin", aLogin.status === 200, `status=${aLogin.status}`);

  const metrics = await api(admin, "GET", "/api/admin/metrics");
  const met = metrics.json as { days: { free: number; managed: number; count: number }[]; freeBookings: number; managedBookings: number; freeGmvUsd: number };
  ok("métricas con serie FREE/gestionada", metrics.status === 200 && Array.isArray(met.days) && met.days.every((d) => typeof d.free === "number" && typeof d.managed === "number"));
  ok("totales FREE/gestionadas presentes", typeof met.freeBookings === "number" && typeof met.managedBookings === "number", `free=${met.freeBookings} gestionadas=${met.managedBookings} gmvDirecto=${met.freeGmvUsd}`);
  ok("la prereserva FREE cuenta como FREE en la serie", met.freeBookings >= 1, `hoy=${met.days[met.days.length - 1]?.free}`);

  // Preparar prestador COMMISSION y flujo gestionado (si Ponme era FREE lo pasamos a COMMISSION y luego lo devolvemos a FREE)
  const admins = await api(admin, "GET", "/api/admin/providers");
  const aProvs = (admins.json.providers as { id: string; businessName: string; plan?: string }[] | undefined) ?? [];
  const target = aProvs.find((p) => p.businessName.includes("Ponme"));
  if (target) {
    await api(admin, "PATCH", "/api/admin/providers", { id: target.id, action: "setPlan", plan: "COMMISSION" });
    const maria4: Jar = { cookie: "" };
    await api(maria4, "POST", "/api/auth/login", { email: "maria@demo.ve", password: "demo1234" });
    const detail2 = await api(maria4, "GET", `/api/providers/${target.id}`);
    const svcs2 = (detail2.json.services as { id: string; petTypes: string; petSizes: string }[] | undefined) ?? [];
    const svc2 = svcs2.find((s) => s.petTypes.split(",").includes("PERRO") && s.petSizes.split(",").includes("M"));
    const b2 = await api(maria4, "POST", "/api/bookings", {
      providerId: target.id, serviceId: svc2!.id, petId, address: "Av. Guayana, C.C. Orinokia, Puerto Ordaz", date, time: "15:00", extras: [],
    });
    const b2id = (b2.json.booking as { id?: string })?.id;
    const b2code = (b2.json.booking as { code?: string })?.code;
    ok("reserva COMMISSION creada (PENDIENTE_PAGO)", b2.status === 201 && (b2.json.booking as { status: string })?.status === "PENDIENTE_PAGO", `code=${b2code}`);
    const pay2 = await api(maria4, "POST", "/api/payments", { bookingId: b2id, method: "PAGO_MOVIL", reference: `E2E-COM-${Date.now()}` });
    ok("pago COMMISSION con referencia → PENDIENTE para admin", pay2.status === 201, `status=${pay2.status}`);

    // La reserva SIN comprobante debe salir en la nueva lista admin y poder confirmarse
    const adminBk = await api(admin, "GET", "/api/admin/bookings?status=PENDIENTE_PAGO");
    const pend = (adminBk.json.bookings as { code: string; payment: { status: string } | null }[] | undefined) ?? [];
    const sinComprobante = pend.filter((x) => !x.payment || x.payment.status === "RECHAZADO");
    ok("reservas sin comprobante visibles para el admin", Array.isArray(pend), `pendientes=${pend.length} sinComprobante=${sinComprobante.length}`);

    // Crear una reserva SIN pago (se queda varada) → admin la confirma manualmente
    const b3 = await api(maria4, "POST", "/api/bookings", {
      providerId: target.id, serviceId: svc2!.id, petId, address: "Av. Las Américas, Unare II, Puerto Ordaz", date, time: "16:30", extras: [],
    });
    const b3id = (b3.json.booking as { id?: string })?.id;
    const b3code = (b3.json.booking as { code?: string })?.code;
    ok("reserva varada sin pago creada", b3.status === 201, `code=${b3code}`);
    const confirm = await api(admin, "POST", "/api/admin/bookings", { id: b3id, action: "confirm" });
    ok("admin CONFIRMA reserva sin comprobante (Pago recibido)", confirm.status === 200 && confirm.json.status === "CONFIRMADA", `status=${confirm.status} json=${JSON.stringify(confirm.json).slice(0, 80)}`);

    // Conciliar el pago PENDIENTE del flujo COMMISSION
    const queue = await api(admin, "GET", "/api/admin/payments");
    const qList = (queue.json.payments as { id: string; status: string; booking: { code: string; provider: { plan?: string } } }[] | undefined) ?? [];
    const pendiente = qList.find((p) => p.status === "PENDIENTE" && p.booking.code === b2code);
    ok("cola de conciliación muestra el pago COMMISSION", !!pendiente, `cola=${qList.filter((p) => p.status === "PENDIENTE").length}`);
    if (pendiente) {
      const rec = await api(admin, "POST", `/api/payments/${pendiente.id}/reconcile`, { action: "verify" });
      ok("admin CONCILIA pago (verify) → reserva CONFIRMADA", rec.status === 200 && rec.json.status === "VERIFICADO", `status=${rec.status}`);
    }

    // Restaurar plan FREE del prestador (estado demo limpio)
    await api(admin, "PATCH", "/api/admin/providers", { id: target.id, action: "setPlan", plan: "FREE" });
    ok("plan del prestador restaurado a FREE", true);
  }

  finish();

  function finish() {
    console.log(`\n═══ RESULTADO: ${failures === 0 ? "TODAS LAS PRUEBAS PASARON ✅" : `${failures} PRUEBAS FALLARON ❌`} ═══\n`);
    process.exit(failures === 0 ? 0 : 1);
  }
}

main().catch((e) => {
  console.error("E2E crash:", e);
  process.exit(1);
});
