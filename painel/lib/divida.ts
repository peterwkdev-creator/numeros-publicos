/**
 * A dívida dos governos estaduais: o contrato com o `estados-divida.json` que
 * o motor escreve e as leituras puras que a seção `#divida` da página do
 * estado faz dele. Espec: `especs/numeros-publicos-divida-estados.md`, §4, §5,
 * §6.2 e §7.1.
 *
 * ## O limite é o que o relatório declara, ano a ano
 *
 * Nada aqui supõe 200%. O limite de cada ano é a linha do próprio RGF
 * (`limiteSenado`, em reais) dividida pela receita sobre a qual o relatório
 * calculou o percentual (`base[ano]`): dá 200 na maioria, 90 em Roraima e
 * ~170 em São Paulo em 2025 (decisão do Peter, 27/10/2026). O alerta, pela
 * mesma conta. Onde o relatório escreveu o limite em pontos percentuais (CE
 * 2015–2022, DF 2016), o motor já o gravou em reais: a conta dá 200 e a
 * página não diz nada.
 *
 * ## A inflação, pelo número-índice
 *
 * O fator do IPCA é a razão entre dois números-índice de dezembro (SIDRA
 * 1737, variável 2266), nunca o encadeamento da variação mensal: o ponto é de
 * 31/12, e o índice de dezembro do mesmo ano é o que o corrige.
 */

import type { Mandato, SerieBrasil } from "./brasil";

/** A ordem das colunas de cada ano, a mesma de `colunas` no arquivo. */
export const COLUNAS = [
  "dc", "deducoes", "dcl", "rcl", "rclAjustada", "percentual", "limiteSenado", "limiteAlerta",
] as const;

/**
 * Um ano: dívida consolidada, deduções, dívida líquida, RCL, RCL ajustada
 * (`null` antes de 2020, quando o relatório não a trazia), o % declarado e os
 * dois limites, em reais.
 */
export type AnoDivida = [
  dc: number, deducoes: number | null, dcl: number, rcl: number, rclAjustada: number | null,
  percentual: number, limiteSenado: number, limiteAlerta: number,
];

/** A receita sobre a qual o relatório calculou o percentual daquele ano. */
export type BaseDivida = "rcl" | "rclAjustada";

export interface DividaEstado {
  uf: string;
  nome: string;
  anos: Record<string, AnoDivida>;
  base: Record<string, BaseDivida>;
  /** Os avisos do motor por ano; o do limite fora dos 2 x vira nota. */
  avisos: Record<string, string[]>;
}

export interface SnapshotDivida {
  geradoEm: string;
  coletadoEm: string;
  fonte: string;
  exercicios: number[];
  colunas: string[];
  /** Por ano, as UFs sem relatório publicado. */
  faltam: Record<string, string[]>;
  /** Pelo código IBGE da UF ("35"), e não pela sigla. */
  estados: Record<string, DividaEstado>;
}

/** O começo do aviso do motor quando o limite declarado não é 2 x a receita. */
export const AVISO_LIMITE = "limite do Senado não é 2 x";

/** Uma linha da tabela: o ano com o dado, já com os limites em % da base. */
export interface LinhaDivida {
  ano: number;
  dc: number;
  deducoes: number | null;
  dcl: number;
  /** A receita da base do percentual (RCL ou RCL ajustada). */
  receita: number;
  base: BaseDivida;
  percentual: number;
  /** O limite do Senado e o alerta, em % da mesma receita: a régua do gráfico. */
  limite: number;
  alerta: number;
  /**
   * O limite como o relatório o declara, para a nota e o texto: o relatório
   * aplica o fator ora à RCL ajustada, ora à sem ajuste, e a régua do gráfico
   * (sobre a base do %) sai torta no texto (RR: 90,03 a 90,67 sobre a
   * ajustada, 90 sobre a sem ajuste; AC 2023: 200 sobre a ajustada, 198,6 sobre
   * a sem ajuste). Das duas contas, a mais perto de um inteiro.
   */
  limiteDeclarado: number;
  /** O relatório declarou um limite que não é 2 x a receita (o aviso do motor). */
  limiteDiferente: boolean;
}

/** O ano sem relatório publicado: buraco no gráfico, linha própria na tabela. */
export interface AnoSemDado {
  ano: number;
  semDado: true;
}

export function dividaDe(snap: SnapshotDivida, sigla: string): DividaEstado | null {
  return Object.values(snap.estados).find((e) => e.uf === sigla) ?? null;
}

/** A receita da base do ano; sem `base` gravada, a RCL. */
export function receitaDaBase(ano: AnoDivida, base: BaseDivida | undefined): number {
  return base === "rclAjustada" && ano[4] !== null ? ano[4] : ano[3];
}

/** Um valor do relatório, em reais, como % da receita da base do ano. */
export function percentualDaBase(reais: number, ano: AnoDivida, base: BaseDivida | undefined): number {
  return (reais / receitaDaBase(ano, base)) * 100;
}

/** As linhas do estado, do ano mais velho ao mais novo, com os anos sem dado. */
export function linhasDe(snap: SnapshotDivida, e: DividaEstado): (LinhaDivida | AnoSemDado)[] {
  return [...snap.exercicios].sort((a, b) => a - b).map((ano) => {
    const v = e.anos[String(ano)];
    if (!v) return { ano, semDado: true as const };
    const base = e.base[String(ano)] ?? "rcl";
    return {
      ano,
      dc: v[0],
      deducoes: v[1],
      dcl: v[2],
      receita: receitaDaBase(v, base),
      base,
      percentual: v[5],
      limite: percentualDaBase(v[6], v, base),
      alerta: percentualDaBase(v[7], v, base),
      limiteDeclarado: maisRedondo(percentualDaBase(v[6], v, base), (v[6] / v[3]) * 100),
      limiteDiferente: (e.avisos[String(ano)] ?? []).some((a) => a.startsWith(AVISO_LIMITE)),
    };
  });
}

/** Das duas contas, a mais perto de um inteiro; empate, a primeira. */
function maisRedondo(a: number, b: number): number {
  const d = (n: number) => Math.abs(n - Math.round(n));
  return d(b) < d(a) ? b : a;
}

export function temDado(l: LinhaDivida | AnoSemDado): l is LinhaDivida {
  return !("semDado" in l);
}

/**
 * A nota abaixo do gráfico: os anos cujo limite declarado não é 200%,
 * agrupados pelo `limiteDeclarado` arredondado a inteiro (Roraima: 2015 a
 * 2025 em 90%; sobre a RCL ajustada daria 90 e 91 em grupos separados). O gatilho é o
 * aviso do motor, e não a conta: os pontos percentuais de CE e DF dão 200 e
 * não têm aviso deste tipo.
 */
export function notaDoLimite(linhas: (LinhaDivida | AnoSemDado)[]): { anos: number[]; limite: number }[] {
  const grupos: { anos: number[]; limite: number }[] = [];
  for (const l of linhas.filter(temDado)) {
    if (!l.limiteDiferente) continue;
    const limite = Math.round(l.limiteDeclarado);
    const g = grupos.find((x) => x.limite === limite);
    if (g) g.anos.push(l.ano);
    else grupos.push({ anos: [l.ano], limite });
  }
  return grupos;
}

/**
 * Os anos em texto: "2015", "2015 e 2016", "2015 a 2018" para uma sequência
 * contínua, e vírgulas entre os trechos ("2015 a 2017, 2019 e 2021").
 */
export function anosEmTexto(anos: number[]): string {
  const trechos: string[] = [];
  const ord = [...anos].sort((a, b) => a - b);
  for (let i = 0; i < ord.length;) {
    let j = i;
    while (j + 1 < ord.length && ord[j + 1] === ord[j]! + 1) j++;
    trechos.push(j - i >= 2 ? `${ord[i]} a ${ord[j]}` : j === i ? `${ord[i]}` : `${ord[i]}, ${ord[j]}`);
    i = j + 1;
  }
  const t = trechos.join(", ").split(", ");
  return t.length === 1 ? t[0]! : `${t.slice(0, -1).join(", ")} e ${t[t.length - 1]}`;
}

/** Os anos com a preposição do começo de frase: "Em 2017", "De 2015 a 2025". */
export function emAnos(anos: number[]): string {
  const t = anosEmTexto(anos);
  return /^\d{4} a \d{4}$/.test(t) ? `De ${t}` : `Em ${t}`;
}

/** O número-índice do IPCA, na chave `auxiliares` do `brasil.json`. */
export function serieIpca(auxiliares: SerieBrasil[] | undefined): SerieBrasil | null {
  return auxiliares?.find((s) => s.codigo === "ipca-indice") ?? null;
}

/**
 * O fator que leva reais de 31/12 de `ano` a reais de dezembro de `ate`:
 * índice(dez/ate) ÷ índice(dez/ano). `null` sem um dos dois índices.
 */
export function fatorIpca(ipca: SerieBrasil | null, ano: number, ate: number): number | null {
  if (!ipca) return null;
  const dez = (a: number) => ipca.pontos.find(([p]) => p === `${a}-12`)?.[1];
  const de = dez(ano);
  const para = dez(ate);
  return de && para ? para / de : null;
}

/** Como a data da troca foi conferida (`estados_mandatos.csv`, espec §6.3). */
export type Conferido = "tse" | "lida" | "imprensa-publica" | "data-aproximada";

export interface MandatoEstado extends Mandato {
  conferido: Conferido;
}

/** O `estados-governadores.json` (`python -m numeros_publicos governadores-exportar`). */
export interface SnapshotGovernadores {
  inicio: string;
  fonte: string;
  estados: Record<string, MandatoEstado[]>;
}

export interface FaixaGoverno {
  rotulo: string;
  nome: string;
  /** Anos `[de, ate)`: cada ano é a coluna do ponto de 31/12. */
  de: number;
  ate: number;
  tom: 0 | 1;
}

/**
 * Quem governava em 31/12 de cada ano de `[de, ate)`, o dia do ponto da
 * dívida: anos seguidos da mesma pessoa viram uma faixa só, com o tom
 * alternado. O ponto nunca cai na faixa de quem já tinha saído; quem passou
 * pelo cargo sem estar nele num 31/12 fica só na tabela "Quem governava"
 * (decisão de 27/10/2026). O ano sem governador na tabela fica sem faixa.
 */
export function governoEm31(mandatos: Mandato[], de: number, ate: number): FaixaGoverno[] {
  const faixas: FaixaGoverno[] = [];
  for (let ano = de; ano < ate; ano++) {
    const dia = `${ano}-12-31`;
    const m = mandatos.find((x) => x.inicio <= dia && (x.fim === null || dia < x.fim));
    const ultima = faixas[faixas.length - 1];
    if (!m) continue;
    if (ultima && ultima.nome === m.nome && ultima.ate === ano) {
      ultima.ate = ano + 1;
    } else {
      faixas.push({
        rotulo: m.rotulo, nome: m.nome, de: ano, ate: ano + 1,
        tom: (faixas.length % 2) as 0 | 1,
      });
    }
  }
  return faixas;
}
