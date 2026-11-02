/**
 * A emenda Pix: o contrato com o JSON que o Python escreve e as regras da
 * espec (`especs/numeros-publicos-emendas-pix.md`, §4) que a página
 * sustenta: área sem valor, relatório ausente que não vira zero, só os anos
 * da seção na página e a série inteira no download.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";

import { areasDe, pixDe, planosEmTexto, resumoPixDe, type SnapshotPix } from "../lib/pix.ts";

const ler = (caminho: string) =>
  fs.readFileSync(new URL(caminho, import.meta.url), "utf-8");
const real = JSON.parse(ler("../dados/pix.json")) as SnapshotPix;

const pequeno: SnapshotPix = {
  fonte: "Transferegov", origem: "", licenca: "", coletadoEm: "2026-10-30T13:12:02+00:00",
  anos: [2020, 2025, 2026],
  funcoes: { "10": "Saúde", "12": "Educação", "15": "Urbanismo" },
  municipios: [
    [1, [
      [2020, "P-2020", 100_00, [[null, "Antigo", [10]]], ["Final", "2021-03-01T10:00:00", 100_00, 0]],
      [2025, "P-B", 300_000_00, [[null, "Obra", [15, 10]], ["FUNDO MUNICIPAL DE SAÚDE", "Posto", [10]]], null],
      [2025, "P-A", 100_000_00, [[null, "Escola", [12]]], ["Parcial", "2026-06-25T11:45:29.476456", 200_000_00, 0]],
      [2026, "P-C", 50_000_00, [[null, "Praça", [99]]], null],
    ]],
  ],
};

test("município sem plano no arquivo é null, não lista vazia", () => {
  assert.equal(pixDe(pequeno, 2, [2025, 2026]), null);
});

test("a página leva só os anos da seção; o download, todos", () => {
  const p = pixDe(pequeno, 1, [2025, 2026])!;
  assert.deepEqual(p.planos.map((x) => x.codigo), ["P-C", "P-A", "P-B"]);
  assert.deepEqual(p.anos, [2025, 2026]);
  assert.equal(p.todos.length, 4);
});

test("centavo vira real; relatório ausente é null, nunca zero", () => {
  const p = pixDe(pequeno, 1, [2025, 2026])!;
  const b = p.planos.find((x) => x.codigo === "P-B")!;
  assert.equal(b.reais, 300_000);
  assert.equal(b.relatorio, null);
  const a = p.planos.find((x) => x.codigo === "P-A")!;
  assert.deepEqual(a.relatorio, { tipo: "parcial", data: "2026-06-25T11:45:29.476456", executado: 200_000, pendente: 0 });
});

test("área conta planos, uma vez por plano, e a soma pode passar do total", () => {
  const p = pixDe(pequeno, 1, [2025, 2026])!;
  // P-B cita Saúde em dois executores: conta UMA vez.
  assert.deepEqual(p.areas, [
    { nome: "99", planos: 1 }, { nome: "Educação", planos: 1 },
    { nome: "Saúde", planos: 1 }, { nome: "Urbanismo", planos: 1 },
  ]);
  assert.ok(p.areas.reduce((s, a) => s + a.planos, 0) > p.planos.length);
  assert.ok(areasDe(p.planos).every((a) => !("reais" in a)));
});

test("executor só aparece quando não é o beneficiário", () => {
  const b = pixDe(pequeno, 1, [2025])!.planos.find((x) => x.codigo === "P-B")!;
  assert.deepEqual(b.objetos.map((o) => o.executor), [null, "FUNDO MUNICIPAL DE SAÚDE"]);
});

test("resumo da base nacional: planos e soma por ano; sem plano, 0 e vazio", () => {
  assert.deepEqual(resumoPixDe(pequeno, 1, [2025, 2026]), [
    { planos: 2, reais: 400_000 }, { planos: 1, reais: 50_000 },
  ]);
  // Ano fora dos pedidos (2020) não entra; município sem plano dá 0 e null.
  assert.deepEqual(resumoPixDe(pequeno, 1, [2024]), [{ planos: 0, reais: null }]);
  assert.deepEqual(resumoPixDe(pequeno, 2, [2025, 2026]), [
    { planos: 0, reais: null }, { planos: 0, reais: null },
  ]);
});

test("planosEmTexto concorda o número", () => {
  assert.equal(planosEmTexto(1), "1 plano");
  assert.equal(planosEmTexto(3), "3 planos");
});

test("o arquivo real: contrato, códigos únicos e soma por ano como a coleta", () => {
  assert.ok(real.fonte.includes("Transferegov"));
  assert.deepEqual(real.anos, [2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  const codigos = new Set(real.municipios.map(([c]) => c));
  assert.equal(codigos.size, real.municipios.length);
  assert.equal(real.municipios.length, 5506);
  const porAno = new Map<number, [number, number]>();
  const semExecutor: number[] = [];
  for (const [, linhas] of real.municipios) {
    for (const [ano, , centavos, executores] of linhas) {
      assert.ok(Number.isInteger(centavos) && centavos > 0);
      if (executores.length === 0) semExecutor.push(ano);
      const [n, s] = porAno.get(ano) ?? [0, 0];
      porAno.set(ano, [n + 1, s + centavos]);
    }
  }
  // Plano sem executor (logo, sem objeto) existe: 42, medido em 01/11/2026,
  // todos antes de 2025; a página e o CSV dizem "sem objeto cadastrado".
  assert.equal(semExecutor.length, 42);
  assert.ok(semExecutor.every((a) => a < 2025));
  // Os números do registro da coleta (Onde retomar, 01/11/2026).
  assert.equal(porAno.get(2025)![0], 9595);
  assert.equal(porAno.get(2026)![0], 8336);
  assert.equal(Math.round(porAno.get(2025)![1] / 1e9), 642); // R$ 6,42 bi (centavos / 1e9)
  assert.equal(Math.round(porAno.get(2026)![1] / 1e9), 582); // R$ 5,82 bi
});
