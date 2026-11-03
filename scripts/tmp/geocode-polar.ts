// Geocodificación Nominatim (forward) para nuevos prestadores Polar
const ADDRS: [string, string][] = [
  ["hipercaroni", "Av. Atlántico, Lomas del Caroní, Puerto Ordaz, Bolívar, Venezuela"],
  ["mykonos", "Carrera 16 entre calles 58 y 59, Barquisimeto, Lara, Venezuela"],
  ["daba", "Calle 60 entre carreras 13b y 13c, Barquisimeto, Lara, Venezuela"],
  ["riozona", "Río Supermercado, Puerto Ordaz, Bolívar, Venezuela"],
  ["agrocan", "Agrocan, Puerto Ordaz, Bolívar, Venezuela"],
  ["acuario-atl", "Acuario Atlantic Center, Maracaibo, Zulia, Venezuela"],
];

async function main() {
  const out: Record<string, { lat: number; lng: number; label: string } | null> = {};
  for (const [key, addr] of ADDRS) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ve&q=${encodeURIComponent(addr)}`;
    try {
      const r = await fetch(url, { headers: { "User-Agent": "PetServiceVE/1.0 (contact: impulsaia@gmail.com)" } });
      const j = (await r.json()) as { lat: string; lon: string; display_name: string }[];
      if (j.length) {
        out[key] = { lat: Number(j[0].lat), lng: Number(j[0].lon), label: j[0].display_name };
        console.log(`✓ ${key}: ${out[key]!.lat.toFixed(5)}, ${out[key]!.lng.toFixed(5)} — ${j[0].display_name.slice(0, 90)}`);
      } else {
        out[key] = null;
        console.log(`✗ ${key}: sin resultados`);
      }
    } catch (e: any) {
      console.log(`✗ ${key}: ${e.message?.slice(0, 60)}`);
      out[key] = null;
    }
    await new Promise((res) => setTimeout(res, 1300));
  }
  const { writeFileSync } = await import("fs");
  writeFileSync("/tmp/polar-geocode.json", JSON.stringify(out, null, 2));
  console.log("OK → /tmp/polar-geocode.json");
}
main();
