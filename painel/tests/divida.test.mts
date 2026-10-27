/**
 * A dívida dos governos estaduais: o contrato com o `estados-divida.json` que
 * o motor escreve e as contas puras da seção `#divida` (`lib/divida.ts`), com
 * os números reais do arquivo. Espec: `especs/numeros-publicos-divida-estados.md`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";

import {
  anosEmTexto, dividaDe, emAnos, faixasDoCalendario, fatorIpca, linhasDe, notaDoLimite,
  serieIpca, temDado,
  type LinhaDivida, type SnapshotDivida,
} from "../lib/divida.ts";
import type { SnapshotBrasil } from "../lib/brasil.ts";

const ler = (caminho: string) =>
  fs.readFileSync(new URL(caminho, import.meta.url), "utf-8");
const real = JSON.parse(ler("../dados/estados-divida.json")) as SnapshotDivida;
const brasil = JSON.parse(ler("../dados/brasil.json")) as SnapshotBrasil;

const linha = (uf: string, ano: number): LinhaDivida => {
  const e = dividaDe(real, uf);
  assert.ok(e, uf);
  const l = linhasDe(real, e).find((x) => x.ano === ano);
  assert.ok(l && temDado(l), `${uf} ${ano} sem dado`);
  return l;
};

test("o arquivo real tem os 26 estados e o DF, e as colunas na ordem do tipo", () => {
  assert.equal(Object.keys(real.estados).length, 27);
  assert.deepEqual(real.colunas,
    ["dc", "deducoes", "dcl", "rcl", "rclAjustada", "percentual", "limiteSenado", "limiteAlerta"]);
  assert.equal(dividaDe(real, "XX"), null);
});

test("SP 2024: o limite declarado é 2 vezes a receita da base, e o % é o do relatório", () => {
  const l = linha("SP", 2024);
  assert.equal(l.percentual, 126.55);
  assert.equal(l.dcl, 317655576689.71);
  assert.ok(Math.abs(l.limite - 200) < 0.01, String(l.limite));
  // O alerta é 90% do limite sobre a RCL sem ajuste: sobre a ajustada, 180,25.
  assert.ok(Math.abs(l.alerta - 180) < 0.5, String(l.alerta));
  assert.ok(Math.abs(l.limiteDeclarado - 200) < 0.01, String(l.limiteDeclarado));
  assert.equal(l.limiteDiferente, false);
  // E o % do relatório bate com a conta sobre a base declarada.
  assert.ok(Math.abs((l.dcl / l.receita) * 100 - l.percentual) < 0.01);
});

test("SP 2025: o relatório declara ~170%, e a nota diz isso", () => {
  const l = linha("SP", 2025);
  assert.ok(Math.abs(l.limite - 169.93) < 0.01, String(l.limite));
  assert.equal(Math.round(l.limiteDeclarado), 170);
  assert.equal(l.limiteDiferente, true);
  const nota = notaDoLimite(linhasDe(real, dividaDe(real, "SP")!));
  assert.deepEqual(nota, [{ anos: [2025], limite: 170 }]);
});

test("RR 2015–2025: limite de 90% em todos os anos, numa nota só", () => {
  assert.ok(Math.abs(linha("RR", 2015).limite - 90) < 0.01);
  const nota = notaDoLimite(linhasDe(real, dividaDe(real, "RR")!));
  assert.deepEqual(nota, [{
    anos: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025], limite: 90,
  }]);
  assert.equal(anosEmTexto(nota[0]!.anos), "2015 a 2025");
});

test("CE e DF: o limite em pontos percentuais dá 200 e não vira nota", () => {
  for (const uf of ["CE", "DF"]) {
    const linhas = linhasDe(real, dividaDe(real, uf)!);
    assert.deepEqual(notaDoLimite(linhas), [], uf);
    for (const l of linhas.filter(temDado)) {
      assert.equal(Math.round(l.limiteDeclarado), 200, `${uf} ${l.ano}`);
    }
  }
});

test("sem o aviso do motor, o limite é 200% em toda UF e todo ano", () => {
  const fora = Object.values(real.estados).flatMap((e) =>
    linhasDe(real, e).filter(temDado)
      .filter((l) => !l.limiteDiferente && Math.round(l.limiteDeclarado) !== 200)
      .map((l) => `${e.uf} ${l.ano}: ${l.limiteDeclarado}`));
  assert.deepEqual(fora, []);
});

test("RO 2021: dívida líquida negativa, e o % declarado negativo", () => {
  const l = linha("RO", 2021);
  assert.ok(l.dcl < 0);
  assert.equal(l.percentual, -5.1);
});

test("AP 2017: o ano sem relatório fica como buraco, sem interpolar", () => {
  assert.deepEqual(real.faltam["2017"], ["AP"]);
  const l = linhasDe(real, dividaDe(real, "AP")!).find((x) => x.ano === 2017);
  assert.deepEqual(l, { ano: 2017, semDado: true });
});

test("IPCA: fator pelo número-índice de dezembro, nunca pela variação encadeada", () => {
  const ipca = serieIpca(brasil.auxiliares);
  assert.ok(ipca, "série ipca-indice ausente do brasil.json");
  const dez = (a: number) => ipca.pontos.find(([p]) => p === `${a}-12`)?.[1];
  // Medidos em 26/10/2026 (espec §4).
  assert.equal(dez(2014), 4059.86);
  assert.equal(dez(2024), 7100.5);
  assert.equal(fatorIpca(ipca, 2014, 2024), 7100.5 / 4059.86);
  assert.equal(fatorIpca(ipca, 2025, 2025), 1);
  assert.equal(fatorIpca(ipca, 1900, 2025), null);
  assert.equal(fatorIpca(null, 2015, 2025), null);
});

test("anos em texto e faixas do calendário de mandatos", () => {
  assert.equal(anosEmTexto([2017]), "2017");
  assert.equal(anosEmTexto([2016, 2015]), "2015 e 2016");
  assert.equal(anosEmTexto([2015, 2016, 2017, 2019, 2021, 2022]), "2015 a 2017, 2019, 2021 e 2022");
  assert.equal(emAnos([2017]), "Em 2017");
  assert.equal(emAnos([2015, 2016, 2017]), "De 2015 a 2017");
  assert.equal(emAnos([2015, 2016, 2017, 2019]), "Em 2015 a 2017 e 2019");
  assert.deepEqual(faixasDoCalendario(2015, 2026), [
    { de: 2015, ate: 2019, tom: 0 },
    { de: 2019, ate: 2023, tom: 1 },
    { de: 2023, ate: 2026, tom: 0 },
  ]);
});
