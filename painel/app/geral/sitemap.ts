import type { MetadataRoute } from "next";

import { slugUf } from "../../lib/estado";
import { atualizadoEm } from "../../lib/sitemap";
import { lerFiscal, lerSnapshot, SITE } from "../../lib/servidor";

/**
 * Tudo que não é página de município: a capa, a ajuda, o ranking e os 27
 * estados. Publicado em `/geral/sitemap.xml`.
 *
 * **O segmento `geral/` não tem página, e isso é de propósito.** Ele existe só
 * para dar endereço a este arquivo — a convenção do App Router publica um
 * `sitemap.ts` no caminho do segmento que o contém, e as 30 URLs aqui dentro
 * não pertencem a nenhuma das rotas reais do site.
 *
 * Elas ficam juntas porque são **trinta**, e um arquivo por página seria ruído
 * no relatório de cobertura sem responder nada. A divisão por estado, do outro
 * lado, existe para responder uma pergunta concreta — ver
 * `app/municipio/sitemap.ts`.
 */

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [snapshot, fiscal] = await Promise.all([lerSnapshot(), lerFiscal()]);
  const atualizado = atualizadoEm(snapshot, fiscal);

  const inicio: MetadataRoute.Sitemap = [
    {
      url: `${SITE}/`,
      lastModified: atualizado,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      // A ajuda responde as duvidas que as buscas trazem literalmente
      // ("o que e RCL ajustada", "o que e despesa liquidada"), entao ela e
      // pagina de destino, nao so pagina de apoio.
      url: `${SITE}/ajuda/`,
      lastModified: atualizado,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      // A UNICA pagina do site que disputa consulta de CABECA. As 5.571 de
      // municipio disputam cauda longa, onde a Wikipedia ja responde no
      // snippet; "ranking municipios gasto com pessoal LRF" nao tem dono
      // nacional -- so Tribunais de Contas, um por estado. Medido em 07/09.
      //
      // Prioridade 0.9, igual a de estado: e uma pagina so, e o dado dela muda
      // a cada coleta.
      url: `${SITE}/ranking/gasto-com-pessoal/`,
      lastModified: atualizado,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];

  // Prioridade acima da do municipio: sao 27 paginas que concentram o link
  // interno de 5.571. No grafo do site elas sao o unico caminho da home ate a
  // maioria das paginas -- ver `lib/estado.ts`.
  const estados: MetadataRoute.Sitemap = snapshot.ufs.map((u) => ({
    url: `${SITE}/estado/${slugUf(u.sigla)}/`,
    lastModified: atualizado,
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));

  return [...inicio, ...estados];
}
