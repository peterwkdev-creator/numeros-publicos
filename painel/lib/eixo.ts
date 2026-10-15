/**
 * O eixo vertical de todo gráfico de série do site: do menor ao maior dado,
 * com uma folga pequena para o traço não encostar na borda.
 *
 * Pedido do usuário em 15/10/2026: o gráfico não pode ter parte vazia
 * espremendo a parte com dado. Antes, cada gráfico tinha a sua régua: o do
 * Brasil arredondava para fora (até um passo inteiro de sobra em cada ponta),
 * o do Ideb ia de 0 a 10 fixo, e o de pessoal e o de saúde sempre esticavam a
 * escala até o limite legal, mesmo quando o município estava longe dele.
 *
 * ## As duas proteções que ficam
 *
 * - **`vaoMinimo`**: colado nos dados, meio ponto de variação ocuparia o
 *   gráfico inteiro e pareceria um salto. O vão nunca é menor que este, e a
 *   sobra se divide igual em cima e embaixo.
 * - **`reguas`**: um limite legal ou um piso perto dos dados entra na escala e
 *   é desenhado. Longe deles (mais de `alcance` vezes o vão dos dados), fica
 *   FORA, e o gráfico diz em texto que ele está acima ou abaixo: a régua
 *   desenhada no canto espremeria a série numa faixa fina.
 */

export interface Eixo {
  baixo: number;
  alto: number;
  /** Os valores redondos dentro do eixo, de baixo para cima. */
  marcas: number[];
  /** As réguas que ficaram fora da escala. */
  fora: number[];
}

/** Folga em cada ponta, em fração do vão. */
const FOLGA = 0.06;
/** No máximo cinco marcas: mais que isso vira borrão num gráfico pequeno. */
const MARCAS = 5;

export function eixoJusto(
  valores: number[],
  {
    vaoMinimo = 0,
    reguas = [],
    alcance = 0.5,
    limites,
  }: {
    vaoMinimo?: number;
    reguas?: number[];
    alcance?: number;
    /** A escala natural do índice (o Ideb vai de 0 a 10): o eixo não passa dela. */
    limites?: [number, number];
  } = {},
): Eixo {
  let min = Math.min(...valores);
  let max = Math.max(...valores);
  const vaoDados = Math.max(max - min, vaoMinimo);
  const dentro = reguas.filter(
    (r) => r >= min - alcance * vaoDados && r <= max + alcance * vaoDados,
  );
  const fora = reguas.filter((r) => !dentro.includes(r));
  min = Math.min(min, ...dentro);
  max = Math.max(max, ...dentro);

  const vao = Math.max(max - min, vaoMinimo) || Math.abs(max) || 1;
  const sobra = vao - (max - min);
  let baixo = min - sobra / 2 - vao * FOLGA;
  let alto = max + sobra / 2 + vao * FOLGA;
  if (limites) {
    // Empurra para dentro sem encolher: o vão continua o mesmo.
    const [piso, teto] = limites;
    if (baixo < piso) [baixo, alto] = [piso, Math.min(teto, alto + piso - baixo)];
    if (alto > teto) [baixo, alto] = [Math.max(piso, baixo - (alto - teto)), teto];
  }

  return { baixo, alto, marcas: marcasEntre(baixo, alto), fora };
}

/** Os múltiplos redondos (1, 2, 2,5 ou 5 vezes uma potência de 10) entre os
 *  dois extremos: o menor passo que não passa de cinco marcas. */
export function marcasEntre(baixo: number, alto: number): number[] {
  const pot = 10 ** Math.floor(Math.log10((alto - baixo) / MARCAS));
  for (const k of [1, 2, 2.5, 5, 10, 20, 25, 50]) {
    const passo = k * pot;
    const de = Math.ceil(baixo / passo - 1e-9);
    const ate = Math.floor(alto / passo + 1e-9);
    if (ate - de + 1 <= MARCAS) {
      const marcas: number[] = [];
      // Arredondado ao passo: 0,1 + 0,2 não vira 0,30000000000000004.
      for (let i = de; i <= ate; i++) marcas.push(Number((i * passo).toPrecision(12)));
      return marcas;
    }
  }
  return [];
}
