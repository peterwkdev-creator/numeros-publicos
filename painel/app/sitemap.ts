import type { MetadataRoute } from "next";

import { expandir } from "../lib/dados";
import { slugUf } from "../lib/estado";
import { slugDe } from "../lib/fiscal";
import { lerFiscal, lerSnapshot, SITE } from "../lib/servidor";

// Com `output: "export"`, sitemap e robots sao route handlers e o Next exige
// que sejam declarados estaticos -- sem isto o build morre com
// `export const dynamic = "force-static" not configured on route`. Nao e
// opcional aqui: nao existe servidor para gerar isto sob demanda.
export const dynamic = "force-static";


/**
 * O sitemap, gerado no build a partir do próprio snapshot.
 *
 * Sem ele, 1.794 páginas que ninguém linka de fora podem levar meses para
 * serem descobertas — o rastreador precisa de um caminho até elas, e listar
 * à mão um arquivo que muda a cada coleta seria garantia de ficar desatualizado.
 *
 * A convenção de arquivo do App Router publica isto em `/sitemap.xml`:
 * https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const snapshot = await lerSnapshot();
  const fiscal = await lerFiscal();

  // ── `lastModified` é o MAIS RECENTE das fontes, não o do snapshot do IBGE ──
  //
  // Medido em 07/09/2026: o snapshot dizia `2026-09-05T02:45:41` e o fiscal,
  // `2026-09-07T00:03:08`. A série de cinco anos de despesa por função tinha
  // acabado de mudar **as 5.571 páginas de município** — e o sitemap anunciava
  // aos buscadores que nada mudava desde o dia 5, justamente no dia em que mais
  // mudou.
  //
  // `lastmod` é sinal de priorização de rastreamento, e um sinal que subestima
  // a mudança é pior que nenhum: ensina o rastreador a voltar mais tarde. A
  // metade fiscal da página vem de outro arquivo, com outra data de geração, e
  // esquecê-la é o mesmo erro do `coletadoEm` da capa — só que ao contrário,
  // declarando dado mais VELHO do que se tem.
  //
  // O `Math.max` sobre os dois evita a próxima ocorrência: fonte nova entra
  // aqui, e não num lugar que alguém precise lembrar de atualizar.
  const atualizado = new Date(Math.max(
    new Date(snapshot.geradoEm).getTime(),
    fiscal.geradoEm ? new Date(fiscal.geradoEm).getTime() : 0,
  ));

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

  // Prioridade acima da do municipio: sao 9 paginas que concentram o link
  // interno de 1.794. No grafo do site elas sao o unico caminho da home ate a
  // maioria das paginas -- ver `lib/estado.ts`.
  const estados: MetadataRoute.Sitemap = snapshot.ufs.map((u) => ({
    url: `${SITE}/estado/${slugUf(u.sigla)}/`,
    lastModified: atualizado,
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));

  const municipios: MetadataRoute.Sitemap = expandir(snapshot).map((m) => ({
    url: `${SITE}/municipio/${slugDe(m.nome, m.uf)}/`,
    lastModified: atualizado,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...inicio, ...estados, ...municipios];
}
