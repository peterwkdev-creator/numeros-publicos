/**
 * Testes do `scripts/versionar-js.mjs`: o hash no nome dos scripts de
 * `public/`. O erro aqui é silencioso — um import não reescrito quebra o
 * módulo no navegador e o build passa —, por isso a lógica é testada sem o
 * minificador (a identidade no lugar dele).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const { importados, ordem, versionar, reescreverHtml, PASTA } = await import("../scripts/versionar-js.mjs");
const igual = async (c: string) => c;

test("versionar-js: quem é importado sai antes, e o nome com hash entra em quem importa", async () => {
  const fontes = new Map([
    ["capa", 'import { slugDe } from "./busca.js";\nimport { br } from "./capa-lista.js";\n'],
    ["capa-lista", 'import { chave } from "./busca.js";\n'],
    ["busca", "export const chave = 1;\n"],
  ]);
  assert.deepEqual(ordem(fontes), ["busca", "capa-lista", "capa"]);
  const v = await versionar(fontes, igual);
  const busca = v.get("busca").arquivo;
  assert.match(busca, /^busca\.[0-9a-f]{10}\.js$/);
  assert.ok(v.get("capa-lista").codigo.includes(`from "./${busca}"`));
  assert.ok(v.get("capa").codigo.includes(`from "./${busca}"`));
  assert.ok(v.get("capa").codigo.includes(`from "./${v.get("capa-lista").arquivo}"`));
});

test("versionar-js: mudar um script importado muda o hash de quem o importa", async () => {
  const a = await versionar(new Map([["capa", 'import "./busca.js";'], ["busca", "1"]]), igual);
  const b = await versionar(new Map([["capa", 'import "./busca.js";'], ["busca", "2"]]), igual);
  assert.notEqual(a.get("busca").arquivo, b.get("busca").arquivo);
  assert.notEqual(a.get("capa").arquivo, b.get("capa").arquivo);
});

test("versionar-js: recusa import que não é outro script, e import circular", () => {
  const nomes = new Set(["capa"]);
  assert.throws(() => importados("capa", 'import x from "./fora.js";', nomes), /não é outro script/);
  assert.throws(() => importados("capa", 'const m = await import("/busca.js");', nomes), /não é outro script/);
  assert.throws(() => ordem(new Map([["a", 'import "./b.js";'], ["b", 'import "./a.js";']])), /circular/);
});

test("versionar-js: o HTML troca só o src dos scripts conhecidos", () => {
  const v = new Map([["busca", { arquivo: "busca.0123456789.js", codigo: "" }]]);
  const html = '<script type="module" src="/busca.js"></script><script type="application/ld+json">{}</script>'
    + '<script src="/_next/static/x.js"></script>';
  const r = reescreverHtml(html, v);
  assert.equal(r.trocas, 1);
  assert.ok(r.html.includes(`src="/${PASTA}/busca.0123456789.js"`));
  assert.ok(r.html.includes('src="/_next/static/x.js"'));
});

test("versionar-js: /js/* é immutable no _headers da Cloudflare", async () => {
  const fs = await import("node:fs");
  const linhas = fs.readFileSync("../cloudflare/_headers", "utf-8").split(/\r?\n/);
  const i = linhas.indexOf(`/${PASTA}/*`);
  assert.ok(i >= 0, `falta a regra /${PASTA}/* no _headers`);
  assert.match(linhas[i + 1], /Cache-Control: public, max-age=31536000, immutable/);
});
