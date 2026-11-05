import { AppShell } from "@/components/petservice/AppShell";
import { AppRoot } from "@/components/petservice/AppRoot";
import { SeoContent } from "@/components/petservice/SeoContent";

/**
 * Página única ("/") — SPA cliente (AppRoot) + bloque SEO/GEO server-rendered
 * (SeoContent): los crawlers de IA y Google encuentran contenido y datos
 * estructurados JSON-LD directamente en el HTML, sin necesidad de JavaScript.
 *
 * ISR: se regenera cada hora para mantener frescos los conteos reales.
 */
export const revalidate = 3600;

export default function Home() {
  return (
    <AppShell>
      <AppRoot />
      <SeoContent />
    </AppShell>
  );
}
