import type { MetadataRoute } from "next";

import type { Snapshot } from "./dados";
import type { SnapshotFiscal } from "./fiscal";

/**
 * O que os três arquivos de sitemap compartilham.
 *
 * Existe porque em 09/09/2026 o sitemap único virou **um índice com 28
 * filhos**, e a data de atualização passou a ser calculada em três lugares.
 * Três implementações da mesma regra divergem — e aqui a divergência seria
 * invisível: cada sitemap anunciaria uma data diferente para o mesmo dado.
 */

/**
 * `lastModified` é o MAIS RECENTE das fontes, não o do snapshot do IBGE.
 *
 * Medido em 07/09/2026: o snapshot dizia `2026-09-05T02:45:41` e o fiscal,
 * `2026-09-07T00:03:08`. A série de despesa por função tinha acabado de mudar
 * **as 5.571 páginas de município** — e o sitemap anunciava aos buscadores que
 * nada mudava desde o dia 5, justamente no dia em que mais mudou.
 *
 * `lastmod` é sinal de priorização de rastreamento, e um sinal que subestima a
 * mudança é pior que nenhum: ensina o rastreador a voltar mais tarde.
 *
 * O `Math.max` sobre as duas evita a próxima ocorrência: fonte nova entra aqui,
 * e não num lugar que alguém precise lembrar de atualizar.
 */
export function atualizadoEm(
  s: Snapshot,
  f: SnapshotFiscal,
  // Fontes que mudam SÓ as páginas de município (o Caged, desde 29/09/2026).
  // Quem as passa é o sitemap dos municípios, e não o geral: a capa e os
  // estados não mudam quando sai um mês novo do Caged.
  ...outras: (string | null | undefined)[]
): Date {
  return new Date(Math.max(
    new Date(s.geradoEm).getTime(),
    f.geradoEm ? new Date(f.geradoEm).getTime() : 0,
    ...outras.map((d) => (d ? new Date(d).getTime() : 0)),
  ));
}

/** As siglas de UF que têm sitemap próprio, em ordem estável. */
export function ufsComSitemap(s: Snapshot): string[] {
  return s.ufs.map((u) => u.sigla).sort();
}

/**
 * Escapa o que o XML não aceita cru.
 *
 * As URLs deste site são slugs sem acento e sem `&`, então na prática nada
 * muda — mas um sitemap escrito à mão que não escapa é uma bomba de efeito
 * retardado, e o dia em que um slug ganhar um `&` o arquivo inteiro fica
 * inválido, não só aquela linha.
 */
export function escaparXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Um `<sitemapindex>` completo, a partir dos caminhos dos filhos. */
export function indiceDeSitemaps(
  site: string,
  caminhos: string[],
  atualizado: Date,
  // Filho com data própria: o do INSS muda por outro calendário. Com uma data
  // só, o índice anunciaria que os 28 sitemaps do IBGE e do fiscal mudaram no
  // dia em que só o INSS mudou.
  porFilho: Record<string, Date> = {},
): string {
  const linhas = caminhos.map((c) =>
    `  <sitemap>\n    <loc>${escaparXml(site + c)}</loc>\n` +
    `    <lastmod>${(porFilho[c] ?? atualizado).toISOString()}</lastmod>\n  </sitemap>`,
  );
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + linhas.join("\n") + "\n</sitemapindex>\n";
}

/**
 * A data mais recente entre as URLs de um sitemap filho: o `lastmod` dele no
 * índice.
 *
 * Existe porque até 26/10/2026 o índice datava o filho `geral` pela regra dos
 * municípios (snapshot e fiscal, 15/10), enquanto o próprio `geral` já levava
 * as eleições e as séries do país de 26/10: o índice dizia ao buscador que
 * nada tinha mudado ali. Calcular a data a partir das URLs do filho é a única
 * forma de as duas pontas não divergirem quando entrar outra fonte.
 */
export function maisRecente(urls: MetadataRoute.Sitemap): Date | undefined {
  const tempos = urls
    .map((u) => (u.lastModified ? new Date(u.lastModified).getTime() : NaN))
    .filter((t) => !Number.isNaN(t));
  return tempos.length ? new Date(Math.max(...tempos)) : undefined;
}

/** Os caminhos dos sitemaps filhos, na ordem em que entram no índice. */
export function caminhosDosFilhos(ufs: string[]): string[] {
  return ["/geral/sitemap.xml", "/inss/sitemap.xml",
    ...ufs.map((uf) => `/municipio/sitemap/${uf}.xml`)];
}

export type { MetadataRoute };
