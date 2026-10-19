import { cagedDe, type SnapshotCaged } from "./caged";
import { PARES_CENSO, mediana } from "./censo";
import type { Snapshot } from "./dados";
import { emendasDe, type SnapshotEmendas } from "./emendas";
import { faixaDaLinha, type SnapshotFiscal } from "./fiscal";
import type { SnapshotIdeb } from "./ideb";
import { PARES_TRABALHO } from "./trabalho";

/**
 * Os dados da página /explorar: um arquivo por indicador, buscado só por ela.
 *
 * Espec: `especs/numeros-publicos-explorar.md` (repositório de trabalho), §5.
 *
 * ## Por que um arquivo por indicador
 *
 * Medido em 19/10/2026: os 12 indicadores do IBGE e do fiscal num arquivo só
 * custariam 125 KB comprimidos; um por indicador, ≈10 KB cada. Quem abre a
 * página olha um ou dois indicadores, não doze.
 *
 * ## Por que o valor já vem calculado
 *
 * A taxa de cada município sai daqui, com os mesmos pares das páginas
 * (`PARES_CENSO`, `PARES_TRABALHO`). Mandar numerador e denominador para o
 * navegador custaria o triplo (372 KB os absolutos, medido) e obrigaria o
 * script a repetir a conta, que é onde as duas versões divergiriam.
 *
 * ## Por que o agregado vai em células
 *
 * Percentual não se soma: o esgoto do Nordeste não é a média das taxas dos
 * nove estados. O agregado de qualquer recorte é Σ numerador / Σ denominador,
 * e por isso o arquivo leva as somas por UF × faixa de população (`a`). Região
 * e Brasil saem somando células no navegador: soma de inteiros, sem perda.
 * O que não tem par (o gasto com pessoal é razão de um relatório fiscal, não
 * de duas colunas) usa a mediana do recorte, rotulada como mediana.
 */

/**
 * As 7 classes de tamanho da população do IBGE, as da MUNIC ("Até 5 000" a
 * "Mais de 500 000"; Perfil dos Municípios Brasileiros 2012, tabela 21, lida
 * em 19/10/2026). O limite de cima é fechado: 5.000 habitantes é "até 5 mil".
 */
export const FAIXAS_POPULACAO = [
  { chave: "ate-5", rotulo: "Até 5 mil", ate: 5_000 },
  { chave: "5-10", rotulo: "De 5 mil a 10 mil", ate: 10_000 },
  { chave: "10-20", rotulo: "De 10 mil a 20 mil", ate: 20_000 },
  { chave: "20-50", rotulo: "De 20 mil a 50 mil", ate: 50_000 },
  { chave: "50-100", rotulo: "De 50 mil a 100 mil", ate: 100_000 },
  { chave: "100-500", rotulo: "De 100 mil a 500 mil", ate: 500_000 },
  { chave: "mais-500", rotulo: "Mais de 500 mil", ate: Infinity },
] as const;

/** Índice da faixa (0 a 6), ou `null` sem população conhecida. */
export function faixaPopulacao(pop: number | null | undefined): number | null {
  if (pop === null || pop === undefined || !Number.isFinite(pop) || pop < 0) return null;
  return FAIXAS_POPULACAO.findIndex((f) => pop <= f.ate);
}

/** `indice`: número com casas que não é percentual nem dinheiro (o IDEB). */
export type FormatoExplorar = "pct" | "reais" | "inteiro" | "indice";

type Base = {
  chave: string;
  rotulo: string;
  tema: string;
  formato: FormatoExplorar;
  /** Casas decimais gravadas no arquivo. */
  casas: number;
};

/** Valor = mult × numerador / denominador; agregado pela razão das somas. */
type PorRazao = Base & {
  tipo: "razao";
  numerador: string;
  denominador: string;
  mult: number;
  /** Coluna publicada pelo IBGE para o município, quando difere da conta. */
  valorPublicado?: string;
  /**
   * Município sem numerador continua no denominador do agregado. É o caso das
   * emendas: quem não recebeu nada fica "sem dado" na linha dele (ausência não
   * é zero), mas a população dele é do estado, e a página do estado divide o
   * total pago pela população inteira. A célula guarda `null` no numerador
   * quando ninguém nela recebeu, e o recorte todo `null` sai sem valor.
   */
  denominadorSemNumerador?: true;
};
/** Contagem: o agregado é a soma. */
type PorSoma = Base & { tipo: "soma"; coluna: string };
/** Sem par de colunas: o agregado é a mediana dos municípios do recorte. */
type PorMediana = Base & { tipo: "mediana"; coluna: string };

export type IndicadorExplorar = PorRazao | PorSoma | PorMediana;

const doPar = (chave: string, tema: string): PorRazao => {
  const p = [...PARES_CENSO, ...PARES_TRABALHO].find((x) => x.chave === chave);
  if (!p) throw new Error(`par sem definição: ${chave}`);
  return {
    chave, rotulo: p.rotulo, tema, formato: "pct", casas: 1,
    tipo: "razao", numerador: p.numerador, denominador: p.denominador, mult: 100,
  };
};

/**
 * Os arquivos de onde o /explorar lê. O snapshot do IBGE dá as linhas e a
 * população; os outros entram como colunas a mais (`COLUNAS_DE_FORA`).
 */
export type FontesExplorar = {
  snapshot: Snapshot;
  fiscal: SnapshotFiscal;
  ideb: SnapshotIdeb;
  idebFinais: SnapshotIdeb;
  caged: SnapshotCaged;
  emendas: SnapshotEmendas;
};

/** O IDEB observado na edição mais recente, a de `medianaUltimaEdicao`. */
function idebPorCodigo(s: SnapshotIdeb): Map<number, number> {
  const ultimo = s.edicoes.length - 1;
  const por = new Map<number, number>();
  for (const [codigo, pontos] of Object.entries(s.serie)) {
    const ponto = pontos.find(([i]) => i === ultimo);
    if (ponto) por.set(Number(codigo), ponto[1]);
  }
  return por;
}

/**
 * As colunas que não estão no snapshot, cada uma com a mesma função da página
 * que a mostra: o IDEB pela edição mais recente, o Caged pela soma dos 12
 * meses de `cagedDe`, as emendas pelo ano cheio de `emendasDe` (em reais).
 */
export const COLUNAS_DE_FORA: Record<string, (f: FontesExplorar) => Map<number, number | null>> = {
  "pessoal-rcl": (f) => pessoalPorCodigo(f.fiscal),
  "ideb-anos-iniciais": (f) => idebPorCodigo(f.ideb),
  "ideb-anos-finais": (f) => idebPorCodigo(f.idebFinais),
  "caged-saldo-12-meses": (f) => new Map(f.caged.municipios.map(
    (l) => [l[0], cagedDe(f.caged, l[0])!.saldo])),
  "emendas-pagas-ano-cheio": (f) => new Map(f.emendas.municipios.map(
    (l) => [l[0], emendasDe(f.emendas, l[0])!.cheio.reais])),
};

/**
 * Os indicadores, decididos pelo Peter em 19/10/2026 (espec, §9): os 12 da
 * Fase 1a e, na 1b, IDEB, Caged e emendas. A ORDEM é a da lista na página.
 */
export const INDICADORES_EXPLORAR: IndicadorExplorar[] = [
  {
    chave: "populacao", rotulo: "População estimada", tema: "População",
    formato: "inteiro", casas: 0, tipo: "soma", coluna: "populacao-estimada",
  },
  {
    // A mesma conta do cartão da página do município e da camada do mapa:
    // PIB (mil reais) × 1000 / população do Censo 2022.
    chave: "pib-habitante", rotulo: "PIB por habitante", tema: "Economia",
    formato: "reais", casas: 0, tipo: "razao",
    numerador: "pib-municipal", denominador: "populacao-censo-2022", mult: 1000,
  },
  {
    // A média publicada é a massa dividida por quem tem rendimento: medido em
    // 19/10/2026, a diferença nos 5.570 municípios é de até R$ 2,92 (arredondamento
    // do IBGE). A célula soma massa e pessoas; o município mostra o publicado.
    chave: "renda", rotulo: "Rendimento médio do trabalho", tema: "Trabalho e renda",
    formato: "reais", casas: 0, tipo: "razao",
    numerador: "massa-rendimento-trabalho", denominador: "ocupados-com-rendimento",
    mult: 1, valorPublicado: "rendimento-medio-trabalho",
  },
  doPar("desocupacao", "Trabalho e renda"),
  doPar("previdencia", "Trabalho e renda"),
  {
    // Fluxo, não estoque: soma-se, e o estado é a soma dos municípios dele
    // (`cagedDeVarios`), sem o que o MTE não atribui a município nenhum.
    chave: "caged", rotulo: "Saldo de empregos formais em 12 meses", tema: "Trabalho e renda",
    formato: "inteiro", casas: 0, tipo: "soma", coluna: "caged-saldo-12-meses",
  },
  doPar("agua", "Saneamento e moradia"),
  doPar("esgoto", "Saneamento e moradia"),
  doPar("lixo", "Saneamento e moradia"),
  doPar("internet", "Saneamento e moradia"),
  doPar("alfabetizacao", "Educação"),
  doPar("superior", "Educação"),
  {
    // Índice de 0 a 10, por rede: mediana, como no cartão do estado. Duas
    // casas para a mediana de um número par de municípios sair inteira.
    chave: "ideb-iniciais", rotulo: "IDEB dos anos iniciais (rede municipal)", tema: "Educação",
    formato: "indice", casas: 2, tipo: "mediana", coluna: "ideb-anos-iniciais",
  },
  {
    chave: "ideb-finais", rotulo: "IDEB dos anos finais (rede municipal)", tema: "Educação",
    formato: "indice", casas: 2, tipo: "mediana", coluna: "ideb-anos-finais",
  },
  {
    chave: "pessoal", rotulo: "Gasto com pessoal (% da RCL)", tema: "Contas públicas",
    formato: "pct", casas: 2, tipo: "mediana", coluna: "pessoal-rcl",
  },
  {
    // A régua da página do município (`porHabitante`): o último ano cheio
    // sobre a população estimada. O ano entra no rótulo pela página.
    chave: "emendas", rotulo: "Emendas parlamentares pagas por habitante", tema: "Contas públicas",
    formato: "reais", casas: 2, tipo: "razao",
    numerador: "emendas-pagas-ano-cheio", denominador: "populacao-estimada", mult: 1,
    denominadorSemNumerador: true,
  },
];

/** Uma linha do índice de busca: município (com código) ou estado. */
export type EntradaIndice = {
  nome: string;
  uf: string;
  pop: number;
  estado: boolean;
  codigo: number | null;
};

/**
 * A ordem do `indice.json`: população decrescente, estados no meio.
 * O `indice.json` e os arquivos do /explorar saem DESTA função, e é isso que
 * os mantém casados linha a linha. A razão da ordem está na rota do índice.
 */
export function entradasDoIndice(snapshot: Snapshot): EntradaIndice[] {
  const iPop = snapshot.colunas.indexOf("populacao-censo-2022");
  const iEst = snapshot.colunas.indexOf("populacao-estimada");
  const entradas: EntradaIndice[] = [
    ...snapshot.municipios.map(
      (m): EntradaIndice => ({
        nome: String(m[1]),
        uf: String(m[2]),
        pop: (m[iPop] as number | null) ?? (m[iEst] as number | null) ?? -1,
        estado: false,
        codigo: Number(m[0]),
      }),
    ),
    ...snapshot.ufs.map(
      (u): EntradaIndice => ({
        nome: u.nome,
        uf: u.sigla,
        pop: u.totais["populacao-censo-2022"] ?? -1,
        estado: true,
        codigo: null,
      }),
    ),
  ];
  return entradas.sort((a, b) => {
    // Sem população conhecida vai para o fim: ausência não é município
    // pequeno. Empate desfeito pelo nome, para a ordem ser determinística —
    // senão dois builds do mesmo dado gerariam arquivos diferentes.
    if (a.pop !== b.pop) return b.pop - a.pop;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

/**
 * A impressão digital da ordem: FNV-1a de 32 bits sobre "nome\tuf\n" de cada
 * linha. Vai em cada arquivo do /explorar; o script a recalcula sobre o
 * `indice.json` que recebeu e, se divergir (um arquivo de outro build no
 * cache), não desenha nada: cada linha mostraria o valor do vizinho.
 */
export function impressaoDaOrdem(linhas: { nome: string; uf: string }[]): string {
  let h = 0x811c9dc5;
  const texto = linhas.map((l) => `${l.nome}\t${l.uf}\n`).join("");
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export type ArquivoExplorar = {
  /** Impressão digital da ordem do `indice.json`. */
  ordem: string;
  /** Faixa de população por linha ("0" a "6"; "-" estado ou sem população). */
  faixas: string;
  /** Valor por linha, na ordem do índice; nos estados, o valor da UF. */
  valores: (number | null)[];
  /**
   * Células [uf, faixa, Σ numerador, Σ denominador] (razão) ou [uf, faixa, Σ]
   * (soma). Σ numerador `null`: ninguém da célula tem valor, mas a população
   * dela conta (`denominadorSemNumerador`).
   */
  celulas: (string | number | null)[][];
};

const arredondar = (v: number, casas: number) => {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
};

/**
 * O gasto com pessoal que entra na conta: o mesmo filtro da mediana do estado
 * (`panoramaEstados`). Implausível, quem presta contas como estado e quem não
 * estava instalado ficam sem valor; quem não entregou também.
 */
function pessoalPorCodigo(fiscal: SnapshotFiscal): Map<number, number> {
  const por = new Map<number, number>();
  for (const linha of fiscal.municipios) {
    const [codigo, , , , publicou, percentual] = linha;
    const faixa = faixaDaLinha(fiscal, linha);
    if (faixa === "implausivel" || faixa === "como-estado" || faixa === "nao-instalado") continue;
    if (publicou && typeof percentual === "number") por.set(Number(codigo), percentual);
  }
  return por;
}

export function arquivoDoIndicador(
  ind: IndicadorExplorar,
  fontes: FontesExplorar,
): ArquivoExplorar {
  const { snapshot } = fontes;
  const entradas = entradasDoIndice(snapshot);
  const col = new Map(snapshot.colunas.map((c, i) => [c, i]));
  const linhaDe = new Map(snapshot.municipios.map((m) => [Number(m[0]), m]));
  const deFora = new Map<string, Map<number, number | null>>();
  const ler = (m: unknown[], coluna: string): number | null => {
    const fora = COLUNAS_DE_FORA[coluna];
    if (fora) {
      if (!deFora.has(coluna)) deFora.set(coluna, fora(fontes));
      const v = deFora.get(coluna)!.get(Number(m[0]));
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    }
    const i = col.get(coluna);
    if (i === undefined) throw new Error(`coluna ausente no snapshot: ${coluna}`);
    const v = m[i];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  // Somas por "UF|faixa"; numerador `null` só com `denominadorSemNumerador`.
  const somas = new Map<string, [number | null, number]>();
  const somar = (k: string, n: number | null, d: number) => {
    const s = somas.get(k) ?? [null, 0];
    somas.set(k, [n === null ? s[0] : (s[0] ?? 0) + n, s[1] + d]);
  };
  const valoresPorUf = new Map<string, number[]>();
  const valorMun = new Map<number, number | null>();
  for (const m of snapshot.municipios) {
    const codigo = Number(m[0]);
    const uf = String(m[2]);
    const faixa = faixaPopulacao(ler(m, "populacao-estimada"));
    const k = `${uf}|${faixa}`;
    let v: number | null = null;
    if (ind.tipo === "razao") {
      const n = ler(m, ind.numerador);
      const d = ler(m, ind.denominador);
      if (n !== null && d) {
        v = ind.valorPublicado ? ler(m, ind.valorPublicado) : (ind.mult * n) / d;
      }
      if (d && (n !== null || ind.denominadorSemNumerador) && faixa !== null) somar(k, n, d);
    } else if (ind.tipo === "soma") {
      v = ler(m, ind.coluna);
      if (v !== null && faixa !== null) somar(k, v, 0);
    } else {
      v = ler(m, ind.coluna);
      if (v !== null) valoresPorUf.set(uf, [...(valoresPorUf.get(uf) ?? []), v]);
    }
    valorMun.set(codigo, v === null ? null : arredondar(v, ind.casas));
  }

  // Valor de cada UF: razão das somas, soma, ou mediana. Numerador `null` em
  // todas as células da UF (ninguém recebeu emenda) é UF sem valor, não zero.
  const valorUf = new Map<string, number | null>();
  for (const u of snapshot.ufs) {
    const celulas = [...somas.entries()].filter(([k]) => k.startsWith(`${u.sigla}|`));
    const numeradores = celulas.map(([, s]) => s[0]).filter((n): n is number => n !== null);
    const n = numeradores.length ? numeradores.reduce((a, x) => a + x, 0) : null;
    let v: number | null = null;
    if (ind.tipo === "razao") {
      const d = celulas.reduce((a, [, s]) => a + s[1], 0);
      v = n !== null && d ? (ind.mult * n) / d : null;
    } else if (ind.tipo === "soma") {
      v = n;
    } else {
      v = mediana(valoresPorUf.get(u.sigla) ?? []);
    }
    valorUf.set(u.sigla, v === null ? null : arredondar(v, ind.casas));
  }

  const valores = entradas.map((e) =>
    e.estado ? valorUf.get(e.uf) ?? null : valorMun.get(e.codigo!) ?? null);
  const faixas = entradas.map((e) => {
    if (e.estado) return "-";
    const f = faixaPopulacao(ler(linhaDe.get(e.codigo!)!, "populacao-estimada"));
    return f === null ? "-" : String(f);
  }).join("");

  const celulas = [...somas.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, s]) => {
      const [uf, faixa] = k.split("|");
      const base = [uf!, Number(faixa), s[0] === null ? null : arredondar(s[0], 2)];
      return ind.tipo === "razao" ? [...base, arredondar(s[1], 2)] : base;
    });

  return { ordem: impressaoDaOrdem(entradas), faixas, valores, celulas };
}
