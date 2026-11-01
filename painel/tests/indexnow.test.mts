/**
 * Testes do `scripts/indexnow.mjs`: a impressão por página que decide quem é
 * avisado. O erro aqui é silencioso nos dois sentidos — uma impressão que
 * muda com o layout volta ao envio em lote que o Bing acusou em 01/11/2026, e
 * uma que não muda com o texto deixa a página nova sem aviso.
 */

import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

const { impressaoDaPagina, arquivoDaUrl, mudadas, porSecao } = await import("../scripts/indexnow.mjs");

const pagina = ({
  titulo = "Aparecida (SP) | Números Públicos",
  meta = "Aparecida tem 32.569 habitantes.",
  jsonld = '{"@type":"Dataset","name":"Aparecida"}',
  css = "/_next/static/css/a1b2c3.css",
  js = "/_next/static/chunks/main-d4e5f6.js",
  classe = "cartao",
  texto = "População: 32.569",
  barra = "2025: R$ 1,2 mi",
} = {}) => `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charSet="utf-8"/><title>${titulo}</title>
<meta name="description" content="${meta}"/>
<link rel="stylesheet" href="${css}"/>
<script src="${js}" async=""></script>
</head><body class="${classe}">
<script type="application/ld+json">${jsonld}</script>
<main><p class="${classe}">${texto}</p>
<svg role="img"><rect width="10"><title>${barra}</title></rect></svg></main>
<script>self.__next_f.push([1,"${js}"])</script>
<style>.${classe}{color:red}</style>
</body></html>`;

const base = impressaoDaPagina(pagina());

test("indexnow: a impressão é estável e curta", () => {
  assert.equal(impressaoDaPagina(pagina()), base);
  assert.match(base, /^[0-9a-f]{12}$/);
});

test("indexnow: layout (CSS, JS, classe, estilo) não muda a impressão", () => {
  assert.equal(impressaoDaPagina(pagina({ css: "/_next/static/css/ffffff.css" })), base);
  assert.equal(impressaoDaPagina(pagina({ js: "/_next/static/chunks/main-999999.js" })), base);
  assert.equal(impressaoDaPagina(pagina({ classe: "cartao-novo" })), base);
});

test("indexnow: o que a página diz muda a impressão", () => {
  const casos = {
    texto: pagina({ texto: "População: 32.570" }),
    "title do gráfico": pagina({ barra: "2025: R$ 1,3 mi" }),
    título: pagina({ titulo: "Aparecida (SP): números | Números Públicos" }),
    meta: pagina({ meta: "Aparecida tem 32.570 habitantes." }),
    "JSON-LD": pagina({ jsonld: '{"@type":"Dataset","name":"Aparecida (SP)"}' }),
  };
  for (const [nome, html] of Object.entries(casos)) {
    assert.notEqual(impressaoDaPagina(html), base, nome);
  }
});

test("indexnow: arquivoDaUrl acha o index.html da pasta e decodifica", () => {
  const out = path.join("x", "out");
  assert.equal(arquivoDaUrl("https://exemplo.br/", out), path.join(out, "index.html"));
  assert.equal(
    arquivoDaUrl("https://exemplo.br/municipio/aparecida-sp/", out),
    path.join(out, "municipio", "aparecida-sp", "index.html"),
  );
  assert.equal(
    arquivoDaUrl("https://exemplo.br/s%C3%A3o/", out),
    path.join(out, "são", "index.html"),
  );
  assert.equal(arquivoDaUrl("https://exemplo.br/dados.csv", out), path.join(out, "dados.csv"));
});

test("indexnow: mudadas conta tudo sem estado e só o diferente com estado", () => {
  const atual = { "/": "aaa", "/a/": "bbb", "/b/": "ccc" };
  assert.deepEqual(mudadas(atual, undefined), ["/", "/a/", "/b/"]);
  assert.deepEqual(mudadas(atual, {}), ["/", "/a/", "/b/"]);
  assert.deepEqual(mudadas(atual, { "/": "aaa", "/a/": "xxx" }), ["/a/", "/b/"]);
  assert.deepEqual(mudadas(atual, { ...atual, "/saiu/": "ddd" }), []);
});

test("indexnow: porSecao agrupa pelo primeiro segmento, maior primeiro", () => {
  assert.deepEqual(
    porSecao(["/municipio/a/", "/estado/sp/", "/municipio/b/", "/"]),
    [["/municipio", 2], ["/estado", 1], ["/", 1]],
  );
});
