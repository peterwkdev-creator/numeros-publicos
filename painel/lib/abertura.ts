/**
 * A abertura da página de município: as duas frases logo abaixo do H1.
 *
 * ## Por que isto existe
 *
 * Até 30/10/2026 o primeiro parágrafo era o mesmo nas 5.571 páginas ("Código
 * IBGE {n}. Os números abaixo vêm de fontes oficiais..."), e é o primeiro
 * texto que o buscador lê. O Search Console daquele dia: 651 indexadas, 3.966
 * detectadas sem rastrear, 1.064 rastreadas sem indexar
 * (`especs/numeros-publicos-visibilidade.md`, Fase 1).
 *
 * ## Como o fato se escolhe
 *
 * Entre os fatos já calculados para a página (posição no estado em população,
 * PIB por habitante, emendas por habitante e gasto com pessoal), entram os
 * DOIS em que o município fica mais perto de uma das pontas do estado. Trocar
 * só o número numa frase fixa continuaria molde; aqui muda o próprio fato, e
 * o lado (maior ou menor). Empate de extremidade fica na ordem de `TEMAS`.
 *
 * Neutro: posição, número e mediana, sem adjetivo. "O 3º maior gasto com
 * pessoal" descreve; "gasta demais" julgaria (memória "site neutro").
 */

import { br } from "./dados";
import { deEstado } from "./estado";

export type Tema = "populacao" | "pib" | "emendas" | "pessoal";

/** A ordem do desempate: quando dois fatos são igualmente extremos. */
export const TEMAS: readonly Tema[] = ["populacao", "pib", "emendas", "pessoal"];

/** Abaixo disto, "o 3º de 8" descreve vizinhos, não um estado (o mesmo piso de `posicaoEntre`). */
export const MINIMO_ABERTURA = 10;

export type FatoDoEstado = {
  tema: Tema;
  valor: number;
  mediana: number;
  /** Quantos municípios do estado têm valor MENOR. */
  abaixo: number;
  /** Quantos têm valor MAIOR. Com empate, `abaixo + acima < de - 1`. */
  acima: number;
  /** Quantos entraram na comparação. */
  de: number;
  /** O período do dado, como a seção o escreve ("2023", "3º quadrimestre de 2025"). */
  periodo: string | null;
};

/** 1 nas pontas (o maior ou o menor do estado), 0 no meio. */
export function extremidade(f: FatoDoEstado): number {
  const meio = (f.de - 1) / 2;
  if (meio <= 0) return 0;
  return Math.max(0, 1 - Math.min(f.acima, f.abaixo) / meio);
}

/** Do lado de cima ou de baixo, e em que lugar a partir dessa ponta. */
function lugar(f: FatoDoEstado): { topo: boolean; ordem: number } {
  const topo = f.acima <= f.abaixo;
  return { topo, ordem: (topo ? f.acima : f.abaixo) + 1 };
}

/** "o 3º maior", "o maior"; `mais`/`menos` para "populoso". */
function ordinal(ordem: number, palavra: string): string {
  return ordem === 1 ? `o ${palavra}` : `o ${ordem}º ${palavra}`;
}

/** A frase sem sujeito, começando pelo verbo: "é o 3º mais populoso dos...". */
export function fraseDe(f: FatoDoEstado, uf: string): string {
  const { topo, ordem } = lugar(f);
  const doUf = deEstado(uf);
  const maior = topo ? "maior" : "menor";
  const em = f.periodo ? ` em ${f.periodo}` : "";
  switch (f.tema) {
    case "populacao":
      return `é ${ordinal(ordem, topo ? "mais populoso" : "menos populoso")} dos ${br(f.de)} municípios ${doUf}, com ${br(f.valor)} habitantes no Censo 2022 (a mediana do estado é ${br(f.mediana)})`;
    case "pib":
      return `tem ${ordinal(ordem, maior)} PIB por habitante dos ${br(f.de)} municípios ${doUf}, R$ ${br(f.valor)}${em} (a mediana é R$ ${br(f.mediana)})`;
    case "emendas":
      return `recebeu ${ordinal(ordem, maior)} valor em emendas parlamentares por habitante entre os ${br(f.de)} municípios ${doUf} com pagamento${em}, R$ ${br(f.valor, 2)} (a mediana é R$ ${br(f.mediana, 2)})`;
    case "pessoal":
      return `teve ${ordinal(ordem, maior)} gasto com pessoal, em proporção da receita corrente líquida, entre os ${br(f.de)} municípios ${doUf} que entregaram o relatório fiscal${f.periodo ? ` do ${f.periodo}` : ""}: ${br(f.valor, 2)}% (a mediana é ${br(f.mediana, 2)}%)`;
  }
}

/** O pedaço curto para a meta description: "o 3º mais populoso de Minas Gerais". */
export function rotuloDe(f: FatoDoEstado, uf: string): string {
  const { topo, ordem } = lugar(f);
  const doUf = deEstado(uf);
  const maior = topo ? "maior" : "menor";
  switch (f.tema) {
    case "populacao":
      return `${ordinal(ordem, topo ? "mais populoso" : "menos populoso")} ${doUf}`;
    case "pib":
      return `R$ ${br(f.valor)} de PIB por habitante, ${ordinal(ordem, maior)} ${doUf}`;
    case "emendas":
      return `R$ ${br(f.valor, 2)} por habitante em emendas, ${ordinal(ordem, maior)} ${doUf}`;
    case "pessoal":
      return `${ordinal(ordem, maior)} ${doUf}`;
  }
}

/** Os fatos que valem uma frase, do mais extremo para o menos; no máximo `quantos`. */
export function escolherFatos(
  fatos: readonly (FatoDoEstado | null)[],
  quantos = 2,
): FatoDoEstado[] {
  return fatos
    .filter((f): f is FatoDoEstado =>
      f !== null && f.de >= MINIMO_ABERTURA && Number.isFinite(f.valor))
    .map((f) => ({ f, e: extremidade(f), i: TEMAS.indexOf(f.tema) }))
    .sort((a, b) => b.e - a.e || a.i - b.i)
    .slice(0, quantos)
    .map((x) => x.f);
}

/**
 * As frases da abertura, já com o sujeito: "Arapiraca é o 2º mais populoso...
 * Tem o 5º menor PIB...". `null` quando nenhum fato passa do piso (o Distrito
 * Federal, sozinho no estado): a página volta ao parágrafo de procedência.
 */
export function aberturaDe(nome: string, uf: string, escolhidos: readonly FatoDoEstado[]): string | null {
  if (!escolhidos.length) return null;
  return escolhidos
    .map((f, i) => {
      const frase = fraseDe(f, uf);
      return i === 0
        ? `${nome} ${frase}.`
        : `${frase[0]!.toUpperCase()}${frase.slice(1)}.`;
    })
    .join(" ");
}
