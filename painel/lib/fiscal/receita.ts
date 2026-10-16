/** De onde vem o dinheiro: a composição da receita corrente (RREO Anexo 01). */

import type { ExercicioReceita, Receita, SnapshotFiscal } from "./tipos";

/**
 * As duas contas que a frase da página nomeia.
 *
 * Constantes, e não `rotulos[0]`/`rotulos[1]`: a ordem de `rotulos` é por
 * **peso no exercício mais recente**, então ela pode mudar entre coletas. Um
 * índice cravado sobreviveria à mudança exibindo a conta errada com o rótulo
 * certo, que é a classe de defeito que este arquivo inteiro existe para evitar.
 */
export const CONTA_TRIBUTARIA = "IMPOSTOS, TAXAS E CONTRIBUIÇÕES DE MELHORIA";
export const CONTA_TRANSFERIDA = "TRANSFERÊNCIAS CORRENTES";

/**
 * O nome de uma conta como a página o exibe.
 *
 * O SICONFI publica as componentes em CAIXA ALTA (`TRANSFERÊNCIAS CORRENTES`)
 * e o detalhe em caixa mista (`Transferências da União e de suas Entidades`).
 * Numa tabela, a caixa alta grita — e as funções orçamentárias, ao lado, vêm
 * em caixa mista.
 *
 * **Minusculizar tudo seria pior que gritar**: `da União` viraria `da união` e
 * `do Distrito Federal` viraria `do distrito federal`. Por isso a conversão só
 * acontece quando o nome **não tem nenhuma minúscula** — aí não há nome
 * próprio a preservar, porque não há informação de caixa nenhuma para perder.
 *
 * E só vale para a TELA. Os downloads mantêm a grafia da fonte: num arquivo
 * que alguém cruza com o dado original, a forma exata da conta é o que permite
 * casar as duas pontas.
 */
export function rotuloReceita(nome: string): string {
  if (/\p{Ll}/u.test(nome)) return nome;
  const baixo = nome.toLocaleLowerCase("pt-BR");
  return baixo.charAt(0).toLocaleUpperCase("pt-BR") + baixo.slice(1);
}

/** Uma componente da receita, com nome, valor e fatia do total. */
export type FatiaReceita = {
  nome: string;
  valor: number;
  /** `null` quando o total é zero ou ausente — ver `FatiaFuncao`. */
  percentual: number | null;
};

/**
 * Uma linha de detalhe, **com o nome de quem a contém**.
 *
 * O `dentroDe` viaja junto do valor de propósito: é ele que impede a página de
 * apresentar R$ 101 mi da União ao lado dos R$ 147 mi de transferências como
 * se fossem duas parcelas somáveis.
 */
export type DetalheReceita = FatiaReceita & { dentroDe: string | null };

export type ComposicaoReceita = {
  exercicio: number;
  periodo: number;
  total: number | null;
  /** As componentes que somam, da maior para a menor. */
  fatias: FatiaReceita[];
  /** O que está dentro delas. **Nunca somar com `fatias`.** */
  detalhe: DetalheReceita[];
  /**
   * O que o município cobra de quem mora nele (impostos, taxas e contribuição
   * de melhoria). `null` se a conta não veio.
   *
   * **Não se chama "receita própria" de propósito.** O termo tem duas
   * definições correntes — só a tributária, ou tudo que não é transferência —
   * e escolher uma em silêncio publicaria um número contestável em 5.571
   * páginas com cara de fato. A página nomeia a conta que está mostrando.
   */
  tributaria: number | null;
  /** O que vem da União, dos Estados e dos fundos. `null` se não veio. */
  transferida: number | null;
  /**
   * `false` quando a declaração **não pode** descrever a receita do município.
   *
   * O critério é um fato legal, não um limiar escolhido: o FPM é repasse
   * constitucional (CF art. 159), e **nenhum município recebe transferência
   * corrente zero**. Uma declaração sem ela está incompleta por construção.
   *
   * Achado em 22/09/2026 com Apiaí/SP no ar dizendo *"79,0% de impostos"*:
   * R$ 5 mi declarados, R$ 204 por habitante, contra R$ 134 mi de RCL no RGF
   * do mesmo município. **E a soma fechava** — a régua da fonte compara a
   * declaração consigo mesma, e declaração incompleta e coerente passa.
   *
   * O critério estatístico (receita contra RCL) mora no motor Python
   * (`fiscal conferir-receita`), porque ele diz que UM dos dois relatórios
   * está errado sem dizer qual. Este aqui diz qual.
   *
   * **O segundo critério, de 09/10/2026: transferência acima da receita
   * corrente inteira.** Só acontece com uma origem negativa, e grande. Em
   * 2024, 12 municípios (11 do TO e 1 de GO) declararam os impostos
   * negativos, até a previsão; Novo Jardim/TO estava no ar dizendo *"194,9%
   * veio de transferências"*. Conferido na API do SICONFI: o número é o
   * declarado. Origem negativa pequena (16 municípios, até -1,1%) continua
   * plausível, e a página põe uma nota.
   */
  plausivel: boolean;
  /** Por que não é plausível — a página explica cada caso com a sua frase. */
  implausivelPor: "sem-transferencia" | "transferencia-acima-do-total" | null;
};

/** O exercício em destaque: o mais recente da coleta. Não recua. */
export function atualDeReceita(r: Receita): ExercicioReceita | null {
  return r.exercicios[0] ?? null;
}

/** O exercício mais recente **que este município tem**, como em funções. */
export function exercicioDeReceita(
  r: Receita,
  codigo: number,
): ExercicioReceita | null {
  const chave = String(codigo);
  for (const e of r.exercicios) if (e.porMunicipio[chave]) return e;
  return null;
}

/**
 * A composição da receita no exercício da COLETA — para agregar e exportar.
 *
 * **Não recua**, e o par com `receitaRecenteDe` existe pela mesma razão que o
 * de `funcoesDe`/`funcoesRecentesDe`: quem soma estados ou escreve uma linha
 * de CSV não pode misturar anos. Recuar aqui somaria a receita de 2024 de um
 * município com a de 2021 do vizinho, ou publicaria colunas de anos diferentes
 * na mesma linha de um arquivo que **viaja sem a explicação da página**.
 *
 * Nenhum dos dois quebraria nada. Os dois dariam número.
 *
 * Hoje a coleta tem um exercício só, então as duas funções coincidem — e é
 * exatamente por isso que a separação entra agora: no dia em que o segundo ano
 * for varrido, a diferença aparece calada.
 */
export function receitaDe(
  s: SnapshotFiscal,
  codigo: number,
): ComposicaoReceita | null {
  const bloco = s.receita;
  if (!bloco) return null;
  return montarReceita(bloco, codigo, atualDeReceita(bloco));
}

/**
 * Como `receitaDe`, mas recuando até o exercício mais recente **deste
 * município**. Só a página do município usa.
 *
 * Quem chama tem de imprimir o ano — por isso ele volta dentro do resultado,
 * para o rótulo não poder divergir do dado.
 */
export function receitaRecenteDe(
  s: SnapshotFiscal,
  codigo: number,
): ComposicaoReceita | null {
  const bloco = s.receita;
  if (!bloco) return null;
  return montarReceita(bloco, codigo, exercicioDeReceita(bloco, codigo));
}

function montarReceita(
  bloco: Receita,
  codigo: number,
  ex: ExercicioReceita | null,
): ComposicaoReceita | null {
  if (!ex) return null;
  const entrada = ex.porMunicipio[String(codigo)];
  if (!entrada) return null;

  const [total, valores, detalhe] = entrada;
  const fracao = (v: number) =>
    total && total > 0 ? (v / total) * 100 : null;
  // O `?? ...` não é paranoia decorativa: se o export mudar a ordem dos
  // rótulos sem regerar o resto, o nome faltante iria para a tela como
  // `undefined`. Mesma guarda de `montarFuncoes`.
  const nomeDe = (i: number) => rotuloReceita(bloco.rotulos[i] ?? `Componente ${i}`);

  const fatias = valores
    .map(([i, valor]) => ({ nome: nomeDe(i), valor, percentual: fracao(valor) }))
    .sort((a, b) => b.valor - a.valor);

  const achar = (conta: string) => {
    const i = bloco.rotulos.indexOf(conta);
    if (i < 0) return null;
    return valores.find(([j]) => j === i)?.[1] ?? null;
  };

  const transferida = achar(CONTA_TRANSFERIDA);
  const implausivelPor =
    transferida === null || transferida <= 0
      ? "sem-transferencia" as const
      : total !== null && transferida > total
        ? "transferencia-acima-do-total" as const
        : null;
  return {
    exercicio: ex.exercicio,
    periodo: bloco.periodo,
    total,
    fatias,
    detalhe: detalhe
      .map(([i, valor]) => {
        const pai = bloco.paiDoDetalhe[i];
        return {
          nome: rotuloReceita(bloco.rotulosDetalhe[i] ?? `Detalhe ${i}`),
          valor,
          percentual: fracao(valor),
          dentroDe: pai == null ? null : nomeDe(pai),
        };
      })
      .sort((a, b) => b.valor - a.valor),
    tributaria: achar(CONTA_TRIBUTARIA),
    transferida,
    plausivel: implausivelPor === null,
    implausivelPor,
  };
}
