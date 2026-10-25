/**
 * O governo estadual: o contrato com o `estados-fiscal.json` que o motor
 * escreve (`exportar-estados`) e as leituras que a página de estado faz dele.
 * Espec: `especs/painel-fiscal-estados.md`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";

import {
  FUNCOES_DA_SERIE, fatiasDoAno, governoDe, serieDaFuncao, ultimoAno,
  type SnapshotEstadosFiscal,
} from "../lib/estados-fiscal.ts";

const ler = (caminho: string) =>
  fs.readFileSync(new URL(caminho, import.meta.url), "utf-8");
const real = JSON.parse(ler("../dados/estados-fiscal.json")) as SnapshotEstadosFiscal;

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

test("o arquivo real tem os 26 estados e o DF, uma vez cada", () => {
  const ufs = Object.values(real.estados).map((g) => g.uf).sort();
  assert.deepEqual(ufs, UFS);
  for (const sigla of UFS) assert.ok(governoDe(real, sigla), sigla);
  assert.equal(governoDe(real, "XX"), null);
});

test("as colunas do arquivo são as do tipo, na mesma ordem", () => {
  // `PessoalDoAno` e `FuncoesDoAno` são tuplas: a página lê pela posição, e
  // uma coluna nova no meio trocaria o limite pelo percentual sem erro.
  assert.deepEqual(real.colunasPessoal,
    ["rclAjustada", "despesa", "percentual", "limitePrudencial", "limiteLegal"]);
  assert.deepEqual(real.colunasFuncoes, ["total", "valores"]);
});

test("o limite legal é 49% ou 48,6% (LRF, art. 20) e o prudencial, 95% dele", () => {
  for (const g of Object.values(real.estados)) {
    for (const [ano, p] of Object.entries(g.pessoal)) {
      const [, , percentual, prudencial, legal] = p;
      assert.ok(legal === 49 || legal === 48.6, `${g.uf} ${ano}: ${legal}`);
      assert.ok(Math.abs(prudencial - legal * 0.95) < 0.01, `${g.uf} ${ano}: ${prudencial}`);
      assert.ok(percentual > 0 && percentual < 100, `${g.uf} ${ano}: ${percentual}`);
    }
  }
  // Os três com tribunal de contas dos municípios.
  for (const sigla of ["BA", "GO", "PA"]) {
    const g = governoDe(real, sigla)!;
    assert.equal(g.pessoal[String(ultimoAno(g.pessoal))][4], 48.6, sigla);
  }
  assert.equal(governoDe(real, "SP")!.pessoal[String(ultimoAno(governoDe(real, "SP")!.pessoal))][4], 49);
});

test("as fatias de um ano somam o total declarado e vêm da maior para a menor", () => {
  for (const g of Object.values(real.estados)) {
    const ano = ultimoAno(g.funcoes)!;
    const { total, fatias } = fatiasDoAno(real, g, ano)!;
    const soma = fatias.reduce((s, f) => s + f.valor, 0);
    assert.ok(Math.abs(soma - total) < 0.01, `${g.uf} ${ano}: ${soma} != ${total}`);
    for (let i = 1; i < fatias.length; i++) assert.ok(fatias[i - 1].valor >= fatias[i].valor);
    for (const f of fatias) assert.equal(typeof f.nome, "string", `${g.uf}: índice ${f.funcao}`);
  }
  assert.equal(fatiasDoAno(real, governoDe(real, "SP")!, 1990), null);
});

test("a série de uma função vai do ano mais velho ao mais novo, com null onde falta", () => {
  const sp = governoDe(real, "SP")!;
  for (const nome of FUNCOES_DA_SERIE) {
    assert.ok(real.rotulos.includes(nome), nome);
    const serie = serieDaFuncao(real, sp, nome);
    assert.deepEqual(serie.map((p) => p.ano), [...real.exercicios].sort((a, b) => a - b));
    assert.ok(serie.every((p) => p.valor !== null && p.valor > 0), nome);
  }
  // Um ano sem relatório e uma função que não existe dão null, não zero.
  const semAno = { ...sp, funcoes: { ...sp.funcoes } };
  delete semAno.funcoes[String(real.exercicios[0])];
  assert.equal(serieDaFuncao(real, semAno, "Saúde").at(-1)!.valor, null);
  assert.ok(serieDaFuncao(real, sp, "Inexistente").every((p) => p.valor === null));
});
