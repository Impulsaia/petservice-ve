// Av. Atlántico bajo el nombre oficial "Ciudad Guayana" en OSM
async function main() {
  for (const [key, q] of [
    ["av-atl-guayana", "Avenida Atlántico, Ciudad Guayana"],
    ["av-atl-segments", "Avenida Atlantico, Municipio Caroní"],
  ] as [string, string][]) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&countrycodes=ve&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { "User-Agent": "PetServiceVE/1.0 (contact: impulsaia@gmail.com)" } });
    const j = (await r.json()) as { lat: string; lon: string; display_name: string; type: string }[];
    console.log(`### ${key} (${j.length})`);
    for (const x of j) console.log(`  ${Number(x.lat).toFixed(5)},${Number(x.lon).toFixed(5)} (${x.type}) — ${x.display_name.slice(0, 110)}`);
    await new Promise((res) => setTimeout(res, 1300));
  }
}
main();
