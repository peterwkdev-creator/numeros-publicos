/**
 * A lógica pura do mapa por UF. **Sem JSX**, para poder ser testada.
 *
 * O `node:test` remove tipos de TypeScript mas **não transforma JSX**: um
 * `.tsx` importado por um teste estoura com `ERR_UNKNOWN_FILE_EXTENSION`. A
 * separação que isso força é a mesma que `lib/dados.ts` já segue, e pela mesma
 * razão — o que decide um número fica onde um teste alcança.
 */

import { br } from "./dados";

export type CamadaMapa = {
  /** Curto e sem espaço: vira `data-<chave>` e id de input. */
  chave: string;
  rotulo: string;
  /** Sigla da UF para o percentual. Ausente = cinza, nunca zero. */
  valores: Record<string, number | null>;
  /** O que a legenda diz que a cor significa. */
  legenda: string;
};

/**
 * Cinco faixas, e a cor sai de tokens do tema.
 *
 * **Escala sequencial de um matiz só**, e não um arco-íris: a auditoria de
 * daltonismo desta base (04/09/2026) reprovaria vermelho-verde, e uma rampa de
 * azul preserva a ordem para deuteranopia e protanopia — o que importa num
 * mapa é distinguir *mais* de *menos*, não identificar a cor.
 */
export const FAIXAS = 5;

/** Em qual das cinco faixas um percentual cai. `null` fica fora. */
export function faixaDoValor(v: number | null): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  const i = Math.floor((Math.max(0, Math.min(100, v)) / 100) * FAIXAS);
  return Math.min(FAIXAS - 1, i);
}

/** O percentual de cada UF para um par numerador/denominador do snapshot. */
export function percentuaisPorUf(
  ufs: { sigla: string; totais: Record<string, number | null> }[],
  numerador: string,
  denominador: string,
): Record<string, number | null> {
  const saida: Record<string, number | null> = {};
  for (const uf of ufs) {
    const n = uf.totais[numerador];
    const d = uf.totais[denominador];
    // As duas pontas, e denominador maior que zero: ausência vira `null` e sai
    // cinza no mapa, nunca 0% — que seria uma afirmação sobre o estado.
    saida[uf.sigla] =
      typeof n === "number" && typeof d === "number" && d > 0
        ? (n * 100) / d
        : null;
  }
  return saida;
}

/** O texto da legenda, com a mediana entre os estados para dar régua. */
export function legendaCom(
  descricao: string,
  valores: Record<string, number | null>,
): string {
  const v = Object.values(valores).filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  if (!v.length) return descricao;
  const meio = Math.floor(v.length / 2);
  const mediana = v.length % 2 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2;
  return `${descricao} Mediana entre os estados: ${br(mediana, 1)}%.`;
}
