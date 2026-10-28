/**
 * Os MEI optantes pelo SIMEI na página do município. **Módulo puro.**
 *
 * O arquivo (`dados/simei.json`) vem de `python -m numeros_publicos
 * simei-exportar`, que só o escreve com as 27 UFs em todas as datas, as
 * linhas somando o TOTAL de cada fatia, uma posição consolidada só e os
 * 5.571 municípios na posição atual.
 *
 * ## Ausência não é zero
 *
 * A Receita omite da tabela o município sem nenhum optante naquela data, e o
 * arquivo traz `null` ali. Aqui o `null` continua `null`: no gráfico vira ano
 * sem barra ("nenhum optante registrado"), no download, célula vazia com a
 * nota. Nunca um zero inventado.
 */

/** `[código IBGE, [optantes por data, na ordem de `datas`; `null` = sem linha na fonte]]`. */
export type LinhaSimei = [number, (number | null)[]];

export type SnapshotSimei = {
  fonte: string;
  origem: string;
  licenca: string;
  /** A posição consolidada (AAAA-MM-DD): a data mais recente da série. */
  posicao: string;
  /** 31/12 de cada ano desde 2009 e, por último, a posição atual. */
  datas: string[];
  coletadoEm: string;
  /** O total do país em cada data (a soma das linhas TOTAL das 27 UFs). */
  totais: number[];
  municipios: LinhaSimei[];
};

export type PontoSimei = { data: string; valor: number | null };

/** `"2026-10-24"` → `"24/10/2026"`. */
export function dataBr(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

const cacheIndice = new WeakMap<object, Map<number, (number | null)[]>>();

/** A série de um município, data a data, ou `null` se o código não está no arquivo. */
export function simeiDe(s: SnapshotSimei, codigo: number): PontoSimei[] | null {
  let indice = cacheIndice.get(s.municipios);
  if (!indice) {
    indice = new Map(s.municipios.map((l) => [l[0], l[1]]));
    cacheIndice.set(s.municipios, indice);
  }
  const valores = indice.get(codigo);
  if (!valores) return null;
  return s.datas.map((data, i) => ({ data, valor: valores[i] ?? null }));
}

/** Optantes por mil habitantes; `null` sem valor ou sem população. */
export function porMil(valor: number | null | undefined, populacao: number | null | undefined): number | null {
  if (typeof valor !== "number" || typeof populacao !== "number" || !(populacao > 0)) return null;
  return (valor * 1000) / populacao;
}

type ComPopulacao = { codigo: number; uf: string; valores: Record<string, number | null> };

export type PosicaoSimei = {
  /** Optantes por mil habitantes na posição atual. */
  porMil: number;
  /** 1 = o maior número por habitante do estado. */
  posicao: number;
  /** Quantos municípios do estado entram na comparação. */
  de: number;
};

export type IndiceSimei = {
  porCodigo: Map<number, PosicaoSimei>;
  /** A soma do país na posição atual sobre a soma da população estimada, × 1000. */
  taxaPais: number | null;
};

const cachePosicoes = new WeakMap<object, IndiceSimei>();

/**
 * Por mil habitantes e a posição de cada município no seu estado, na posição
 * atual, com a estimativa de população do IBGE (`populacao-estimada`), a
 * mesma que a página já usa. A posição é 1 + quantos do mesmo estado têm
 * MAIS optantes por habitante (empate divide o lugar). Calculado uma vez por
 * build, guardado pela lista de municípios.
 */
export function indiceSimei(s: SnapshotSimei, municipios: readonly ComPopulacao[]): IndiceSimei {
  const pronto = cachePosicoes.get(municipios);
  if (pronto) return pronto;
  const ultimo = s.datas.length - 1;
  const atual = new Map(s.municipios.map((l) => [l[0], l[1][ultimo] ?? null]));
  const porUf = new Map<string, { codigo: number; porMil: number }[]>();
  let soma = 0;
  let pop = 0;
  for (const m of municipios) {
    const valor = atual.get(m.codigo) ?? null;
    const p = m.valores["populacao-estimada"] ?? null;
    const t = porMil(valor, p);
    if (t === null) continue;
    soma += valor!;
    pop += p!;
    const lista = porUf.get(m.uf) ?? [];
    lista.push({ codigo: m.codigo, porMil: t });
    porUf.set(m.uf, lista);
  }
  const porCodigo = new Map<number, PosicaoSimei>();
  for (const lista of porUf.values()) {
    for (const x of lista) {
      const acima = lista.filter((y) => y.porMil > x.porMil).length;
      porCodigo.set(x.codigo, { porMil: x.porMil, posicao: acima + 1, de: lista.length });
    }
  }
  const r = { porCodigo, taxaPais: pop > 0 ? (soma * 1000) / pop : null };
  cachePosicoes.set(municipios, r);
  return r;
}

/** `17.730.861` → `"17,7 milhões"` (uma casa, para a nota). */
export function milhoes(n: number): string {
  return `${(n / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} milhões`;
}

/** A nota que viaja com o download: o vazio é ausência na fonte, nunca zero. */
export const NOTA_AUSENCIA =
  "vazio = o município não aparece na tabela da Receita naquela data (nenhum optante registrado), nunca zero";

/**
 * O cabeçalho do download largo (`/dados/mei.csv` e `.xlsx`): uma coluna por
 * data e, no CSV, uma última coluna sem valores cujo NOME é a nota da
 * ausência e da posição consolidada (o CSV não tem dicionário, e a nota
 * custa um `;` por linha). A planilha leva a nota no dicionário.
 */
export function cabecalhoMei(s: SnapshotSimei, formato: "csv" | "xlsx"): string[] {
  const ultimo = s.datas.length - 1;
  if (formato === "csv") {
    return [
      "codigo_ibge", "municipio", "uf",
      ...s.datas.map((d) => `mei_simei_${d.replaceAll("-", "_")}`),
      `nota: ${NOTA_AUSENCIA}; posição consolidada até ${dataBr(s.posicao)}; ` +
        `a última data é a posição atual; fonte: ${s.fonte}`,
    ];
  }
  return [
    "Código IBGE", "Município", "UF",
    ...s.datas.map((d, i) =>
      i === ultimo ? `MEI em ${dataBr(d)} (posição atual)` : `MEI em ${dataBr(d)}`),
  ];
}

/** Uma linha por município do snapshot, com `null` (célula vazia) onde a fonte não tem linha. */
export function linhasMei(
  s: SnapshotSimei,
  municipios: readonly { codigo: number; nome: string; uf: string }[],
  formato: "csv" | "xlsx",
): (string | number | null)[][] {
  return municipios.map((m) => [
    m.codigo, m.nome, m.uf,
    ...(simeiDe(s, m.codigo)?.map((p) => p.valor) ?? s.datas.map(() => null)),
    ...(formato === "csv" ? [null] : []),
  ]);
}
