// A linha de fonte do gráfico do IDEB (`periodoEdicoes`, 18/10/2026): com
// uma edição só, "edição de 2025", e não "edições de 2025 a 2025".
import assert from "node:assert/strict";
import { test } from "node:test";

import { periodoEdicoes, type EdicaoIdeb, type Trajetoria } from "../lib/ideb.ts";

function trajetoria(edicoes: number[]): Trajetoria {
  const pontos = edicoes.map((edicao) => ({ edicao }) as EdicaoIdeb);
  return {
    etapa: "finais",
    rotuloEtapa: "anos finais",
    pontos,
    primeiro: pontos[0]!,
    ultimo: pontos[pontos.length - 1]!,
    variacao: 0,
  };
}

test("ideb: uma edição só se diz no singular", () => {
  assert.equal(periodoEdicoes(trajetoria([2025])), "edição de 2025");
});

test("ideb: várias edições dizem o intervalo", () => {
  assert.equal(periodoEdicoes(trajetoria([2005, 2015, 2025])), "edições de 2005 a 2025");
});
