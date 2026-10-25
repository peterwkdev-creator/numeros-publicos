/**
 * O dado fiscal dos 26 governos estaduais e do DF: o contrato com o
 * `estados-fiscal.json` que o motor escreve (`exportar-estados`, banco
 * `estados.db`) e as leituras que a página de estado faz dele.
 *
 * Arquivo separado do `fiscal.json` dos municípios, e de propósito: o
 * governo estadual e a soma dos municípios **não se somam**. Parte do que o
 * estado gasta é dinheiro transferido aos municípios (convênios, repasses da
 * saúde e da educação; a cota do ICMS e do IPVA, CF art. 158), que o município
 * gasta de novo: a soma contaria esse dinheiro duas vezes.
 * Espec: `especs/painel-fiscal-estados.md`.
 */

import type { FatiaFuncao } from "./fiscal/funcoes";

/** `[total declarado, [[índice em rotulos, valor], ...]]`, valores em reais. */
export type FuncoesDoAno = [total: number, valores: [funcao: number, valor: number][]];

/** `[RCL ajustada, despesa, % da RCL, limite prudencial, limite legal]`. */
export type PessoalDoAno = [
  rclAjustada: number, despesa: number, percentual: number,
  limitePrudencial: number, limiteLegal: number,
];

export type GovernoEstadual = {
  uf: string;
  nome: string;
  /** Por exercício (a chave é o ano), 6º bimestre: o ano inteiro. */
  funcoes: Record<string, FuncoesDoAno>;
  /** Por exercício, 3º quadrimestre, Poder Executivo. */
  pessoal: Record<string, PessoalDoAno>;
};

export type SnapshotEstadosFiscal = {
  geradoEm: string;
  coletadoEm: string | null;
  fonte: { funcoes: string; pessoal: string };
  /** Do mais novo para o mais velho. */
  exercicios: number[];
  rotulos: string[];
  colunasFuncoes: string[];
  colunasPessoal: string[];
  /** Pelo código do IBGE da UF (29 é a Bahia, 53 o DF). */
  estados: Record<string, GovernoEstadual>;
  /** O ano de função que a régua da fonte recusou (soma ≠ total). */
  fora: { codigo: number; exercicio: number; motivo: string }[];
};

/** As três funções cuja série a página mostra: as que o estado mais executa. */
export const FUNCOES_DA_SERIE = ["Educação", "Saúde", "Segurança Pública"] as const;

/** O governo de uma UF pela sigla, ou `null` se o arquivo não o tem. */
export function governoDe(
  snap: SnapshotEstadosFiscal, sigla: string,
): GovernoEstadual | null {
  return Object.values(snap.estados).find((g) => g.uf === sigla) ?? null;
}

/** O ano mais novo em que a série tem dado, ou `null`. */
export function ultimoAno(serie: Record<string, unknown>): number | null {
  const anos = Object.keys(serie).map(Number);
  return anos.length ? Math.max(...anos) : null;
}

/** As fatias de um ano, da maior para a menor, no formato das barras. */
export function fatiasDoAno(
  snap: SnapshotEstadosFiscal, g: GovernoEstadual, ano: number,
): { total: number; fatias: FatiaFuncao[] } | null {
  const f = g.funcoes[String(ano)];
  if (!f) return null;
  const [total, valores] = f;
  const fatias = valores
    .map(([i, valor]) => ({
      // Índice sem rótulo é contrato quebrado: o teste do arquivo real o pega.
      nome: snap.rotulos[i] ?? `função ${i}`,
      valor,
      percentual: total > 0 ? (valor * 100) / total : null,
      funcao: i,
    }))
    .sort((a, b) => b.valor - a.valor);
  return { total, fatias };
}

/** O valor de uma função por ano, do mais velho ao mais novo; `null` onde o
 * ano não tem relatório ou a função não foi declarada. */
export function serieDaFuncao(
  snap: SnapshotEstadosFiscal, g: GovernoEstadual, nome: string,
): { ano: number; valor: number | null }[] {
  const i = snap.rotulos.indexOf(nome);
  return [...snap.exercicios].sort((a, b) => a - b).map((ano) => {
    const f = g.funcoes[String(ano)];
    const par = f && i >= 0 ? f[1].find(([j]) => j === i) : undefined;
    return { ano, valor: par ? par[1] : null };
  });
}
