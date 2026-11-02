/**
 * Em que a prefeitura declarou aplicar a emenda Pix, na seção de emendas do
 * município. **Módulo puro.**
 *
 * O arquivo (`dados/pix.json`) vem de `python -m numeros_publicos
 * pix-exportar`, que só o escreve com o número de planos e a soma por ano
 * fechados contra o banco; o banco vem dos planos de ação do Transferegov
 * (espec `especs/numeros-publicos-emendas-pix.md`). Aqui não se recalcula
 * nada da fonte: só se escolhe o ano, se contam planos por área e se
 * converte centavo em real.
 *
 * ## O que a página diz, e este módulo sustenta
 *
 * - **Área não tem valor.** A fonte dá a área (função) por executor, sem
 *   quantia: dividir o valor do plano entre as áreas seria inventar, e somar
 *   o valor dos planos de cada área passa do total. Por isso a área vem com o
 *   NÚMERO de planos que a citam, nunca com R$ (decisão 2 da espec).
 * - **O relatório de gestão é declaração da prefeitura**, e é recente: plano
 *   sem relatório não é plano sem execução. `null` é "sem relatório", nunca
 *   zero.
 * - **Só 2025 e o ano corrente na página**, como o resto da seção; a série
 *   desde 2020 vai para o download.
 */

/** `["Final" | "Parcial", data, executado em centavos, pendente em centavos]`. */
export type RelatorioPix = [string, string, number, number];

/** `[executor (só se não for o beneficiário), objeto, códigos das funções]`. */
export type ExecutorPix = [string | null, string, number[]];

/** `[ano, código do plano, centavos, executores, relatório]`. */
export type LinhaPlanoPix = [number, string, number, ExecutorPix[], RelatorioPix | null];

export type SnapshotPix = {
  fonte: string;
  origem: string;
  licenca: string;
  coletadoEm: string;
  anos: number[];
  funcoes: Record<string, string>;
  municipios: [number, LinhaPlanoPix[]][];
};

export type ObjetoPix = { executor: string | null; objeto: string; areas: string[] };

export type RelatorioDeclarado = {
  tipo: "final" | "parcial";
  data: string;
  executado: number;
  pendente: number;
};

export type PlanoPix = {
  ano: number;
  codigo: string;
  reais: number;
  objetos: ObjetoPix[];
  relatorio: RelatorioDeclarado | null;
};

export type AreaPix = { nome: string; planos: number };

export type PixMunicipio = {
  /** Todos os planos do arquivo, para o CSV. */
  todos: PlanoPix[];
  /** Os planos dos anos da página, do mais novo para o mais velho. */
  planos: PlanoPix[];
  /** As áreas citadas nos planos da página, da mais citada para a menos. */
  areas: AreaPix[];
  anos: number[];
};

const cacheIndice = new WeakMap<object, Map<number, LinhaPlanoPix[]>>();

function plano(e: SnapshotPix, [ano, codigo, centavos, executores, rel]: LinhaPlanoPix): PlanoPix {
  return {
    ano,
    codigo,
    reais: centavos / 100,
    objetos: executores.map(([executor, objeto, funcoes]) => ({
      executor,
      objeto,
      areas: funcoes.map((f) => e.funcoes[String(f)] ?? String(f)),
    })),
    relatorio: rel === null ? null : {
      tipo: rel[0] === "Final" ? "final" : "parcial",
      data: rel[1],
      executado: rel[2] / 100,
      pendente: rel[3] / 100,
    },
  };
}

/**
 * As áreas de um conjunto de planos: cada plano conta UMA vez em cada área
 * que algum executor dele cita. Empate se desfaz pelo nome, para a ordem não
 * depender da ordem do arquivo.
 */
export function areasDe(planos: PlanoPix[]): AreaPix[] {
  const conta = new Map<string, number>();
  for (const p of planos) {
    for (const nome of new Set(p.objetos.flatMap((o) => o.areas))) {
      conta.set(nome, (conta.get(nome) ?? 0) + 1);
    }
  }
  return [...conta]
    .map(([nome, n]) => ({ nome, planos: n }))
    .sort((a, b) => b.planos - a.planos || a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Os planos Pix de um município, ou `null` se ele não tem plano nenhum no
 * arquivo. `anos` são os da página (o último cheio e o corrente da seção).
 */
export function pixDe(e: SnapshotPix, codigo: number, anos: number[]): PixMunicipio | null {
  let indice = cacheIndice.get(e.municipios);
  if (!indice) {
    indice = new Map(e.municipios.map(([c, l]) => [c, l]));
    cacheIndice.set(e.municipios, indice);
  }
  const linhas = indice.get(codigo);
  if (!linhas) return null;
  const todos = linhas.map((l) => plano(e, l));
  const planos = todos
    .filter((p) => anos.includes(p.ano))
    .sort((a, b) => b.ano - a.ano || a.codigo.localeCompare(b.codigo));
  return { todos, planos, areas: areasDe(planos), anos: anos.filter((a) => planos.some((p) => p.ano === a)) };
}

/** "1 plano", "3 planos". */
export function planosEmTexto(n: number): string {
  return n === 1 ? "1 plano" : `${n} planos`;
}
