/**
 * Municípios que o IBGE renomeou depois que a página já estava no ar.
 *
 * A página nasce do nome atual do IBGE (e o endereço, de `slugDe` sobre ele).
 * Quem conhecia o nome antigo, ou chega por um link velho, precisa achar o
 * município pelo nome que conhece: a busca casa os dois, e a página diz o
 * antigo logo abaixo do título. O endereço velho tem 301 em
 * `cloudflare/_redirects`, e `scripts/conferir-enderecos.mjs` barra a
 * publicação se um renomeado ficar sem ele.
 *
 * Só entra o que foi medido na fonte: o nome que o próprio IBGE dava antes,
 * e quando o nome novo apareceu nele.
 */
export type NomeAnterior = {
  /** O nome que o IBGE dava antes, com acento. */
  anterior: string;
  /** Quando o nome novo apareceu no cadastro do IBGE, por extenso. */
  desde: string;
  /** De onde vem a troca. */
  fonte: string;
};

export const NOMES_ANTERIORES: Readonly<Record<number, NomeAnterior>> = {
  // A coleta semanal de 23/11/2026 trouxe o nome novo (a de 16/11 ainda dava
  // o antigo). O site publicou sozinho e o endereço velho deu 404 (26/11).
  2104552: {
    anterior: "Governador Edison Lobão",
    desde: "novembro de 2026",
    fonte: "IBGE, cadastro de localidades",
  },
};

export function nomeAnteriorDe(codigo: number): NomeAnterior | null {
  return NOMES_ANTERIORES[codigo] ?? null;
}
