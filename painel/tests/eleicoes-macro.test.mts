/**
 * Eleições 2026, a visão macro e a paleta dos partidos (26/10/2026).
 *
 * - Cada cor de partido tem contraste de 3:1 ou mais contra o fundo e a
 *   superfície, nos dois temas (lido do próprio CSS, para o número não ficar
 *   só no comentário); o vermelho e o azul do escuro, 4,5:1.
 * - Cada cargo do mapa cobre as 27 UFs, com uma cor que a paleta pinta.
 * - Empate no topo das cadeiras pinta "empate", nunca um dos partidos.
 * - Os links do cartão e os links velhos da página única apontam para ids
 *   que existem em /eleicoes-2026/dados/.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import type { Eleicoes2026 } from "../lib/eleicoes.ts";
import { cadeirasPorPartido, lider, senadoresPorPartido, vagasTotais, type Cargos2026 } from "../lib/eleicoes-cargos.ts";
import { montarMacro } from "../lib/eleicoes-macro.ts";
import { CORES, corDoPartido } from "../lib/partidos.ts";

const texto = (c: string) => fs.readFileSync(new URL(c, import.meta.url), "utf-8");
const ler = (c: string) => JSON.parse(texto(c));
const e = ler("../dados/eleicoes-2026.json") as Eleicoes2026;
const arquivoCargos = new URL("../dados/eleicoes-2026-cargos.json", import.meta.url);
const cargos = fs.existsSync(arquivoCargos) ? (JSON.parse(fs.readFileSync(arquivoCargos, "utf-8")) as Cargos2026) : null;

const css = texto("../app/componentes/partidos.module.css");
const globais = texto("../app/globals.css");
const dadosPage = texto("../app/eleicoes-2026/dados/page.tsx");
const macroPage = texto("../app/eleicoes-2026/page.tsx");
const macroJs = texto("../public/eleicoes-macro.js");

const luz = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contraste = (a: string, b: string) => {
  const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};

/** As variáveis de um bloco: o primeiro depois de `inicio`. */
function variaveis(fonte: string, inicio: number): Record<string, string> {
  const fim = fonte.indexOf("}", inicio);
  return Object.fromEntries([...fonte.slice(inicio, fim).matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]!.toLowerCase()]));
}
const escuroCss = css.indexOf("prefers-color-scheme: dark");
const temas = {
  claro: { cor: variaveis(css, css.indexOf(".paleta {")), base: variaveis(globais, globais.indexOf(":root")) },
  escuro: { cor: variaveis(css, escuroCss), base: variaveis(globais, globais.indexOf("prefers-color-scheme: dark")) },
};

test("partidos: cada cor tem 3:1 contra o fundo e a superfície nos dois temas", () => {
  for (const [nome, t] of Object.entries(temas)) {
    assert.ok(t.base["--fundo"] && t.base["--superficie"], `${nome}: fundo e superfície lidos do globals.css`);
    for (const chave of CORES) {
      const cor = t.cor[`--cor-${chave}`];
      assert.ok(cor, `${nome}: --cor-${chave} definida`);
      for (const fundo of [t.base["--fundo"]!, t.base["--superficie"]!]) {
        const r = contraste(cor!, fundo);
        assert.ok(r >= 3, `${nome}: --cor-${chave} ${cor} contra ${fundo} dá ${r.toFixed(2)}:1`);
      }
    }
  }
  // O vermelho e o azul dos candidatos também pintam texto no escuro: 4,5:1.
  for (const chave of ["pt", "pl"]) {
    const r = contraste(temas.escuro.cor[`--cor-${chave}`]!, temas.escuro.base["--superficie"]!);
    assert.ok(r >= 4.5, `escuro: --cor-${chave} contra a superfície dá ${r.toFixed(2)}:1`);
  }
  // O vermelho de verdade do pedido (perto de #ef4444), não o salmão de antes.
  assert.equal(temas.escuro.cor["--cor-pt"], "#ef4444");
  // Toda chave tem a regra que a pinta.
  for (const chave of [...CORES, "empate"]) assert.match(css, new RegExp(`\\[data-cor="${chave}"\\]`));
});

test("partidos: a cor segue a sigla, e o resto é 'outros'", () => {
  assert.equal(corDoPartido("PT"), "pt");
  assert.equal(corDoPartido("PL"), "pl");
  assert.equal(corDoPartido("UNIÃO"), "uniao");
  assert.equal(corDoPartido("REPUBLICANOS"), "rep");
  assert.equal(corDoPartido("NOVO"), "outros");
  assert.equal(corDoPartido(""), "outros");
});

const ESTADOS = 27;
const CORES_MAPA = new Set<string>([...CORES, "empate", "sem"]);

test("macro: cada cargo cobre as 27 UFs, com cor pintável, dica e link", () => {
  const macro = montarMacro(e, cargos);
  assert.deepEqual(macro.map((m) => m.chave), cargos ? ["p2", "p1", "gov", "sen", "depf", "depe"] : ["p2", "p1", "gov"]);
  for (const m of macro) {
    const ufs = Object.keys(m.ufs);
    assert.equal(ufs.length, ESTADOS, `${m.chave}: ${ufs.length} UFs`);
    for (const [u, x] of Object.entries(m.ufs)) {
      assert.ok(CORES_MAPA.has(x.c), `${m.chave}/${u}: cor ${x.c}`);
      assert.ok(x.d.length > 0 && x.s.length > 0, `${m.chave}/${u}: dica e subtítulo`);
      // O link do cartão aponta para um id que a página de dados gera.
      const ancora = /^\/eleicoes-2026\/dados\/#([a-z0-9]+)-([a-z]{2})$/.exec(x.h);
      assert.ok(ancora && ancora[2] === u, `${m.chave}/${u}: link ${x.h}`);
      const prefixo = ancora![1]!;
      assert.ok(
        dadosPage.includes(`"${prefixo}-" + `) || dadosPage.includes(`\`${prefixo}-\${`) || dadosPage.includes("`${prefixo}-${uf}`"),
        `${m.chave}: a página de dados gera ids "${prefixo}-xx"`,
      );
    }
    // A legenda conta todo estado uma vez.
    assert.equal(m.legenda.reduce((s, g) => s + g.ufs.length, 0), ESTADOS, `${m.chave}: legenda`);
  }
});

test("macro: os cargos com o arquivo real (513 deputados federais, DF distrital)", { skip: !cargos && "sem dados/eleicoes-2026-cargos.json" }, () => {
  const c = cargos!;
  for (const k of ["senador", "depFederal", "depEstadual"] as const) assert.equal(Object.keys(c[k]).length, ESTADOS, k);
  assert.equal(vagasTotais(c.depFederal), 513);
  const somaCadeiras = cadeirasPorPartido(c.depFederal).reduce((s, p) => s + p.n, 0);
  assert.ok(somaCadeiras <= 513, `cadeiras somadas ${somaCadeiras}`);
  assert.ok(senadoresPorPartido(c.senador).reduce((s, p) => s + p.n, 0) <= vagasTotais(c.senador));
  const depe = montarMacro(e, c).find((m) => m.chave === "depe")!;
  assert.match(depe.ufs.df!.s, /distrital/);
});

test("macro: empate no topo das cadeiras pinta 'empate', nunca um partido", { skip: !cargos && "sem dados/eleicoes-2026-cargos.json" }, () => {
  const c = structuredClone(cargos!) as Cargos2026;
  const b = c.depFederal.ac!;
  b.partidos = [
    { partido: "PT", eleitos: 3, votos: 100, pct: 40 },
    { partido: "PL", eleitos: 3, votos: 90, pct: 36 },
    { partido: "MDB", eleitos: 2, votos: 60, pct: 24 },
  ];
  assert.equal(lider(b), null);
  const depf = montarMacro(e, c).find((m) => m.chave === "depf")!;
  assert.equal(depf.ufs.ac!.c, "empate");
  assert.match(depf.ufs.ac!.d, /empate entre PT e PL/);
  // A legenda do empate diz quem empatou, entre parênteses.
  assert.ok(depf.legenda.some((g) => g.cor === "empate" && g.ufs.some((u) => /^Acre \(.+ e .+\)$/.test(u))));
});

const VELHOS = ["consulta", "prorrogacao", "presidente", "presidente-1", "sumario", "por-uf", "participacao", "governador", "metodo"];

test("links velhos: os ids saíram da macro, existem na de dados e o script os leva", () => {
  const regra = /const VELHO = (\/.*\/);/.exec(macroJs);
  assert.ok(regra, "a regra dos links velhos em public/eleicoes-macro.js");
  const velho = new RegExp(regra![1]!.slice(1, -1));
  for (const id of VELHOS) {
    assert.ok(dadosPage.includes(`id="${id}"`), `dados: id="${id}"`);
    assert.ok(!macroPage.includes(`id="${id}"`), `macro sem id="${id}"`);
    assert.ok(velho.test(id), `o script leva #${id}`);
  }
  for (const id of ["gov-ba", "uf-df"]) assert.ok(velho.test(id), `o script leva #${id}`);
  // Os novos ids do cartão ficam na macro: não podem ser levados.
  for (const id of ["sen-ba", "depf-sp", "pres1-rj", "cargo-p2", "escolha-uf"]) assert.ok(!velho.test(id), `#${id} fica`);
  assert.match(macroJs, /has\("secao"\)/);
});
