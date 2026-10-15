// O eixo vertical comum aos gráficos de série (`lib/eixo.ts`, 15/10/2026):
// colado nos dados, com o vão mínimo contra o exagero e as réguas que só
// entram quando estão perto.
import assert from "node:assert/strict";
import { test } from "node:test";

import { eixoJusto, marcasEntre } from "../lib/eixo.ts";

test("eixo: vai do menor ao maior dado, com 6% de folga e nada mais", () => {
  const e = eixoJusto([501, 1679]);
  const vao = 1679 - 501;
  assert.ok(Math.abs(e.baixo - (501 - 0.06 * vao)) < 1e-9, String(e.baixo));
  assert.ok(Math.abs(e.alto - (1679 + 0.06 * vao)) < 1e-9, String(e.alto));
  // as marcas ficam DENTRO do eixo, redondas
  assert.ok(e.marcas.every((m) => m >= e.baixo && m <= e.alto), String(e.marcas));
  assert.ok(e.marcas.length >= 3 && e.marcas.length <= 5, String(e.marcas));
});

test("eixo: o vão mínimo divide a sobra igual em cima e embaixo", () => {
  // Ideb de 4,9 para 5,1: sem o mínimo, 0,2 ponto encheria o gráfico
  const e = eixoJusto([4.9, 5.1], { vaoMinimo: 2 });
  assert.ok(Math.abs((e.baixo + e.alto) / 2 - 5) < 1e-9);
  assert.ok(e.alto - e.baixo >= 2);
});

test("eixo: régua perto dos dados entra; longe fica fora e é devolvida", () => {
  // pessoal entre 44% e 50%: o prudencial (51,3) e o teto (54) estão a até
  // meio vão (3 pontos de 6)... o teto não
  const perto = eixoJusto([44, 50], { vaoMinimo: 5, reguas: [51.3, 54] });
  assert.deepEqual(perto.fora, [54]);
  assert.ok(perto.alto >= 51.3 && perto.alto < 54);
  // pessoal em 25%: os dois limites ficam fora, e a escala é a dos dados
  const longe = eixoJusto([24, 27], { vaoMinimo: 5, reguas: [51.3, 54] });
  assert.deepEqual(longe.fora, [51.3, 54]);
  assert.ok(longe.alto < 30, String(longe.alto));
});

test("eixo: os limites da escala natural empurram sem encolher o vão", () => {
  const e = eixoJusto([9.2, 9.6], { vaoMinimo: 2, limites: [0, 10] });
  assert.equal(e.alto, 10);
  assert.ok(Math.abs(e.alto - e.baixo - 2 * 1.12) < 1e-9, `${e.baixo} ${e.alto}`);
});

test("eixo: marcas sem resto de ponto flutuante, e o zero quando cruza", () => {
  assert.deepEqual(marcasEntre(0.05, 0.95), [0.2, 0.4, 0.6, 0.8]);
  assert.ok(eixoJusto([-4.5, 7.5]).marcas.includes(0));
});
