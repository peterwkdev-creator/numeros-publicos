/**
 * Gera `public/og/*.png`: o cartão de compartilhamento de cada estado, do
 * `/brasil`, de cada série do país (desde 16/10/2026, quando cada uma ganhou
 * página própria) e dos dois rankings (item 12 da revisão de 11/10, 15/10/2026).
 *
 *     node scripts/gerar-cartoes.mjs
 *
 * ## Por que um por estado, e não um por página
 *
 * Até ali o site inteiro mostrava o cartão da capa. Um por município seriam
 * 5.571 PNGs num deploy que já tem 11.296 arquivos, com teto de 20.000 na
 * Cloudflare Pages. Um por estado são 27: o município usa o do seu estado, e
 * o título e a descrição do cartão continuam os dele.
 *
 * ## Por que rodar à mão, e versionar o resultado
 *
 * Como `dados/malha-uf.json`: o desenho só muda quando muda o nome de um
 * estado, a malha ou este script. Gerar no build pediria o Chrome no CI.
 * O cartão não traz número que envelhece (nem população, nem PIB): só o nome,
 * a região, quantos municípios e o mapa; o de uma série, o nome, a fonte, o
 * ano em que ela começa e para que lado é melhor, e nunca o último valor. O teste confere que existe um PNG
 * 1280×640 para cada UF do snapshot.
 *
 * O desenho é o do cartão da capa (`.claude/social-preview/`, no repositório
 * de trabalho), com o mapa à direita e o estado na cor de destaque.
 *
 * ## Por que em paleta
 *
 * O cartão é cor chapada, texto e um mapa: cabe em 256 cores. A captura sai
 * em cor cheia (RGBA), e a paleta a leva a 30% do tamanho (medido em
 * 16/10/2026: os 30 cartões de 4,6 para 1,4 MB, o pior PSNR em 53 dB, uma
 * diferença que o olho não vê). Quem baixa o cartão é o leitor de quem
 * compartilha o link, a cada compartilhamento. A paleta vem do sharp que o
 * Next já traz, sem dependência nova. Se uma versão do Next deixar de
 * trazê-lo, este script para no import.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const SAIDA = path.join(RAIZ, "public", "og");
const LARGURA = 1280;
const ALTURA = 640;
const ACENTO = "#34d399";

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

const ler = (f) => JSON.parse(readFileSync(path.join(RAIZ, "dados", f), "utf-8"));
const snapshot = ler("snapshot.json");
const brasil = ler("brasil.json");
// O nome de cada série e o lado melhor vêm de `lib/brasil.ts`, os mesmos da
// página: o registrador dos testes ensina o Node a importar o TypeScript.
await import("../tests/registrar.mjs");
const { APRESENTACAO, FONTE_COM_ARTIGO, SELO } = await import("../lib/brasil.ts");
const malha = ler("malha-uf.json");

const escapar = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const br = (n) => n.toLocaleString("pt-BR");

/** O mapa do Brasil, com `destaque(sigla)` dizendo a cor de cada estado. */
function mapa(destaque, sigla) {
  const caminhos = Object.entries(malha.caminhos)
    .map(([s, d]) => `<path data-uf="${s}" d="${d}" fill="${destaque(s)}"/>`)
    .join("");
  return `<svg viewBox="${malha.viewBox}" stroke="#0d1117" stroke-width="2.5" stroke-linejoin="round"${sigla ? ` data-destaque="${sigla}"` : ""}>${caminhos}</svg>`;
}

/**
 * Estado pequeno some no mapa de 430 px: com menos de 130 unidades no lado
 * maior do `getBBox` (DF, SE, AL, RN, PB, RJ e ES, em 15/10/2026), ganha um
 * anel em volta.
 */
function anelEmEstadoPequeno() {
  const svg = document.querySelector("svg[data-destaque]");
  if (!svg) return false;
  const b = svg.querySelector(`path[data-uf="${svg.dataset.destaque}"]`).getBBox();
  if (Math.max(b.width, b.height) >= 130) return false;
  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("cx", b.x + b.width / 2);
  c.setAttribute("cy", b.y + b.height / 2);
  c.setAttribute("r", Math.max(b.width, b.height) / 2 + 26);
  c.setAttribute("fill", "none");
  c.setAttribute("stroke", "#34d399");
  c.setAttribute("stroke-width", "7");
  svg.append(c);
  return true;
}

const FONTES = ["IBGE", "SICONFI", "INEP", "Novo Caged"];

const cartoes = [
  ...snapshot.ufs.map((u) => ({
    arquivo: u.sigla.toLowerCase(),
    tipo: `Região ${u.regiao}`,
    titulo: u.nome,
    linha:
      u.municipios === 1
        ? "População, PIB, emprego, contas públicas e educação, com a fonte oficial ao lado de cada número."
        : `${br(u.municipios)} municípios, um a um: população, PIB, emprego, contas públicas e educação, com a fonte oficial ao lado de cada número.`,
    chips: [u.municipios === 1 ? "Distrito Federal" : `${br(u.municipios)} municípios`, ...FONTES],
    mapa: mapa((s) => (s === u.sigla ? ACENTO : "#262d36"), u.sigla),
  })),
  {
    arquivo: "brasil",
    tipo: "O país no tempo",
    titulo: "Brasil",
    linha:
      "PIB, desemprego, renda, pobreza, inflação, dólar, juros, salário mínimo, dívida e resultado primário, ano a ano.",
    chips: ["IBGE", "Banco Central", "Ipea"],
    mapa: mapa(() => ACENTO),
  },
  ...brasil.series.map((s) => ({
    arquivo: `brasil-${s.codigo}`,
    tipo: "O Brasil ao longo do tempo",
    titulo: APRESENTACAO[s.codigo].titulo,
    linha:
      `Série ${FONTE_COM_ARTIGO[s.fonte]} desde ${s.pontos[0][0].slice(0, 4)}, com quem ` +
      "ocupava a Presidência ao fundo. Gráfico, tabela e CSV.",
    chips: [s.fonte, SELO[APRESENTACAO[s.codigo].melhor]],
    mapa: mapa(() => ACENTO),
  })),
  {
    arquivo: "ranking-gasto-com-pessoal",
    tipo: "Ranking nacional",
    titulo: "Gasto com pessoal",
    linha:
      "Os municípios que declararam gasto com pessoal acima do limite da Lei de Responsabilidade Fiscal.",
    chips: ["SICONFI", "Todos os municípios"],
    mapa: mapa(() => `${ACENTO}8c`),
  },
  {
    arquivo: "ranking-emprego-com-carteira",
    tipo: "Ranking nacional",
    titulo: "Emprego com carteira",
    linha: "Os municípios que mais abriram e mais fecharam vagas com carteira assinada em 12 meses.",
    chips: ["Novo Caged", "Todos os municípios"],
    mapa: mapa(() => `${ACENTO}8c`),
  },
];

function html(c) {
  const chips = c.chips.map((t) => `<span class="chip">${escapar(t)}</span>`).join("");
  return `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${LARGURA}px;height:${ALTURA}px}
  body{display:flex;overflow:hidden;background:#0d1117;color:#e6edf3;
    font-family:"Segoe UI Variable Display","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif}
  .barra{width:14px;flex:none;background:linear-gradient(180deg,${ACENTO},${ACENTO}22)}
  .brilho{position:absolute;top:-260px;right:-200px;width:760px;height:760px;border-radius:50%;
    background:radial-gradient(circle,${ACENTO}2e 0%,${ACENTO}00 68%)}
  .cartao{position:relative;flex:1;display:flex;padding:62px 56px 58px 72px;gap:40px}
  .texto{position:relative;flex:1;display:flex;flex-direction:column;justify-content:space-between;min-width:0}
  header{display:flex;align-items:center;gap:18px}
  .marca{font-size:23px;color:#e6edf3;font-weight:600;letter-spacing:.2px}
  .tipo{font-size:17px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:${ACENTO};
    border:1.5px solid ${ACENTO}59;border-radius:999px;padding:7px 17px;white-space:nowrap}
  h1{font-size:${c.titulo.length > 28 ? 54 : c.titulo.length > 16 ? 64 : 74}px;line-height:1.04;font-weight:700;letter-spacing:-1.6px}
  p{margin-top:24px;font-size:27px;line-height:1.45;color:#a5b0bb}
  .chips{display:flex;flex-wrap:wrap;gap:11px}
  .chip{font-size:19px;color:#c3ccd6;background:#161b22;border:1px solid #2b3138;border-radius:9px;padding:9px 16px;white-space:nowrap}
  .mapa{position:relative;flex:none;width:430px;display:flex;align-items:center}
  .mapa svg{width:100%;height:auto;overflow:visible}
</style>
<div class="barra"></div>
<div class="cartao">
  <div class="brilho"></div>
  <div class="texto">
    <header><span class="marca">numerospublicos.com.br</span><span class="tipo">${escapar(c.tipo)}</span></header>
    <main><h1>${escapar(c.titulo)}</h1><p>${escapar(c.linha)}</p></main>
    <footer class="chips">${chips}</footer>
  </div>
  <div class="mapa">${c.mapa}</div>
</div>`;
}

mkdirSync(SAIDA, { recursive: true });
const navegador = await puppeteer.launch({ executablePath: acharChrome(), headless: true });
try {
  for (const c of cartoes) {
    const destino = path.join(SAIDA, `${c.arquivo}.png`);
    // Uma página por cartão: reusar a mesma pendura o segundo `setContent`.
    // O cartão não busca nada da rede, então `load` é o sinal certo.
    const pagina = await navegador.newPage();
    let anel = false;
    try {
      await pagina.setViewport({ width: LARGURA, height: ALTURA, deviceScaleFactor: 1 });
      await pagina.setContent(html(c), { waitUntil: "load" });
      await pagina.evaluateHandle("document.fonts.ready");
      anel = await pagina.evaluate(anelEmEstadoPequeno);
      // Texto que transborda não dá erro: sai cortado no PNG, em silêncio.
      const transborda = await pagina.evaluate(() => {
        const t = document.querySelector(".texto");
        return t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1;
      });
      if (transborda) throw new Error(`o texto de ${c.arquivo} não cabe no cartão`);
      const captura = await pagina.screenshot({ type: "png" });
      writeFileSync(destino, await sharp(captura).png({ palette: true, effort: 10, compressionLevel: 9 }).toBuffer());
    } finally {
      await pagina.close();
    }
    console.log(`  ${c.arquivo.padEnd(30)} ${(statSync(destino).size / 1024).toFixed(0)} KB${anel ? "  (com anel)" : ""}`);
  }
} finally {
  await navegador.close();
}
console.log(`\n${cartoes.length} cartões em public/og/`);
