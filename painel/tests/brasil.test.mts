/**
 * O Brasil ao longo do tempo: o contrato com o JSON que o Python escreve, a
 * aritmética do tempo (onde um erro desloca a faixa de uma posse sem nada
 * acusar) e as regras de neutralidade da espec (seção 4), que aqui viram
 * teste em vez de intenção.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";

import {
  anoDecimal, anosDoEixo, anosHerdados, APRESENTACAO, casasDe, cobertura,
  contiguos, dominio, escala, faixas, fimPeriodo, inicioPeriodo, meioPeriodo,
  resumo, rotuloPeriodo, SELO, trechosMeta,
  type Mandato, type SerieBrasil, type SnapshotBrasil,
} from "../lib/brasil.ts";

const ler = (caminho: string) =>
  fs.readFileSync(new URL(caminho, import.meta.url), "utf-8");
const real = JSON.parse(ler("../dados/brasil.json")) as SnapshotBrasil;

const perto = (a: number, b: number, msg?: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, msg ?? `${a} != ${b}`);

const m = (nome: string, inicio: string, fim: string | null): Mandato => ({
  nome, inicio, fim, como: "", fonte: "https://exemplo.gov.br/", rotulo: nome,
});

const serie = (codigo: string, pontos: [string, number][]): SerieBrasil => ({
  codigo, nome: codigo, unidade: "%", fonte: "IBGE", periodicidade: "mensal",
  origem: "", conferida: "", coletadoEm: "2026-10-05T00:00:00+00:00", pontos,
});

// ------------------------------------------------------------- contrato

test("brasil: o JSON real tem as chaves que o tipo declara", () => {
  assert.deepEqual(Object.keys(real).sort(), ["mandatos", "metaInflacao", "series"]);
  assert.deepEqual(Object.keys(real.metaInflacao).sort(),
    ["anos", "coletadoEm", "conferida", "fonte", "origem"]);
  for (const a of real.metaInflacao.anos) assert.equal(a.length, 3, String(a));
  for (const s of real.series) {
    assert.deepEqual(Object.keys(s).sort(), ["codigo", "coletadoEm", "conferida",
      "fonte", "nome", "origem", "periodicidade", "pontos", "unidade"]);
    assert.ok(s.pontos.length >= 2, s.codigo);
  }
  for (const x of real.mandatos) {
    assert.deepEqual(Object.keys(x).sort(),
      ["como", "fim", "fonte", "inicio", "nome", "rotulo"]);
  }
});

test("brasil: toda série do JSON tem apresentação, e nenhuma apresentação sobra", () => {
  const codigos = real.series.map((s) => s.codigo).sort();
  assert.deepEqual(Object.keys(APRESENTACAO).sort(), codigos);
});

// ----------------------------------------------------------------- leitura

test("leitura: toda série diz o que mede e para que lado é melhor", () => {
  for (const [codigo, ap] of Object.entries(APRESENTACAO)) {
    assert.ok(ap.como.length > 20, `${codigo}: sem a frase de leitura`);
    assert.ok(ap.melhor in SELO, `${codigo}: ${ap.melhor}`);
  }
  // Uma só se lê pela meta, e é a que tem a meta no JSON.
  assert.deepEqual(Object.entries(APRESENTACAO)
    .filter(([, ap]) => ap.melhor === "meta").map(([c]) => c), ["ipca"]);
});

test("leitura: o zero só divide a leitura onde a série real o cruza", () => {
  for (const s of real.series) {
    const ap = APRESENTACAO[s.codigo]!;
    if (!ap.zero) continue;
    const vs = s.pontos.map((p) => p[1]);
    assert.ok(Math.min(...vs) < 0 && Math.max(...vs) > 0,
      `${s.codigo}: rótulos dos dois lados do zero numa série de um lado só`);
  }
});

test("meta: a faixa vai ano a ano, recortada à cobertura e com as pontas em centésimos", () => {
  const anos: [number, number, number][] = [[1999, 8, 2], [2000, 6, 2], [2001, 4.5, 2.05]];
  const t = trechosMeta(anos, 1999.5, 2001.25);
  assert.deepEqual(t.map((x) => [x.ano, x.de, x.ate, x.inferior, x.superior]), [
    [1999, 1999.5, 2000, 6, 10],
    [2000, 2000, 2001, 4, 8],
    [2001, 2001, 2001.25, 2.45, 6.55],
  ]);
  // fora da cobertura, nada
  assert.deepEqual(trechosMeta(anos, 2005, 2006), []);
});

test("meta: no JSON real, de 1999 em diante sem buraco, e dentro do IPCA", () => {
  const anos = real.metaInflacao.anos.map((a) => a[0]);
  assert.equal(anos[0], 1999);
  assert.deepEqual(anos, anos.map((_, i) => 1999 + i));
  for (const [ano, meta, tol] of real.metaInflacao.anos) {
    assert.ok(tol > 0 && tol < meta, `${ano}: tolerância ${tol} para meta ${meta}`);
  }
  const ipca = real.series.find((s) => s.codigo === "ipca")!;
  const [de, ate] = cobertura(ipca);
  assert.equal(trechosMeta(real.metaInflacao.anos, de, ate).length, anos.length,
    "todo ano da meta cai dentro da cobertura do IPCA");
});

test("brasil: os períodos de cada série vêm em ordem e sem repetição", () => {
  for (const s of real.series) {
    for (let i = 1; i < s.pontos.length; i++) {
      assert.ok(inicioPeriodo(s.pontos[i]![0]) > inicioPeriodo(s.pontos[i - 1]![0]),
        `${s.codigo}: ${s.pontos[i - 1]![0]} antes de ${s.pontos[i]![0]}`);
    }
  }
});

test("brasil: só quem ocupa hoje fica sem fim, e é o último", () => {
  const abertos = real.mandatos.filter((x) => x.fim === null);
  assert.equal(abertos.length, 1);
  assert.equal(real.mandatos.at(-1)!.fim, null);
});

// ---------------------------------------------------------------- tempo

test("brasil: começo, fim e meio do período", () => {
  perto(inicioPeriodo("1996T1"), 1996);
  perto(inicioPeriodo("1996T2"), 1996.25);
  perto(fimPeriodo("1996T4"), 1997);
  perto(inicioPeriodo("1995-07"), 1995.5);
  perto(fimPeriodo("2026-12"), 2027);
  perto(meioPeriodo("1996T1"), 1996.125);
  assert.throws(() => inicioPeriodo("1996-13"));
  assert.throws(() => inicioPeriodo("1996T5"));
});

test("brasil: data em ano decimal", () => {
  perto(anoDecimal("2003-01-01"), 2003);
  // 31/08/2016: dia 243 de um ano bissexto de 366
  perto(anoDecimal("2016-08-31"), 2016 + 243 / 366);
});

test("brasil: rótulo do período", () => {
  assert.equal(rotuloPeriodo("1996T1"), "1º tri. 1996");
  assert.equal(rotuloPeriodo("1995-07"), "jul. 1995");
  assert.equal(rotuloPeriodo("2026-05"), "maio 2026");
});

test("brasil: vizinhos no tempo, inclusive na virada do ano", () => {
  assert.ok(contiguos("1996T4", "1997T1"));
  assert.ok(contiguos("2026-12", "2027-01"));
  assert.ok(!contiguos("1996T1", "1996T3"), "buraco de um trimestre");
  assert.ok(!contiguos("2020-01", "2020-03"), "buraco de um mês");
});

test("brasil: o eixo é COMUM, do começo mais antigo ao fim mais recente", () => {
  const a = serie("a", [["2012-01", 1], ["2012-02", 2]]);
  const b = serie("b", [["1995-07", 1], ["1995-08", 2]]);
  const [de, ate] = dominio([a, b]);
  perto(de, 1995.5);
  perto(ate, fimPeriodo("2012-02"));
  // e no JSON real: nenhuma série sai do eixo
  const [d, t] = dominio(real.series);
  for (const s of real.series) {
    const [c0, c1] = cobertura(s);
    assert.ok(c0 >= d && c1 <= t, s.codigo);
  }
});

test("brasil: as marcas do eixo são os múltiplos de 5", () => {
  assert.deepEqual(anosDoEixo([1995.5, 2026.7]), [2000, 2005, 2010, 2015, 2020, 2025]);
  assert.deepEqual(anosDoEixo([1995, 2000]), [1995, 2000]);
});

// ------------------------------------------------------------- mandatos

const MANDATOS = [
  m("A", "1995-01-01", "1999-01-01"),
  m("A", "1999-01-01", "2003-01-01"),
  m("B", "2003-01-01", "2011-01-01"),
  m("C", "2011-01-01", "2016-05-12"),
  m("D", "2016-05-12", "2016-08-31"),
  m("D", "2016-08-31", "2019-01-01"),
  m("E", "2019-01-01", null),
];

test("brasil: períodos seguidos da mesma pessoa viram uma faixa, com divisa", () => {
  const f = faixas(MANDATOS, 1990, 2030);
  assert.deepEqual(f.map((x) => x.nome), ["A", "B", "C", "D", "E"]);
  assert.deepEqual(f[0]!.divisas, [1999]);
  perto(f[3]!.divisas[0]!, anoDecimal("2016-08-31"));
  // quem ocupa hoje vai até o fim do intervalo
  perto(f[4]!.ate, 2030);
});

test("brasil: o tom alterna pela ordem das PESSOAS, não dos períodos", () => {
  const f = faixas(MANDATOS, 1990, 2030);
  assert.deepEqual(f.map((x) => x.tom), [0, 1, 0, 1, 0]);
});

test("brasil: a faixa é recortada à cobertura e não se estende para trás", () => {
  const f = faixas(MANDATOS, 2012, 2020);
  assert.deepEqual(f.map((x) => x.nome), ["C", "D", "E"]);
  perto(f[0]!.de, 2012);
  perto(f[2]!.ate, 2020);
  // a divisa de A (1999) ficou fora; a de D continua
  assert.equal(f.flatMap((x) => x.divisas).length, 1);
  // e o tom NÃO muda com o recorte: C é escuro aqui e na série inteira
  assert.equal(f[0]!.tom, faixas(MANDATOS, 1990, 2030)[2]!.tom);
});

test("brasil: no JSON real, a desocupação começa em 2012 e a faixa também", () => {
  const s = real.series.find((x) => x.codigo === "desocupacao")!;
  const [c0, c1] = cobertura(s);
  const f = faixas(real.mandatos, c0, c1);
  perto(f[0]!.de, c0);
  assert.ok(c0 >= 2012 && c0 < 2013);
});

test("brasil: o ano da posse vai do dia da posse ao 1º de janeiro seguinte", () => {
  const h = anosHerdados(MANDATOS, 1990, 2030);
  // a posse interina e a definitiva de D caem no mesmo ano e se unem
  const d = h.find(([a]) => a > 2016 && a < 2017)!;
  perto(d[0], anoDecimal("2016-05-12"));
  perto(d[1], 2017);
  assert.equal(h.filter(([a]) => a > 2016 && a < 2017).length, 1);
  // recortado à cobertura
  const r = anosHerdados(MANDATOS, 2003.5, 2020);
  perto(r[0]![0], 2003.5);
  perto(r[0]![1], 2004);
});

// --------------------------------------------------------------- valores

test("brasil: a escala cobre os valores com marcas redondas", () => {
  for (const vs of [[-4.5, 7.5], [5.1, 14.9], [3061, 3795], [1.65, 27.45],
    [51.27, 87.66], [-4.08, 9.24]]) {
    const e = escala(vs);
    assert.ok(e.baixo <= Math.min(...vs) && e.alto >= Math.max(...vs), String(vs));
    assert.ok(e.marcas.length >= 3 && e.marcas.length <= 7, `${vs}: ${e.marcas}`);
    perto(e.marcas[0]!, e.baixo);
    perto(e.marcas.at(-1)!, e.alto);
  }
  // série que cruza o zero tem o zero entre as marcas
  assert.ok(escala([-4.5, 7.5]).marcas.includes(0));
});

test("brasil: casas decimais e resumo sem verbo de tendência", () => {
  assert.equal(casasDe(serie("x", [["2020-01", 3061], ["2020-02", 3100]])), 0);
  assert.equal(casasDe(serie("x", [["2020-01", 1.5], ["2020-02", 1.65]])), 2);
  const r = resumo(serie("x", [["2020-01", 2], ["2020-02", 1], ["2020-03", 3]]));
  assert.deepEqual(r, {
    primeiro: ["2020-01", 2], ultimo: ["2020-03", 3],
    menor: ["2020-02", 1], maior: ["2020-03", 3],
  });
});

// --------------------------------------------------------- neutralidade

const COMPONENTE = ler("../app/componentes/serie-brasil-svg.tsx");
const PAGINA = ler("../app/brasil/page.tsx");
const CSS_COMPONENTE = ler("../app/componentes/serie-brasil.module.css");
const LIB = ler("../lib/brasil.ts");

test("neutralidade: nenhum partido nem sigla partidária na página", () => {
  const siglas = /\b(PT|PSDB|PL|MDB|PMDB|PSL|PSB|PDT|PP|PSD|União Brasil)\b/;
  for (const [nome, texto] of [["componente", COMPONENTE], ["página", PAGINA],
    ["apresentação", LIB]]) {
    assert.ok(!siglas.test(texto!), `${nome}: ${siglas.exec(texto!)?.[0]}`);
  }
  for (const x of real.mandatos) {
    assert.ok(!siglas.test(`${x.nome} ${x.rotulo} ${x.como}`), x.nome);
  }
});

test("neutralidade: as faixas são cinzas nos três modos, sem cor de partido", () => {
  const css = ler("../app/globals.css");
  for (const tom of [0, 1]) {
    const cores = [...css.matchAll(new RegExp(`--faixa-${tom}:\\s*#([0-9a-f]{6})`, "g"))]
      .map((x) => x[1]!);
    assert.equal(cores.length, 3, `--faixa-${tom} em claro, escuro e impressão`);
    for (const c of cores) {
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
      const espalho = Math.max(r!, g!, b!) - Math.min(r!, g!, b!);
      assert.ok(espalho <= 28, `#${c} não é cinza (espalho ${espalho})`);
    }
  }
  // e a cor das faixas sai só das duas variáveis
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(CSS_COMPONENTE), "cor literal no CSS do gráfico");
  assert.ok(!/(fill|stroke)="#/.test(COMPONENTE), "cor literal no SVG");
});

test("neutralidade: a nota de que as faixas não medem efeito, na página e em cada gráfico", () => {
  assert.match(COMPONENTE, /não medem\s+efeito/);
  assert.match(PAGINA, /não medem\s+efeito/);
});

test("neutralidade: todos os gráficos recebem o MESMO eixo", () => {
  const usos = [...PAGINA.matchAll(/<SerieBrasilSvg[^>]*>/gs)].map((x) => x[0]);
  assert.equal(usos.length, 1, "um uso só, dentro do map das séries");
  assert.match(usos[0]!, /dominio=\{eixo\}/);
  assert.match(PAGINA, /const eixo = dominio\(b\.series\)/);
});

test("neutralidade: nenhum evento anotado além das trocas no cargo", () => {
  // O SVG escreve os rótulos das faixas, os eixos, o começo da série, a
  // leitura (melhor e pior, ou os dois lados do zero) e o nome da faixa da
  // meta. Um <text> novo com outra coisa reprova aqui até alguém decidir de
  // propósito.
  const textos = [...COMPONENTE.matchAll(/<text[^>]*>\s*([^<]*)/g)].map((x) => x[1]!.trim());
  assert.deepEqual(textos, ["{f.rotulo}", "{br(v, Number.isInteger(v) ? 0 : 1)}", "{a}", "",
    "{l.texto}", "faixa da meta"]);
});

test("neutralidade: a leitura é escrita, sem verde nem vermelho", () => {
  // As variáveis de cor de juízo do site não entram no gráfico do país.
  assert.ok(!/var\(--(positivo|alerta|atencao)\)/.test(CSS_COMPONENTE));
});
