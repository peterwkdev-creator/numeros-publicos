/**
 * A dívida dos governos estaduais: o contrato com o `estados-divida.json` que
 * o motor escreve e as contas puras da seção `#divida` (`lib/divida.ts`), com
 * os números reais do arquivo. Espec: `especs/numeros-publicos-divida-estados.md`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";

import {
  anosEmTexto, dividaDe, emAnos, fatorIpca, governoEm31, linhasDe, notaDoLimite,
  serieIpca, temDado,
  type LinhaDivida, type SnapshotDivida, type SnapshotGovernadores,
} from "../lib/divida.ts";
import type { Mandato, SnapshotBrasil } from "../lib/brasil.ts";

const ler = (caminho: string) =>
  fs.readFileSync(new URL(caminho, import.meta.url), "utf-8");
const real = JSON.parse(ler("../dados/estados-divida.json")) as SnapshotDivida;
const brasil = JSON.parse(ler("../dados/brasil.json")) as SnapshotBrasil;
const governadores = JSON.parse(ler("../dados/estados-governadores.json")) as SnapshotGovernadores;

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
});

const faixas = (uf: string, de: number, ate: number) =>
  governoEm31(governadores.estados[uf], de, ate).map((f) => [f.rotulo, f.de, f.ate, f.tom]);

test("o arquivo de governadores tem os 27 e começa em 2015 com quem ocupa hoje no fim", () => {
  assert.equal(Object.keys(governadores.estados).length, 27);
  for (const [uf, ms] of Object.entries(governadores.estados)) {
    assert.equal(ms[0].inicio, governadores.inicio, uf);
    assert.equal(ms[ms.length - 1].fim, null, uf);
  }
});

test("TO 2018: as idas e voltas do ano ficam na tabela; a faixa é de quem estava em 31/12", () => {
  assert.deepEqual(faixas("TO", 2015, 2026), [
    ["Marcelo Miranda", 2015, 2018, 0],
    ["Mauro Carlesse", 2018, 2021, 1],
    ["Wanderlei Barbosa", 2021, 2026, 0],
  ]);
});

test("AM 2017: o interino de maio a outubro não ganha faixa; 2026 é do sucessor", () => {
  assert.deepEqual(faixas("AM", 2015, 2027), [
    ["José Melo", 2015, 2017, 0],
    ["Amazonino Mendes", 2017, 2019, 1],
    ["Wilson Lima", 2019, 2026, 0],
    ["Roberto Cidade", 2026, 2027, 1],
  ]);
});

test("governoEm31: ano sem governador fica sem faixa e não une as vizinhas", () => {
  const m = (nome: string, inicio: string, fim: string | null): Mandato =>
    ({ nome, rotulo: nome, inicio, fim, como: "Eleito", fonte: "" });
  const lista = [m("A", "2015-01-01", "2016-06-01"), m("A", "2017-01-01", null)];
  assert.deepEqual(governoEm31(lista, 2015, 2019).map((f) => [f.nome, f.de, f.ate, f.tom]), [
    ["A", 2015, 2016, 0],
    ["A", 2017, 2019, 1],
  ]);
  assert.deepEqual(governoEm31([], 2015, 2019), []);
});
