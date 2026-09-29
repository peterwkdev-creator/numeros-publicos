/**
 * Trabalho e renda na página do município. **Módulo puro.**
 *
 * Entrou em 29/09/2026, com duas fontes que contam coisas diferentes e não
 * podem aparecer como se fossem a mesma:
 *
 * | fonte | conta onde | ano |
 * |---|---|---|
 * | Censo 2022 | a pessoa **mora** | 2022 |
 * | Cadastro Central de Empresas | a empresa **está** | o mais recente publicado |
 *
 * Numa cidade-dormitório os dois divergem, e não é erro. Por isso as frases
 * da página dizem sempre de qual das duas é o número.
 *
 * ## O que NÃO existe, e a página diz
 *
 * **Não há taxa de desemprego ATUAL por município** em fonte oficial nenhuma.
 * A do Censo é de 2022; a PNAD Contínua, trimestral, vai só até estados e
 * capitais, e mede de outro jeito — as duas não se comparam. Quem procura
 * "desemprego em X" merece ouvir isso, em vez de um número que pareça atual.
 *
 * ## Duas médias, e elas não se somam
 *
 * O rendimento médio e o salário médio são as **médias publicadas pelo
 * IBGE**, e não conta nossa: dividir a massa pelas pessoas erra até R$ 2,92,
 * porque a contagem publicada já vem arredondada. O motor Python as confere
 * município a município contra os dois absolutos (ver `Media` em
 * `observatorio/ibge.py`), e o snapshot não as soma.
 */

import { mediana, type ParCenso } from "./censo";

/** Os dois pares do Censo, no mesmo molde (e na mesma tabela) dos seis de lá. */
export const PARES_TRABALHO: ParCenso[] = [
  {
    chave: "desocupacao",
    rotulo: "Desocupação",
    numerador: "desocupados-14-mais",
    denominador: "forca-de-trabalho-14-mais",
    contagem: "pessoas de 14 anos ou mais na força de trabalho",
    // A definição do IBGE tem as três condições, e as três importam: quem
    // não procurou ou não podia começar está FORA da força de trabalho.
    criterio: "estavam sem trabalho, tinham procurado um e podiam começar",
  },
  {
    chave: "previdencia",
    rotulo: "Contribuem para a previdência",
    numerador: "ocupados-contribuintes",
    denominador: "ocupados-14-mais",
    contagem: "pessoas ocupadas",
    criterio: "contribuíam para instituto de previdência oficial",
  },
];

/** Um valor direto (não um par), com o jeito de escrevê-lo. */
export type ValorTrabalho = {
  chave: string;
  rotulo: string;
  /** O código do indicador no snapshot. */
  codigo: string;
  /** O que o número conta, nas palavras da fonte. */
  criterio: string;
  formato: "reais" | "inteiro";
};

export const RENDA_CENSO: ValorTrabalho = {
  chave: "renda",
  rotulo: "Rendimento médio do trabalho",
  codigo: "rendimento-medio-trabalho",
  criterio: "por mês, somados todos os trabalhos, de quem trabalhava e tinha rendimento",
  formato: "reais",
};

export const EMPRESAS: ValorTrabalho[] = [
  {
    chave: "empresas",
    rotulo: "Empresas e outras organizações",
    codigo: "empresas-atuantes",
    // "Outras organizações" é o que a fonte diz, e importa: prefeitura,
    // câmara e associação entram na conta, e numa cidade pequena a
    // prefeitura pode ser o maior empregador.
    criterio: "atuantes, incluindo órgãos públicos e entidades sem fins lucrativos",
    formato: "inteiro",
  },
  {
    chave: "ocupadas",
    rotulo: "Pessoas ocupadas",
    codigo: "pessoal-ocupado-empresas",
    criterio: "assalariados, sócios e proprietários, em 31 de dezembro",
    formato: "inteiro",
  },
  {
    chave: "assalariados",
    rotulo: "Assalariados",
    codigo: "assalariados-empresas",
    criterio: "com vínculo de emprego, em 31 de dezembro",
    formato: "inteiro",
  },
  {
    chave: "salario",
    rotulo: "Salário médio mensal",
    codigo: "salario-medio-empresas",
    criterio: "salários do ano divididos por 13 e pelo número médio de assalariados",
    formato: "reais",
  },
];

/** A mediana de UMA coluna entre os municípios. `null` se a coluna não existe. */
export function medianaDaColuna(
  linhas: (number | string | null)[][],
  colunas: string[],
  codigo: string,
): number | null {
  const i = colunas.indexOf(codigo);
  if (i < 0) return null;
  const v: number[] = [];
  for (const l of linhas) {
    const x = l[i];
    if (typeof x === "number") v.push(x);
  }
  return mediana(v);
}

const cacheColunas = new WeakMap<object, Map<string, number | null>>();

/**
 * `medianaDaColuna` memorizado pelas linhas e pelo código — a mesma razão de
 * `medianasCache`: 5.571 páginas pedindo o mesmo número.
 */
export function medianaDaColunaCache(
  linhas: (number | string | null)[][],
  colunas: string[],
  codigo: string,
): number | null {
  let porCodigo = cacheColunas.get(linhas);
  if (!porCodigo) {
    porCodigo = new Map();
    cacheColunas.set(linhas, porCodigo);
  }
  if (porCodigo.has(codigo)) return porCodigo.get(codigo)!;
  const calculado = medianaDaColuna(linhas, colunas, codigo);
  porCodigo.set(codigo, calculado);
  return calculado;
}
