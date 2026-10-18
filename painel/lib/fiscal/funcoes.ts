/** Para onde vai o dinheiro: a despesa por função orçamentária (RREO). */

import type { ExercicioFuncoes, Funcoes, SnapshotFiscal } from "./tipos";

/**
 * O exercício em destaque: o mais recente da série.
 *
 * Existe para a convenção "o primeiro é o atual" morar num lugar só. Doze
 * chamadores reimplementando `exercicios[0]` é doze lugares para alguém trocar
 * por `exercicios[1]` num refatoramento e a página passar a exibir o ano
 * passado como se fosse este — sem nada quebrar.
 */
export function atualDeFuncoes(f: Funcoes): ExercicioFuncoes | null {
  return f.exercicios[0] ?? null;
}

/** O exercício de comparação: o anterior na série, ou `null` se não houver. */
export function anteriorDeFuncoes(f: Funcoes): ExercicioFuncoes | null {
  return f.exercicios[1] ?? null;
}

/**
 * O exercício mais recente **que ESTE município tem** — que não é o do bloco.
 *
 * ## Por que existe
 *
 * `atualDeFuncoes` devolve o exercício mais novo da coleta, e a página o usava
 * para todo mundo. Quem não entregou aquele ano caía em `null` e **perdia a
 * seção inteira**, com até quatro outros anos dentro: medido em 06/09/2026,
 * **568 municípios** nessa situação, 1.076 município-anos coletados e nunca
 * exibidos.
 *
 * O dano maior não era o gráfico ausente, era o que sobrava no lugar: quem
 * prestou contas de 2020 a 2023 e falhou em 2024 ficava **idêntico** a quem
 * nunca prestou contas. É a mesma distinção que `serieFuncoesDe` já respeita
 * ao tratar ano sem entrega como buraco, aplicada um nível acima.
 *
 * Quem chama isto **tem de imprimir o ano** — ver `funcoesDe`, que o devolve
 * junto justamente para que o rótulo não possa divergir do dado.
 */
export function exercicioDeFuncoes(
  f: Funcoes,
  codigo: number,
): ExercicioFuncoes | null {
  const chave = String(codigo);
  // `exercicios` vem do mais recente para o mais antigo, então o primeiro que
  // tiver entrada é o mais novo deste município.
  for (const e of f.exercicios) if (e.porMunicipio[chave]) return e;
  return null;
}

/**
 * O par mais recente de anos **consecutivos** que este município declarou.
 *
 * ## Por que consecutivos, e não simplesmente "os dois mais recentes que ele tem"
 *
 * Porque a faixa de plausibilidade acima (`CRESCIMENTO_MINIMO`/`MAXIMO`,
 * 0,5–3,0) foi **medida de um ano para o outro**: mediana 1,193, p95 1,43. De
 * 2020 para 2024 a mediana esperada já é ~2,0 e o p95 passa de 4 — a mesma
 * régua reprovaria município normal como "declaração quebrada", e a recusa
 * pareceria zelo.
 *
 * Reaproveitar limiar calibrado para outra distância é o tipo de erro que não
 * quebra nada: produz uma ausência plausível. Então o salto de ano cancela a
 * comparação — e **só a comparação**: a série continua desenhando os buracos,
 * que é onde eles se leem bem.
 */
export function parDeFuncoes(
  f: Funcoes,
  codigo: number,
): { atual: ExercicioFuncoes; anterior: ExercicioFuncoes } | null {
  const chave = String(codigo);
  // Por ano, e não por índice: a densidade da lista é uma propriedade da
  // coleta, não uma garantia do tipo. Um exercício que falte no bloco faria
  // `exercicios[i+1]` ser o retrasado, e a página diria "de 2022 para 2024"
  // chamando isso de um ano.
  const porAno = new Map(f.exercicios.map((e) => [e.exercicio, e]));
  for (const e of f.exercicios) {
    if (!e.porMunicipio[chave]) continue;
    const antes = porAno.get(e.exercicio - 1);
    if (antes?.porMunicipio[chave]) return { atual: e, anterior: antes };
  }
  return null;
}

/**
 * Quantas funções a Portaria MOG 42/1999 prevê.
 *
 * Constante da norma, **não** `rotulos.length`: aquele é quantas aparecem no
 * dado coletado, e os dois números só coincidem por acaso. Usar um no lugar do
 * outro produz uma frase que fica errada no dia em que uma função não for
 * declarada por ninguém — e ninguém vai perceber.
 */
export const FUNCOES_DA_PORTARIA = 28;

/** Uma função já com nome, valor e fatia do orçamento. */
export type FatiaFuncao = {
  nome: string;
  valor: number;
  /** `null` quando o total declarado é zero ou ausente — dividir por ele
   *  produziria `Infinity` ou `NaN`, e os dois viram "—" na tela sem que
   *  ninguém entenda por quê. */
  percentual: number | null;
  /** O índice da função em `rotulos`, quando quem montou a fatia o tem: é a
   *  chave da cor fixa por função (`--rosca-*`). */
  funcao?: number;
};

/**
 * O deslocamento de fatia abaixo do qual a página diz "praticamente estável".
 *
 * **1,0 ponto percentual, e o número saiu da medição, não do gosto.** Sobre
 * 2.699 comparações de fatia (educação e saúde, 1.351 municípios, 2023/6 contra
 * 2024/6): o quartil inferior desloca 0,75 pp, a mediana 1,67 pp e o p90 4,78
 * pp. Cortar em 1,0 deixa **67%** das comparações com uma frase de movimento e
 * manda 33% para "estável" — e evita o erro que a série de pessoal quase
 * cometeu, de narrar tendência sobre um movimento que é ruído.
 */
export const DESLOCAMENTO_MINIMO = 1.0;

/**
 * A faixa de crescimento do gasto total que torna dois anos comparáveis.
 *
 * Medido: o crescimento nominal mediano de 2023 para 2024 foi de **1,193**
 * (19,3%), com p5 em 1,04 e p95 em 1,43; apenas 2% encolheram. Fora de
 * 0,5–3,0 não há município — há declaração quebrada num dos dois anos, e o
 * mínimo observado foi 0,0000 e o máximo 9,5.
 *
 * Igual à faixa de plausibilidade do percentual de pessoal: não corrige nada,
 * apenas se recusa a construir frase sobre número que não descreve o mundo.
 */
export const CRESCIMENTO_MINIMO = 0.5;
export const CRESCIMENTO_MAXIMO = 3.0;

export type Deslocamento = {
  nome: string;
  /** Fatia no período em destaque, em % do total declarado. */
  atual: number;
  /** Fatia no mesmo bimestre do ano anterior. */
  anterior: number;
  /** `atual - anterior`, em pontos percentuais. */
  pontos: number;
};

export type Comparacao = {
  exercicioAtual: number;
  exercicioAnterior: number;
  periodo: number;
  /** O crescimento nominal do gasto total entre os dois anos. */
  crescimento: number;
  /** As funções presentes nos dois anos, pela maior mudança em módulo. */
  deslocamentos: Deslocamento[];
};

/**
 * A mudança de composição do gasto entre o mesmo bimestre de dois anos.
 *
 * `null` quando falta um dos dois anos, quando algum total é zero ou negativo,
 * ou quando o crescimento cai fora da faixa comparável — nesse último caso um
 * dos relatórios está quebrado, e comparar publicaria uma mudança que não houve.
 */
export function compararFuncoes(
  s: SnapshotFiscal,
  codigo: number,
): Comparacao | null {
  const bloco = s.funcoes;
  if (!bloco) return null;
  const par = parDeFuncoes(bloco, codigo);
  if (!par) return null;
  const { atual: atualEx, anterior: antes } = par;

  const a = atualEx.porMunicipio[String(codigo)]!;
  const b = antes.porMunicipio[String(codigo)]!;

  const [totalAtual, valoresAtual] = a;
  const [totalAntes, valoresAntes] = b;
  if (!totalAtual || !totalAntes || totalAtual <= 0 || totalAntes <= 0) return null;

  const crescimento = totalAtual / totalAntes;
  if (crescimento < CRESCIMENTO_MINIMO || crescimento > CRESCIMENTO_MAXIMO) {
    return null;
  }

  // Os dois lados compartilham `bloco.rotulos`, então o índice é a chave —
  // comparar por nome exigiria confiar que a grafia não mudou entre anos.
  const fatiaAntes = new Map(
    valoresAntes.map(([i, v]) => [i, (v * 100) / totalAntes]),
  );
  const deslocamentos: Deslocamento[] = [];
  for (const [i, v] of valoresAtual) {
    const anterior = fatiaAntes.get(i);
    // Função que não existia no ano anterior não tem deslocamento: tem
    // estreia. Tratá-la como "subiu de 0%" inventaria uma queda anterior que
    // ninguém declarou.
    if (anterior === undefined) continue;
    const atual = (v * 100) / totalAtual;
    deslocamentos.push({
      nome: bloco.rotulos[i] ?? `Função ${i}`,
      atual,
      anterior,
      pontos: atual - anterior,
    });
  }
  deslocamentos.sort((x, y) => Math.abs(y.pontos) - Math.abs(x.pontos));

  return {
    exercicioAtual: atualEx.exercicio,
    exercicioAnterior: antes.exercicio,
    periodo: bloco.periodo,
    crescimento,
    deslocamentos,
  };
}

/**
 * As funções de um município, da maior para a menor, com a fatia de cada uma.
 *
 * `null` só quando o município não entregou o RREO em **nenhum** exercício
 * coletado — e "não entregou" nunca pode virar uma lista vazia que o leitor
 * confunda com "não gastou nada".
 *
 * **O `exercicio` volta no resultado, e não é decoração.** Estas fatias podem
 * ser de 2021 enquanto a coleta vai até 2024; quem imprime o número tem de
 * imprimir o ano dele. Devolvê-los juntos é o que impede o rótulo de divergir
 * do dado — a alternativa, o chamador buscar o ano por fora, é a divergência
 * esperando a primeira distração.
 *
 * ## Duas funções, e não um parâmetro
 *
 * `funcoesDe` fica no exercício da COLETA — é o que somas e exportações
 * precisam. `funcoesRecentesDe` recua até o ano que este município tem, e é o
 * que a página dele usa.
 *
 * Foram separadas depois de quase virarem uma só: mudar `funcoesDe` por baixo
 * teria trocado, em silêncio, o significado de três chamadores. `somarFuncoes`
 * (`lib/estado.ts`) somaria o orçamento de 2021 de um município com o de 2024
 * do vizinho e chamaria o resultado de "total do estado"; o CSV e o XLSX
 * publicariam colunas de anos diferentes na mesma linha, **num arquivo que
 * viaja sem a explicação da página**. Nada disso quebraria: daria número.
 *
 * Nome diferente para comportamento diferente é o que faz o chamador escolher
 * em vez de herdar.
 */
export function funcoesDe(
  s: SnapshotFiscal,
  codigo: number,
): { exercicio: number; total: number | null; fatias: FatiaFuncao[] } | null {
  const bloco = s.funcoes;
  if (!bloco) return null;
  return montarFuncoes(bloco, codigo, atualDeFuncoes(bloco));
}

/**
 * Como `funcoesDe`, mas recuando até o exercício mais recente **deste
 * município** — ver `exercicioDeFuncoes` para os 568 que isto destrava.
 *
 * Só a página do município usa. Quem agrega ou exporta continua em `funcoesDe`,
 * porque ali misturar anos produz número errado em vez de seção ausente.
 */
export function funcoesRecentesDe(
  s: SnapshotFiscal,
  codigo: number,
): { exercicio: number; total: number | null; fatias: FatiaFuncao[] } | null {
  const bloco = s.funcoes;
  if (!bloco) return null;
  return montarFuncoes(bloco, codigo, exercicioDeFuncoes(bloco, codigo));
}

function montarFuncoes(
  bloco: Funcoes,
  codigo: number,
  atualEx: ExercicioFuncoes | null,
): { exercicio: number; total: number | null; fatias: FatiaFuncao[] } | null {
  if (!atualEx) return null;
  const entrada = atualEx.porMunicipio[String(codigo)];
  if (!entrada) return null;
  const [total, valores] = entrada;
  const fatias = valores
    .map(([i, valor]) => ({
      // O índice vem de um arquivo gerado, mas o `?? ...` não é paranoia
      // decorativa: se o export mudar a ordem dos rótulos sem regerar o resto,
      // o rótulo faltante seria `undefined` impresso como texto na página.
      nome: bloco.rotulos[i] ?? `Função ${i}`,
      valor,
      percentual: total && total > 0 ? (valor * 100) / total : null,
    }))
    .sort((a, b) => b.valor - a.valor);
  return { exercicio: atualEx.exercicio, total, fatias };
}

/** Um exercício da série de funções, já em fatias comparáveis. */
export type PontoFuncoes = {
  exercicio: number;
  /** O total declarado no ano, em reais. `null` quando não declarado. */
  total: number | null;
  /**
   * As fatias, **na mesma ordem e com o mesmo conjunto em todos os anos**.
   * `percentual` é `null` quando o total não permite calcular.
   */
  fatias: { nome: string; valor: number; percentual: number | null }[];
};

/**
 * A série de despesa por função de um município, do mais antigo ao mais recente.
 *
 * ## O conjunto de funções é o MESMO em todos os anos, e isso decide tudo
 *
 * Se cada ano trouxesse as suas oito maiores, a terceira barra significaria
 * "Urbanismo" num ano e "Previdência" no outro — e as barras empilhadas
 * pareceriam comparáveis sem ser. O conjunto vem dos oito primeiros `rotulos`,
 * que o exportador já ordena pelo peso no exercício mais recente, e tudo o
 * mais cai em "outras" **em cada ano**.
 *
 * ## Do mais ANTIGO para o mais recente
 *
 * Ao contrário de `exercicios`, que vem do mais recente porque quem quer a
 * foto usa o primeiro. Uma série se lê da esquerda para a direita no tempo, e
 * inverter aqui é o que evita cada componente reordenar por conta.
 */
export function serieFuncoesDe(
  s: SnapshotFiscal,
  codigo: number,
  nomeadas = 8,
): PontoFuncoes[] {
  const bloco = s.funcoes;
  if (!bloco) return [];
  const chave = String(codigo);

  const cabeca = bloco.rotulos.slice(0, nomeadas);
  const quantasSobram = Math.max(0, bloco.rotulos.length - nomeadas);
  const rotuloCauda = `outras ${quantasSobram} ${
    quantasSobram === 1 ? "função" : "funções"}`;

  const pontos: PontoFuncoes[] = [];
  for (const e of [...bloco.exercicios].reverse()) {
    const entrada = e.porMunicipio[chave];
    // Ano sem entrega vira BURACO, e não um ponto de zero: o município não
    // gastou zero, ele não declarou. É a mesma distinção da faixa
    // `nao-consultado`, agora dentro de uma série.
    if (!entrada) continue;
    const [total, valores] = entrada;
    const porIndice = new Map(valores);
    let cauda = 0;
    for (const [i, v] of valores) if (i >= nomeadas) cauda += v;

    const fatias = cabeca.map((nome, i) => {
      const valor = porIndice.get(i) ?? 0;
      return {
        nome,
        valor,
        percentual: total && total > 0 ? (valor * 100) / total : null,
      };
    });
    if (quantasSobram > 0) {
      fatias.push({
        nome: rotuloCauda,
        valor: cauda,
        percentual: total && total > 0 ? (cauda * 100) / total : null,
      });
    }
    pontos.push({ exercicio: e.exercicio, total, fatias });
  }
  return pontos;
}
