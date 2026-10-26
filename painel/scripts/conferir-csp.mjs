/**
 * Serve o out/ com os cabeçalhos de cloudflare/_headers e reprova qualquer
 * violação de Content-Security-Policy nas páginas que interagem.
 *
 *     npm run build
 *     node scripts/conferir-csp.mjs              (a política do _headers)
 *     node scripts/conferir-csp.mjs --plantar    (a prova: um <script> inline
 *                                                 plantado na capa TEM de reprovar)
 *
 * Existe porque a CSP só vale em produção: o `npm start` (serve) não lê o
 * _headers, e um script de outra origem, um `<script>` inline novo numa página
 * desidratada ou um `fetch` para fora passariam por build, testes e auditoria
 * e quebrariam só no ar — em silêncio, porque a página bloqueada continua
 * bem formada. Aqui a página roda com a política de verdade, e cada violação
 * sai com a diretiva e o que foi bloqueado.
 *
 * Criado em 11/10/2026, com os cabeçalhos de segurança.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME
  ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const RAIZ = new URL("../out/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const HEADERS = new URL("../../cloudflare/_headers", import.meta.url);
const PLANTAR = process.argv.includes("--plantar");

/** As regras de caminho do _headers (as de host, `https://...`, ficam de fora). */
function lerRegras(texto) {
  const regras = [];
  let atual = null;
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.trim() || linha.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(linha)) {
      atual = linha.startsWith("/") ? { padrao: linha.trim(), cabecalhos: {} } : null;
      if (atual) regras.push(atual);
    } else if (atual) {
      const i = linha.indexOf(":");
      atual.cabecalhos[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
    }
  }
  return regras;
}

const casa = (padrao, caminho) =>
  new RegExp(`^${padrao.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`)
    .test(caminho);

const regras = lerRegras(await readFile(HEADERS, "utf8"));
if (!regras.some((r) => r.cabecalhos["Content-Security-Policy"])) {
  console.error("cloudflare/_headers sem Content-Security-Policy");
  process.exit(1);
}

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain",
  ".xml": "application/xml", ".webmanifest": "application/manifest+json",
};

const servidor = createServer(async (req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let arquivo = normalize(join(RAIZ, caminho));
  if (!arquivo.startsWith(normalize(RAIZ))) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(arquivo)).isDirectory()) arquivo = join(arquivo, "index.html");
    const corpo = await readFile(arquivo);
    const cab = { "Content-Type": TIPOS[extname(arquivo)] ?? "application/octet-stream" };
    for (const r of regras) if (casa(r.padrao, caminho)) Object.assign(cab, r.cabecalhos);
    // A prova (17/10/2026): um <script> inline na capa, o que uma página nova
    // ou um componente que volte a hidratar poria. Até ali a prova tirava o
    // 'unsafe-inline' do script-src, e o _headers deixou de tê-lo.
    if (PLANTAR && caminho === "/") {
      res.writeHead(200, cab).end(String(corpo).replace(
        "</body>", "<script>document.title = 'plantado'</script></body>"));
      return;
    }
    res.writeHead(200, cab).end(corpo);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${servidor.address().port}`;

/** Página e o que fazer nela: o mapa, as buscas e o "Copiar link". */
const ROTEIRO = [
  ["/", async (p) => {
    await p.click('label[for="mapa-pib-habitante"]').catch(() => {});
    // na capa a busca da barra fica escondida; a que se usa é a do herói
    await p.type("#busca-capa", "sao paulo");
  }],
  ["/municipio/sao-paulo-sp/", async (p) => {
    await p.type("#busca-cab", "recife");
    await p.click('[data-acao="copiar"]');
  }],
  ["/estado/sp/", async (p) => {
    await p.click('label[for="mapa-agua"]').catch(() => {});
    await p.click('[data-acao="copiar"]');
  }],
  ["/brasil/", null],
  ["/brasil/ipca/", null],
  ["/ranking/gasto-com-pessoal/", null],
  ["/ranking/emprego-com-carteira/", null],
  ["/inss/", null],
  ["/inss/aposentadoria-por-idade/", null],
  ["/ajuda/", null],
  // As duas consultas ao TSE no navegador (connect-src): a seção, escolhida
  // nos seletores, e o bloco do município, que se atualiza sozinho. Sem
  // rede, o status diz que falhou e a CSP continua conferida.
  // A visão macro (26/10/2026): trocar de cargo e abrir o cartão de um estado
  // (CSSOM na dica e na barra do cartão, `fetch` do JSON do mapa).
  ["/eleicoes-2026/", async (p) => {
    await p.click('label[for="cargo-gov"]');
    await p.click('path[data-uf="ba"]');
    await p.waitForFunction(() => document.querySelector("[data-cartao] .cartao-link"), { timeout: 10000 }).catch(() => {});
    const r = await p.evaluate(() => ({
      cor: document.querySelector('path[data-uf="ba"]')?.getAttribute("data-cor"),
      cartao: document.querySelector("[data-cartao] h3")?.textContent ?? "",
      linhas: document.querySelectorAll("[data-cartao] li").length,
    }));
    console.log(`  /eleicoes-2026/ governador, BA: cor ${r.cor}, cartão "${r.cartao}", ${r.linhas} linhas`);
    if (!r.cartao || r.cor === "sem") { console.log("✗ /eleicoes-2026/: o cartão do estado não abriu"); falhas++; }
  }],
  // O link velho da página única vai para a página de dados.
  ["/eleicoes-2026/#gov-ba", async (p) => {
    await p.waitForFunction(() => location.pathname.endsWith("/dados/"), { timeout: 10000 }).catch(() => {});
    const u = await p.evaluate(() => location.pathname + location.hash);
    console.log(`  /eleicoes-2026/#gov-ba foi para ${u}`);
    if (u !== "/eleicoes-2026/dados/#gov-ba") { console.log("✗ /eleicoes-2026/#gov-ba: o link velho não foi levado"); falhas++; }
  }],
  ["/eleicoes-2026/dados/", async (p) => {
    const opcao = (sel) => p.waitForFunction((s) => document.querySelector(s)?.options.length > 1, { timeout: 20000 }, sel);
    await p.select("#cs-uf", "rr");
    await opcao("#cs-mun"); await p.select("#cs-mun", "03085");
    await opcao("#cs-zona"); await p.select("#cs-zona", "0008");
    await opcao("#cs-secao"); await p.select("#cs-secao", "0001");
    await p.click('form[data-consulta-secao] button[type="submit"]');
    await p.waitForFunction(() => document.querySelector("#cs-resultado")?.children.length > 0, { timeout: 60000 }).catch(() => {});
    console.log(`  /eleicoes-2026/dados/ consulta: ${await p.$eval("#cs-status", (e) => e.textContent)}`);
  }],
  // O link da consulta (26/10/2026): `?secao=` refaz a consulta sozinho. O
  // endereço velho, sem /dados/, passa pela macro e chega aqui igual.
  ["/eleicoes-2026/?secao=rr-03085-0008-0001", async (p) => {
    await p.waitForFunction(() => location.pathname.endsWith("/dados/"), { timeout: 10000 }).catch(() => {});
    await p.waitForFunction(() => document.querySelector("#cs-resultado")?.children.length > 0, { timeout: 60000 }).catch(() => {});
    const s = await p.$eval("#cs-status", (e) => e.textContent);
    console.log(`  /eleicoes-2026/?secao= consulta: ${s}`);
    // Sem rede o status diz que falhou; o que não pode é o link ser ignorado.
    if (await p.$eval("#cs-uf", (e) => e.value) !== "rr" || !s) {
      console.log("✗ /eleicoes-2026/?secao=: o link da consulta foi ignorado");
      falhas++;
    }
  }],
  ["/municipio/imperatriz-ma/", async (p) => {
    await p.waitForFunction(() => /ao vivo/.test(document.querySelector("[data-eleicao-status]")?.textContent), { timeout: 30000 }).catch(() => {});
    console.log(`  /municipio/imperatriz-ma/ eleições: ${await p.$eval("[data-eleicao-status]", (e) => e.textContent)}`);
  }],
];

const nav = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
let falhas = 0;
try {
  for (const [rota, agir] of ROTEIRO) {
    const p = await nav.newPage();
    await p.evaluateOnNewDocument(() => {
      window.__csp = [];
      document.addEventListener("securitypolicyviolation", (e) =>
        window.__csp.push(`${e.violatedDirective} bloqueou ${e.blockedURI || "(inline)"}`));
    });
    const resp = await p.goto(base + rota, { waitUntil: "networkidle0" });
    const csp = resp.headers()["content-security-policy"];
    if (agir) { await agir(p); await new Promise((ok) => setTimeout(ok, 800)); }
    const violacoes = [...new Set(await p.evaluate(() => window.__csp))];
    if (!csp) { console.log(`✗ ${rota}: sem Content-Security-Policy`); falhas++; }
    else if (violacoes.length) {
      console.log(`✗ ${rota}: ${violacoes.length} violação(ões)`);
      for (const v of violacoes.slice(0, 5)) console.log(`    ${v}`);
      falhas++;
    } else console.log(`✓ ${rota}`);
    await p.close();
  }
} finally {
  await nav.close();
  servidor.close();
}
console.log(`\n${falhas} página(s) com problema${PLANTAR ? " (modo --plantar)" : ""}.`);
process.exit(falhas ? 1 : 0);
