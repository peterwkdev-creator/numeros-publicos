import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Eleições 2026: o resultado oficial do TSE, como `python -m numeros_publicos
 * eleicoes-2026` o grava (`dados/eleicoes-2026.json` e
 * `dados/eleicoes-2026-municipios.json`). A espec é
 * `especs/numeros-publicos-eleicoes-2026.md`, no repositório de trabalho.
 *
 * Nada aqui calcula resultado: os números são os do TSE. As exceções são
 * aritmética de leitura, escrita na página onde aparece: a margem do 2º turno
 * (um menos o outro) e o percentual de cada candidato no município, que o
 * arquivo compacto não guarda (votos do candidato sobre os válidos, a mesma
 * conta do TSE, arredondada em duas casas).
 */

export interface Candidato {
  n: string;
  nome: string;
  partido: string;
  votos: number;
  pct: number;
  eleito: boolean;
  situacao: string;
  destino: string;
}

export interface Resultado {
  gerado: string;
  final: boolean;
  secoesTotal: number;
  secoesTotalizadas: number;
  eleitorado: number;
  comparecimento: number;
  pctComparecimento: number;
  abstencao: number;
  pctAbstencao: number;
  validos: number;
  anulados: number;
  brancos: number;
  pctBrancos: number;
  nulos: number;
  pctNulos: number;
  candidatos: Candidato[];
}

export type Turno = "1" | "2";

export interface Eleicoes2026 {
  fonte: {
    orgao: string;
    origem: string;
    exemplo: string;
    municipios: string;
    licenca: Record<string, string>;
    coletadoEm: string;
  };
  turnos: Record<Turno, string>;
  presidente: Record<Turno, { brasil: Resultado; ufs: Record<string, Resultado> }>;
  governador: Record<Turno, Record<string, Resultado>>;
  municipios: {
    campos: string[];
    total: number;
    gerado: Record<string, [string, string]>;
    semPar: { ibge: string; nome: string }[];
  };
}

export type ChaveMunicipal = "p1" | "p2" | "g1" | "g2";

export interface MunicipiosEleicoes {
  campos: string[];
  ordem: {
    p1: string[];
    p2: string[];
    g1: Record<string, string[]>;
    g2: Record<string, string[]>;
  };
  municipios: Record<
    string,
    { uf: string; tse: string; nome: string } & Partial<Record<ChaveMunicipal, number[]>>
  >;
}

export const CAMINHO = "/eleicoes-2026/";
export const TITULO = "Eleições 2026";

/** A raiz dos arquivos do TSE, a mesma que o navegador consulta ao vivo. */
export const BASE_TSE = "https://resultados.tse.jus.br/oficial/ele2026";

/** Eleição do TSE por chave: presidente/governador, 1º/2º turno. */
export const ELEICAO: Record<ChaveMunicipal, number> = { p1: 6257, p2: 6258, g1: 6259, g2: 6260 };

const DATA_TURNO: Record<Turno, string> = { "1": "04/10/2026", "2": "25/10/2026" };
export const dataDoTurno = (t: Turno) => DATA_TURNO[t];

export const UF_NOME: Record<string, string> = {
  ac: "Acre", al: "Alagoas", ap: "Amapá", am: "Amazonas", ba: "Bahia", ce: "Ceará",
  df: "Distrito Federal", es: "Espírito Santo", go: "Goiás", ma: "Maranhão",
  mt: "Mato Grosso", ms: "Mato Grosso do Sul", mg: "Minas Gerais", pa: "Pará",
  pb: "Paraíba", pr: "Paraná", pe: "Pernambuco", pi: "Piauí", rj: "Rio de Janeiro",
  rn: "Rio Grande do Norte", rs: "Rio Grande do Sul", ro: "Rondônia", rr: "Roraima",
  sc: "Santa Catarina", se: "Sergipe", sp: "São Paulo", to: "Tocantins",
  zz: "Exterior",
};

/** As UFs na ordem do nome, com o exterior no fim. */
export function ufsEmOrdem(chaves: string[]): string[] {
  return [...chaves].sort((a, b) => {
    if (a === "zz") return 1;
    if (b === "zz") return -1;
    return UF_NOME[a]!.localeCompare(UF_NOME[b]!, "pt-BR");
  });
}

let cache: Eleicoes2026 | null = null;
let cacheMun: MunicipiosEleicoes | null = null;

export async function lerEleicoes(): Promise<Eleicoes2026> {
  if (cache) return cache;
  const arquivo = path.join(process.cwd(), "dados", "eleicoes-2026.json");
  cache = JSON.parse(await readFile(arquivo, "utf-8")) as Eleicoes2026;
  return cache;
}

export async function lerEleicoesMunicipios(): Promise<MunicipiosEleicoes> {
  if (cacheMun) return cacheMun;
  const arquivo = path.join(process.cwd(), "dados", "eleicoes-2026-municipios.json");
  cacheMun = JSON.parse(await readFile(arquivo, "utf-8")) as MunicipiosEleicoes;
  return cacheMun;
}

/** Diferença de votos entre o 1º e o 2º colocados. */
export function margem(r: Resultado): number {
  const [a, b] = r.candidatos;
  return a && b ? a.votos - b.votos : 0;
}

/** `25/10/2026 23:27:02` → `25/10/2026, 23:27`. */
export function geradoCurto(g: string): string {
  const [d, h] = g.split(" ");
  return `${d}, ${(h ?? "").slice(0, 5)}`;
}

/**
 * O percentual do candidato como o TSE publica em `pvap`: sobre a soma dos
 * votos de TODOS os candidatos, inclusive os anulados e anulados sub judice
 * (não sobre os válidos), em duas casas, meio para cima, e 0,01 para quem
 * teve voto e arredondaria a zero. Conferido em 26/10/2026 contra os 120.235
 * `pvap` dos 17.273 arquivos coletados: nenhuma diferença. Conta em inteiros
 * (centésimos), sem o erro de ponto flutuante do meio exato.
 */
export function pctTse(votos: number, totalCandidatos: number): number {
  if (!totalCandidatos) return 0;
  const centesimos = Math.floor((votos * 20000 + totalCandidatos) / (2 * totalCandidatos));
  return (votos > 0 && centesimos === 0 ? 1 : centesimos) / 100;
}

export interface LinhaMunicipal {
  n: string;
  nome: string;
  partido: string;
  votos: number;
  /** null quando o voto do candidato não entra nos válidos (anulado). */
  pct: number | null;
}

export interface CargoMunicipal {
  chave: ChaveMunicipal;
  cargo: "Presidente" | "Governador";
  turno: Turno;
  eleitorado: number;
  comparecimento: number;
  abstencao: number;
  brancos: number;
  nulos: number;
  secoesTotalizadas: number;
  secoesTotal: number;
  linhas: LinhaMunicipal[];
}

export interface EleicaoDoMunicipio {
  uf: string;
  tse: string;
  cargos: CargoMunicipal[];
}

/**
 * O resultado de um município, ou `null` quando ele não tem par no TSE (a
 * página mostra uma nota, nunca zero). A lista de candidatos e os nomes vêm
 * do resultado do país (presidente) ou da UF (governador); o arquivo compacto
 * só traz os votos, na mesma ordem.
 */
export function eleicaoDoMunicipio(
  e: Eleicoes2026, mm: MunicipiosEleicoes, ibge: string | number,
): EleicaoDoMunicipio | null {
  const reg = mm.municipios[String(ibge)];
  if (!reg) return null;
  const campos = mm.campos;
  const idx = (c: string) => campos.indexOf(c);
  const cargos: CargoMunicipal[] = [];
  for (const chave of ["p2", "p1", "g2", "g1"] as const) {
    const linha = reg[chave];
    if (!linha) continue;
    const turno = chave[1] as Turno;
    const presidente = chave[0] === "p";
    const ref = presidente ? e.presidente[turno].brasil : e.governador[turno][reg.uf];
    const ordem = presidente ? mm.ordem[chave as "p1" | "p2"] : mm.ordem[chave as "g1" | "g2"][reg.uf];
    if (!ref || !ordem) continue;
    const porNumero = new Map(ref.candidatos.map((c) => [c.n, c]));
    const votos = linha.slice(campos.length);
    const totalCandidatos = votos.reduce((s, v) => s + v, 0);
    const linhas = ordem
      .map((n, i) => {
        const c = porNumero.get(n)!;
        const valido = c.destino.startsWith("V");
        return {
          n, nome: c.nome, partido: c.partido, votos: votos[i]!,
          pct: valido ? pctTse(votos[i]!, totalCandidatos) : null,
        };
      })
      .sort((a, b) => b.votos - a.votos || a.n.localeCompare(b.n));
    cargos.push({
      chave,
      cargo: presidente ? "Presidente" : "Governador",
      turno,
      eleitorado: linha[idx("eleitorado")]!,
      comparecimento: linha[idx("comparecimento")]!,
      abstencao: linha[idx("abstencao")]!,
      brancos: linha[idx("brancos")]!,
      nulos: linha[idx("nulos")]!,
      secoesTotalizadas: linha[idx("secoesTotalizadas")]!,
      secoesTotal: linha[idx("secoesTotal")]!,
      linhas,
    });
  }
  return { uf: reg.uf, tse: reg.tse, cargos };
}

/** O endereço do `-u.json` de um município no TSE (o mesmo que o navegador pede). */
export function urlMunicipio(chave: ChaveMunicipal, uf: string, tse: string): string {
  const e = ELEICAO[chave];
  const cargo = chave[0] === "p" ? "0001" : "0003";
  return `${BASE_TSE}/${e}/dados/${uf}/${uf}${tse}-c${cargo}-e${String(e).padStart(6, "0")}-u.json`;
}
