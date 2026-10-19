/**
 * Os arquivos da página /explorar: o erro deles é silencioso. Uma ordem
 * desencontrada do `indice.json` mostra o valor do vizinho; um agregado pela
 * média das taxas mostra um número que nenhuma página do site mostra.
 * Espec: `especs/numeros-publicos-explorar.md`, §6 e §10.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import zlib from "node:zlib";

import {
  arquivoDoIndicador, entradasDoIndice, FAIXAS_POPULACAO, faixaPopulacao,
  impressaoDaOrdem, INDICADORES_EXPLORAR,
} from "../lib/explorar.ts";
import { mediana } from "../lib/censo.ts";
import { panoramaEstados } from "../lib/nacional.ts";
import type { Snapshot } from "../lib/dados.ts";
import type { SnapshotFiscal } from "../lib/fiscal.ts";

const ler = (nome: string) =>
  JSON.parse(fs.readFileSync(new URL(`../dados/${nome}`, import.meta.url), "utf-8"));
const snapshot = ler("snapshot.json") as Snapshot;
const fiscal = ler("fiscal.json") as SnapshotFiscal;
const arquivos = new Map(INDICADORES_EXPLORAR.map((i) =>
  [i.chave, arquivoDoIndicador(i, snapshot, fiscal)]));
const entradas = entradasDoIndice(snapshot);

test("explorar: faixas de população nos limites do IBGE, fechadas em cima", () => {
  assert.equal(FAIXAS_POPULACAO.length, 7);
  assert.equal(faixaPopulacao(5_000), 0);
  assert.equal(faixaPopulacao(5_001), 1);
  assert.equal(faixaPopulacao(500_000), 5);
  assert.equal(faixaPopulacao(500_001), 6);
  assert.equal(faixaPopulacao(null), null);
  assert.equal(faixaPopulacao(-1), null);
});

test("explorar: chaves únicas e cada coluna existe no snapshot", () => {
  const chaves = INDICADORES_EXPLORAR.map((i) => i.chave);
  assert.equal(new Set(chaves).size, chaves.length);
  for (const i of INDICADORES_EXPLORAR) {
    const cols = i.tipo === "razao" ? [i.numerador, i.denominador, i.valorPublicado]
      : i.tipo === "soma" ? [i.coluna] : [];
    for (const c of cols) if (c) assert.ok(snapshot.colunas.includes(c), `${i.chave}: ${c}`);
  }
});

test("explorar: cada arquivo tem uma linha por entrada do índice, na mesma ordem", () => {
  const ordem = impressaoDaOrdem(entradas);
  for (const [chave, a] of arquivos) {
    assert.equal(a.valores.length, entradas.length, chave);
    assert.equal(a.faixas.length, entradas.length, chave);
    assert.equal(a.ordem, ordem, chave);
  }
  // A ordem é a do índice de busca: 5.571 municípios + 27 estados.
  assert.equal(entradas.length, snapshot.municipios.length + snapshot.ufs.length);
});

test("explorar: a impressão digital muda com a ordem (pega o arquivo de outro build)", () => {
  const trocada = [entradas[1]!, entradas[0]!, ...entradas.slice(2)];
  assert.notEqual(impressaoDaOrdem(trocada), impressaoDaOrdem(entradas));
});

test("explorar: valor do município na linha dele (plantado: o de São Paulo)", () => {
  const i = snapshot.colunas.indexOf("populacao-estimada");
  const sp = snapshot.municipios.find((m) => Number(m[0]) === 3550308)!;
  const linha = entradas.findIndex((e) => e.codigo === 3550308);
  assert.equal(arquivos.get("populacao")!.valores[linha], sp[i]);
  assert.equal(arquivos.get("populacao")!.faixas[linha], "6");
});

test("explorar: agregado da UF pela razão das somas é o das páginas de estado", () => {
  for (const ind of INDICADORES_EXPLORAR) {
    if (ind.tipo !== "razao") continue;
    const a = arquivos.get(ind.chave)!;
    for (const u of snapshot.ufs) {
      const n = u.totais[ind.numerador] ?? null;
      const d = u.totais[ind.denominador] ?? null;
      if (n === null || !d) continue;
      const pagina = (ind.mult * n) / d;
      const linha = entradas.findIndex((e) => e.estado && e.uf === u.sigla);
      const v = a.valores[linha]!;
      // as células só somam quem tem os dois lados; a tolerância é a do
      // arredondamento gravado (1 casa no %, real inteiro)
      const tol = ind.formato === "pct" ? 0.051 : 0.51 + pagina * 1e-6;
      assert.ok(Math.abs(v - pagina) <= tol, `${ind.chave} ${u.sigla}: ${v} × ${pagina}`);
    }
  }
});

test("explorar: as células de cada UF somam o total da UF", () => {
  const pop = arquivos.get("populacao")!;
  for (const u of snapshot.ufs) {
    const soma = pop.celulas.filter((c) => c[0] === u.sigla)
      .reduce((s, c) => s + Number(c[2]), 0);
    assert.equal(soma, u.totais["populacao-estimada"], u.sigla);
  }
});

test("explorar: mediana do pessoal por UF é a do panorama dos estados", () => {
  const a = arquivos.get("pessoal")!;
  for (const e of panoramaEstados(fiscal)) {
    const linha = entradas.findIndex((x) => x.estado && x.uf === e.uf);
    const esperado = e.municipios > 0 && e.mediana !== null ? Math.round(e.mediana * 100) / 100 : null;
    assert.equal(a.valores[linha], esperado, e.uf);
    // e a mediana dos valores municipais do arquivo bate com ela
    const doArquivo = entradas.map((x, k) => (!x.estado && x.uf === e.uf ? a.valores[k] : null))
      .filter((v): v is number => v !== null);
    if (esperado !== null) assert.ok(Math.abs(mediana(doArquivo)! - esperado) <= 0.01, e.uf);
  }
});

test("explorar: peso de cada arquivo dentro do orçamento da espec (§8)", () => {
  for (const [chave, a] of arquivos) {
    const gz = zlib.gzipSync(JSON.stringify(a), { level: 9 }).length;
    assert.ok(gz < 25_000, `${chave}: ${gz} bytes gzip`);
  }
});
