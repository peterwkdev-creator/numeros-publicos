/**
 * As séries: a faixa de plausibilidade do percentual, a saúde (SIOPS) e a
 * série quadrimestral de pessoal — rótulos, contiguidade, interrupções,
 * variação.
 */

import type { PontoSerie, SnapshotFiscal } from "./tipos";

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
 * O rótulo curto de um período, para eixo e leitura de tela: `3º quadr. 2024`.
 *
 * Era `2024/3` até 11/10/2026, e quem não conhece o RGF lê "março de 2024".
 * O formato é o mesmo do `1º tri. 1996` da página do Brasil.
 */
export function rotuloPeriodo(exercicio: number, periodo: number): string {
  return `${periodo}º quadr. ${exercicio}`;
}

/** Por extenso, para tabela e frase: `3º quadrimestre de 2024`. Uma definição
 *  só: até 11/10/2026 a frase estava copiada em quatro páginas. */
export function nomeQuadrimestre(exercicio: number, periodo: number): string {
  return `${periodo}º quadrimestre de ${exercicio}`;
}

/** O mês em que cada bimestre termina. */
const FIM_DO_BIMESTRE = ["fevereiro", "abril", "junho", "agosto", "outubro", "dezembro"];

/** Abertura da frase do RREO, que acumula o ano desde janeiro: "No 6º
 *  bimestre de 2025" se lia como "em novembro e dezembro" (auditoria de
 *  termos, A5, 26/10/2026). */
export function fraseBimestre(exercicio: number, periodo: number): string {
  return periodo === 6
    ? `Em ${exercicio} (o ano inteiro, no relatório do 6º bimestre)`
    : `De janeiro a ${FIM_DO_BIMESTRE[periodo - 1]} de ${exercicio} (relatório do ${periodo}º bimestre)`;
}

/** Abertura da frase do RGF, cujo percentual cobre os 12 meses até o fim do
 *  quadrimestre; o Simplificado do 2º semestre, os 12 meses até dezembro. */
export function fraseDozeMeses(exercicio: number, periodo: number, simplificado = false): string {
  const fim = simplificado ? "dezembro" : FIM_DO_BIMESTRE[2 * periodo - 1];
  const relatorio = simplificado ? "2º semestre" : `${periodo}º quadrimestre`;
  return `Nos 12 meses até ${fim} de ${exercicio} (relatório do ${relatorio})`;
}

/** O rótulo curto de um PONTO da série: o do RGF Simplificado é semestre. */
export function rotuloPonto(p: PontoSerie): string {
  return p[4] === true ? `2º sem. ${p[0]}` : rotuloPeriodo(p[0], p[1]);
}

/** Por extenso, para tabela e frase: `2º semestre de 2024` no Simplificado. */
export function nomePonto(p: PontoSerie): string {
  return p[4] === true ? `2º semestre de ${p[0]}` : nomeQuadrimestre(p[0], p[1]);
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

/**
 * Dois pontos são vizinhos NO TEMPO, e não só na lista?
 *
 * **Quem entrega o RGF Simplificado não deve 1º nem 2º quadrimestre** naquele
 * ano: o ponto dele é o 2º semestre, posto no 3º quadrimestre. Então o ano
 * anterior encosta nele. Sem isso, cada ano de um município semestral contava
 * como interrupção, e a página dizia "não entregou relatório" de quem
 * entregou todos — ~2.300 municípios, achado antes de ir ao ar, em 12/10/2026.
 */
export function contiguos(a: PontoSerie, b: PontoSerie): boolean {
  const ate = b[4] === true && b[1] === QUADRIMESTRES_POR_ANO
    ? indiceQuadrimestre(b[0], 1)
    : indiceQuadrimestre(b[0], b[1]);
  const passo = ate - indiceQuadrimestre(a[0], a[1]);
  return passo === 1 || (b[4] === true && passo === 0);
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
