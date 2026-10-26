import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Senador e deputados de 2026, do TSE, como a coleta os grava em
 * `dados/eleicoes-2026-cargos.json` (26/10/2026). Uma chave por UF, em
 * minúscula, 27 por cargo; `partidos` vem em ordem de eleitos, do maior para
 * o menor. Nada aqui calcula resultado: as somas por partido no Brasil são
 * aritmética de leitura (cadeiras e votos somados), sem percentual nacional,
 * que o TSE não publica para estes cargos.
 */

export interface FonteCargos {
  orgao: string;
  origem: string;
  eleicao: string;
  exemplo: string;
  coletadoEm: string;
  nota: string;
}

export interface CandidatoSenado {
  n: string;
  nome: string;
  partido: string;
  votos: number;
  pct: number;
  eleito: boolean;
}

export interface Senado {
  gerado: string;
  final: boolean;
  vagas: number;
  validos: number;
  candidatos: CandidatoSenado[];
  /** Votos em candidato com registro anulado: fora dos válidos. */
  votosAnulados?: number;
  candidatosAnulados?: { n: string; nome: string; partido: string; votos: number; situacao: string }[];
}

export interface PartidoBancada {
  partido: string;
  eleitos: number;
  votos: number;
  pct: number;
}

export interface Bancada {
  gerado: string;
  final: boolean;
  vagas: number;
  validos: number;
  /** Só no `df` do estadual: "Deputado distrital". */
  cargo?: string;
  partidos: PartidoBancada[];
  eleitos: { nome: string; partido: string; votos: number }[];
}

export interface Cargos2026 {
  fonte: FonteCargos;
  senador: Record<string, Senado>;
  depFederal: Record<string, Bancada>;
  depEstadual: Record<string, Bancada>;
}

let cache: Cargos2026 | null | undefined;

/**
 * O arquivo, ou `null` enquanto a coleta não o gravou: as páginas mostram
 * presidente e governador e omitem os outros cargos, nunca um zero.
 * `ELEICOES_CARGOS` aponta outro arquivo (só para conferir a página com uma
 * amostra, sem tocar em `dados/`).
 */
export async function lerCargos(): Promise<Cargos2026 | null> {
  if (cache !== undefined) return cache;
  const arquivo = process.env.ELEICOES_CARGOS
    ?? path.join(process.cwd(), "dados", "eleicoes-2026-cargos.json");
  cache = existsSync(arquivo) ? (JSON.parse(await readFile(arquivo, "utf-8")) as Cargos2026) : null;
  return cache;
}

/** Os eleitos de uma UF, do mais para o menos votado. */
export function eleitosDoSenado(s: Senado): CandidatoSenado[] {
  return s.candidatos.filter((c) => c.eleito).sort((a, b) => b.votos - a.votos);
}

export interface ContagemPartido {
  partido: string;
  /** Cadeiras ou eleitos. */
  n: number;
  /** Votos somados (só nos deputados). */
  votos?: number;
}

const ordenar = (m: Map<string, ContagemPartido>) =>
  [...m.values()].sort((a, b) => b.n - a.n || (b.votos ?? 0) - (a.votos ?? 0) || a.partido.localeCompare(b.partido, "pt-BR"));

/** Senadores eleitos por partido, somadas as 27 UFs. */
export function senadoresPorPartido(sen: Record<string, Senado>): ContagemPartido[] {
  const m = new Map<string, ContagemPartido>();
  for (const s of Object.values(sen)) for (const c of eleitosDoSenado(s)) {
    const x = m.get(c.partido) ?? { partido: c.partido, n: 0 };
    x.n += 1;
    m.set(c.partido, x);
  }
  return ordenar(m);
}

/** Cadeiras e votos por partido, somadas as 27 UFs; só partido que elegeu. */
export function cadeirasPorPartido(dep: Record<string, Bancada>): ContagemPartido[] {
  const m = new Map<string, ContagemPartido>();
  for (const b of Object.values(dep)) for (const p of b.partidos) {
    if (p.eleitos <= 0) continue;
    const x = m.get(p.partido) ?? { partido: p.partido, n: 0, votos: 0 };
    x.n += p.eleitos;
    x.votos = (x.votos ?? 0) + p.votos;
    m.set(p.partido, x);
  }
  return ordenar(m);
}

/** O total de vagas somadas as UFs (513 cadeiras na Câmara). */
export const vagasTotais = (r: Record<string, { vagas: number }>) =>
  Object.values(r).reduce((s, b) => s + b.vagas, 0);

/**
 * O partido que mais elegeu na UF, ou `null` com empate no topo (dois com o
 * mesmo número de cadeiras): a página diz "empate", não escolhe um.
 */
export function lider(b: Bancada): PartidoBancada | null {
  const [p, q] = [...b.partidos].sort((x, y) => y.eleitos - x.eleitos);
  if (!p || p.eleitos <= 0) return null;
  return q && q.eleitos === p.eleitos ? null : p;
}

/** Os partidos com cadeira, do maior para o menor (empate: mais votos). */
export const comCadeira = (b: Bancada) =>
  b.partidos.filter((p) => p.eleitos > 0).sort((x, y) => y.eleitos - x.eleitos || y.votos - x.votos);

/** "Deputado estadual", ou "Deputado distrital" no DF. */
export const nomeEstadual = (uf: string, b?: Bancada) =>
  b?.cargo ?? (uf === "df" ? "Deputado distrital" : "Deputado estadual");
