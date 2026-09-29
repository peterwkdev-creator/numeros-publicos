/**
 * Os indicadores do Censo 2022, em pares numerador/denominador. **Módulo puro.**
 *
 * ## Por que pares, e não percentuais
 *
 * O IBGE publica os dois: o absoluto e a taxa. O motor Python ingere **só o
 * absoluto**, porque `conferir` soma os municípios e compara com o total que a
 * fonte publica — e percentual não se soma. Ver `especs/numeros-publicos.md`.
 *
 * A consequência boa chega aqui: com o par na mão, a página pode dizer
 * **"94.063 dos 97.991 domicílios"** em vez de só "96%". O número absoluto é o
 * que permite a alguém conferir, e a proporção sozinha esconde o tamanho.
 *
 * ## A ausência é `null`, nunca zero
 *
 * "Não sabemos" e "nenhum domicílio" são coisas opostas, e confundi-las é
 * como um painel passa a mentir sem ninguém notar. **E vale nos dois
 * sentidos:** até 29/09/2026, 8 municípios apareciam sem dado de água e 25 sem
 * esgoto, e em todos o IBGE publicava `-`, que no sinal convencional dele é
 * ZERO. O motor Python lia o traço como ausente; hoje lê como 0.
 */

/** Um par do Censo: o que se conta, sobre o quê, e como a frase se lê. */
export type ParCenso = {
  chave: string;
  /** O rótulo curto, para cartão e cabeçalho de tabela. */
  rotulo: string;
  /** O código do indicador que é o numerador, no snapshot. */
  numerador: string;
  /** O código do indicador que é o denominador. */
  denominador: string;
  /** O substantivo contado, no plural: "domicílios", "moradores". */
  contagem: string;
  /**
   * O que o numerador significa, **nas palavras da fonte**.
   *
   * Vai visível na página, e não num comentário: "esgoto" pode significar seis
   * coisas no Censo, e a categoria escolhida (`46290`) é uma delas. Quem lê o
   * número tem direito de saber qual.
   */
  criterio: string;
};

/**
 * Os seis pares, na ordem em que a página os mostra.
 *
 * A ordem não é arbitrária: saneamento primeiro (o que a prefeitura entrega),
 * depois acesso e escolaridade (o que descreve quem mora ali).
 */
export const PARES_CENSO: ParCenso[] = [
  {
    chave: "agua",
    rotulo: "Água da rede geral",
    numerador: "agua-rede-geral",
    denominador: "domicilios-total",
    contagem: "domicílios",
    criterio: "possuem ligação à rede geral e a utilizam como forma principal",
  },
  {
    chave: "esgoto",
    rotulo: "Esgoto ligado à rede",
    numerador: "esgoto-rede",
    denominador: "domicilios-total",
    contagem: "domicílios",
    criterio: "têm esgotamento por rede geral, rede pluvial ou fossa ligada à rede",
  },
  {
    chave: "lixo",
    rotulo: "Lixo coletado",
    numerador: "lixo-coletado",
    denominador: "domicilios-total",
    contagem: "domicílios",
    criterio: "têm o lixo coletado",
  },
  {
    chave: "internet",
    rotulo: "Internet no domicílio",
    numerador: "internet-domicilio",
    denominador: "moradores-10-mais",
    contagem: "moradores de 10 anos ou mais",
    criterio: "vivem em domicílio com acesso à internet",
  },
  {
    chave: "alfabetizacao",
    rotulo: "Alfabetização",
    numerador: "alfabetizados-15-mais",
    denominador: "pessoas-15-mais",
    contagem: "pessoas de 15 anos ou mais",
    criterio: "são alfabetizadas",
  },
  {
    chave: "superior",
    rotulo: "Ensino superior completo",
    numerador: "superior-completo",
    denominador: "pessoas-18-mais",
    contagem: "pessoas de 18 anos ou mais",
    criterio: "concluíram o ensino superior",
  },
];

/**
 * O rótulo que DISTINGUE cada indicador do Censo nos downloads.
 *
 * ## O defeito que isto corrige
 *
 * O nome de um indicador vem da **variável** do IBGE, e com classificação
 * quatro indicadores diferentes compartilham a mesma variável. O CSV do
 * município saía com **quatro linhas chamadas "Domicílios particulares
 * permanentes ocupados"** — 97.180, 97.991, 94.063 e 97.672 — e nada dizendo
 * qual era água, qual era total, qual era esgoto e qual era lixo.
 *
 * Na tela isso nunca apareceu, porque a página nomeia cada linha. **O arquivo
 * viaja sem a página**, e é ele que alguém republica.
 *
 * Os denominadores levam "(total)" no nome: sem isso, "Pessoas de 15 anos ou
 * mais" e "Pessoas de 15 anos ou mais alfabetizadas" são distinguíveis, mas
 * "Domicílios ... ocupados" e "Domicílios com água" contam universos
 * diferentes e o leitor precisa ver qual é a base.
 */
export const ROTULO_DOWNLOAD: Record<string, string> = {
  "domicilios-total": "Domicílios particulares permanentes ocupados (total)",
  "agua-rede-geral": "Domicílios com água da rede geral como forma principal",
  "esgoto-rede": "Domicílios com esgoto por rede geral, pluvial ou fossa ligada à rede",
  "lixo-coletado": "Domicílios com lixo coletado",
  "moradores-10-mais": "Moradores de 10 anos ou mais em domicílios permanentes (total)",
  "internet-domicilio": "Moradores de 10 anos ou mais com internet no domicílio",
  "pessoas-15-mais": "Pessoas de 15 anos ou mais (total)",
  "alfabetizados-15-mais": "Pessoas de 15 anos ou mais alfabetizadas",
  "pessoas-18-mais": "Pessoas de 18 anos ou mais (total)",
  "superior-completo": "Pessoas de 18 anos ou mais com ensino superior completo",

  // Trabalho e renda (29/09/2026). Aqui o rótulo carrega mais que a
  // distinção: diz ONDE se conta. O Censo conta onde a pessoa mora e o
  // Cadastro de Empresas onde a empresa está, e "pessoas ocupadas" existe nos
  // dois com números diferentes -- lado a lado numa planilha, sem o recorte
  // escrito, pareceriam o mesmo dado discordando.
  "forca-de-trabalho-14-mais":
    "Censo: pessoas de 14 anos ou mais na força de trabalho (total)",
  "desocupados-14-mais":
    "Censo: pessoas de 14 anos ou mais desocupadas (sem trabalho, procurando e disponíveis)",
  "ocupados-14-mais": "Censo: pessoas de 14 anos ou mais ocupadas (total)",
  "ocupados-contribuintes":
    "Censo: pessoas ocupadas que contribuíam para instituto de previdência oficial",
  "ocupados-com-rendimento":
    "Censo: pessoas ocupadas com rendimento de trabalho (total)",
  "massa-rendimento-trabalho":
    "Censo: massa de rendimento mensal de todos os trabalhos",
  "rendimento-medio-trabalho":
    "Censo: rendimento médio mensal de todos os trabalhos (média do IBGE; não se soma)",
  "empresas-atuantes":
    "Cadastro de Empresas: empresas e outras organizações atuantes",
  "pessoal-ocupado-empresas":
    "Cadastro de Empresas: pessoal ocupado total, no município da empresa",
  "assalariados-empresas":
    "Cadastro de Empresas: pessoal assalariado, no município da empresa",
  "assalariado-medio-empresas":
    "Cadastro de Empresas: pessoal assalariado médio no ano (base do salário médio)",
  "salarios-empresas":
    "Cadastro de Empresas: salários e outras remunerações pagos no ano",
  "salario-medio-empresas":
    "Cadastro de Empresas: salário médio mensal (média do IBGE; não se soma)",
};

/**
 * O rótulo de um indicador para download: o que distingue, ou o nome da fonte.
 *
 * Cai no nome da fonte para os indicadores sem classificação (PIB, população),
 * onde ele já é único — repetir a lista ali só criaria uma segunda verdade a
 * manter.
 */
export function rotuloDownload(codigo: string, nome: string): string {
  return ROTULO_DOWNLOAD[codigo] ?? nome;
}

/** Uma medida já calculada, pronta para a página. */
export type MedidaCenso = ParCenso & {
  parte: number | null;
  total: number | null;
  /** `parte / total` em pontos percentuais, ou `null` se faltar qualquer um. */
  percentual: number | null;
};

/**
 * As seis medidas de um município.
 *
 * **O percentual é `null` se faltar qualquer uma das pontas**, e não zero: um
 * município sem dado de esgoto não tem 0% de esgoto, tem 0 de informação.
 * Denominador zero também devolve `null` — não existe proporção de nada.
 */
export function medidasDe(
  valores: Record<string, number | null>,
  pares: ParCenso[] = PARES_CENSO,
): MedidaCenso[] {
  return pares.map((par) => {
    const parte = valores[par.numerador] ?? null;
    const total = valores[par.denominador] ?? null;
    const percentual =
      parte === null || total === null || total === 0
        ? null
        : (parte * 100) / total;
    return { ...par, parte, total, percentual };
  });
}

/**
 * A mediana de cada par entre os municípios dados. Calculada no BUILD.
 *
 * Serve à pergunta que o site faz em toda página: *"isso é muito?"*. Um
 * percentual sozinho não responde — 60% de esgoto parece pouco até se saber que
 * a mediana do país é 27%.
 *
 * **Mediana e não média**, pela mesma razão de sempre: a média de proporções
 * municipais é puxada por extremos, e aqui os extremos são reais (0,0% e 99%).
 *
 * **E mediana de MUNICÍPIOS não é a taxa do país.** No esgoto os dois números
 * são 26,9% e 64,7%, os dois corretos e com sentidos opostos — o segundo é
 * puxado pelas cidades grandes. Quem exibir um não pode chamá-lo do outro.
 */
export function medianasDe(
  linhas: (number | string | null)[][],
  colunas: string[],
  pares: ParCenso[] = PARES_CENSO,
): Record<string, number | null> {
  const idx = (codigo: string) => colunas.indexOf(codigo);
  const saida: Record<string, number | null> = {};

  for (const par of pares) {
    const iN = idx(par.numerador);
    const iD = idx(par.denominador);
    if (iN < 0 || iD < 0) {
      saida[par.chave] = null;
      continue;
    }
    const pcts: number[] = [];
    for (const linha of linhas) {
      const n = linha[iN];
      const d = linha[iD];
      if (typeof n === "number" && typeof d === "number" && d > 0) {
        pcts.push((n * 100) / d);
      }
    }
    saida[par.chave] = mediana(pcts);
  }
  return saida;
}

/**
 * `medianasDe` memorizado por identidade das linhas.
 *
 * **Sem isto o build não fecha.** `generateStaticParams` gera 5.571 páginas, e
 * cada uma chamaria `medianasDe` sobre os 5.571 municípios × 6 pares: 186
 * milhões de operações, para recalcular 6 números sempre iguais.
 *
 * A chave é a **identidade do array**, não um hash: `lerSnapshot` já mantém o
 * snapshot em cache, então todas as páginas recebem o mesmo objeto. Se um dia
 * duas fontes diferentes forem passadas, cada uma ganha sua entrada em vez de
 * silenciosamente receber a da outra — que é o erro que um cache de chave fixa
 * cometeria.
 */
const cacheMedianas = new WeakMap<object, Map<ParCenso[], Record<string, number | null>>>();

/**
 * **A chave tem duas partes desde 29/09/2026**, quando os pares de trabalho
 * entraram ao lado dos seis do Censo: as linhas E a lista de pares. Com a
 * chave antiga, só as linhas, a seção de trabalho receberia as medianas da
 * água e do esgoto -- guardadas pela primeira página que pediu --, e as
 * chaves `desocupacao` e `previdencia` sairiam `undefined`, bem formadas.
 */
function memorizado<T>(
  cache: WeakMap<object, Map<ParCenso[], T>>,
  linhas: object,
  pares: ParCenso[],
  calcular: () => T,
): T {
  let porPares = cache.get(linhas);
  if (!porPares) {
    porPares = new Map();
    cache.set(linhas, porPares);
  }
  const guardado = porPares.get(pares);
  if (guardado) return guardado;
  const calculado = calcular();
  porPares.set(pares, calculado);
  return calculado;
}

export function medianasCache(
  linhas: (number | string | null)[][],
  colunas: string[],
  pares: ParCenso[] = PARES_CENSO,
): Record<string, number | null> {
  return memorizado(cacheMedianas, linhas, pares,
                    () => medianasDe(linhas, colunas, pares));
}

/**
 * A taxa do PAÍS: soma dos numeradores sobre soma dos denominadores.
 *
 * **Não é a mediana dos municípios, e a diferença é enorme.** No esgoto os dois
 * são **64,7%** e **32,6%**: o primeiro é puxado pelas cidades grandes, que
 * concentram população e rede. Os dois estão certos e dizem coisas opostas.
 *
 * Existe para que a página possa dizer isso **com os dois números derivados do
 * dado**. A primeira versão escreveu "26,9%" no texto à mão — número medido
 * numa categoria de esgoto que nem era a exibida — e a tabela ao lado mostrava
 * 32,6%. É o erro que esta base já pagou três vezes: correto no dia em que foi
 * digitado, falso na coleta seguinte, e nenhum teste pega, porque continua
 * sendo frase bem formada.
 */
export function taxasDoPais(
  linhas: (number | string | null)[][],
  colunas: string[],
  pares: ParCenso[] = PARES_CENSO,
): Record<string, number | null> {
  const saida: Record<string, number | null> = {};
  for (const par of pares) {
    const iN = colunas.indexOf(par.numerador);
    const iD = colunas.indexOf(par.denominador);
    if (iN < 0 || iD < 0) { saida[par.chave] = null; continue; }
    let n = 0;
    let d = 0;
    for (const linha of linhas) {
      const a = linha[iN];
      const b = linha[iD];
      // As duas pontas juntas, sempre: somar um numerador cujo denominador
      // falta inflaria a taxa em silêncio.
      if (typeof a === "number" && typeof b === "number") { n += a; d += b; }
    }
    saida[par.chave] = d > 0 ? (n * 100) / d : null;
  }
  return saida;
}

const cacheTaxas = new WeakMap<object, Map<ParCenso[], Record<string, number | null>>>();

/** `taxasDoPais` memorizado — mesma razão e mesma chave de `medianasCache`. */
export function taxasCache(
  linhas: (number | string | null)[][],
  colunas: string[],
  pares: ParCenso[] = PARES_CENSO,
): Record<string, number | null> {
  return memorizado(cacheTaxas, linhas, pares,
                    () => taxasDoPais(linhas, colunas, pares));
}

/**
 * As medidas do PAÍS, um par de cada vez, com as duas pontas pareadas.
 *
 * ## Duas coisas que o teste ensinou, nesta ordem
 *
 * **1. Somar as UFs quebra o pareamento.** Por UF o esgoto dava 64,69% e por
 * município 64,72%: o numerador batia, e o denominador diferia em **32.128
 * domicílios** — as casas de 26 municípios que têm domicílios e **não têm dado
 * de esgoto**. Somá-las no denominador equivale a afirmar que não têm rede.
 * Não sabemos se têm, e essa é a distinção que o projeto inteiro mantém.
 *
 * **2. Um mapa `código → total` não comporta denominador compartilhado.**
 * `domicilios-total` é o denominador de água, esgoto e lixo, e cada par exclui
 * municípios diferentes: pareado, o denominador da água é 72.442.192 e o do
 * esgoto 72.424.240. Num mapa plano o último par sobrescreve os outros, e a
 * página publica a proporção da água sobre o denominador do lixo — número bem
 * formado e errado.
 *
 * Por isso a função devolve as **medidas**, e não os totais: cada par carrega o
 * seu próprio denominador, que é a única forma de os três coexistirem.
 */
export function medidasDoPais(
  linhas: (number | string | null)[][],
  colunas: string[],
): MedidaCenso[] {
  return PARES_CENSO.map((par) => {
    const iN = colunas.indexOf(par.numerador);
    const iD = colunas.indexOf(par.denominador);
    let parte: number | null = null;
    let total: number | null = null;
    if (iN >= 0 && iD >= 0) {
      for (const l of linhas) {
        const a = l[iN];
        const b = l[iD];
        if (typeof a === "number" && typeof b === "number") {
          parte = (parte ?? 0) + a;
          total = (total ?? 0) + b;
        }
      }
    }
    const percentual =
      parte === null || total === null || total === 0
        ? null
        : (parte * 100) / total;
    return { ...par, parte, total, percentual };
  });
}

const cachePais = new WeakMap<object, MedidaCenso[]>();

/** `medidasDoPais` memorizado — mesma razão de `medianasCache`. */
export function medidasDoPaisCache(
  linhas: (number | string | null)[][],
  colunas: string[],
): MedidaCenso[] {
  const guardado = cachePais.get(linhas);
  if (guardado) return guardado;
  const calculado = medidasDoPais(linhas, colunas);
  cachePais.set(linhas, calculado);
  return calculado;
}

/** A mediana de uma lista. Vazia devolve `null`, nunca zero. */
export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2;
}
