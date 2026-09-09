import type { MetadataRoute } from "next";

import { expandir } from "../../lib/dados";
import { slugDe } from "../../lib/fiscal";
import { atualizadoEm, ufsComSitemap } from "../../lib/sitemap";
import { lerFiscal, lerSnapshot, SITE } from "../../lib/servidor";

/**
 * Um sitemap por estado, com os municípios daquele estado.
 *
 * ## Por que dividir, quando um arquivo só funcionava
 *
 * **Não é conserto de indexação — é instrumento de medição.** Em 09/09/2026 o
 * Search Console dizia: 276 páginas indexadas de 5.600, e **5.279 detectadas e
 * nunca rastreadas**. Cinco alavancas de código foram testadas naquele dia e as
 * cinco já estavam puxadas; o que faltava não era conserto, era saber **QUAIS**
 * páginas o Google está deixando de lado.
 *
 * O Search Console reporta cobertura **por sitemap enviado**. Com um arquivo só
 * o relatório é um número agregado que não distingue nada. Com 27, a próxima
 * leitura responde se o padrão é geográfico, de tamanho de município, ou
 * nenhum — e "nenhum" também é resposta, porque descarta duas hipóteses.
 *
 * ## Por estado, e não em fatias de 5.000
 *
 * O limite do protocolo é 50.000 URLs por arquivo, então 5.571 caberiam em um.
 * Fatiar por tamanho daria arquivos sem significado — "as URLs 5.000 a 10.000"
 * não é uma pergunta que alguém queira responder. O estado é o recorte que o
 * site já usa em todo lugar, e é uma hipótese testável.
 *
 * `generateSitemaps` publica em `/municipio/sitemap/<id>.xml`, então o `id` é a
 * sigla da UF e a URL fica legível: `/municipio/sitemap/MA.xml`.
 */

export const dynamic = "force-static";

export async function generateSitemaps() {
  const snapshot = await lerSnapshot();
  return ufsComSitemap(snapshot).map((uf) => ({ id: uf }));
}

export default async function sitemap(
  { id }: { id: Promise<string> },
): Promise<MetadataRoute.Sitemap> {
  // No Next 16 o `id` é uma Promise que resolve para string -- mudou na v16.0,
  // e antes era o valor direto. Está no histórico de versões da documentação.
  const uf = await id;
  const [snapshot, fiscal] = await Promise.all([lerSnapshot(), lerFiscal()]);
  const atualizado = atualizadoEm(snapshot, fiscal);

  return expandir(snapshot)
    .filter((m) => m.uf === uf)
    .map((m) => ({
      url: `${SITE}/municipio/${slugDe(m.nome, m.uf)}/`,
      lastModified: atualizado,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
}
