/**
 * A forma do snapshot fiscal: só tipos, sem código executável.
 *
 * Mora à parte para que `serie`, `funcoes` e `receita` possam falar de
 * `SnapshotFiscal` sem importar uns aos outros: o snapshot contém os três
 * blocos, e os três têm funções que recebem o snapshot.
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
  | "como-estado"
  /** O município ainda não existia como prefeitura no período. Ver `INSTALADO_EM`. */
  | "nao-instalado";

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
  /**
   * `true` = o número veio do RGF Simplificado do 2º semestre (art. 63 da
   * LRF, município com menos de 50 mil habitantes), que cobre os mesmos 12
   * meses até dezembro do 3º quadrimestre. `null` quando não entregou nenhum.
   */
  simplificado: boolean | null,
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
  /**
   * De onde vem a receita corrente. `null` enquanto o `ingerir-receita` não
   * tiver rodado. É a outra metade de `funcoes`, que diz para onde ela vai.
   */
  receita: Receita | null;
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

export type EntradaFuncoes = [
  total: number | null,
  valores: [indice: number, valor: number][],
];

/** Um ponto da série: exercício, quadrimestre, publicou, percentual e se veio
 *  do RGF Simplificado — semestral, sem 1º e 2º quadrimestres no ano (desde
 *  12/10/2026; ponto sem a marca é quadrimestral). Ver `contiguos`. */
export type PontoSerie = [
  exercicio: number,
  periodo: number,
  publicou: boolean,
  percentual: number,
  simplificado?: boolean,
];

/**
 * A composição da receita corrente (RREO Anexo 01).
 *
 * `funcoes` responde *para onde vai* o dinheiro. Este bloco responde a
 * pergunta que vem antes e que o site não respondia: **de onde ele vem.**
 *
 * ## `valores` e `detalhe` chegam separados, e têm de continuar separados
 *
 * `rotulos` são as oito componentes que **somam** as receitas correntes e
 * fecham com o total que o próprio ente declarou. `rotulosDetalhe` são quatro
 * linhas que estão **dentro** daquelas: `Impostos` e `Taxas` dentro de
 * IMPOSTOS, TAXAS E CONTRIBUIÇÕES DE MELHORIA, e as duas transferências por
 * origem dentro de TRANSFERÊNCIAS CORRENTES.
 *
 * Concatenar as duas listas infla a receita do município em ~20%, com o número
 * bem formado e a página plausível. O motor Python as emite em posições
 * diferentes da tupla justamente para que isso exija um gesto deliberado — e
 * aqui elas continuam em campos diferentes, pela mesma razão.
 */
export type Receita = {
  /** **Bimestre** (1..6). O RREO não usa a escala quadrimestral do RGF. */
  periodo: number;
  fonte: string;
  rotulos: string[];
  rotulosDetalhe: string[];
  /**
   * Alinhado a `rotulosDetalhe`: o índice em `rotulos` da componente que
   * **contém** cada detalhe, ou `null` se ela não existe no corpus. É o que
   * permite dizer "dos R$ 147 mi de transferências, R$ 101 mi vieram da
   * União" sem inferir hierarquia pelo nome da conta.
   */
  paiDoDetalhe: (number | null)[];
  colunasMunicipio: string[];
  /** Do mais recente para o mais antigo, como em `Funcoes`. */
  exercicios: ExercicioReceita[];
};

export type ExercicioReceita = {
  exercicio: number;
  coletadoEm: string | null;
  /**
   * `naoFecham` é a régua da própria fonte: a soma das componentes contra o
   * total declarado. Em 2024/6 ela apontou 15 municípios, e **os 15 eram
   * defeito do leitor**, não do dado — corrigidos em 22/09/2026.
   */
  cobertura: { consultados: number; publicaram: number; naoFecham: number };
  porMunicipio: Record<string, EntradaReceita>;
};

export type EntradaReceita = [
  total: number | null,
  valores: [indice: number, valor: number][],
  detalhe: [indice: number, valor: number][],
];
