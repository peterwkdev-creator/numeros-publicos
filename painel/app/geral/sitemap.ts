import type { MetadataRoute } from "next";

import { caminhoDaSerie } from "../../lib/brasil";
import { lerEleicoes } from "../../lib/eleicoes";
import { slugUf } from "../../lib/estado";
import { atualizadoEm } from "../../lib/sitemap";
import { lerBrasil, lerCaged, lerFiscal, lerSnapshot, SITE } from "../../lib/servidor";

/**
 * Tudo que não é página de município: a capa, a ajuda, o ranking, o país, as
 * séries do país e os 27 estados. Publicado em `/geral/sitemap.xml`.
 *
 * **O segmento `geral/` não tem página, e isso é de propósito.** Ele existe só
 * para dar endereço a este arquivo — a convenção do App Router publica um
 * `sitemap.ts` no caminho do segmento que o contém, e as URLs aqui dentro
 * não pertencem a nenhuma das rotas reais do site.
 *
 * Elas ficam juntas porque são poucas (**47** desde 16/10/2026, com as 15
 * séries do país), e um arquivo por página seria ruído
 * no relatório de cobertura sem responder nada. A divisão por estado, do outro
 * lado, existe para responder uma pergunta concreta — ver
 * `app/municipio/sitemap.ts`.
 */

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [snapshot, fiscal, brasil, caged, eleicoes] = await Promise.all([
    lerSnapshot(), lerFiscal(), lerBrasil(), lerCaged(), lerEleicoes(),
  ]);
  const atualizado = atualizadoEm(snapshot, fiscal);
  // A coleta das séries do país tem ritmo próprio: a data é a dela, e não a
  // do snapshot dos municípios.
  const coletaBrasil = brasil.series.map((s) => s.coletadoEm).sort().at(-1)!;

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
    {
      // Os dois índices de 17/10/2026: até ali `/ranking/` e `/estado/` davam
      // 404. Prioridade baixa: são páginas de passagem, e o que disputa busca
      // é o ranking e o estado.
      url: `${SITE}/ranking/`,
      lastModified: atualizadoEm(snapshot, fiscal, caged.coletadoEm),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE}/estado/`,
      lastModified: new Date(snapshot.geradoEm),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      // "Comparar municípios" (Fase 3 do Explorar, espec §7, passo 4). Junta
      // o fiscal, o Caged, o Ideb e as emendas: a data é a do ranking.
      url: `${SITE}/explorar/`,
      lastModified: atualizadoEm(snapshot, fiscal, caged.coletadoEm),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      // A segunda página de cabeça: "cidades que mais geraram empregos". O
      // dado muda uma vez por mês, com a competência nova do Caged.
      url: `${SITE}/ranking/emprego-com-carteira/`,
      lastModified: new Date(caged.coletadoEm ?? atualizado),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE}/brasil/`,
      lastModified: new Date(coletaBrasil),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE}/eleicoes-2026/`,
      lastModified: new Date(eleicoes.fonte.coletadoEm),
      changeFrequency: "daily",
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

  // Uma página por série do país desde 16/10/2026, cada uma com a data da
  // própria coleta: um mês novo do IPCA não muda a página do desmatamento.
  const series: MetadataRoute.Sitemap = brasil.series.map((s) => ({
    url: `${SITE}${caminhoDaSerie(s.codigo)}`,
    lastModified: new Date(s.coletadoEm),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...inicio, ...series, ...estados];
}
