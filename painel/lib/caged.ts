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

/** `"202607"` → `"jul/2026"`, para a coluna da tabela. */
export function competenciaCurta(c: string): string {
  return `${NOMES[Number(c.slice(4)) - 1]!.slice(0, 3)}/${c.slice(0, 4)}`;
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
