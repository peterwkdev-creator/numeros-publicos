/**
 * O Novo Caged na página do município. **Módulo puro.**
 *
 * O arquivo (`dados/caged.json`) vem de `python -m numeros_publicos
 * caged-exportar`, que só o escreve depois de conferir o mês, o ano e os 12
 * meses contra o sumário executivo do Ministério do Trabalho. Aqui não se
 * recalcula nada da fonte: só se soma a janela e se escreve.
 *
 * ## Três coisas que a página tem de dizer, e este módulo sustenta
 *
 * - **Zero é zero.** Município sem nenhuma linha no mês tem 0 admissões e 0
 *   desligamentos, e o arquivo traz o zero: não existe "sem dado" no Caged.
 * - **É fluxo, não estoque.** O Caged não diz quantos empregados o município
 *   tem, então não há variação percentual — só quem entrou e quem saiu.
 * - **Os meses já têm os ajustes** (declarações fora do prazo e exclusões) até
 *   a competência mais recente, que ainda pode mudar no mês seguinte.
 */

import { rotuloPeriodo } from "./brasil";
import type { Snapshot } from "./dados";

/** `[código IBGE, admissões × 12, desligamentos × 12]`, do mês mais velho ao mais novo. */
export type LinhaCaged = [number, number[], number[]];

export type Bloco = { saldo: number; admissoes: number; desligamentos: number };

export type SnapshotCaged = {
  fonte: string;
  origem: string;
  competencia: string;
  competencias: string[];
  coletadoEm: string | null;
  conferencia: {
    sumario: string;
    mes: Bloco;
    ano: Bloco | null;
    anoPeriodo: string | null;
    doze: Bloco;
    dozePeriodo: string;
  };
  naoIdentificado: [number[], number[]];
  municipios: LinhaCaged[];
};

export type MesCaged = {
  competencia: string;
  admissoes: number;
  desligamentos: number;
  saldo: number;
};

export type CagedMunicipio = {
  meses: MesCaged[];
  admissoes: number;
  desligamentos: number;
  saldo: number;
  ultimo: MesCaged;
};

const NOMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** `"202607"` → `"julho de 2026"`. */
export function nomeCompetencia(c: string): string {
  return `${NOMES[Number(c.slice(4)) - 1]} de ${c.slice(0, 4)}`;
}

/**
 * `"202607"` → `"jul. 2026"`, para a coluna da tabela: a mesma abreviatura
 * das séries do Brasil (`rotuloPeriodo`), com ponto e "maio" inteiro.
 */
export function competenciaCurta(c: string): string {
  return rotuloPeriodo(`${c.slice(0, 4)}-${c.slice(4)}`);
}

/**
 * O saldo com sinal: `+1.234`, `−56`, `0`. O menos é o sinal tipográfico
 * (U+2212), que não quebra linha nem some ao lado do número.
 */
export function comSinal(n: number): string {
  const abs = Math.abs(n).toLocaleString("pt-BR");
  return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : "0";
}

const cacheIndice = new WeakMap<object, Map<number, LinhaCaged>>();

/** O Caged de um município, ou `null` se o código não está no arquivo. */
export function cagedDe(c: SnapshotCaged, codigo: number): CagedMunicipio | null {
  let indice = cacheIndice.get(c.municipios);
  if (!indice) {
    indice = new Map(c.municipios.map((l) => [l[0], l]));
    cacheIndice.set(c.municipios, indice);
  }
  const l = indice.get(codigo);
  if (!l) return null;
  const meses = c.competencias.map((competencia, i) => {
    const admissoes = l[1][i] ?? 0;
    const desligamentos = l[2][i] ?? 0;
    return { competencia, admissoes, desligamentos, saldo: admissoes - desligamentos };
  });
  const admissoes = meses.reduce((s, m) => s + m.admissoes, 0);
  const desligamentos = meses.reduce((s, m) => s + m.desligamentos, 0);
  return {
    meses, admissoes, desligamentos, saldo: admissoes - desligamentos,
    ultimo: meses[meses.length - 1]!,
  };
}

/**
 * Os 12 meses de um conjunto de municípios (os de um estado), somados, e
 * quantos deles fecharam a janela com saldo positivo.
 *
 * É a soma dos municípios, e não o número do estado no sumário do MTE: as
 * movimentações sem município identificado (`naoIdentificado`, só no total do
 * país) ficam de fora, e a página diz isso. Código ausente do arquivo não
 * conta como zero nem entra no denominador de `positivos`.
 */
export function cagedDeVarios(
  c: SnapshotCaged, codigos: Iterable<number>,
): (CagedMunicipio & { comDado: number; positivos: number }) | null {
  const n = c.competencias.length;
  const adm = new Array<number>(n).fill(0);
  const des = new Array<number>(n).fill(0);
  let comDado = 0;
  let positivos = 0;
  for (const codigo of codigos) {
    const um = cagedDe(c, codigo);
    if (!um) continue;
    comDado += 1;
    if (um.saldo > 0) positivos += 1;
    um.meses.forEach((m, i) => {
      adm[i]! += m.admissoes;
      des[i]! += m.desligamentos;
    });
  }
  if (comDado === 0) return null;
  const meses = c.competencias.map((competencia, i) => ({
    competencia, admissoes: adm[i]!, desligamentos: des[i]!, saldo: adm[i]! - des[i]!,
  }));
  const admissoes = adm.reduce((s, x) => s + x, 0);
  const desligamentos = des.reduce((s, x) => s + x, 0);
  return {
    meses, admissoes, desligamentos, saldo: admissoes - desligamentos,
    ultimo: meses[n - 1]!, comDado, positivos,
  };
}

/**
 * Os 12 meses do PAÍS, somando os municípios e o "não identificado".
 *
 * Existe para a página poder dizer o total nacional **a partir do dado**, e
 * para um teste cobrar que ele é o número do sumário do MTE: se a soma dos
 * municípios não der o oficial, o arquivo perdeu ou duplicou alguém.
 */
export function totalDoPais(c: SnapshotCaged): Bloco {
  let a = 0;
  let d = 0;
  for (const l of c.municipios) {
    for (const x of l[1]) a += x;
    for (const x of l[2]) d += x;
  }
  for (const x of c.naoIdentificado[0]) a += x;
  for (const x of c.naoIdentificado[1]) d += x;
  return { saldo: a - d, admissoes: a, desligamentos: d };
}

/** `1 admissão`, `0 admissões`, `1.234 admissões`: o plural sai do número. */
export function contagem(n: number, singular: string, plural: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? singular : plural}`;
}

/**
 * Abaixo disto o saldo por mil habitantes não entra na lista: num município
 * de 2 mil habitantes, uma empresa que abre ou fecha move o número por mil
 * mais que a economia de uma capital, e o topo seria só de cidades pequenas.
 */
export const POPULACAO_MINIMA_POR_MIL = 100_000;

export type LinhaRankingCaged = {
  codigo: number;
  nome: string;
  uf: string;
  saldo: number;
  admissoes: number;
  desligamentos: number;
  /** A estimativa de população do IBGE, ou `null` se o snapshot não a tem. */
  populacao: number | null;
  /** Saldo por mil habitantes; `null` sem população. */
  porMil: number | null;
};

export type RankingCaged = {
  /** Todos os municípios do arquivo, do maior saldo ao menor. */
  ordem: LinhaRankingCaged[];
  positivos: number;
  negativos: number;
  zerados: number;
  /** Só os de `POPULACAO_MINIMA_POR_MIL` habitantes ou mais, por mil desc. */
  porMil: LinhaRankingCaged[];
};

/**
 * O ranking dos 12 meses: o saldo de cada município, e o mesmo saldo por mil
 * habitantes nas cidades grandes.
 *
 * Nome e UF vêm do snapshot do IBGE (de onde as páginas nascem), casados pelo
 * código; o número vem de `cagedDe`, o mesmo da página do município. Código do
 * Caged sem município no snapshot fica de fora: sem nome, não há o que listar.
 * Empate de saldo desempata pelo nome e depois pelo código, para a ordem não
 * depender da ordem do arquivo.
 */
export function rankingCaged(c: SnapshotCaged, identidade: Snapshot): RankingCaged {
  const iPop = identidade.colunas.indexOf("populacao-estimada");
  const nomes = new Map<number, { nome: string; uf: string; populacao: number | null }>();
  for (const l of identidade.municipios) {
    const pop = iPop < 0 ? null : l[iPop];
    nomes.set(l[0] as number, {
      nome: l[1] as string,
      uf: l[2] as string,
      populacao: typeof pop === "number" && pop > 0 ? pop : null,
    });
  }
  const ordem: LinhaRankingCaged[] = [];
  for (const l of c.municipios) {
    const id = nomes.get(l[0]);
    const um = cagedDe(c, l[0]);
    if (!id || !um) continue;
    ordem.push({
      codigo: l[0], nome: id.nome, uf: id.uf,
      saldo: um.saldo, admissoes: um.admissoes, desligamentos: um.desligamentos,
      populacao: id.populacao,
      porMil: id.populacao === null ? null : (um.saldo * 1000) / id.populacao,
    });
  }
  const desempate = (a: LinhaRankingCaged, b: LinhaRankingCaged) =>
    a.nome.localeCompare(b.nome, "pt-BR") || a.codigo - b.codigo;
  ordem.sort((a, b) => b.saldo - a.saldo || desempate(a, b));
  const porMil = ordem
    .filter((x) => x.populacao !== null && x.populacao >= POPULACAO_MINIMA_POR_MIL)
    .sort((a, b) => b.porMil! - a.porMil! || desempate(a, b));
  return {
    ordem,
    positivos: ordem.filter((x) => x.saldo > 0).length,
    negativos: ordem.filter((x) => x.saldo < 0).length,
    zerados: ordem.filter((x) => x.saldo === 0).length,
    porMil,
  };
}
