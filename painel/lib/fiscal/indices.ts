/** Índices e faixas: o mapa por código IBGE, o slug, e a faixa de cada
 *  município em uma letra, na ordem das linhas. */

import type { Faixa, SnapshotFiscal } from "./tipos";
import { faixaDaLinha } from "./pessoal";

export type Fiscal = {
  publicou: boolean | null;
  percentual: number | null;
  limitePrudencial: number | null;
  despesa: number | null;
  rclAjustada: number | null;
  /** Veio do RGF Simplificado semestral; ver `LinhaFiscal`. */
  simplificado: boolean | null;
  faixa: Faixa;
};

/** Índice por código IBGE, para juntar com o município do observatório. */
export function indexarFiscal(s: SnapshotFiscal): Map<number, Fiscal> {
  const mapa = new Map<number, Fiscal>();
  for (const linha of s.municipios) {
    const [codigo, , , , publicou, percentual, limitePrudencial,
      despesa, rclAjustada, simplificado] = linha;
    mapa.set(codigo, {
      publicou,
      percentual,
      limitePrudencial,
      despesa,
      rclAjustada,
      simplificado,
      faixa: faixaDaLinha(s, linha),
    });
  }
  return mapa;
}

/**
 * O identificador do município na URL: `imperatriz-ma`, `sao-luis-ma`.
 *
 * Acento fora, espaço vira hífen, UF no fim para desempatar homônimos — e há
 * muitos: "Bom Jesus" existe em cinco estados do Nordeste. Sem a UF no slug,
 * quatro dos cinco perderiam a própria página em silêncio.
 */
export function slugDe(nome: string, uf: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base}-${uf.toLowerCase()}`;
}

/**
 * Uma letra por faixa, para viajar até o navegador sem virar peso.
 *
 * O filtro por situação fiscal da capa precisa da faixa dos 5.571 municípios no
 * cliente. Um mapa `código → faixa` custaria ~180 KB de JSON com a chave e o
 * nome da faixa repetidos milhares de vezes. Uma **string de um caractere por
 * município**, na mesma ordem das linhas, custa 5.571 bytes — e comprime a
 * cerca de 1 KB, porque a maioria dos vizinhos cai na mesma faixa.
 *
 * É a mesma lição do payload da capa, que caiu 57% ao parar de repetir chave.
 */
export const LETRA_FAIXA: Record<Faixa, string> = {
  abaixo: "a",
  "acima-prudencial": "p",
  "acima-legal": "l",
  implausivel: "i",
  "sem-dado": "s",
  "nao-consultado": "n",
  "como-estado": "e",
  "nao-instalado": "d",
};

/** O inverso de `LETRA_FAIXA`, para o navegador voltar da letra à faixa. */
export const FAIXA_DA_LETRA: Record<string, Faixa> = Object.fromEntries(
  Object.entries(LETRA_FAIXA).map(([faixa, letra]) => [letra, faixa as Faixa]),
) as Record<string, Faixa>;

/**
 * A faixa de cada município, na ORDEM das linhas do snapshot.
 *
 * A ordem é o contrato: o navegador casa `faixas[i]` com `linhas[i]`. Mudar a
 * ordem de um sem o outro desloca a situação fiscal de todos os municípios a
 * partir dali, em silêncio — a página continuaria bem formada, mostrando a
 * faixa do vizinho. Por isso as duas saem da MESMA lista, aqui.
 */
export function faixasEmLinha(
  linhas: readonly (readonly unknown[])[],
  fiscal: SnapshotFiscal,
): string {
  const porCodigo = indexarFiscal(fiscal);
  return linhas
    .map((l) => {
      const f = porCodigo.get(l[0] as number);
      return LETRA_FAIXA[f?.faixa ?? "nao-consultado"];
    })
    .join("");
}
