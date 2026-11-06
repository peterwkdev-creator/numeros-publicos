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
 * PIB por habitante, emendas por habitante, gasto com pessoal e, desde
 * 06/11/2026, MEI por mil habitantes, IDEB dos anos iniciais e aplicação em
 * saúde), entram os DOIS em que o município fica mais perto de uma das pontas
 * do estado. Os três últimos vieram da queda do Google de 02/10: com quatro
 * temas, metade das páginas abria pelas mesmas duas frases-molde
 * (`progress/numeros-publicos.md`, "Medição 4" e seguintes). Trocar
 * só o número numa frase fixa continuaria molde; aqui muda o próprio fato, e
 * o lado (maior ou menor). Empate de extremidade fica na ordem de `TEMAS`.
 *
 * Neutro: posição, número e mediana, sem adjetivo. "O 3º maior gasto com
 * pessoal" descreve; "gasta demais" julgaria (memória "site neutro").
 */

import { br } from "./dados";
import { deEstado } from "./estado";

export type Tema = "populacao" | "pib" | "emendas" | "pessoal" | "mei" | "ideb" | "saude";

/** A ordem do desempate: quando dois fatos são igualmente extremos. */
export const TEMAS: readonly Tema[] = ["populacao", "pib", "emendas", "pessoal", "mei", "ideb", "saude"];

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
  /** O período do dado: o ano ("2023"; no pessoal, o exercício do relatório fiscal;
   *  no MEI, a data da posição, "24/10/2026"; no IDEB, a edição). */
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

/**
 * Quantos OUTROS municípios têm exatamente o mesmo valor. O lugar é o de
 * competição (`acima + 1`): com 411 empates no pessoal e 55 na população
 * (01/11/2026), "o 3º maior" sozinho esconderia que outro também é o 3º.
 */
export function empatados(f: FatoDoEstado): number {
  return Math.max(0, f.de - 1 - f.abaixo - f.acima);
}

/** ", empatado com outro município": concorda com o lugar ("o 3º maior gasto", "o mais populoso"), sempre masculino. */
function empate(f: FatoDoEstado): string {
  const n = empatados(f);
  if (n === 0) return "";
  return n === 1 ? ", empatado com outro município" : `, empatado com outros ${br(n)} municípios`;
}

/** A frase sem sujeito, começando pelo verbo: "é o 3º mais populoso dos...". */
export function fraseDe(f: FatoDoEstado, uf: string): string {
  const { topo, ordem } = lugar(f);
  const doUf = deEstado(uf);
  const maior = topo ? "maior" : "menor";
  const em = f.periodo ? ` em ${f.periodo}` : "";
  const emp = empate(f);
  switch (f.tema) {
    case "populacao":
      return `é ${ordinal(ordem, topo ? "mais populoso" : "menos populoso")} dos ${br(f.de)} municípios ${doUf}${emp}, com ${br(f.valor)} habitantes no Censo 2022 (a mediana do estado é ${br(f.mediana)})`;
    case "pib":
      return `tem ${ordinal(ordem, maior)} PIB por habitante dos ${br(f.de)} municípios ${doUf}${emp}, R$ ${br(f.valor)}${em}, segundo o IBGE (a mediana é R$ ${br(f.mediana)})`;
    case "emendas":
      return `recebeu ${ordinal(ordem, maior)} valor em emendas parlamentares por habitante entre os ${br(f.de)} municípios ${doUf} com pagamento${em}${emp}, R$ ${br(f.valor, 2)}, segundo o Portal da Transparência (a mediana é R$ ${br(f.mediana, 2)})`;
    case "pessoal":
      // O período é só o ano: o conjunto mistura o RGF do 3º quadrimestre e o
      // Simplificado do 2º semestre, e "do 3º quadrimestre" errava para estes.
      return `teve ${ordinal(ordem, maior)} gasto com pessoal, em proporção da receita corrente líquida, entre os ${br(f.de)} municípios ${doUf} que entregaram o relatório fiscal${f.periodo ? ` de ${f.periodo}` : ""}${emp}: ${br(f.valor, 2)}% (a mediana é ${br(f.mediana, 2)}%)`;
    case "mei":
      return `tem ${ordinal(ordem, maior)} número de microempreendedores individuais (MEI) por mil habitantes dos ${br(f.de)} municípios ${doUf}${emp}, ${br(f.valor, 1)}${em}, segundo a Receita Federal (a mediana é ${br(f.mediana, 1)})`;
    case "ideb":
      // Só a rede municipal dos anos iniciais: a que a seção mostra e a que a
      // prefeitura administra. "Nota" e não "desempenho": o número, sem juízo.
      return `teve ${ordinal(ordem, maior)} IDEB dos anos iniciais na rede municipal entre os ${br(f.de)} municípios ${doUf} com nota${em}${emp}, ${br(f.valor, 1)}, segundo o INEP (a mediana é ${br(f.mediana, 1)})`;
    case "saude":
      return `aplicou em saúde ${ordinal(ordem, maior)} percentual da receita de impostos e transferências entre os ${br(f.de)} municípios ${doUf} com dado${em}${emp}: ${br(f.valor, 2)}% (a mediana é ${br(f.mediana, 2)}%; o mínimo constitucional, 15%)`;
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
    case "ideb":
      return `${ordinal(ordem, maior)} ${doUf}`;
    case "mei":
      return `${br(f.valor, 1)} MEI por mil habitantes, ${ordinal(ordem, maior)} ${doUf}`;
    case "saude":
      return `${br(f.valor, 2)}% aplicados em saúde, ${ordinal(ordem, maior)} ${doUf}`;
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
