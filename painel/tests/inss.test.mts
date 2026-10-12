/**
 * O INSS no painel: o contrato com o JSON que o Python escreve, e as funções
 * de texto cujo erro é silencioso (um mês trocado, um percentual arredondado
 * para o lado errado, uma rota gerada para grupo sem dado).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";

import {
  dataBr, dias, gruposComPagina, inssDaUf, mesPorExtenso, pct, tendencia,
  type SnapshotInss,
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
      // o recorte por UF soma a fila do país: nenhum pedido sem UF
      const soma = Object.values(g.fila.porUf).reduce((t, x) => t + x.n, 0);
      assert.equal(soma, g.fila.n, g.chave);
    }
    if (g.negados) {
      // a automação fica fora das UFs, e só ela
      const soma = Object.values(g.negados.porUf).reduce((t, x) => t + x.n, 0);
      assert.ok(soma <= g.negados.n, g.chave);
    }
  }
  const fora = real.negados!.foraDasUfs;
  assert.ok(fora.n > 0 && fora.n < fora.total);
});

test("inss: inssDaUf traz só o lado publicável, e some o benefício sem nenhum", () => {
  const base = real.grupos.find((g) => g.fila && g.negados)!;
  const recorte = (n: number) => ({
    n, mediana: 10, acima45: 0, acima90: 0, publicavel: n >= 1000, acimaDoPrazo: null,
  });
  const s: SnapshotInss = {
    ...real,
    grupos: [
      { ...base, chave: "menor", fila: { ...base.fila!, porUf: { ZZ: recorte(1000) } },
        negados: { ...base.negados!, porUf: { ZZ: recorte(999) } } },
      { ...base, chave: "maior", fila: { ...base.fila!, porUf: { ZZ: recorte(5000) } },
        negados: { ...base.negados!, porUf: { ZZ: recorte(2000) } } },
      { ...base, chave: "pouco", fila: { ...base.fila!, porUf: { ZZ: recorte(10) } },
        negados: { ...base.negados!, porUf: {} } },
    ],
  };
  const r = inssDaUf(s, "ZZ");
  assert.deepEqual(r.map((x) => x.grupo.chave), ["maior", "menor"]);
  assert.equal(r[1]!.negados, null);        // 999 negados: travessão, não número
  assert.equal(r[0]!.negados!.n, 2000);
  assert.deepEqual(inssDaUf(s, "YY"), []);
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
