// O casamento de regras do `conferir-enderecos` (o `_redirects` da Cloudflare
// Pages) e o 301 do município renomeado em 23/11/2026 (2104552/MA).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const { destino, lerRegras } = await import("../scripts/conferir-enderecos.mjs");

const REDIRECTS = path.resolve(import.meta.dirname, "..", "..", "cloudflare", "_redirects");

test("a primeira regra que casa vence, e /* vira :splat (inclusive vazio)", () => {
  const regras = lerRegras([
    "# comentário",
    "/a /b/ 301",
    "/a/* /b/:splat 301",
    "/a/x /nunca/ 301",
  ].join("\n"));
  assert.deepEqual(destino(regras, "/a"), { para: "/b/", codigo: "301" });
  assert.deepEqual(destino(regras, "/a/"), { para: "/b/", codigo: "301" });
  assert.deepEqual(destino(regras, "/a/x"), { para: "/b/x", codigo: "301" });
  assert.equal(destino(regras, "/ab"), null);
  assert.equal(lerRegras("/c /d")[0].codigo, "302");
});

test("o endereço velho de 2104552 (MA) leva ao novo, com o CSV", () => {
  const regras = lerRegras(fs.readFileSync(REDIRECTS, "utf8"));
  const velho = "/municipio/governador-edison-lobao-ma";
  const novo = "/municipio/ribeiraozinho-do-maranhao-ma/";
  for (const [pedido, esperado] of [
    [velho, novo],
    [`${velho}/`, novo],
    [`${velho}/dados.csv`, `${novo}dados.csv`],
  ]) {
    assert.deepEqual(destino(regras, pedido), { para: esperado, codigo: "301" }, pedido);
  }
});
