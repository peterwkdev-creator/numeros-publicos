/**
 * O INSS no painel: o retrato por grupo que `python -m observatorio
 * inss-exportar` escreve em `dados/inss.json`.
 *
 * O contrato é este tipo, e `TestRetratoParaOPainel` (Python) o cobra do outro
 * lado: mudou lá, muda aqui. Puro, sem `node:fs` — a leitura do disco fica em
 * `lib/servidor.ts`, como a do snapshot.
 *
 * Duas medidas diferentes, e a página nunca as confunde:
 * - **fila**: há quanto tempo esperam os pedidos AINDA sem decisão numa data.
 *   Quem foi atendido rápido já saiu do arquivo; não é "quanto demora".
 * - **negados**: do pedido ao "não", para quem foi negado no mês. É o único
 *   tempo até a decisão que o dado aberto permite medir. O tempo até o "sim"
 *   não está nos dados abertos (concessões não trazem a data do pedido).
 */

import { br } from "./dados";

export type ResumoInss = {
  n: number;
  mediana: number;
  p75: number;
  p90: number;
  acima45: number;
  acima90: number;
  publicavel: boolean;
};

export type RecorteInss = {
  n: number;
  mediana: number;
  acima45: number;
  publicavel: boolean;
};

export type FilaInss = ResumoInss & {
  /** Fração acima do prazo do acordo; null quando o grupo não tem prazo. */
  acimaDoPrazo: number | null;
  /** A mediana no mês anterior, para a tendência; null sem mês anterior. */
  medianaAnterior: number | null;
  porServico: (RecorteInss & { codigo: number; nome: string })[];
};

export type NegadosInss = ResumoInss & {
  porClientela: Partial<Record<"urbano" | "rural", RecorteInss>>;
};

export type GrupoInss = {
  chave: string;
  nome: string;
  nomePopular: string;
  /** Prazo do acordo no STF (Tema 1066, 2021), em dias; null fora da tabela. */
  prazoAcordo: number | null;
  /** O prazo conta do pedido (true) ou só depois da perícia (false)? */
  prazoContaDoPedido: boolean | null;
  fila: FilaInss | null;
  negados: NegadosInss | null;
};

export type SnapshotInss = {
  geradoEm: string;
  fonte: { nome: string; url: string };
  fila: {
    mes: string;
    referencia: string;
    mesAnterior: string | null;
    arquivo: string | null;
    gravadoEm: string | null;
  } | null;
  negados: { mes: string; arquivo: string | null; gravadoEm: string | null } | null;
  minimoPedidos: number;
  grupos: GrupoInss[];
};

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "2026-07" → "julho de 2026". */
export function mesPorExtenso(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  const nome = m ? MESES[m - 1] : undefined;
  if (!nome || !ano) throw new Error(`mês inválido no retrato do INSS: ${mes}`);
  return `${nome} de ${ano}`;
}

/** "2026-07-31" → "31/07/2026". */
export function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** 0.5176 → "52%". Zero casas: é o que a frase precisa, e o que se lê. */
export function pct(fracao: number): string {
  return `${br(fracao * 100, 0)}%`;
}

/** "1 dia", "50 dias". */
export function dias(n: number): string {
  return n === 1 ? "1 dia" : `${br(n)} dias`;
}

export function grupoPorChave(s: SnapshotInss, chave: string): GrupoInss | undefined {
  return s.grupos.find((g) => g.chave === chave);
}

/**
 * Grupos com página: os que têm fila publicável. Um grupo sem fila, ou abaixo
 * do mínimo, não ganha rota — página que só diz "poucos dados" não serve a
 * quem busca, e o build não deve gerar endereço que o próximo mês apague.
 */
export function gruposComPagina(s: SnapshotInss): GrupoInss[] {
  return s.grupos.filter((g) => g.fila?.publicavel);
}

/**
 * A frase da tendência, ou null. Não diz "melhorou": a mediana da fila cai
 * tanto quando o INSS decide mais rápido quanto quando entram mais pedidos
 * novos. Diz o número de antes e deixa a leitura para quem lê.
 */
export function tendencia(g: GrupoInss, s: SnapshotInss): string | null {
  const f = g.fila;
  if (!f || f.medianaAnterior === null || !s.fila?.mesAnterior) return null;
  return `No fim de ${mesPorExtenso(s.fila.mesAnterior)}, a metade esperava ` +
    `havia mais de ${dias(f.medianaAnterior)}.`;
}
