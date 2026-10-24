/**
 * A conta do navegador (`public/explorar-conta.js`) contra a do build
 * (`recorteDe` de `lib/explorar.ts`). A primeira tela do /explorar sai do
 * build e as seguintes saem do script: se as duas divergissem, o número
 * mudaria no primeiro clique sem o filtro ter mudado. Espec:
 * `especs/numeros-publicos-explorar.md`, §6 e §10.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";

import {
  arquivoDoIndicador, entradasDoIndice, FAIXAS_POPULACAO, formatarExplorar,
  impressaoDaOrdem, INDICADOR_PADRAO, INDICADORES_EXPLORAR, recorteDe,
  type FiltroExplorar, type FontesExplorar,
} from "../lib/explorar.ts";
import type { Snapshot } from "../lib/dados.ts";

// @ts-expect-error: o `public/` é JavaScript puro, sem tipos (`allowJs: false`).
import * as conta from "../public/explorar-conta.js";

const ler = (nome: string) =>
  JSON.parse(fs.readFileSync(new URL(`../dados/${nome}`, import.meta.url), "utf-8"));
const snapshot = ler("snapshot.json") as Snapshot;
const fontes: FontesExplorar = {
  snapshot, fiscal: ler("fiscal.json"), ideb: ler("ideb.json"),
  idebFinais: ler("ideb-finais.json"), caged: ler("caged.json"), emendas: ler("emendas.json"),
};
const entradas = entradasDoIndice(snapshot);
// O que o navegador recebe: as linhas do `indice.json`, como a rota as escreve.
const indice = entradas.map((x) => (x.estado ? [x.nome, x.uf, 1] : [x.nome, x.uf]));
const doIndice = conta.expandirIndice(JSON.parse(JSON.stringify(indice)));
const ufs = snapshot.ufs.map((u) => ({ sigla: u.sigla, regiao: u.regiao }));
const regioes = [...new Set(ufs.map((u) => u.regiao))];
const arquivos = new Map(INDICADORES_EXPLORAR.map((i) =>
  // Pelo JSON, como o navegador lê: o que não sobrevive a ele não vale no teste.
  [i.chave, JSON.parse(JSON.stringify(arquivoDoIndicador(i, fontes)))]));

const filtros: [string, FiltroExplorar][] = [
  ["Brasil", {}],
  ...regioes.map((r): [string, FiltroExplorar] => [r, { regiao: r }]),
  ...ufs.map((u): [string, FiltroExplorar] => [u.sigla, { uf: u.sigla }]),
  ...FAIXAS_POPULACAO.map((f, i): [string, FiltroExplorar] => [f.rotulo, { faixa: i }]),
  ...regioes.flatMap((r) => FAIXAS_POPULACAO.map((f, i): [string, FiltroExplorar] =>
    [`${r} × ${f.rotulo}`, { regiao: r, faixa: i }])),
];

test("explorar-conta: o índice expandido é o do build, e a impressão digital é a mesma", () => {
  assert.equal(doIndice.length, entradas.length);
  doIndice.forEach((e: { nome: string; uf: string; estado: boolean }, i: number) => {
    assert.deepEqual([e.nome, e.uf, e.estado], [entradas[i]!.nome, entradas[i]!.uf, entradas[i]!.estado]);
  });
  assert.equal(conta.impressaoDaOrdem(doIndice), impressaoDaOrdem(entradas));
  assert.deepEqual(conta.FAIXAS, FAIXAS_POPULACAO.map((f) => f.rotulo));
});

test("explorar-conta: o recorte é igual ao do build nos 16 indicadores × 75 recortes", () => {
  assert.equal(INDICADORES_EXPLORAR.length, 16);
  assert.equal(filtros.length, 1 + 5 + 27 + 7 + 35);
  for (const ind of INDICADORES_EXPLORAR) {
    const arquivo = arquivos.get(ind.chave)!;
    for (const [nome, filtro] of filtros) {
      const onde = `${ind.chave} em ${nome}`;
      const build = recorteDe(ind, arquivo, entradas, ufs, filtro);
      const nav = conta.recorte(ind, arquivo, doIndice, ufs, filtro);
      assert.equal(nav.agregado, build.agregado, `${onde}: agregado`);
      assert.equal(nav.municipios, build.municipios, `${onde}: municípios`);
      assert.equal(nav.semDado, build.semDado, `${onde}: sem dado`);
      assert.deepEqual(nav.porUf, build.porUf, `${onde}: por UF`);
      assert.equal(nav.linhas.length, build.linhas.length, `${onde}: linhas`);
      build.linhas.forEach((l, k) => {
        const n = nav.linhas[k];
        // A linha do navegador aponta para a posição no índice; o código
        // dessa posição tem de ser o do município que o build pôs ali.
        assert.deepEqual([n.nome, n.uf, n.valor, entradas[n.i]!.codigo],
          [l.nome, l.uf, l.valor, l.codigo], `${onde}: linha ${k + 1}`);
      });
    }
  }
});

test("explorar-conta: o formato é o do build em todo agregado e numa amostra das linhas", () => {
  for (const ind of INDICADORES_EXPLORAR) {
    const arquivo = arquivos.get(ind.chave)!;
    const valores = new Set<number | null>([null, ...arquivo.valores.slice(0, 300)]);
    for (const [, filtro] of filtros.slice(0, 40)) {
      const r = recorteDe(ind, arquivo, entradas, ufs, filtro);
      valores.add(r.agregado);
      for (const v of Object.values(r.porUf)) valores.add(v);
    }
    for (const v of valores) {
      assert.equal(conta.formatar(v, ind), formatarExplorar(v, ind), `${ind.chave}: ${v}`);
    }
  }
});

test("explorar-conta: arquivo de outra ordem não casa com o índice (armadilha 1)", () => {
  const arquivo = arquivos.get(INDICADOR_PADRAO)!;
  assert.equal(conta.casaComIndice(arquivo, doIndice), true);
  // Plantado: dois vizinhos trocados, como num índice novo com arquivo velho.
  const trocado = [...doIndice];
  [trocado[10], trocado[11]] = [trocado[11], trocado[10]];
  assert.equal(conta.casaComIndice(arquivo, trocado), false);
  // Plantado: um município a menos.
  assert.equal(conta.casaComIndice(arquivo, doIndice.slice(1)), false);
  assert.equal(conta.casaComIndice({ ...arquivo, valores: arquivo.valores.slice(1) }, doIndice), false);
});

test("explorar-conta: o endereço inválido cai fora e pede limpeza (armadilha 4)", () => {
  const chaves = INDICADORES_EXPLORAR.map((i) => i.chave);
  const ler = (q: string) => conta.lerFiltro(new URLSearchParams(q), chaves, ufs, INDICADOR_PADRAO);
  const sulUf = ufs.find((u) => u.regiao === "Sul")!.sigla;
  const nordesteUf = ufs.find((u) => u.regiao === "Nordeste")!.sigla;

  assert.deepEqual(ler(""), { indicador: INDICADOR_PADRAO, filtro: {}, invalido: false });
  assert.deepEqual(ler(`i=renda&regiao=Sul&uf=${sulUf}&pop=6`),
    { indicador: "renda", filtro: { regiao: "Sul", uf: sulUf, faixa: 6 }, invalido: false });
  assert.deepEqual(ler("pop=0"), { indicador: INDICADOR_PADRAO, filtro: { faixa: 0 }, invalido: false });
  for (const q of ["i=nada", "regiao=Atlantida", "uf=XX", "uf=sp", "pop=7", "pop=-1", "pop=1.5", "pop="]) {
    const r = ler(q);
    assert.equal(r.invalido, true, q);
    assert.deepEqual(r.filtro, {}, q);
    assert.equal(r.indicador, INDICADOR_PADRAO, q);
  }
  // UF fora da região pedida: fica a região, a UF cai.
  assert.deepEqual(ler(`regiao=Sul&uf=${nordesteUf}`),
    { indicador: INDICADOR_PADRAO, filtro: { regiao: "Sul" }, invalido: true });
});
