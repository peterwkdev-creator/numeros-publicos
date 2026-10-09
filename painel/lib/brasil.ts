/**
 * O Brasil ao longo do tempo: as séries do país e quem ocupava a
 * Presidência. **Módulo puro**: sem I/O, testável sem build.
 *
 * O arquivo (`dados/brasil.json`) vem de `python -m numeros_publicos
 * brasil-exportar`, que lê o banco gravado pela ingestão (cada série lida por
 * dois caminhos da fonte, e nada entra se divergirem). A espec é
 * `especs/numeros-publicos-brasil-no-tempo.md`, no repositório de trabalho.
 *
 * ## As regras de neutralidade que moram aqui
 *
 * - **O mesmo eixo de tempo em todos os gráficos**: `dominio` sai de todas as
 *   séries juntas, e não de cada uma. Recortar por série deixaria cada gráfico
 *   começar onde convém.
 * - **A faixa só existe onde a série tem dado**: `faixas` recorta pela
 *   cobertura da série, em vez de estender as faixas para trás.
 * - **Faixas iguais para todos**: dois tons alternados pela ordem das pessoas
 *   no cargo, e nada mais. Nenhuma soma, média ou placar por mandato.
 * - **Nas séries fiscais, o ano da posse vem marcado** (`anosHerdados`): o
 *   orçamento em execução naquele ano foi aprovado antes dela.
 * - **O lado melhor é da série, não do mandato** (`APRESENTACAO`): cada
 *   gráfico diz para que lado é melhor, para quem não é economista, e nada
 *   liga essa leitura a quem ocupava o cargo.
 */

export type PontoBrasil = [periodo: string, valor: number];

export interface SerieBrasil {
  codigo: string;
  /** O nome oficial, dos metadados da fonte. */
  nome: string;
  unidade: string;
  fonte: string;
  periodicidade: "trimestral" | "mensal" | "anual";
  /** A leitura gravada e a segunda, que a conferiu ponto a ponto. */
  origem: string;
  conferida: string;
  coletadoEm: string;
  pontos: PontoBrasil[];
}

export interface Mandato {
  nome: string;
  /** AAAA-MM-DD: o dia em que passou a ocupar o cargo. */
  inicio: string;
  /** O dia em que o seguinte assumiu; `null` para quem ocupa hoje. */
  fim: string | null;
  como: string;
  fonte: string;
  /** O nome curto, o que cabe na faixa do gráfico. */
  rotulo: string;
}

/**
 * A meta de inflação de cada ano, fixada pelo Conselho Monetário Nacional:
 * `[ano, meta, tolerância]`, em % e pontos percentuais. A tabela é versionada
 * no Python e conferida, a cada ingestão, contra a série 13521 do SGS (o
 * centro) e contra a página do Banco Central (meta e intervalo).
 */
export interface MetaInflacao {
  /** A página do Banco Central com o histórico das metas. */
  fonte: string;
  origem: string;
  conferida: string;
  coletadoEm: string;
  anos: [ano: number, meta: number, tolerancia: number][];
}

export interface SnapshotBrasil {
  series: SerieBrasil[];
  mandatos: Mandato[];
  metaInflacao: MetaInflacao;
}

/**
 * Como se lê a série, para quem não é economista: para que lado é melhor.
 * `meta` diz que o melhor é ficar dentro de uma faixa, e não num extremo.
 * `nenhum` diz que os dois lados têm ganho e custo (o câmbio, os juros):
 * marcar um deles como melhor seria tomar partido numa escolha de política.
 */
export type Melhor = "alto" | "baixo" | "meta" | "nenhum";

export interface Apresentacao {
  titulo: string;
  fiscal: boolean;
  /** O que a série mede, em uma ou duas frases sem jargão. */
  como: string;
  melhor: Melhor;
  /** Onde o zero divide a leitura (crescer e encolher, déficit e
   *  superávit): o nome de cada lado, escrito no próprio gráfico. */
  zero?: { acima: string; abaixo: string };
  nota?: string;
}

/**
 * O que a página diz de cada série, além do nome oficial. Uma série nova no
 * JSON sem entrada aqui reprova no teste, em vez de sair sem título.
 *
 * O lado melhor de cada uma é a leitura corrente da própria série (a meta que
 * o Banco Central persegue, a desocupação mais baixa), e não um juízo sobre
 * quem governava: dizer quem a moveu é o que a página não faz.
 */
export const APRESENTACAO: Record<string, Apresentacao> = {
  pib: {
    titulo: "PIB: variação em quatro trimestres",
    fiscal: false,
    como:
      "Acima de zero, a economia cresceu em relação ao ano anterior; abaixo " +
      "de zero, encolheu.",
    melhor: "alto",
    zero: { acima: "cresceu", abaixo: "encolheu" },
    nota:
      "Cada ponto compara os quatro trimestres terminados ali com os quatro " +
      "do ano anterior.",
  },
  desocupacao: {
    titulo: "Taxa de desocupação",
    fiscal: false,
    como:
      "De cada 100 pessoas que procuram trabalho, quantas não encontram.",
    melhor: "baixo",
    nota: "A PNAD Contínua começa em 2012; antes disso a pesquisa era outra.",
  },
  rendimento: {
    titulo: "Rendimento médio real do trabalho",
    fiscal: false,
    como: "Quanto ganha por mês, em média, quem trabalha.",
    melhor: "alto",
    nota:
      "Valor real: o IBGE desconta a inflação antes de publicar, então um " +
      "ano se compara com outro.",
  },
  "extrema-pobreza": {
    titulo: "Pessoas em extrema pobreza",
    fiscal: false,
    como:
      "De cada 100 pessoas, quantas vivem com menos de US$ 3,00 por dia, a " +
      "linha internacional de pobreza extrema do Banco Mundial.",
    melhor: "baixo",
    nota:
      "Pela PNAD Contínua, que começa em 2012, um valor por ano. O dólar é " +
      "convertido em reais pela paridade de poder de compra de 2021 e " +
      "corrigido pela inflação. Outras publicações do IBGE usam outra linha " +
      "e dão outro percentual; quando o Banco Mundial troca a linha, o IBGE " +
      "refaz a série inteira.",
  },
  ipca: {
    titulo: "Inflação (IPCA) em 12 meses",
    fiscal: false,
    como:
      "Quanto os preços subiram em 12 meses. A faixa é a meta de inflação de " +
      "cada ano: o objetivo é ficar dentro dela, nem acima nem abaixo.",
    melhor: "meta",
    nota:
      "Desde julho de 1995, o primeiro mês em que os 12 meses acumulados " +
      "caem inteiros no Real. Antes disso a inflação passava de mil por " +
      "cento ao ano, e a escala apagaria o resto do gráfico.",
  },
  "divida-bruta": {
    titulo: "Dívida bruta do governo geral",
    fiscal: true,
    como:
      "Quanto os governos federal, estaduais e municipais devem, comparado " +
      "ao tamanho da economia (o PIB).",
    melhor: "baixo",
  },
  "divida-liquida": {
    titulo: "Dívida líquida do setor público",
    fiscal: true,
    como:
      "Quanto o setor público deve, descontado o que tem a receber, " +
      "comparado ao tamanho da economia (o PIB).",
    melhor: "baixo",
    nota:
      "Desde dezembro de 2001. Inclui os governos federal, estaduais e " +
      "municipais, as estatais (sem Petrobras e Eletrobras) e o Banco " +
      "Central. Desconta o que o setor público tem a receber, inclusive as " +
      "reservas internacionais: por isso a alta do dólar a reduz. Quando o " +
      "IBGE revisa o PIB, a série inteira muda.",
  },
  "nfsp-primario": {
    titulo: "Resultado primário do setor público",
    fiscal: true,
    como:
      "Acima de zero, o setor público gastou mais do que arrecadou (déficit); " +
      "abaixo de zero, arrecadou mais do que gastou (superávit). Sem contar " +
      "os juros da dívida.",
    melhor: "baixo",
    zero: { acima: "déficit", abaixo: "superávit" },
    nota:
      "O Banco Central publica a necessidade de financiamento do setor " +
      "público, e por isso o déficit fica acima de zero.",
  },
  cambio: {
    titulo: "Dólar: média do mês",
    fiscal: false,
    como:
      "Quantos reais custa um dólar, na média do mês. Dólar mais caro " +
      "encarece o que vem de fora e ajuda quem exporta; mais barato faz o " +
      "contrário.",
    melhor: "nenhum",
    nota:
      "Valor nominal, sem descontar a inflação. Desde julho de 1994, o " +
      "primeiro mês do Real. Até janeiro de 1999 o Banco Central mantinha o " +
      "dólar dentro de uma faixa; desde então o câmbio é flutuante.",
  },
  reservas: {
    titulo: "Reservas internacionais",
    fiscal: false,
    como:
      "Quanto o Banco Central guarda em moeda estrangeira e ouro no fim do " +
      "mês. As reservas protegem o país da falta de dólares numa crise; " +
      "mantê-las tem custo, porque rendem menos que os juros da dívida " +
      "pública.",
    melhor: "nenhum",
    nota:
      "Em bilhões de dólares, no último dia de cada mês. Desde julho de " +
      "1994, o primeiro mês do Real. De 2001 a 2005, parte das reservas " +
      "vinha de empréstimos do FMI, quitados no fim de 2005.",
  },
  "balanca-comercial": {
    titulo: "Balança comercial: saldo do mês",
    fiscal: false,
    como:
      "Quanto o país vendeu de bens ao exterior, menos o que comprou, no " +
      "mês. Acima de zero, vendeu mais do que comprou (superávit); abaixo, " +
      "comprou mais do que vendeu (déficit).",
    melhor: "nenhum",
    zero: { acima: "superávit", abaixo: "déficit" },
    nota:
      "Em bilhões de dólares, pelo critério do balanço de pagamentos, desde " +
      "janeiro de 1995. Por isso não bate com o número do Ministério do " +
      "Desenvolvimento (Comex Stat): o Banco Central inclui a energia " +
      "elétrica, as operações sem passagem pela alfândega e as encomendas " +
      "postais. O saldo sobe e desce ao longo do ano com a safra.",
  },
  selic: {
    titulo: "Selic: a taxa básica de juros",
    fiscal: false,
    como:
      "A taxa de juros que o Banco Central fixa como meta, em % ao ano. " +
      "Juros mais altos seguram a inflação e encarecem o crédito; mais " +
      "baixos fazem o contrário.",
    melhor: "nenhum",
    nota:
      "Decisão do Copom, o comitê do Banco Central, autônomo desde 2021 " +
      "(Lei Complementar 179). Cada ponto é a meta em vigor no último dia " +
      "do mês. Desde março de 1999, quando a meta começou.",
  },
  "salario-minimo": {
    titulo: "Salário mínimo real",
    fiscal: false,
    como:
      "Quanto vale o salário mínimo, descontada a inflação. Mínimo mais alto " +
      "aumenta a renda de quem o recebe e o piso das aposentadorias; também " +
      "pesa mais na folha das empresas e nas contas da Previdência.",
    melhor: "nenhum",
    nota:
      "O valor nominal é fixado a cada ano por lei ou medida provisória. O " +
      "Ipea desconta a inflação (INPC) e refaz a série inteira em reais do " +
      "último mês. Desde agosto de 1994: em julho, o mês da troca da moeda, " +
      "o Ipea ajusta a inflação, e o valor não se compara com os seguintes.",
  },
  "mortes-agressao": {
    titulo: "Mortes por agressão: óbitos no ano",
    fiscal: false,
    como:
      "Quantas pessoas morreram no ano vítimas de agressão (homicídio), " +
      "pelas declarações de óbito.",
    melhor: "baixo",
    nota:
      "Segurança pública é competência dos estados. Número de óbitos, e não " +
      "taxa por habitante: a população também cresceu no período. Só os " +
      "anos que o Ministério da Saúde dá como finais; o ano seguinte ainda é " +
      "preliminar e entra quando fechar. Desde 2019 cresceram os óbitos de " +
      "intenção indeterminada (sem saber se foi agressão, acidente ou " +
      "suicídio), que não entram aqui. Um ano já fechado pode ser " +
      "republicado com correções.",
  },
  desmatamento: {
    titulo: "Desmatamento da Amazônia Legal: km² no ano",
    fiscal: false,
    como:
      "Quantos quilômetros quadrados de floresta nativa foram desmatados no " +
      "ano nos nove estados da Amazônia Legal, medidos pelo INPE em imagens " +
      "de satélite.",
    melhor: "baixo",
    nota:
      "Cada ano vai de agosto do ano anterior a julho: 2025 é de agosto de " +
      "2024 a julho de 2025. É a taxa consolidada, que sai no ano seguinte; " +
      "a estimativa que o INPE divulga antes não entra aqui. 1993 e 1994 têm " +
      "o mesmo valor na série do INPE.",
  },
};

/** O selo de leitura, acima do gráfico. */
export const SELO: Record<Melhor, string> = {
  alto: "Mais alto é melhor",
  baixo: "Mais baixo é melhor",
  meta: "Melhor dentro da faixa da meta",
  nenhum: "Nenhum lado é melhor por si",
};

/** Cada fonte com o seu artigo. Fonte nova sem entrada reprova no teste. */
export const FONTE_COM_ARTIGO: Record<string, string> = {
  IBGE: "do IBGE",
  "Banco Central": "do Banco Central",
  Ipea: "do Ipea",
  "Ministério da Saúde": "do Ministério da Saúde",
  INPE: "do INPE",
};

/** "do IBGE, do Banco Central e do Ipea", na ordem dada. */
export function fontesPorExtenso(fontes: string[]): string {
  const ditas = fontes.map((f) => FONTE_COM_ARTIGO[f] ?? f);
  return ditas.length > 1
    ? `${ditas.slice(0, -1).join(", ")} e ${ditas[ditas.length - 1]}`
    : (ditas[0] ?? "");
}

// ------------------------------------------------------------------ tempo

const TRIMESTRE = /^(\d{4})T([1-4])$/;
const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
const ANO = /^\d{4}$/;

/** O começo de um período, em anos: `1996T2` → 1996,25; `1995-07` → 1995,5;
 *  `2012` → 2012. */
export function inicioPeriodo(p: string): number {
  if (ANO.test(p)) return Number(p);
  const t = TRIMESTRE.exec(p);
  if (t) return Number(t[1]) + (Number(t[2]) - 1) / 4;
  const m = MES.exec(p);
  if (m) return Number(m[1]) + (Number(m[2]) - 1) / 12;
  throw new Error(`período ${JSON.stringify(p)} não é trimestre, mês nem ano`);
}

/** O fim do período (o começo do seguinte), em anos. */
export function fimPeriodo(p: string): number {
  const tamanho = ANO.test(p) ? 1 : TRIMESTRE.test(p) ? 1 / 4 : 1 / 12;
  return inicioPeriodo(p) + tamanho;
}

/** Onde o ponto se desenha: no meio do período que ele resume. */
export function meioPeriodo(p: string): number {
  return (inicioPeriodo(p) + fimPeriodo(p)) / 2;
}

/** `AAAA-MM-DD` em anos, pelo dia do ano: 1º de janeiro é o ano exato. */
export function anoDecimal(data: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) throw new Error(`data ${JSON.stringify(data)} não é AAAA-MM-DD`);
  const ano = Number(m[1]);
  const dia = Date.UTC(ano, Number(m[2]) - 1, Number(m[3]));
  const comeco = Date.UTC(ano, 0, 1);
  const tamanho = Date.UTC(ano + 1, 0, 1) - comeco;
  return ano + (dia - comeco) / tamanho;
}

/** `1996T1` → "1º tri. 1996"; `1995-07` → "jul. 1995"; `2012` → "2012". */
const MESES = ["jan.", "fev.", "mar.", "abr.", "maio", "jun.", "jul.", "ago.",
  "set.", "out.", "nov.", "dez."];
export function rotuloPeriodo(p: string): string {
  const t = TRIMESTRE.exec(p);
  if (t) return `${t[2]}º tri. ${t[1]}`;
  const m = MES.exec(p);
  if (m) return `${MESES[Number(m[2]) - 1]} ${m[1]}`;
  return p;
}

/** Os dois pontos são vizinhos no tempo? Se não, a linha se interrompe. */
export function contiguos(a: string, b: string): boolean {
  return Math.abs(fimPeriodo(a) - inicioPeriodo(b)) < 1e-9;
}

/** Cobertura de uma série, em anos: do começo do primeiro período ao fim do
 *  último. */
export function cobertura(s: SerieBrasil): [number, number] {
  const ps = s.pontos;
  return [inicioPeriodo(ps[0]![0]), fimPeriodo(ps[ps.length - 1]![0])];
}

/** O eixo de tempo COMUM aos gráficos: do começo mais antigo ao fim mais
 *  recente entre todas as séries. */
export function dominio(series: SerieBrasil[]): [number, number] {
  const c = series.map(cobertura);
  return [Math.min(...c.map((x) => x[0])), Math.max(...c.map((x) => x[1]))];
}

/** Os anos marcados no eixo: os múltiplos de 5 dentro do domínio. */
export function anosDoEixo([de, ate]: [number, number]): number[] {
  const anos: number[] = [];
  for (let a = Math.ceil(de / 5) * 5; a <= ate; a += 5) anos.push(a);
  return anos;
}

// ------------------------------------------------------------- mandatos

export interface Faixa {
  /** O rótulo curto e o nome inteiro de quem ocupava o cargo. */
  rotulo: string;
  nome: string;
  de: number;
  ate: number;
  /** 0 ou 1: o tom, alternado pela ordem das PESSOAS no cargo, a mesma em
   *  todos os gráficos. */
  tom: 0 | 1;
  /** Onde começa outro período da mesma pessoa (reeleição, posse depois do
   *  exercício): desenhado como divisa fina, sem trocar o tom. */
  divisas: number[];
}

/**
 * As faixas de quem ocupava o cargo, recortadas ao intervalo `[de, ate]`.
 * Períodos seguidos da mesma pessoa viram uma faixa só. Quem ocupa hoje
 * (`fim` nulo) vai até `ate`.
 */
export function faixas(mandatos: Mandato[], de: number, ate: number): Faixa[] {
  const pessoas: Faixa[] = [];
  for (const m of mandatos) {
    const ini = anoDecimal(m.inicio);
    const fim = m.fim === null ? Infinity : anoDecimal(m.fim);
    const ultima = pessoas[pessoas.length - 1];
    if (ultima && ultima.nome === m.nome) {
      ultima.divisas.push(ini);
      ultima.ate = fim;
    } else {
      pessoas.push({
        rotulo: m.rotulo, nome: m.nome, de: ini, ate: fim,
        tom: (pessoas.length % 2) as 0 | 1, divisas: [],
      });
    }
  }
  return pessoas
    .map((p) => ({
      ...p,
      de: Math.max(p.de, de),
      ate: Math.min(p.ate, ate),
      divisas: p.divisas.filter((d) => d > de && d < ate),
    }))
    .filter((p) => p.ate > p.de);
}

/**
 * O ano da posse de cada período, do dia em que assumiu ao 1º de janeiro
 * seguinte, recortado a `[de, ate]` e com os trechos que se tocam unidos. O
 * orçamento em execução nesse trecho foi aprovado antes da posse.
 */
export function anosHerdados(
  mandatos: Mandato[], de: number, ate: number,
): [number, number][] {
  const trechos = mandatos
    .map((m) => {
      const ini = anoDecimal(m.inicio);
      return [Math.max(ini, de), Math.min(Math.floor(ini) + 1, ate)] as [number, number];
    })
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const unidos: [number, number][] = [];
  for (const t of trechos) {
    const u = unidos[unidos.length - 1];
    if (u && t[0] <= u[1]) u[1] = Math.max(u[1], t[1]);
    else unidos.push([...t]);
  }
  return unidos;
}

// ------------------------------------------------------- meta de inflação

export interface TrechoMeta {
  /** Em anos, recortado ao intervalo pedido. */
  de: number;
  ate: number;
  ano: number;
  meta: number;
  inferior: number;
  superior: number;
}

/**
 * A faixa da meta, ano a ano, recortada a `[de, ate]`: só onde a série tem
 * dado, a mesma regra das faixas de quem ocupava o cargo. Arredonda as pontas
 * a centésimos, como a página do Banco Central as publica (4,5 − 2 = 2,5, e
 * não 2,4999…).
 */
export function trechosMeta(
  anos: MetaInflacao["anos"], de: number, ate: number,
): TrechoMeta[] {
  const c = (v: number) => Math.round(v * 100) / 100;
  return anos
    .map(([ano, meta, tol]) => ({
      ano, meta, de: Math.max(ano, de), ate: Math.min(ano + 1, ate),
      inferior: c(meta - tol), superior: c(meta + tol),
    }))
    .filter((t) => t.ate > t.de);
}

// --------------------------------------------------------------- valores

/** Quantas casas a fonte publica: a maior entre os valores, até 2. */
export function casasDe(s: SerieBrasil): number {
  let casas = 0;
  for (const [, v] of s.pontos) {
    const frac = String(v).split(".")[1];
    if (frac) casas = Math.max(casas, Math.min(frac.length, 2));
  }
  return casas;
}

/** A escala vertical com marcas redondas: 1, 2, 2,5 ou 5 vezes uma potência
 *  de 10, umas quatro marcas. O zero entra quando a série o cruza. */
export function escala(valores: number[]): {
  baixo: number; alto: number; marcas: number[];
} {
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const bruto = (max - min || Math.abs(max) || 1) / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((k) => k * pot).find((p) => p >= bruto)!;
  const baixo = Math.floor(min / passo) * passo;
  const alto = Math.ceil(max / passo) * passo;
  const marcas: number[] = [];
  for (let v = baixo; v <= alto + passo / 1e6; v += passo) {
    marcas.push(Math.round(v / passo) * passo);
  }
  return { baixo, alto: alto > baixo ? alto : baixo + passo, marcas };
}

/** Os extremos e as pontas, para o texto do gráfico. Sem verbo de
 *  tendência: "subiu" e "caiu" dependem da janela, e a janela é a série
 *  inteira. */
export function resumo(s: SerieBrasil): {
  primeiro: PontoBrasil; ultimo: PontoBrasil;
  menor: PontoBrasil; maior: PontoBrasil;
} {
  const ps = s.pontos;
  let menor = ps[0]!;
  let maior = ps[0]!;
  for (const p of ps) {
    if (p[1] < menor[1]) menor = p;
    if (p[1] > maior[1]) maior = p;
  }
  return { primeiro: ps[0]!, ultimo: ps[ps.length - 1]!, menor, maior };
}
