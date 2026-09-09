import {
  atualDeFuncoes, faixaDe, type FatiaFuncao, type SnapshotFiscal, slugDe } from "./fiscal";

/**
 * O panorama dos 27 estados — o que só a varredura nacional tornou possível.
 *
 * ## A pergunta que faltava
 *
 * A página do município pergunta *"isso é muito?"* e responde contra o estado.
 * A página do estado não perguntava nada: mostrava quatro números soltos, sem
 * régua. Enquanto só o Nordeste estava varrido não havia contra o que comparar;
 * com os 5.570 municípios consultados, há.
 *
 * ## Duas medidas, e a segunda é a que surpreende
 *
 * **Mediana do gasto com pessoal** situa o estado na régua da Lei de
 * Responsabilidade Fiscal.
 *
 * **Taxa de entrega** — quantos municípios publicaram o relatório — é o achado
 * de 04/09/2026: ela varia de **100% a 14%**, e **não é regional**. Santa
 * Catarina entrega 86% e o Rio Grande do Sul 15%, vizinhos; a Bahia 99% e o
 * Maranhão 49%, ambos no Nordeste. Qualquer narrativa Norte/Sul sobre isso é
 * falsa, e o dado desmente sozinho.
 *
 * Ela também é a medida que **qualifica todas as outras**: a mediana de um
 * estado onde 15% entregaram descreve 15% do estado. Publicar a mediana sem a
 * taxa ao lado é oferecer precisão que o dado não tem.
 *
 * ## O que se recusa a fazer
 *
 * **Não ranqueia, não premia e não pune.** A tira ordena para poder mostrar
 * onde cada um cai, e é só isso: entregar relatório é obrigação legal, mas não
 * entregar tem causas que este painel não conhece — e um "27º lugar" afirma um
 * juízo que o número não sustenta. A régua é da lei; a leitura é de quem lê.
 */

/** Uma linha do panorama. */
export type PanoramaUf = {
  uf: string;
  /** Municípios do estado no snapshot fiscal. */
  municipios: number;
  /** Quantos entregaram o Relatório de Gestão Fiscal. */
  publicaram: number;
  /** `publicaram / municipios`, em pontos percentuais. */
  taxa: number;
  /**
   * A mediana do percentual de pessoal entre os que entregaram, ou `null`.
   *
   * **Mediana e não média:** um único município declarando 371% desloca a
   * média de duzentos quase dois pontos. Aqui os implausíveis já saem antes,
   * mas a mediana continua sendo a escolha certa por não depender disso.
   */
  mediana: number | null;
  /** Quantos entraram na mediana. Sem isto ela é número sem lastro. */
  base: number;
};

const MINIMO_MEDIANA = 10;

/** A mediana de uma lista já filtrada. Vazia devolve `null`, nunca zero. */
export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2;
}

/**
 * Uma linha por estado, em ordem alfabética de sigla.
 *
 * Alfabética e não ordenada por valor: quem chama decide a ordem de exibição,
 * e uma função que já devolve ordenado esconde essa decisão de quem lê o
 * código.
 */
export function panoramaEstados(fiscal: SnapshotFiscal): PanoramaUf[] {
  const por = new Map<string, { total: number; pub: number; vals: number[] }>();

  for (const [codigo, , uf, , publicou, percentual, limitePrudencial]
    of fiscal.municipios) {
    const chave = String(uf);
    const linha = por.get(chave) ?? { total: 0, pub: 0, vals: [] };
    linha.total += 1;

    const faixa = faixaDe(
      percentual as number | null,
      limitePrudencial as number | null,
      fiscal.limites,
      publicou as boolean | null,
      codigo as number,
    );
    // Quem presta contas como estado sai das DUAS contas: não entregou como
    // município porque não é um, e contá-lo como faltoso é a acusação que a
    // faixa `como-estado` existe para impedir. Ver `PRESTA_COMO_ESTADO`.
    if (faixa === "como-estado") {
      linha.total -= 1;
      por.set(chave, linha);
      continue;
    }

    if (publicou) linha.pub += 1;
    // Só o plausível entra na mediana: 371% é formulário preenchido errado,
    // não município caro, e empurraria a mediana do estado inteiro.
    if (faixa !== "implausivel" && typeof percentual === "number") {
      linha.vals.push(percentual);
    }
    por.set(chave, linha);
  }

  return [...por.entries()]
    .filter(([, x]) => x.total > 0)
    .map(([uf, x]) => ({
      uf,
      municipios: x.total,
      publicaram: x.pub,
      taxa: (x.pub / x.total) * 100,
      // Abaixo de 10 comparáveis não há mediana que descreva um estado —
      // mesma régua do gráfico de distribuição do município.
      mediana: x.vals.length >= MINIMO_MEDIANA ? mediana(x.vals) : null,
      base: x.vals.length,
    }))
    .sort((a, b) => a.uf.localeCompare(b.uf));
}

/** Onde uma UF cai numa lista de valores: quantos ficam abaixo dela. */
export function posicaoNaLista(
  valor: number,
  todos: number[],
): { abaixo: number; de: number } {
  return {
    abaixo: todos.filter((v) => v < valor).length,
    de: todos.length,
  };
}

/**
 * A despesa por função somada no país inteiro.
 *
 * ## O que a capa não respondia
 *
 * "Para onde vai o dinheiro" existia na página do município e na do estado. A
 * capa — a página que recebe a busca genérica e que apresenta o site — listava
 * indicadores e estados, e não dizia para onde vai o dinheiro do país. O dado
 * já estava no disco desde que a varredura nacional fechou.
 *
 * ## Soma de valores absolutos, nunca média de percentuais
 *
 * A média das fatias daria a São Paulo e a um município de 3 mil habitantes o
 * mesmo peso na composição do gasto do Brasil — o que descreve uma média de
 * prefeituras, não o país. A fatia sai da soma, no fim.
 *
 * ## O total é a soma dos totais DECLARADOS
 *
 * E não a soma das funções. Os dois são iguais em todo município cujo relatório
 * fecha (**0 de 3.243 não fecharam**), e usar o declarado mantém a régua sendo
 * a da fonte, e não a nossa.
 *
 * ## O que este número NÃO é
 *
 * Não é o gasto público brasileiro: é o dos **municípios que entregaram o
 * RREO** — cerca de 58% deles. Quem chamar isto de "gasto dos municípios
 * brasileiros" está errado por quase metade, e por isso a cobertura sai junto,
 * no mesmo objeto, para nenhuma página poder publicar um sem o outro.
 */
export type PanoramaFuncoes = {
  total: number;
  fatias: FatiaFuncao[];
  /** Quantos municípios entraram na soma. */
  municipios: number;
  exercicio: number;
  periodo: number;
};

export function funcoesDoPais(fiscal: SnapshotFiscal): PanoramaFuncoes | null {
  const bloco = fiscal.funcoes;
  if (!bloco) return null;
  const atual = atualDeFuncoes(bloco);
  if (!atual) return null;

  const soma = new Map<number, number>();
  let total = 0;
  let municipios = 0;

  for (const entrada of Object.values(atual.porMunicipio)) {
    const [declarado, valores] = entrada;
    municipios += 1;
    total += declarado ?? 0;
    for (const [i, valor] of valores) {
      soma.set(i, (soma.get(i) ?? 0) + valor);
    }
  }
  if (!municipios || total <= 0) return null;

  const fatias = [...soma.entries()]
    .map(([i, valor]) => ({
      // Mesmo cuidado de `funcoesDe`: rótulo faltante viraria `undefined`
      // impresso como texto se o export mudasse a ordem sem regerar o resto.
      nome: bloco.rotulos[i] ?? `Função ${i}`,
      valor,
      percentual: (valor * 100) / total,
    }))
    .sort((a, b) => b.valor - a.valor);

  return {
    total, fatias, municipios,
    exercicio: atual.exercicio,
    periodo: bloco.periodo,
  };
}

/** Um município no ranking nacional de gasto com pessoal. */
export type LinhaRanking = {
  codigo: number;
  nome: string;
  uf: string;
  slug: string;
  percentual: number;
  populacao: number | null;
};

export type RankingPessoal = {
  /** Municípios do universo, já sem quem presta contas como estado. */
  universo: number;
  publicaram: number;
  naoEntregaram: number;
  comoEstado: number;
  /** Acima do teto legal, do maior para o menor. Sem os implausíveis. */
  acimaDoTeto: LinhaRanking[];
  /** Entre o prudencial e o teto — alerta, não infração. */
  naFaixaPrudencial: number;
  /**
   * Declarações fora da faixa 0–100%, listadas à parte e NUNCA ranqueadas.
   *
   * Elas não são escondidas: omiti-las faria a página afirmar que o dado não
   * existe, quando ele existe e está quebrado. Mas ranqueá-las publicaria
   * "Guaratinga gastou 371% da receita com pessoal" como fato — uma acusação
   * a um município real, produzida por um formulário preenchido errado.
   */
  implausiveis: LinhaRanking[];
  mediana: number | null;
};

/**
 * O ranking nacional do gasto com pessoal, com as três recusas que o resto do
 * site já pratica — e que aqui pesam mais, porque uma lista ordenada é lida
 * como acusação.
 *
 * 1. **O denominador é quem ENTREGOU**, e o número de quem não entregou vai
 *    junto. "361 de 5.570" faria parecer que 5.209 estão bem; a verdade é que
 *    sobre 2.326 não se sabe nada.
 * 2. **Quem presta contas como estado sai das duas contas** — o Distrito
 *    Federal entrega o RGF na esfera estadual porque não é município. Contá-lo
 *    como faltoso é a acusação que a faixa `como-estado` existe para impedir.
 * 3. **Declaração implausível não é ranqueada.** Ver `implausiveis`.
 *
 * Existe porque a consulta de cabeça ("ranking municípios gasto com pessoal
 * LRF") pertence hoje a Tribunais de Contas, **um por estado** — medido em
 * 07/09/2026. Não havia versão nacional, gratuita e com uma URL limpa.
 */
export function rankingPessoal(fiscal: SnapshotFiscal): RankingPessoal {
  const acima: LinhaRanking[] = [];
  const fora: LinhaRanking[] = [];
  const plausiveis: number[] = [];
  let universo = 0, publicaram = 0, comoEstado = 0, prudencial = 0;

  for (const [codigo, nome, uf, populacao, publicou, percentual, limitePrudencial]
    of fiscal.municipios) {
    const faixa = faixaDe(
      percentual as number | null,
      limitePrudencial as number | null,
      fiscal.limites,
      publicou as boolean | null,
      codigo as number,
    );
    if (faixa === "como-estado") { comoEstado += 1; continue; }
    universo += 1;
    if (!publicou || typeof percentual !== "number") continue;
    publicaram += 1;

    const linha: LinhaRanking = {
      codigo: codigo as number,
      nome: nome as string,
      uf: uf as string,
      slug: slugDe(nome as string, uf as string),
      percentual,
      populacao: (populacao as number | null) ?? null,
    };
    if (faixa === "implausivel") { fora.push(linha); continue; }
    plausiveis.push(percentual);
    // O veredito vem de `faixaDe`, e NÃO de recomparar os limites aqui.
    //
    // Medido em 07/09/2026, revisando: 16 municípios declaram um limite
    // prudencial PRÓPRIO (57% ou 59,05%, contra o global de 51,3%), e em dois
    // deles isso muda a faixa — Eldorado do Carajás/PA com 53,35% e Pindorama
    // do Tocantins/TO com 51,43%. Recomparando com o limite global, esta
    // página os contaria em alerta enquanto **a página do próprio município
    // diz que estão abaixo**. Duas páginas do mesmo site se contradizendo, e
    // nada quebraria.
    //
    // A regra geral: quando já existe função que classifica, ramificar no
    // resultado dela. Reimplementar o limiar é criar uma segunda verdade que
    // diverge no primeiro caso de borda.
    if (faixa === "acima-legal") acima.push(linha);
    else if (faixa === "acima-prudencial") prudencial += 1;
  }

  // Empate desfeito pelo nome: sem isso, dois builds do mesmo dado geram
  // páginas diferentes. Mesma razão do índice de busca.
  const ordenar = (a: LinhaRanking, b: LinhaRanking) =>
    b.percentual - a.percentual || a.nome.localeCompare(b.nome, "pt-BR");

  return {
    universo,
    publicaram,
    naoEntregaram: universo - publicaram,
    comoEstado,
    acimaDoTeto: acima.sort(ordenar),
    naFaixaPrudencial: prudencial,
    implausiveis: fora.sort(ordenar),
    mediana: plausiveis.length >= MINIMO_MEDIANA ? mediana(plausiveis) : null,
  };
}

/**
 * `rankingPessoal` com cache pela identidade do snapshot.
 *
 * **Sem isto o build não fecha.** A página do município precisa de dois números
 * do ranking nacional, e `generateStaticParams` gera 5.571 páginas: recalcular
 * varreria os 5.570 municípios em cada uma — 31 milhões de operações para
 * produzir dois números sempre iguais. É a mesma conta que `medianasCache`
 * resolveu no `lib/censo.ts`, com o mesmo desenho.
 *
 * A chave é a **identidade do objeto**, e não uma chave fixa: `lerFiscal` já
 * mantém o snapshot em cache, então todas as páginas recebem o mesmo. Se um dia
 * duas fontes diferentes forem passadas, cada uma ganha sua entrada em vez de
 * receber a da outra em silêncio — o erro que um cache de chave fixa cometeria.
 */
const cacheRanking = new WeakMap<object, RankingPessoal>();

export function rankingCache(fiscal: SnapshotFiscal): RankingPessoal {
  const guardado = cacheRanking.get(fiscal);
  if (guardado) return guardado;
  const calculado = rankingPessoal(fiscal);
  cacheRanking.set(fiscal, calculado);
  return calculado;
}

// ── A mediana estadual de aplicação em saúde ────────────────────────────────

/** Por sigla de UF, a mediana de cada ano — **alinhada a `saude.anos`**. */
export type MedianasSaude = Record<string, (number | null)[]>;

/**
 * A mediana de aplicação em saúde de cada estado, ano a ano.
 *
 * **Existe porque um percentual sozinho não diz nada.** A pesquisa da fonte, em
 * 07/09/2026, concluiu que o valor do SIOPS é *nível e trajetória* — "seu
 * município aplica X%; a mediana do estado é Y; em 2000 era Z". A página passou
 * a mostrar X e Z antes de ter Y, e sem Y os outros dois não respondem se
 * 25,14% é muito ou pouco.
 *
 * **Mediana por ANO, e não uma só para a série.** Comparar o valor de 2025 de
 * um município com uma mediana que mistura 26 anos misturaria a trajetória do
 * estado inteiro na régua — e a mediana nacional subiu de 12,62% para 21,42%
 * no período, então a régua errada erraria por quase dez pontos.
 *
 * Municípios sem valor naquele ano ficam de fora do cálculo daquele ano, e não
 * entram como zero: a mediana responde "de quem sabemos, quanto aplica".
 */
export function medianasSaude(fiscal: SnapshotFiscal): MedianasSaude {
  const bloco = fiscal.saude;
  if (!bloco) return {};
  const ufDe = new Map<string, string>();
  for (const l of fiscal.municipios) ufDe.set(String(l[0]), String(l[2]));

  // Um balde por UF e por ano, preenchido numa passada só sobre os 5.568.
  const baldes: Record<string, number[][]> = {};
  for (const [codigo, valores] of Object.entries(bloco.porMunicipio)) {
    const uf = ufDe.get(codigo);
    if (uf === undefined) continue;
    const porAno = (baldes[uf] ??= bloco.anos.map(() => []));
    valores.forEach((v, i) => {
      if (typeof v === "number") porAno[i]!.push(v);
    });
  }

  const saida: MedianasSaude = {};
  for (const [uf, porAno] of Object.entries(baldes)) {
    saida[uf] = porAno.map((vs) => mediana(vs));
  }
  return saida;
}

const cacheSaude = new WeakMap<object, MedianasSaude>();

/**
 * O mesmo, pela identidade do snapshot.
 *
 * Sem o cache seriam 5.571 varreduras de 143.754 valores — a mesma conta que
 * `medianasCache` já resolveu para o Censo, e pelo mesmo motivo: o resultado é
 * idêntico em todas as páginas.
 */
export function medianasSaudeCache(fiscal: SnapshotFiscal): MedianasSaude {
  const guardado = cacheSaude.get(fiscal);
  if (guardado) return guardado;
  const calculado = medianasSaude(fiscal);
  cacheSaude.set(fiscal, calculado);
  return calculado;
}
