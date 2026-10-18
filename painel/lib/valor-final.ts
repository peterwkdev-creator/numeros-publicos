/**
 * O último valor escrito junto do último ponto das séries municipais
 * (pessoal, saúde, Ideb; revisão 2, lote D). **Módulo puro.**
 */

/** Uma caixa de texto já desenhada que o valor final não pode cobrir. */
export type Caixa = { x0: number; x1: number; base: number };

/** Largura na fonte de 11 (a do telefone, a maior): 6,2 por caractere, a conta
 *  de `distribuicao-svg.tsx`. Estimar pela maior fonte erra para o lado seguro. */
export const larguraDe = (texto: string) => texto.length * 6.2;
/** Quanto a caixa do texto sobe e desce da linha de base, na fonte de 11. */
export const SOBE = 9;
export const DESCE = 3;

/**
 * Onde escrever o último valor (revisão 2, lote D). À direita do ponto se
 * couber no viewBox; senão acima ou abaixo dele, terminando nele (`end`). O
 * lado preferido é o oposto de onde a linha chega; vence a posição mais perto
 * do ponto que fica dentro do desenho e não cobre o ponto nem um rótulo de
 * régua. Usada pela série do pessoal, a da saúde e a do Ideb.
 */
export function lugarDoValor(
  texto: string, xv: number, yv: number, yAnterior: number,
  { largura, teto, piso, evitar }: { largura: number; teto: number; piso: number; evitar: Caixa[] },
): { x: number; y: number; anchor: "start" | "end" } {
  const w = larguraDe(texto);
  const cabe = (x0: number, x1: number, b: number) =>
    b - SOBE >= teto && b + DESCE <= piso &&
    !evitar.some((c) => x0 < c.x1 && x1 > c.x0 &&
      b - SOBE < c.base + DESCE && b + DESCE > c.base - SOBE);
  if (xv + 6 + w <= largura && cabe(xv + 6, xv + 6 + w, yv + 3)) {
    return { x: xv + 6, y: yv + 3, anchor: "start" };
  }
  const x = Math.min(xv + 3, largura);
  const acima = yv - 4 - DESCE;   // a caixa termina 4 acima do centro do ponto
  const abaixo = yv + 4 + SOBE;   // e começa 4 abaixo
  const prefereAcima = yAnterior >= yv;
  const candidatos = [
    acima, abaixo,
    ...evitar.flatMap((c) => [c.base - SOBE - DESCE - 1, c.base + SOBE + DESCE + 1]),
  ].filter((b) => cabe(x - w, x, b) && (b + DESCE <= yv - 4 || b - SOBE >= yv + 4));
  const custo = (b: number) => {
    const emCima = b < yv;
    return Math.abs(b - (emCima ? acima : abaixo)) + (emCima === prefereAcima ? 0 : 15);
  };
  const melhor = candidatos.sort((a, b) => custo(a) - custo(b))[0];
  const ideal = prefereAcima ? acima : abaixo;
  return {
    x, anchor: "end",
    y: melhor ?? Math.min(Math.max(ideal, teto + SOBE), piso - DESCE),
  };
}

/** O halo das leituras de `serie-brasil.module.css` (`.leituraSvg`), em atributos. */
export const HALO = {
  fill: "var(--tinta)", fontWeight: 600, stroke: "var(--fundo)",
  strokeWidth: 3, strokeLinejoin: "round", paintOrder: "stroke",
} as const;
