/**
 * Confere que todo link interno do site aponta para uma página que existe.
 *
 *     node scripts/conferir-links.mjs
 *
 * ## O vão que isto fecha
 *
 * `npm run auditar` é profundo e visita **11 páginas**; os testes cobrem função
 * pura. Entre os dois havia um vão do tamanho do site: **5.603 páginas cujos
 * links ninguém tinha conferido**.
 *
 * Defeito de corpus não aparece em amostra **por construção** — se aparecesse
 * na amostra, já teria aparecido. E ele não dói onde nasce: um `<Link>` para
 * uma rota que o build não gerou sai da página **bem formado**, sem erro de
 * tipo, sem aviso no build e sem nada no console. Só se descobre clicando.
 *
 * ## O que ele achou no primeiro uso, em 10/09/2026
 *
 * Dois links mortos na página de ranking — a única página "de cabeça" do site.
 * A causa estava a três camadas dali: o ranking montava o endereço com o nome
 * do **SICONFI** e as páginas nascem do nome do **IBGE**, fontes que discordam
 * em 24 municípios. Ver `identidadePorCodigo` em `lib/nacional.ts`.
 *
 * ## Por que ele não pode ler o snapshot
 *
 * Ele compara os links **contra os diretórios que o build realmente gerou**, e
 * nunca contra a lista de municípios ou contra `slugDe`. Um conferidor que
 * derivasse o endereço esperado da mesma função que o código sob teste
 * confirmaria a premissa em vez de testá-la — e teria passado limpo justamente
 * no defeito acima, porque os dois lados usam `slugDe`. É a lição do
 * `stack.md`: *verificação que herda o parâmetro do que deveria verificar não
 * verifica.*
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(AQUI, "..", "out");
const SITE = "https://www.numerospublicos.com.br";

/** Toda rota que o build gerou, na forma `/caminho/`. */
function rotasGeradas(dir = OUT, prefixo = "/") {
  const rotas = new Map();
  for (const item of readdirSync(dir)) {
    const cheio = path.join(dir, item);
    if (statSync(cheio).isDirectory()) {
      for (const [r, c] of rotasGeradas(cheio, `${prefixo}${item}/`)) rotas.set(r, c);
    } else if (item === "index.html") {
      rotas.set(prefixo, cheio);
    }
  }
  return rotas;
}

/**
 * Os destinos internos de uma página.
 *
 * Só `<a href>`: é o que um visitante clica e o que um rastreador segue. E o
 * texto é lido do HTML cru, sem tentar remontar frase — a marca `<!-- -->` que
 * o React insere entre nós de texto já custou um diagnóstico falso nesta base.
 */
function destinos(html) {
  const achados = new Set();
  for (const [, href] of html.matchAll(/<a\b[^>]*?href="([^"]+)"/gs)) {
    let destino = href.startsWith(SITE) ? href.slice(SITE.length) : href;
    if (!destino.startsWith("/") || destino.startsWith("//")) continue;
    destino = destino.split("#")[0].split("?")[0];
    if (!destino) continue;
    // Arquivo (`.csv`, `.xlsx`, `.xml`) não é rota: existe como arquivo solto,
    // não como `pasta/index.html`, e cobrá-lo aqui gritaria lobo.
    if (/\.[a-z0-9]{2,5}$/i.test(destino)) continue;
    achados.add(destino.endsWith("/") ? destino : `${destino}/`);
  }
  return achados;
}

/**
 * As âncoras da própria página sem alvo, e as seções com `id` que o "Nesta
 * página" deixou de fora. Devolve os achados e quantas âncoras conferiu.
 *
 * O sumário (`componentes/nesta-pagina.tsx`, desde 06/10/2026) repete a
 * condição de cada seção, e as seções são condicionais: se as duas
 * divergirem, o item vira link para lugar nenhum ou a seção some do sumário.
 * Nenhum dos dois é erro de build, e a auditoria só vê quando a seção que
 * diverge está numa das páginas dela. Aqui se vê nas 5.571.
 */
function ancorasOrfas(html) {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const achados = [];
  let conferidas = 0;
  for (const [, alvo] of html.matchAll(/<a\b[^>]*?href="#([^"]+)"/gs)) {
    conferidas += 1;
    if (!ids.has(alvo)) achados.push(`#${alvo} sem alvo`);
  }
  const nav = html.match(/<nav\b[^>]*aria-label="Nesta página"[^>]*>([\s\S]*?)<\/nav>/);
  if (nav) {
    const listados = new Set([...nav[1].matchAll(/href="#([^"]+)"/g)].map((m) => m[1]));
    for (const [, id] of html.matchAll(/<section\b[^>]*?\sid="([^"]+)"/g)) {
      conferidas += 1;
      if (!listados.has(id)) achados.push(`seção #${id} fora do "Nesta página"`);
    }
  }
  return { achados, conferidas };
}

const rotas = rotasGeradas();
if (rotas.size === 0) {
  console.error("out/ não existe ou está vazio — rode `npm run build` antes.");
  process.exitCode = 1;
} else {
  // destino quebrado -> páginas que apontam para ele
  const quebrados = new Map();
  // achado de âncora -> páginas onde ele ocorre
  const orfas = new Map();
  let links = 0;
  let ancoras = 0;

  for (const [, arquivo] of rotas) {
    const html = readFileSync(arquivo, "utf8");
    const rota = `/${path.relative(OUT, path.dirname(arquivo))
      .split(path.sep).join("/")}/`.replace("//", "/");
    for (const destino of destinos(html)) {
      links += 1;
      if (!rotas.has(destino)) {
        if (!quebrados.has(destino)) quebrados.set(destino, []);
        quebrados.get(destino).push(rota);
      }
    }
    const { achados, conferidas } = ancorasOrfas(html);
    ancoras += conferidas;
    for (const achado of achados) {
      if (!orfas.has(achado)) orfas.set(achado, []);
      orfas.get(achado).push(rota);
    }
  }

  console.log(`páginas: ${rotas.size} · destinos internos distintos: ${links}` +
    ` · âncoras na própria página: ${ancoras}`);

  if (orfas.size === 0) {
    console.log("âncoras: nenhuma sem alvo, nenhuma seção fora do sumário");
  } else {
    console.error(`\nÂNCORAS ÓRFÃS: ${orfas.size}\n`);
    for (const [achado, paginas] of [...orfas].sort((a, b) => b[1].length - a[1].length)) {
      console.error(`  ${achado}`);
      console.error(`     em ${paginas.length} página(s): ` +
        `${paginas.slice(0, 3).join(", ")}${paginas.length > 3 ? " …" : ""}`);
    }
    process.exitCode = 1;
  }

  if (quebrados.size === 0) {
    console.log("links internos: nenhum quebrado");
  } else {
    console.error(`\nLINKS QUEBRADOS: ${quebrados.size}\n`);
    for (const [destino, origens] of [...quebrados].sort(
      (a, b) => b[1].length - a[1].length,
    )) {
      console.error(`  ${destino}`);
      console.error(`     apontado por ${origens.length} página(s): ` +
        `${origens.slice(0, 3).join(", ")}${origens.length > 3 ? " …" : ""}`);
    }
    // `exitCode` e não `process.exit()`: sair de imediato com escrita pendente
    // no Windows aborta o processo e **o código de saída se perde**, e aí um
    // pipeline lê a falha como sucesso. Já pago em `scripts/indexnow.mjs`.
    process.exitCode = 1;
  }
}
