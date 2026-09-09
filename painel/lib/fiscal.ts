/**
 * O snapshot fiscal, e a junção dele com o do IBGE. **Módulo puro** — sem I/O.
 *
 * `dados/fiscal.json` é produzido pelo motor do `sys-painel-fiscal`
 * (`python -m fiscal exportar`) e **copiado para cá**, versionado. A entrega é
 * explícita de propósito: um build que buscasse dado de outro repositório
 * falharia em silêncio no dia em que aquele repositório mudasse.
 *
 * A chave da junção é o **código IBGE do município** — a mesma dos dois lados,
 * e a razão de os dois sistemas conversarem sem nenhuma tradução.
 */

export type Faixa =
  | "implausivel"
  | "acima-legal"
  | "acima-prudencial"
  | "abaixo"
  /** Consultado, e o município **não entregou** o relatório. */
  | "sem-dado"
  /** **Ainda não perguntamos.** Ver `ROTULO_FAIXA`. */
  | "nao-consultado"
  /** Presta contas como ESTADO, não como município. Ver `PRESTA_COMO_ESTADO`. */
  | "como-estado";

/**
 * A faixa do plausivel: **entre 0 e 100%**.
 *
 * Acima de 100% o municipio declara gastar mais com pessoal do que TODA a sua
 * receita; abaixo de zero, declara gasto negativo. Nenhum dos dois descreve uma
 * prefeitura -- descrevem um formulario preenchido errado.
 *
 * Os dois extremos apareceram no dado real de 2024, e por motivos diferentes:
 *
 * - Guaratinga/BA declarou **371,02%** (R$ 110 mi sobre R$ 29,6 mi).
 * - Paripueira/AL declarou **despesa negativa** e portanto **-19,35%**.
 *
 * O caso negativo e o mais perigoso, e por uma razao que custou perceber: ele e
 * **internamente coerente**. `despesa / RCL` da exatamente -19,35%, entao a
 * conferencia NAO o acusa -- coerencia nao e plausibilidade. E num ranking por
 * percentual ele iria para o **fim da lista**, parecendo o municipio mais
 * economico do Nordeste.
 *
 * Exibidos como declarados e marcados. Corrigir seria inventar numero; esconder
 * seria escolher quais declaracoes o leitor pode ver.
 */
export const LIMITE_PLAUSIVEL = 100;
export const MINIMO_PLAUSIVEL = 0;

/** Uma linha do snapshot fiscal, no formato compacto de array. */
export type LinhaFiscal = [
  codigo: number,
  nome: string,
  uf: string,
  populacao: number | null,
  /** `null` = ainda não consultado; `false` = consultado e não entregou. */
  publicou: boolean | null,
  percentual: number | null,
  limitePrudencial: number | null,
  despesa: number | null,
  rclAjustada: number | null,
];

export type SnapshotFiscal = {
  geradoEm: string;
  coletadoEm: string | null;
  fonte: string;
  exercicio: number;
  periodo: number;
  limites: { prudencial: number; legal: number };
  cobertura: {
    universo: number;
    consultados: number;
    publicaram: number;
    /**
     * Quantos municípios o IBGE conta na mesma área — sempre **um a mais** que
     * o SICONFI, e esse um é Fernando de Noronha, distrito estadual de PE.
     *
     * Derivado do universo no motor Python, nunca literal: com a expansão
     * nacional, o `1794` que estava cravado ali viraria uma diferença de 3.776
     * que não existe, publicada com a autoridade de um número conferido.
     */
    municipiosIbge: number;
  };
  colunas: string[];
  municipios: LinhaFiscal[];
  colunasSerie: string[];
  /**
   * Série histórica por código IBGE. Um número sozinho não diz se o município
   * está melhorando ou piorando — e é essa a pergunta que a foto esconde.
   * Entre 2024/2 e 2024/3, Salvador caiu de 33,22% para 32,37% e Imperatriz
   * subiu de 57,63% para 60,64%: mesmo cartão, movimentos opostos.
   */
  serie: Record<string, PontoSerie[]>;
  periodos: [exercicio: number, periodo: number][];
  /** A despesa por função. `null` enquanto a varredura não tiver rodado. */
  funcoes: Funcoes | null;
  /** A aplicação em saúde. `null` enquanto o `ingerir-saude` não tiver rodado. */
  saude: Saude | null;
};

/**
 * A aplicação de recursos próprios em saúde, do SIOPS — **26 exercícios**.
 *
 * É a única série longa do site: o gasto com pessoal tem 15 quadrimestres e a
 * despesa por função tem 6 exercícios; esta vai de **2000 a 2025**.
 */
export type Saude = {
  indicador: string;
  rotulo: string;
  fonte: string;
  coletadoEm: string | null;
  anos: number[];
  /**
   * O piso legal de cada ano, **alinhado a `anos`**, com `null` onde não há um
   * comparável.
   *
   * A EC 29/2000 fixou 7% para 2000 e mandou cada ente fechar a própria
   * diferença até 15% em 2004 — então entre 2001 e 2003 o piso é individual e
   * não existe régua nacional. Comparar a série inteira contra 15% acusaria
   * 3.428 municípios de descumprir uma regra que ainda não valia para eles.
   */
  pisoPorAno: (number | null)[];
  /**
   * Por código do IBGE, um valor por ano **na ordem de `anos`**.
   *
   * A ordem é contrato: casada errado, cada município exibe o percentual do
   * ano vizinho e a página continua bem formada. `null` é ausência da fonte —
   * aqui não há a distinção "não perguntamos", porque uma requisição traz a UF
   * inteira em todos os exercícios de uma vez.
   */
  porMunicipio: Record<string, (number | null)[]>;
  cobertura: { uf: string; municipios: number; valores: number }[];
};

/** Os pontos `[ano, valor]` de um município, sem os anos ausentes. */
export function saudeDe(
  s: SnapshotFiscal,
  codigo: number,
): { anos: number[]; pontos: [ano: number, valor: number][] } | null {
  const bloco = s.saude;
  if (!bloco) return null;
  const valores = bloco.porMunicipio[String(codigo)];
  if (!valores) return null;
  const pontos: [number, number][] = [];
  bloco.anos.forEach((ano, i) => {
    const v = valores[i];
    // `typeof` e não `!= null`: o valor vem de JSON lido em tempo de execução,
    // e o tipo garante o contrato do código, não o do arquivo. Mesma guarda de
    // `pontoPlausivel`, pelo mesmo motivo.
    if (typeof v === "number") pontos.push([ano, v]);
  });
  return pontos.length ? { anos: bloco.anos, pontos } : null;
}

/**
 * O que o município gasta por função orçamentária — as 28 da Portaria MOG
 * 42/1999: educação, saúde, urbanismo, assistência social, e assim por diante.
 *
 * O percentual com pessoal responde "cabe no limite?". Esta é a **outra**
 * pergunta, a que nenhum percentual responde: *para onde vai o dinheiro?* São
 * eixos independentes — Salvador compromete 32% da receita com pessoal e
 * destina 24% do orçamento à saúde, e nem um número prevê o outro.
 *
 * ## O formato é esparso, e por quê
 *
 * Cada município declara ~14 das 28 funções. Emitir as 28 com `null` nas outras
 * dobraria o arquivo para não dizer nada. Os rótulos saem uma vez só, ordenados
 * pela soma no Nordeste, e cada valor carrega o **índice** nesse array.
 *
 * ## A armadilha que já custou um número vinte vezes menor
 *
 * No relatório de origem cada função aparece **duas vezes**: no total e em
 * "Intra-Orçamentárias" (transferências entre órgãos do próprio município).
 * O motor Python filtra na leitura — Salvador em saúde é R$ 2,86 bi, não os
 * R$ 137 mi da leitura ingênua. Aqui já chega filtrado; não somar de novo.
 */
export type Funcoes = {
  /** **Bimestre** (1..6). O RREO não usa a escala quadrimestral do RGF. */
  periodo: number;
  fonte: string;
  rotulos: string[];
  colunasMunicipio: string[];
  /**
   * A série, do mais recente para o mais antigo, sempre no MESMO bimestre.
   *
   * ## Por que o mesmo bimestre, e nunca o período anterior
   *
   * Medido, não suposto. O RREO é acumulado no ano: o 6º bimestre **contém** o
   * 4º — mediana da razão b4/b6 de **0,629** em 1.414 municípios, ou seja 63%
   * do valor do 6º *é* o do 4º. A fatia de cada função mal se mexe entre eles:
   * deslocamento mediano de **0,96 pp**. Uma frase de tendência ali seria
   * ruído vestido de descoberta.
   *
   * Entre o mesmo bimestre de dois anos as acumulações são disjuntas, e o
   * deslocamento mediano sobe para **1,67 pp** — 42% das comparações movem 2
   * pontos ou mais, 25% movem 3 ou mais.
   *
   * ## Por que uma lista, e não "atual" mais "anterior"
   *
   * Com três exercícios ou mais, aquele formato exigiria um terceiro campo ou
   * repetiria o mesmo ano em dois lugares do arquivo — e dado repetido é dado
   * que diverge. Quem quer só a foto usa `exercicios[0]`, e a ordem é o que
   * torna isso verdade sem cada chamador reordenar por conta.
   */
  exercicios: ExercicioFuncoes[];
};

/** Um exercício da série, com a sua própria cobertura. */
export type ExercicioFuncoes = {
  exercicio: number;
  coletadoEm: string | null;
  /**
   * A cobertura é POR EXERCÍCIO, e não do bloco: um ano varrido pela metade
   * não pode herdar a cobertura do ano completo, senão a página afirma sobre
   * 5.570 municípios o que mediu em 200.
   */
  cobertura: { consultados: number; publicaram: number; naoFecham: number };
  /** `{ "2927408": [totalDeclarado, [[indice, valor], ...]] }`, em reais inteiros. */
  porMunicipio: Record<string, EntradaFuncoes>;
};

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

export type EntradaFuncoes = [
  total: number | null,
  valores: [indice: number, valor: number][],
];

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

/** Um ponto da série: exercício, quadrimestre, publicou, percentual. */
export type PontoSerie = [
  exercicio: number,
  periodo: number,
  publicou: boolean,
  percentual: number,
];

/** O rótulo curto de um período: `2024/3`. */
export function rotuloPeriodo(exercicio: number, periodo: number): string {
  return `${exercicio}/${periodo}`;
}

/** Quadrimestres por exercício no RGF. Três, e não quatro: o nome engana. */
export const QUADRIMESTRES_POR_ANO = 3;

/**
 * O índice de um período numa reta do TEMPO, contínua entre exercícios.
 *
 * Existe porque a posição de um ponto no array **não é** a posição dele no
 * tempo. Dois pontos vizinhos na lista podem estar a um quadrimestre ou a dez
 * — e um eixo espaçado por índice desenha os dois casos igual.
 *
 * Isso não incomodava enquanto a série tinha 6 pontos contíguos de 2023–2024.
 * Com os 15 quadrimestres de 2020 a 2024, medido em 08/09/2026: **286 dos
 * 3.814 municípios têm pontos não consecutivos**, 298 buracos ao todo, e o
 * maior achataria **40 meses num único passo**.
 *
 * A diferença entre dois índices é o número de quadrimestres entre eles, então
 * `=== 1` é o teste de contiguidade.
 */
export function indiceQuadrimestre(exercicio: number, periodo: number): number {
  return exercicio * QUADRIMESTRES_POR_ANO + (periodo - 1);
}

/** Dois pontos são vizinhos NO TEMPO, e não só na lista? */
export function contiguos(a: PontoSerie, b: PontoSerie): boolean {
  return indiceQuadrimestre(b[0], b[1]) - indiceQuadrimestre(a[0], a[1]) === 1;
}

/**
 * Quantas vezes a série é interrompida — quadrimestres sem relatório no meio.
 *
 * **Uma definição só, usada pelo gráfico E pela prosa.** Se cada um contasse
 * do seu jeito, o traço poderia quebrar em dois lugares enquanto o texto
 * falasse de um — e o leitor não teria como saber qual está certo.
 *
 * Conta sobre os pontos PLAUSÍVEIS, que são os que o gráfico desenha: um valor
 * implausível descartado abre um buraco tão real quanto um não entregue.
 */
export function interrupcoes(pontos: PontoSerie[] | undefined): number {
  const bons = (pontos ?? []).filter(pontoPlausivel);
  let n = 0;
  for (let i = 1; i < bons.length; i += 1) {
    if (!contiguos(bons[i - 1]!, bons[i]!)) n += 1;
  }
  return n;
}

/**
 * Um ponto está na faixa que descreve uma prefeitura de verdade?
 *
 * **O `typeof` não é decoração, e o tipo não protege aqui.** `PontoSerie[3]`
 * está declarado `number`, mas o valor vem de JSON lido em tempo de execução —
 * o TypeScript garante o contrato do código, não o do arquivo. E em JavaScript
 * **`null >= 0` é `true`**: um ponto sem percentual passaria como plausível e
 * seria desenhado como **zero**, que é a leitura oposta da verdadeira ("não
 * declarou" virando "não gastou").
 *
 * Achado em 08/09/2026, revisando o dado coletado. A coleta de 2021/1 trouxe
 * **91 municípios com despesa e sem RCL** — a fonte não publica a linha, o que
 * foi conferido contra o SICONFI com controle. Eles não chegam aqui porque o
 * `exportar` filtra `WHERE percentual IS NOT NULL`, e é isso que torna a
 * guarda barata: ela protege o dia em que alguém mexer naquele `WHERE` sem
 * saber que este gráfico depende dele.
 */
export function pontoPlausivel(p: PontoSerie): boolean {
  return typeof p[3] === "number"
    && p[3] >= MINIMO_PLAUSIVEL && p[3] <= LIMITE_PLAUSIVEL;
}

/**
 * A variação entre o primeiro e o último ponto **plausível** da série.
 *
 * Filtrar os implausíveis não é preciosismo: sem isso, Paripueira/AL "subia
 * 114,95 pontos percentuais" partindo de um -19,35% que a própria página marca
 * como erro de preenchimento, e Guaratinga/BA "caía 254,55" partindo de 625%.
 * Frases construídas sobre números que a página declara inválidos.
 *
 * `null` quando sobram menos de dois pontos — uma série de um ponto não tem
 * tendência, e fingir que tem seria inventar informação.
 */
export function variacao(pontos: PontoSerie[] | undefined): number | null {
  const bons = (pontos ?? []).filter(pontoPlausivel);
  if (bons.length < 2) return null;
  // `at()` em vez de indexar: o tsconfig usa `noUncheckedIndexedAccess`, e ele
  // está certo em exigir a checagem -- série vazia existe.
  const primeiro = bons.at(0);
  const ultimo = bons.at(-1);
  if (!primeiro || !ultimo) return null;
  return ultimo[3] - primeiro[3];
}

export type Fiscal = {
  publicou: boolean | null;
  percentual: number | null;
  limitePrudencial: number | null;
  despesa: number | null;
  rclAjustada: number | null;
  faixa: Faixa;
};

/**
 * O rótulo de cada faixa.
 *
 * **`sem-dado` e `nao-consultado` são coisas diferentes, e confundi-las é
 * caluniar.** "Sem relatório entregue" é uma afirmação sobre o município;
 * "ainda não consultado" é uma afirmação sobre nós. Até 03/09/2026 as duas
 * colapsavam no mesmo rótulo — o que era inofensivo enquanto a varredura
 * cobria 100% do universo, e virou falso no instante da expansão nacional, com
 * 3.777 municípios ainda não varridos sendo acusados de não prestar contas.
 */
export const ROTULO_FAIXA: Record<Faixa, string> = {
  implausivel: "Valor implausível — provável erro de preenchimento",
  "acima-legal": "Acima do limite legal",
  "acima-prudencial": "Acima do limite prudencial",
  abaixo: "Dentro do limite",
  "sem-dado": "Sem relatório entregue",
  "nao-consultado": "Ainda não consultado",
  "como-estado": "Presta contas como estado, não como município",
};

/**
 * Entes que o IBGE lista como município mas que **não entregam RGF municipal**,
 * porque não são municípios.
 *
 * Hoje só o Distrito Federal (5300108). Ele entrega o Anexo 01 normalmente —
 * conferido na fonte em 04/09/2026, `co_esfera=E&id_ente=53`, 215 itens,
 * "Governo do Distrito Federal". O que ele não faz, e nunca fará, é entregar
 * como *município*.
 *
 * **Sem esta distinção o site acusava Brasília de não prestar contas**, e
 * dizia "sobre ele não se sabe" a respeito de um ente que publica tudo. É o
 * mesmo erro que a faixa `nao-consultado` existe para impedir, uma casa
 * adiante: ali se confundia "não perguntamos" com "não entregou"; aqui,
 * "perguntamos no lugar errado" com "não entregou".
 *
 * Lista literal, e não regra: é **um** ente entre 5.571, e uma regra inferida
 * ("todo ente cujo código termina em 5300108") seria fingir generalidade que
 * não existe. Se aparecer outro, entra aqui com a consulta que o comprovou.
 */
export const PRESTA_COMO_ESTADO: ReadonlySet<number> = new Set([5300108]);

/** Onde o município cai em relação aos dois limites da Lei de
 *  Responsabilidade Fiscal. Sem percentual, a resposta é "não sei" — e "não
 *  sei" nunca pode virar "está abaixo". */
export function faixaDe(
  percentual: number | null,
  limitePrudencial: number | null,
  limites: SnapshotFiscal["limites"],
  /** `null` = ainda não consultado; `false` = consultado e não entregou. */
  publicou: boolean | null = false,
  /** O código IBGE, só para reconhecer quem presta contas como estado. */
  codigo?: number,
): Faixa {
  // Antes de tudo: quem não é município não deixou de entregar relatório de
  // município. Perguntar na esfera errada e registrar a ausência como falta
  // é acusação sem lastro -- ver `PRESTA_COMO_ESTADO`.
  if (codigo !== undefined && PRESTA_COMO_ESTADO.has(codigo)) {
    return "como-estado";
  }
  // A ordem importa: "não perguntamos" vem ANTES de qualquer leitura do
  // percentual, porque sem consulta não há percentual para interpretar.
  if (publicou === null) return "nao-consultado";
  if (percentual === null) return "sem-dado";
  if (percentual > LIMITE_PLAUSIVEL) return "implausivel";
  if (percentual < MINIMO_PLAUSIVEL) return "implausivel";
  if (percentual > limites.legal) return "acima-legal";
  if (percentual > (limitePrudencial ?? limites.prudencial)) {
    return "acima-prudencial";
  }
  return "abaixo";
}

/** Índice por código IBGE, para juntar com o município do observatório. */
export function indexarFiscal(s: SnapshotFiscal): Map<number, Fiscal> {
  const mapa = new Map<number, Fiscal>();
  for (const [codigo, , , , publicou, percentual, limitePrudencial,
    despesa, rclAjustada] of s.municipios) {
    mapa.set(codigo, {
      publicou,
      percentual,
      limitePrudencial,
      despesa,
      rclAjustada,
      faixa: faixaDe(percentual, limitePrudencial, s.limites, publicou, codigo),
    });
  }
  return mapa;
}

/**
 * O identificador do município na URL: `imperatriz-ma`, `sao-luis-ma`.
 *
 * Acento fora, espaço vira hífen, UF no fim para desempatar homônimos — e há
 * muitos: "Bom Jesus" existe em cinco estados do Nordeste. Sem a UF no slug,
 * quatro dos cinco perderiam a própria página em silêncio.
 */
export function slugDe(nome: string, uf: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base}-${uf.toLowerCase()}`;
}

/**
 * Uma letra por faixa, para viajar até o navegador sem virar peso.
 *
 * O filtro por situação fiscal da capa precisa da faixa dos 5.571 municípios no
 * cliente. Um mapa `código → faixa` custaria ~180 KB de JSON com a chave e o
 * nome da faixa repetidos milhares de vezes. Uma **string de um caractere por
 * município**, na mesma ordem das linhas, custa 5.571 bytes — e comprime a
 * cerca de 1 KB, porque a maioria dos vizinhos cai na mesma faixa.
 *
 * É a mesma lição do payload da capa, que caiu 57% ao parar de repetir chave.
 */
export const LETRA_FAIXA: Record<Faixa, string> = {
  abaixo: "a",
  "acima-prudencial": "p",
  "acima-legal": "l",
  implausivel: "i",
  "sem-dado": "s",
  "nao-consultado": "n",
  "como-estado": "e",
};

/** O inverso de `LETRA_FAIXA`, para o navegador voltar da letra à faixa. */
export const FAIXA_DA_LETRA: Record<string, Faixa> = Object.fromEntries(
  Object.entries(LETRA_FAIXA).map(([faixa, letra]) => [letra, faixa as Faixa]),
) as Record<string, Faixa>;

/**
 * A faixa de cada município, na ORDEM das linhas do snapshot.
 *
 * A ordem é o contrato: o navegador casa `faixas[i]` com `linhas[i]`. Mudar a
 * ordem de um sem o outro desloca a situação fiscal de todos os municípios a
 * partir dali, em silêncio — a página continuaria bem formada, mostrando a
 * faixa do vizinho. Por isso as duas saem da MESMA lista, aqui.
 */
export function faixasEmLinha(
  linhas: readonly (readonly unknown[])[],
  fiscal: SnapshotFiscal,
): string {
  const porCodigo = indexarFiscal(fiscal);
  return linhas
    .map((l) => {
      const f = porCodigo.get(l[0] as number);
      return LETRA_FAIXA[f?.faixa ?? "nao-consultado"];
    })
    .join("");
}
