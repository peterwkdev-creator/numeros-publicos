/**
 * Serve o out/ com os cabeçalhos de cloudflare/_headers e reprova qualquer
 * violação de Content-Security-Policy nas páginas que interagem.
 *
 *     npm run build
 *     node scripts/conferir-csp.mjs              (a política do _headers)
 *     node scripts/conferir-csp.mjs --plantar    (a prova: script-src sem
 *                                                 'unsafe-inline' TEM de reprovar a capa)
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
    if (PLANTAR && cab["Content-Security-Policy"]) {
      cab["Content-Security-Policy"] = cab["Content-Security-Policy"]
        .replace(/(script-src[^;]*?) 'unsafe-inline'/, "$1");
    }
    res.writeHead(200, cab).end(corpo);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${servidor.address().port}`;

/** Página e o que fazer nela: a capa hidrata, as outras usam busca.js. */
const ROTEIRO = [
  ["/", async (p) => {
    await p.click('label[for="mapa-pib-habitante"]').catch(() => {});
    // na capa a busca da barra fica escondida; a que se usa é a do herói
    await p.type("#busca-capa", "sao paulo");
  }],
  ["/municipio/sao-paulo-sp/", async (p) => { await p.type("#busca-cab", "recife"); }],
  ["/estado/sp/", async (p) => { await p.click('label[for="mapa-agua"]').catch(() => {}); }],
  ["/brasil/", null],
  ["/ranking/gasto-com-pessoal/", null],
  ["/ranking/emprego-com-carteira/", null],
  ["/inss/", null],
  ["/inss/aposentadoria-por-idade/", null],
  ["/ajuda/", null],
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
