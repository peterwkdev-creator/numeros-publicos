import { br } from "./dados";
import { CAMINHO_DADOS, UF_NOME, ufsEmOrdem, type Candidato, type Eleicoes2026, type Resultado } from "./eleicoes";
import {
  comCadeira, eleitosDoSenado, lider, nomeEstadual,
  type Bancada, type Cargos2026, type ContagemPartido,
} from "./eleicoes-cargos";
import { corDoPartido, type CorPartido } from "./partidos";

/**
 * O que a página macro das eleições (`/eleicoes-2026/`) mostra de cada cargo
 * e de cada estado (26/10/2026): a cor do estado no mapa, a dica do cursor e
 * o cartão que o clique abre. Montado uma vez no servidor; vai para o mapa
 * (`data-c-<cargo>` em cada estado) e para `/dados/eleicoes-2026-mapa.json`
 * (dica e cartão, que o `public/eleicoes-macro.js` busca). Os textos saem
 * prontos, formatados aqui: o navegador só os coloca na página.
 */

export const CHAVES_CARGO = ["p2", "p1", "gov", "sen", "depf", "depe"] as const;
export type ChaveCargo = (typeof CHAVES_CARGO)[number];
export type CorMapa = CorPartido | "empate" | "sem";

export const DADOS = CAMINHO_DADOS;

/** Uma linha do cartão: rótulo, valor, largura da barra (0 a 100), cor e eleito. */
export interface LinhaCartao { r: string; v: string; p?: number; c?: CorMapa; e?: boolean }

export interface UfCargo {
  /** Cor no mapa. */
  c: CorMapa;
  /** A dica do cursor. */
  d: string;
  /** O subtítulo do cartão. */
  s: string;
  l: LinhaCartao[];
  /** Nota ao pé do cartão. */
  n?: string;
  /** Link para a parte certa de /eleicoes-2026/dados/, e o texto dele. */
  h: string;
  t: string;
}

export interface GrupoLegenda { cor: CorMapa; rotulo: string; ufs: string[] }

export interface CargoMacro {
  chave: ChaveCargo;
  botao: string;
  /** O que a cor do mapa quer dizer neste cargo. */
  titulo: string;
  legenda: GrupoLegenda[];
  ufs: Record<string, UfCargo>;
}

const pct = (x: number) => `${br(x, 2)}%`;
const comPartido = (c: { nome: string; partido: string }) => `${c.nome} (${c.partido})`;
const plural = (n: number, um: string, varios: string) => `${br(n)} ${n === 1 ? um : varios}`;
const ESTADOS = Object.keys(UF_NOME).filter((u) => u !== "zz");

/** Os válidos, do mais para o menos votado. */
const validosDe = (r: Resultado) =>
  r.candidatos.filter((c) => c.destino.startsWith("V")).sort((a, b) => b.votos - a.votos);

/** Cor de quem venceu: empate só com os dois do topo votados e iguais. */
function corDoTopo(lista: { partido: string; votos: number }[]): CorMapa {
  const [x, y] = lista;
  if (!x || x.votos <= 0) return "sem";
  if (y && y.votos === x.votos) return "empate";
  return corDoPartido(x.partido);
}

function linhasCandidatos(lista: (Candidato | { nome: string; partido: string; votos: number; pct: number; eleito: boolean })[], max: number): LinhaCartao[] {
  const maior = Math.max(...lista.slice(0, max).map((c) => c.pct), 1);
  return lista.slice(0, max).map((c) => ({
    r: comPartido(c), v: `${pct(c.pct)} · ${plural(c.votos, "voto", "votos")}`,
    p: Math.round((c.pct / maior) * 1000) / 10, c: corDoPartido(c.partido), e: c.eleito || undefined,
  }));
}

const resto = (total: number, mostrados: number) =>
  total > mostrados ? `Mais ${plural(total - mostrados, "candidato", "candidatos")} na página de dados.` : undefined;

/**
 * A legenda: um grupo por cor, do que tem mais estados para o que tem menos,
 * com empate e "sem dado" no fim. Nos grupos "outros" e "empate" cada estado
 * leva o partido (ou os empatados) entre parênteses: a cor é a mesma, o
 * partido não.
 */
function legenda(ufs: Record<string, UfCargo>, rotulo: (u: string, cor: CorMapa) => string, rotuloOutro: (u: string) => string): GrupoLegenda[] {
  const grupos = new Map<CorMapa, GrupoLegenda>();
  for (const u of ufsEmOrdem(ESTADOS)) {
    const cor = ufs[u]?.c ?? "sem";
    const g = grupos.get(cor) ?? { cor, rotulo: rotulo(u, cor), ufs: [] };
    const quem = cor === "outros" || cor === "empate" ? rotuloOutro(u) : "";
    g.ufs.push(quem ? `${UF_NOME[u]} (${quem})` : UF_NOME[u]!);
    grupos.set(cor, g);
  }
  const fim = (c: CorMapa) => (c === "sem" ? 2 : c === "empate" ? 1 : 0);
  return [...grupos.values()].sort((a, b) => fim(a.cor) - fim(b.cor) || b.ufs.length - a.ufs.length);
}

/** "A, B e C": a lista em frase, sem "A e B e C". */
const emFrase = (xs: string[]) => (xs.length < 3 ? xs.join(" e ") : `${xs.slice(0, -1).join(", ")} e ${xs.at(-1)}`);

const rotuloFixo = (cor: CorMapa, nome: string) =>
  cor === "sem" ? "Sem dado" : cor === "empate" ? "Empate" : cor === "outros" ? "Outros partidos" : nome;

function presidente(e: Eleicoes2026, turno: "1" | "2"): CargoMacro {
  const p = e.presidente[turno];
  const ufs: Record<string, UfCargo> = {};
  const partidoDe = new Map<string, string>();
  for (const u of ESTADOS) {
    const r = p.ufs[u];
    if (!r) continue;
    const v = validosDe(r);
    const c = corDoTopo(v);
    if (v[0]) partidoDe.set(u, comPartido(v[0]));
    const max = turno === "2" ? 2 : 4;
    ufs[u] = {
      c,
      d: `${UF_NOME[u]}: ${v.slice(0, 2).map((x) => `${comPartido(x)} ${pct(x.pct)}`).join(", ")}`,
      s: `Presidente, ${turno}º turno`,
      l: linhasCandidatos(v, max),
      n: [`Comparecimento ${pct(r.pctComparecimento)} do eleitorado.`, resto(v.length, max)].filter(Boolean).join(" "),
      h: `${DADOS}#${turno === "2" ? "uf" : "pres1"}-${u}`,
      t: turno === "2" ? "Ver no placar por estado" : "Ver na tabela do 1º turno",
    };
  }
  return {
    chave: turno === "2" ? "p2" : "p1",
    botao: `Presidente ${turno}º turno`,
    titulo: `Presidente, ${turno}º turno: o candidato com mais votos válidos em cada estado`,
    legenda: legenda(ufs, (u, cor) => rotuloFixo(cor, partidoDe.get(u) ?? ""), (u) => partidoDe.get(u) ?? ""),
    ufs,
  };
}

function governador(e: Eleicoes2026): CargoMacro {
  const ufs: Record<string, UfCargo> = {};
  const partidoDe = new Map<string, string>();
  for (const u of ESTADOS) {
    const turno = e.governador["2"][u] ? "2" : "1";
    const r = e.governador[turno][u];
    if (!r) continue;
    const v = validosDe(r);
    const eleito = r.candidatos.find((c) => c.eleito);
    if (eleito) partidoDe.set(u, eleito.partido);
    ufs[u] = {
      c: eleito ? corDoPartido(eleito.partido) : "sem",
      d: eleito ? `${UF_NOME[u]}: ${comPartido(eleito)} ${pct(eleito.pct)}, eleito no ${turno}º turno`
        : `${UF_NOME[u]}: sem eleito no arquivo`,
      s: eleito ? `Governador, eleito no ${turno}º turno` : "Governador",
      l: linhasCandidatos(v, 4),
      n: resto(v.length, 4),
      h: `${DADOS}#gov-${u}`,
      t: "Ver todos os candidatos e os dois turnos",
    };
  }
  return {
    chave: "gov", botao: "Governador",
    titulo: "Governador: o partido do eleito em cada estado",
    legenda: legenda(ufs, (u, cor) => rotuloFixo(cor, partidoDe.get(u) ?? ""), (u) => partidoDe.get(u) ?? ""),
    ufs,
  };
}

function senador(c: Cargos2026): CargoMacro {
  const ufs: Record<string, UfCargo> = {};
  const partidoDe = new Map<string, string>();
  for (const u of ESTADOS) {
    const s = c.senador[u];
    if (!s) continue;
    const eleitos = eleitosDoSenado(s);
    const todos = [...s.candidatos].sort((a, b) => b.votos - a.votos);
    if (eleitos[0]) partidoDe.set(u, eleitos[0].partido);
    const max = Math.max(4, s.vagas + 2);
    // % sobre os válidos; o TSE soma os anulados ao divisor (até 5 pontos no AC).
    // Na dica (`d`) e no cartão (`s`): a dica só abre com o mouse.
    const nota = s.votosAnulados ? `% sobre os válidos; o TSE soma ao total os ${br(s.votosAnulados)} votos anulados` : "";
    const aviso = nota ? ` (${nota})` : "";
    ufs[u] = {
      c: eleitos[0] ? corDoPartido(eleitos[0].partido) : "sem",
      d: eleitos.length
        ? `${UF_NOME[u]}: ${eleitos.length === 1 ? "eleito" : "eleitos"} ${eleitos.map((x) => `${comPartido(x)} ${pct(x.pct)}`).join(", ")}${aviso}`
        : `${UF_NOME[u]}: sem eleito no arquivo`,
      s: `Senador: ${plural(s.vagas, "vaga", "vagas")}${nota ? `. ${nota}` : ""}`,
      l: linhasCandidatos(todos, max),
      n: resto(todos.length, max),
      h: `${DADOS}#sen-${u}`,
      t: "Ver todos os candidatos ao Senado",
    };
  }
  return {
    chave: "sen", botao: "Senador",
    titulo: "Senador: o partido do eleito mais votado em cada estado",
    legenda: legenda(ufs, (u, cor) => rotuloFixo(cor, partidoDe.get(u) ?? ""), (u) => partidoDe.get(u) ?? ""),
    ufs,
  };
}

function deputados(dep: Record<string, Bancada>, chave: "depf" | "depe"): CargoMacro {
  const ufs: Record<string, UfCargo> = {};
  const partidoDe = new Map<string, string>();
  for (const u of ESTADOS) {
    const b = dep[u];
    if (!b) continue;
    const nome = chave === "depf" ? "Deputado federal" : nomeEstadual(u, b);
    const lista = comCadeira(b);
    const l = lider(b);
    const topo = lista.slice(0, 3).map((p) => `${p.partido} ${br(p.eleitos)}`).join(", ");
    const empatados = lista.filter((p) => p.eleitos === lista[0]?.eleitos).map((p) => p.partido);
    // No empate, a legenda diz quem empatou: a cor só diz que houve empate.
    if (l) partidoDe.set(u, l.partido);
    else if (lista.length) partidoDe.set(u, emFrase(empatados));
    const maior = Math.max(...lista.map((p) => p.eleitos), 1);
    const maisVotados = [...b.eleitos].sort((x, y) => y.votos - x.votos).slice(0, 3);
    ufs[u] = {
      c: l ? corDoPartido(l.partido) : lista.length ? "empate" : "sem",
      d: !lista.length ? `${UF_NOME[u]}: sem eleito no arquivo`
        : l ? `${UF_NOME[u]}: ${l.partido} elegeu ${br(l.eleitos)} de ${plural(b.vagas, "cadeira", "cadeiras")}; ${topo}`
        : `${UF_NOME[u]}: empate entre ${emFrase(empatados)}, ${br(lista[0]!.eleitos)} de ${plural(b.vagas, "cadeira", "cadeiras")} cada; ${topo}`,
      s: `${nome}: ${plural(b.vagas, "cadeira", "cadeiras")}`,
      l: lista.map((p) => ({
        r: p.partido, v: `${plural(p.eleitos, "cadeira", "cadeiras")} · ${pct(p.pct)} dos votos`,
        p: Math.round((p.eleitos / maior) * 1000) / 10, c: corDoPartido(p.partido),
      })),
      n: maisVotados.length ? `Mais votados: ${maisVotados.map((x) => `${x.nome} (${x.partido}), ${plural(x.votos, "voto", "votos")}`).join("; ")}.` : undefined,
      h: `${DADOS}#${chave}-${u}`,
      t: "Ver as cadeiras e os eleitos",
    };
  }
  const federal = chave === "depf";
  return {
    chave, botao: federal ? "Deputado federal" : "Deputado estadual",
    titulo: federal
      ? "Deputado federal: o partido que mais elegeu em cada estado"
      : "Deputado estadual (no DF, distrital): o partido que mais elegeu em cada estado",
    legenda: legenda(ufs, (u, cor) => rotuloFixo(cor, partidoDe.get(u) ?? ""), (u) => partidoDe.get(u) ?? ""),
    ufs,
  };
}

/** Os cargos da página, na ordem dos botões; sem o arquivo dos cargos, só presidente e governador. */
export function montarMacro(e: Eleicoes2026, c: Cargos2026 | null): CargoMacro[] {
  const lista = [presidente(e, "2"), presidente(e, "1"), governador(e)];
  if (c) lista.push(senador(c), deputados(c.depFederal, "depf"), deputados(c.depEstadual, "depe"));
  return lista;
}

/** A frase do mapa para leitor de tela: o que a cor diz e os estados de cada grupo. */
export function descricaoDoMapa(m: CargoMacro): string {
  const n = (k: number) => `${k} ${k === 1 ? "estado" : "estados"}`;
  return `${m.titulo}. ` + m.legenda.map((g) => `${g.rotulo}, ${n(g.ufs.length)}: ${g.ufs.join(", ")}`).join(". ") + ".";
}

/** Governadores eleitos por partido, e quantos no 1º e no 2º turno. */
export function governadoresPorPartido(e: Eleicoes2026): { lista: ContagemPartido[]; turno1: number; turno2: number } {
  const m = new Map<string, ContagemPartido>();
  let turno1 = 0, turno2 = 0;
  for (const u of ESTADOS) {
    const no2 = e.governador["2"][u];
    const eleito = (no2 ?? e.governador["1"][u])?.candidatos.find((c) => c.eleito);
    if (!eleito) continue;
    if (no2) turno2++; else turno1++;
    const x = m.get(eleito.partido) ?? { partido: eleito.partido, n: 0 };
    x.n += 1;
    m.set(eleito.partido, x);
  }
  const lista = [...m.values()].sort((a, b) => b.n - a.n || a.partido.localeCompare(b.partido, "pt-BR"));
  return { lista, turno1, turno2 };
}
