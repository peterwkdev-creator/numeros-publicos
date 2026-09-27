/**
 * O INSS no painel: o contrato com o JSON que o Python escreve, e as funções
 * de texto cujo erro é silencioso (um mês trocado, um percentual arredondado
 * para o lado errado, uma rota gerada para grupo sem dado).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";

import {
  dataBr, dias, gruposComPagina, mesPorExtenso, pct, tendencia, type SnapshotInss,
} from "../lib/inss.ts";

const real = JSON.parse(
  fs.readFileSync(new URL("../dados/inss.json", import.meta.url), "utf-8"),
) as SnapshotInss;

test("inss: o JSON real tem as chaves que o tipo declara", () => {
  assert.deepEqual(Object.keys(real).sort(),
    ["fila", "fonte", "geradoEm", "grupos", "minimoPedidos", "negados"]);
  for (const g of real.grupos) {
    assert.deepEqual(Object.keys(g).sort(), ["chave", "fila", "negados", "nome",
      "nomePopular", "prazoAcordo", "prazoContaDoPedido"]);
    // prazo e marco andam juntos: sem prazo, não há de onde ele conte
    assert.equal(g.prazoAcordo === null, g.prazoContaDoPedido === null, g.chave);
    if (g.fila) {
      assert.ok(Array.isArray(g.fila.porServico), g.chave);
      assert.equal(g.fila.acimaDoPrazo === null, g.prazoAcordo === null, g.chave);
    }
  }
});

test("inss: só ganha rota o grupo com fila publicável", () => {
  const s: SnapshotInss = {
    ...real,
    grupos: [
      { ...real.grupos[0]!, chave: "com", fila: { ...real.grupos[0]!.fila!, publicavel: true } },
      { ...real.grupos[0]!, chave: "pouca", fila: { ...real.grupos[0]!.fila!, publicavel: false } },
      { ...real.grupos[0]!, chave: "sem", fila: null },
    ],
  };
  assert.deepEqual(gruposComPagina(s).map((g) => g.chave), ["com"]);
});

test("inss: mês, data, dias e percentual por extenso", () => {
  assert.equal(mesPorExtenso("2026-07"), "julho de 2026");
  assert.equal(mesPorExtenso("2026-12"), "dezembro de 2026");
  assert.throws(() => mesPorExtenso("2026-13"));
  assert.equal(dataBr("2026-07-31"), "31/07/2026");
  assert.equal(dias(1), "1 dia");
  assert.equal(dias(1500), "1.500 dias");
  assert.equal(pct(0.5176), "52%");
});

test("inss: a tendência diz o número de antes, e cala sem mês anterior", () => {
  const g = real.grupos.find((x) => x.fila?.medianaAnterior !== null && x.fila)!;
  assert.match(tendencia(g, real)!, /^No fim de \w+ de \d{4}, a metade esperava havia mais de/);
  const semAnterior: SnapshotInss = { ...real, fila: { ...real.fila!, mesAnterior: null } };
  assert.equal(tendencia(g, semAnterior), null);
});
