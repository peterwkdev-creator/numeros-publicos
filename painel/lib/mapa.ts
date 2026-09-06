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


/**
 * As três camadas padrão do mapa, iguais na capa e na página do estado.
 *
 * **Existe para as duas não divergirem.** Antes a capa montava as camadas
 * inline; a página do estado montaria as suas, e no dia em que uma ganhasse um
 * indicador a outra ficaria para trás sem nada quebrar — as duas continuariam
 * desenhando um mapa correto, só que de coisas diferentes, com a mesma
 * aparência de estarem certas.
 *
 * As chaves aqui são as mesmas do CSS de `mapa-uf`, e um teste cobra isso.
 */
export function camadasPadrao(
  ufs: { sigla: string; totais: Record<string, number | null> }[],
  estados: { uf: string; municipios: number; taxa: number }[],
): CamadaMapa[] {
  const esgoto = percentuaisPorUf(ufs, "esgoto-rede", "domicilios-total");
  const alfabet = percentuaisPorUf(ufs, "alfabetizados-15-mais", "pessoas-15-mais");
  const entrega: Record<string, number | null> = {};
  for (const e of estados) entrega[e.uf] = e.municipios > 0 ? e.taxa : null;

  return [
    {
      chave: "esgoto",
      rotulo: "Esgoto ligado à rede",
      valores: esgoto,
      legenda: legendaCom(
        "Domicílios com esgotamento por rede geral, pluvial ou fossa ligada " +
        "à rede, no Censo 2022.", esgoto),
    },
    {
      chave: "alfabetizacao",
      rotulo: "Alfabetização",
      valores: alfabet,
      legenda: legendaCom(
        "Pessoas de 15 anos ou mais alfabetizadas, no Censo 2022.", alfabet),
    },
    {
      chave: "entrega",
      rotulo: "Entrega do relatório fiscal",
      valores: entrega,
      legenda: legendaCom(
        "Municípios que entregaram o Relatório de Gestão Fiscal ao SICONFI. " +
        "Repare que estados vizinhos ficam em extremos opostos: isto não é " +
        "um padrão regional.", entrega),
    },
  ];
}
