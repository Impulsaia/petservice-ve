const ADDRS: [string, string][] = [
  ["lomas-caroni", "Lomas de Caroní, Puerto Ordaz"],
  ["av-atlantico", "Avenida Atlántico, Puerto Ordaz, Bolívar"],
  ["mykonos-int", "calle 59 con carrera 16, Barquisimeto"],
  ["daba-int", "calle 60 con carrera 13, Barquisimeto"],
  ["acuario-atl3", "Acuario Atlantic Center Zulia"],
];
async function main() {
  const prev = JSON.parse(await Bun.file("/tmp/polar-geocode.json").text());
  for (const [key, addr] of ADDRS) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&countrycodes=ve&q=${encodeURIComponent(addr)}`;
    try {
      const r = await fetch(url, { headers: { "User-Agent": "PetServiceVE/1.0 (contact: impulsaia@gmail.com)" } });
      const j = (await r.json()) as { lat: string; lon: string; display_name: string; type: string }[];
      if (j.length) {
        prev[key] = { lat: Number(j[0].lat), lng: Number(j[0].lon), label: j[0].display_name };
        console.log(`✓ ${key}: ${Number(j[0].lat).toFixed(5)},${Number(j[0].lon).toFixed(5)} (${j[0].type}) — ${j[0].display_name.slice(0, 85)}`);
        for (const alt of j.slice(1)) console.log(`     alt: ${alt.display_name.slice(0, 75)}`);
      } else console.log(`✗ ${key}: nada`);
    } catch (e: any) { console.log(`✗ ${key}: ${e.message?.slice(0, 50)}`); }
    await new Promise((res) => setTimeout(res, 1300));
  }
  await Bun.write("/tmp/polar-geocode.json", JSON.stringify(prev, null, 2));
  console.log("saved");
}
main();
