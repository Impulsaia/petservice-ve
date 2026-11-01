const ADDRS: [string, string][] = [
  ["lomas-caroni-urb", "Urbanización Lomas del Caroní, Avenida Atlántico, Puerto Ordaz"],
  ["lomas-caroni-urb2", "Lomas del Caroní, Puerto Ordaz, Bolívar"],
];
async function main() {
  for (const [key, addr] of ADDRS) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&countrycodes=ve&q=${encodeURIComponent(addr)}`;
    const r = await fetch(url, { headers: { "User-Agent": "PetServiceVE/1.0 (contact: impulsaia@gmail.com)" } });
    const j = (await r.json()) as { lat: string; lon: string; display_name: string; type: string }[];
    if (j.length) {
      for (const x of j) console.log(`✓ ${key}: ${Number(x.lat).toFixed(5)},${Number(x.lon).toFixed(5)} (${x.type}) — ${x.display_name.slice(0, 95)}`);
    } else console.log(`✗ ${key}: nada`);
    await new Promise((res) => setTimeout(res, 1300));
  }
}
main();
