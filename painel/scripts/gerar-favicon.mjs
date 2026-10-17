/**
 * Gera `public/favicon.ico` a partir de `app/icon.svg`: o mesmo desenho em 16,
 * 32 e 48 px, cada um como PNG dentro do ICO.
 *
 *     node scripts/gerar-favicon.mjs
 *
 * As páginas apontam para o `icon.svg`, mas muito cliente (leitor de RSS,
 * agregador, navegador antigo, robô) pede `/favicon.ico` sem ler o HTML, e até
 * 17/10/2026 recebia 404. O arquivo fica em `public/`, e não em `app/`, porque
 * em `app/` o Next poria mais uma `<link>` em cada uma das 11 mil páginas.
 *
 * Rodado à mão quando o `icon.svg` muda, como o `gerar-cartoes.mjs`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const LADOS = [16, 32, 48];

// O caminho do Chrome vem do ambiente, ou de uma sondagem: nenhum caminho de
// máquina cravado em arquivo versionado.
function acharChrome() {
  const candidatos = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const achado = candidatos.find((c) => existsSync(c));
  if (!achado) throw new Error("Chrome não encontrado; defina CHROME_PATH.");
  return achado;
}

const svg = readFileSync("app/icon.svg");
const fonte = "data:image/svg+xml;base64," + svg.toString("base64");
const navegador = await puppeteer.launch({ executablePath: acharChrome(), headless: true });
const pagina = await navegador.newPage();
const pngs = [];
for (const lado of LADOS) {
  await pagina.setViewport({ width: lado, height: lado, deviceScaleFactor: 1 });
  await pagina.setContent(
    `<body style="margin:0;background:transparent"><img src="${fonte}" width="${lado}" height="${lado}" style="display:block"></body>`,
  );
  await pagina.waitForFunction(() => document.querySelector("img").complete);
  pngs.push(await pagina.screenshot({
    omitBackground: true, clip: { x: 0, y: 0, width: lado, height: lado },
  }));
}
await navegador.close();

// O ICO: cabeçalho de 6 bytes, uma entrada de 16 bytes por imagem, e as
// imagens em seguida. PNG dentro do ICO vale em todo navegador desde o IE 7.
const cabecalho = Buffer.alloc(6);
cabecalho.writeUInt16LE(0, 0); // reservado
cabecalho.writeUInt16LE(1, 2); // tipo: ícone
cabecalho.writeUInt16LE(pngs.length, 4);
let deslocamento = 6 + 16 * pngs.length;
const entradas = pngs.map((png, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(LADOS[i], 0); // largura
  e.writeUInt8(LADOS[i], 1); // altura
  e.writeUInt16LE(1, 4); // planos
  e.writeUInt16LE(32, 6); // bits por pixel
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(deslocamento, 12);
  deslocamento += png.length;
  return e;
});
const ico = Buffer.concat([cabecalho, ...entradas, ...pngs]);
writeFileSync("public/favicon.ico", ico);
console.log(`public/favicon.ico: ${ico.length} bytes (${LADOS.join(", ")} px)`);
