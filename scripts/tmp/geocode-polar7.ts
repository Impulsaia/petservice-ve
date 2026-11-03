// Última vía: búsqueda Nominatim "Lomas" en Ciudad Guayana
async function main() {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&countrycodes=ve&q=${encodeURIComponent("Lomas Caroni Ciudad Guayana")}`;
  const r = await fetch(url, { headers: { "User-Agent": "PetServiceVE/1.0 (contact: impulsaia@gmail.com)" } });
  const j = (await r.json()) as { lat: string; lon: string; display_name: string; type: string }[];
  if (!j.length) console.log("nada");
  for (const x of j) console.log(`${Number(x.lat).toFixed(5)},${Number(x.lon).toFixed(5)} (${x.type}) — ${x.display_name.slice(0, 110)}`);
}
main();
