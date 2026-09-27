import type { MetadataRoute } from "next";

import { dadoAtualizadoEm, gruposComPagina } from "../../lib/inss";
import { lerInss, SITE } from "../../lib/servidor";

/**
 * As páginas do INSS, em `/inss/sitemap.xml`, num arquivo próprio.
 *
 * Separado do geral porque o Search Console reporta a cobertura **por sitemap
 * enviado**: é o que deixa ver se o Google indexa estas páginas, que disputam
 * uma consulta diferente de todo o resto do site ("quanto tempo demora o BPC").
 *
 * A data é a do DADO (`dadoAtualizadoEm`), e não a da exportação.
 */

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const inss = await lerInss();
  const quando = dadoAtualizadoEm(inss);
  return gruposComPagina(inss).map((g) => ({
    url: `${SITE}/inss/${g.chave}/`,
    ...(quando ? { lastModified: new Date(quando) } : {}),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));
}
