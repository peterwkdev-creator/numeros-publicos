/**
 * A geometria da rosca de composição. **Módulo puro, sem JSX.**
 *
 * Existe separada do componente pela mesma razão de `lib/mapa.ts`: o
 * `node:test` remove tipos mas não transforma JSX, então o que decide um
 * número tem de morar onde um teste alcança. E aqui há bastante o que decidir
 * errado — arco de 0,3% que vira um risco invisível, fatia de 100% que fecha
 * o círculo e some, ordem que muda entre dois builds do mesmo dado.
 */

/** Uma fatia pronta para virar `<path d=...>`. */
export type FatiaRosca = {
  nome: string;
  valor: number;
  /** Do total, em pontos percentuais. */
  percentual: number;
  /** O `d` do arco, já no sistema de coordenadas do `viewBox`. */
  caminho: string;
};

const RAIO_EXTERNO = 100;
const RAIO_INTERNO = 62;

/** O `viewBox` que os caminhos assumem. Quadrado, centrado na origem. */
export const VIEW_BOX_ROSCA = "-105 -105 210 210";

function ponto(raio: number, angulo: number): [number, number] {
  // Começa no topo (−90°) e cresce no sentido horário, que é como se lê um
  // relógio — e como quem olha espera que uma composição seja percorrida.
  const r = ((angulo - 90) * Math.PI) / 180;
  return [raio * Math.cos(r), raio * Math.sin(r)];
}

/**
 * Um anel entre dois ângulos.
 *
 * **O caso de 360° é tratado à parte, e não é preciosismo:** um arco cujo
 * ponto final é igual ao inicial tem comprimento zero para o SVG, e uma fatia
 * de 100% desapareceria — o gráfico ficaria vazio justamente quando há um só
 * item. Dois semicírculos resolvem.
 */
export function arco(de: number, ate: number): string {
  const varre = ate - de;
  if (varre >= 359.999) {
    const [ex1, ey1] = ponto(RAIO_EXTERNO, 0);
    const [ex2, ey2] = ponto(RAIO_EXTERNO, 180);
    const [ix1, iy1] = ponto(RAIO_INTERNO, 0);
    const [ix2, iy2] = ponto(RAIO_INTERNO, 180);
    return (
      `M${ex1} ${ey1}A${RAIO_EXTERNO} ${RAIO_EXTERNO} 0 0 1 ${ex2} ${ey2}` +
      `A${RAIO_EXTERNO} ${RAIO_EXTERNO} 0 0 1 ${ex1} ${ey1}` +
      `M${ix1} ${iy1}A${RAIO_INTERNO} ${RAIO_INTERNO} 0 0 0 ${ix2} ${iy2}` +
      `A${RAIO_INTERNO} ${RAIO_INTERNO} 0 0 0 ${ix1} ${iy1}Z`
    );
  }
  const grande = varre > 180 ? 1 : 0;
  const [x1, y1] = ponto(RAIO_EXTERNO, de);
  const [x2, y2] = ponto(RAIO_EXTERNO, ate);
  const [x3, y3] = ponto(RAIO_INTERNO, ate);
  const [x4, y4] = ponto(RAIO_INTERNO, de);
  return (
    `M${x1.toFixed(2)} ${y1.toFixed(2)}` +
    `A${RAIO_EXTERNO} ${RAIO_EXTERNO} 0 ${grande} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}` +
    `L${x3.toFixed(2)} ${y3.toFixed(2)}` +
    `A${RAIO_INTERNO} ${RAIO_INTERNO} 0 ${grande} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}Z`
  );
}

/**
 * As fatias, na ordem recebida, com o arco de cada uma.
 *
 * **Não reordena e não agrupa.** Quem chama já decidiu o que é "outras" e em
 * que ordem mostrar; uma função que reordenasse aqui faria a rosca discordar
 * da tabela ao lado, e duas leituras do mesmo dado na mesma tela é pior que
 * nenhuma.
 *
 * Total ausente ou não positivo devolve lista vazia: não existe composição de
 * nada, e desenhar um círculo inteiro de uma fatia inventada seria afirmar.
 */
export function fatiasDaRosca(
  entradas: { nome: string; valor: number }[],
  total: number,
): FatiaRosca[] {
  if (!(total > 0)) return [];
  const saida: FatiaRosca[] = [];
  let angulo = 0;
  for (const e of entradas) {
    if (!(e.valor > 0)) continue;
    const fracao = e.valor / total;
    const fim = angulo + fracao * 360;
    saida.push({
      nome: e.nome,
      valor: e.valor,
      percentual: fracao * 100,
      // O último fecha exatamente em 360: acumular fração a fração deixa um
      // fio de fundo à mostra por erro de ponto flutuante.
      caminho: arco(angulo, Math.min(360, fim)),
    });
    angulo = fim;
  }
  return saida;
}
