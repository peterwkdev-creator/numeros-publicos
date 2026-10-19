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
  arquivoDoIndicador, COLUNAS_DE_FORA, entradasDoIndice, FAIXAS_POPULACAO, faixaPopulacao,
  impressaoDaOrdem, INDICADORES_EXPLORAR, type FontesExplorar,
} from "../lib/explorar.ts";
import { cagedDeVarios, totalDoPais, type SnapshotCaged } from "../lib/caged.ts";
import { emendasDeVarios, porHabitante, type SnapshotEmendas } from "../lib/emendas.ts";
import { medianaUltimaEdicao, type SnapshotIdeb } from "../lib/ideb.ts";
import { mediana } from "../lib/censo.ts";
import { panoramaEstados } from "../lib/nacional.ts";
import type { Snapshot } from "../lib/dados.ts";
import type { SnapshotFiscal } from "../lib/fiscal.ts";

const ler = (nome: string) =>
  JSON.parse(fs.readFileSync(new URL(`../dados/${nome}`, import.meta.url), "utf-8"));
const snapshot = ler("snapshot.json") as Snapshot;
const fiscal = ler("fiscal.json") as SnapshotFiscal;
const ideb = ler("ideb.json") as SnapshotIdeb;
const idebFinais = ler("ideb-finais.json") as SnapshotIdeb;
const caged = ler("caged.json") as SnapshotCaged;
const emendas = ler("emendas.json") as SnapshotEmendas;
const fontes: FontesExplorar = { snapshot, fiscal, ideb, idebFinais, caged, emendas };
const arquivos = new Map(INDICADORES_EXPLORAR.map((i) =>
  [i.chave, arquivoDoIndicador(i, fontes)]));
const entradas = entradasDoIndice(snapshot);
const linhaDaUf = (uf: string) => entradas.findIndex((e) => e.estado && e.uf === uf);
const codigosDaUf = (uf: string) =>
  snapshot.municipios.filter((m) => m[2] === uf).map((m) => Number(m[0]));
const duas = (v: number) => Math.round(v * 100) / 100;

test("explorar: faixas de população nos limites do IBGE, fechadas em cima", () => {
  assert.equal(FAIXAS_POPULACAO.length, 7);
  assert.equal(faixaPopulacao(5_000), 0);
  assert.equal(faixaPopulacao(5_001), 1);
  assert.equal(faixaPopulacao(500_000), 5);
  assert.equal(faixaPopulacao(500_001), 6);
  assert.equal(faixaPopulacao(null), null);
  assert.equal(faixaPopulacao(-1), null);
});

test("explorar: chaves únicas e cada coluna existe no snapshot ou vem de fora", () => {
  const chaves = INDICADORES_EXPLORAR.map((i) => i.chave);
  assert.equal(new Set(chaves).size, chaves.length);
  assert.equal(chaves.length, 16); // os 12 da 1a + IDEB (2), Caged e emendas
  for (const i of INDICADORES_EXPLORAR) {
    const cols = i.tipo === "razao" ? [i.numerador, i.denominador, i.valorPublicado] : [i.coluna];
    for (const c of cols) {
      if (c) assert.ok(snapshot.colunas.includes(c) || c in COLUNAS_DE_FORA, `${i.chave}: ${c}`);
    }
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
    if (ind.tipo !== "razao" || ind.numerador in COLUNAS_DE_FORA) continue;
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

test("explorar: saldo do Caged por UF é o da página do estado, e o país fecha", () => {
  const a = arquivos.get("caged")!;
  let soma = 0;
  for (const u of snapshot.ufs) {
    const pagina = cagedDeVarios(caged, codigosDaUf(u.sigla));
    assert.equal(a.valores[linhaDaUf(u.sigla)], pagina?.saldo ?? null, u.sigla);
    soma += pagina?.saldo ?? 0;
  }
  // os 27 mais o que o MTE não atribui a município dão o saldo oficial do país
  const naoId = caged.naoIdentificado[0].reduce((s, x) => s + x, 0)
    - caged.naoIdentificado[1].reduce((s, x) => s + x, 0);
  assert.equal(soma + naoId, totalDoPais(caged).saldo);
});

test("explorar: IDEB por UF é a mediana do cartão do estado, nas duas etapas", () => {
  for (const [chave, s] of [["ideb-iniciais", ideb], ["ideb-finais", idebFinais]] as const) {
    const a = arquivos.get(chave)!;
    let comValor = 0;
    for (const u of snapshot.ufs) {
      const pagina = medianaUltimaEdicao(s, codigosDaUf(u.sigla));
      assert.equal(a.valores[linhaDaUf(u.sigla)], pagina ? duas(pagina.mediana) : null,
        `${chave} ${u.sigla}`);
      if (pagina) comValor += 1;
    }
    assert.ok(comValor >= 26, `${chave}: só ${comValor} UFs com IDEB`);
  }
});

test("explorar: emendas por habitante da UF dividem pela população inteira", () => {
  const a = arquivos.get("emendas")!;
  for (const u of snapshot.ufs) {
    const pago = emendasDeVarios(emendas, codigosDaUf(u.sigla)).cheio.reais;
    const pagina = porHabitante(pago, u.totais["populacao-estimada"]);
    assert.equal(a.valores[linhaDaUf(u.sigla)], pagina === null ? null : duas(pagina), u.sigla);
  }
  // Brasília não tem prefeitura: sem dado, nunca R$ 0,00 (nem no DF)
  assert.equal(a.valores[entradas.findIndex((e) => e.codigo === 5300108)], null);
  assert.equal(a.valores[linhaDaUf("DF")], null);
});
