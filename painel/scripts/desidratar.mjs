/**
 * Tira o React das páginas que não têm componente de cliente.
 *
 *     node scripts/desidratar.mjs          # reescreve o out/
 *     node scripts/desidratar.mjs --seco   # só mede
 *
 * ## Por que existe
 *
 * Medido em 22/09/2026: o `out/` tinha 891 MB, 90% eram as 5.571 páginas de
 * município, e **61% de cada uma era o payload RSC** (`self.__next_f`) — uma
 * segunda cópia serializada do conteúdo, que o React usa para hidratar. Junto
 * vinham 8 scripts do runtime, ~456 KB, que cada visitante baixava.
 *
 * E o único componente de cliente daquelas páginas era a busca do cabeçalho,
 * que passou a ser HTML do servidor mais `public/busca.js` (sem React). Sem
 * nada para hidratar, o payload e o runtime não servem a ninguém — e custam
 * duas vezes: peso no celular do visitante e, enquanto o site esteve na
 * Vercel (até 27/09/2026), Deployment Storage, onde cada deploy guardava o
 * site inteiro de novo (`hospedagem-armazenamento.md`).
 *
 * ## Quem PODE hidratar é uma lista, e um teste a amarra ao código
 *
 * `HIDRATAM` lista as páginas que têm componente de cliente de verdade. Desde
 * 15/10/2026 é nenhuma: a capa era a única, pela tabela filtrável
 * (`app/municipios.tsx`), que agora sai do servidor e filtra por
 * `public/capa.js`. A lista e o teste ficam para o próximo que aparecer. Tirar o React de uma
 * página que precisa dele a quebraria EM SILÊNCIO — o HTML continua bem
 * formado, só o controle deixa de responder. Por isso `tests/lib.test.mts`
 * compara o conjunto de arquivos `"use client"` com o que esta lista cobre, e
 * reprova quando alguém cria um componente de cliente sem decidir aqui onde
 * ele hidrata.
 *
 * ## O que sai e o que fica
 *
 * Sai: `<script>` com `self.__next_f`, `<script src="/_next/...js">` e o
 * `<link rel="preload" as="script">` deles. Fica: CSS, fontes, JSON-LD e
 * `/busca.js`. Os arquivos `.js` do runtime continuam em `out/`: o Next os
 * gera de qualquer jeito, e uma página em `HIDRATAM` os usaria.
 */

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(AQUI, "..", "out");
const seco = process.argv.includes("--seco");

/** Páginas (relativas a out/) que têm componente de cliente e hidratam. */
export const HIDRATAM = new Set();

const PAYLOAD = /<script>\(?self\.__next_f\b.*?<\/script>/gs;
const RUNTIME = /<script\b[^>]*\bsrc="\/_next\/[^"]*\.js"[^>]*><\/script>/g;
const PRELOAD_JS = /<link\b[^>]*\bas="script"[^>]*\bhref="\/_next\/[^"]*\.js"[^>]*\/?>/g;
// Desde o Next 16.4: `<script id="_R_">(globalThis["TURBOPACK"] || ...).push(
// {"otherChunks":[...]})</script>`, a lista de chunks que o runtime carrega.
// Sem `src`, escapava do RUNTIME; o conteúdo não tem `<`.
const TURBOPACK = /<script\b[^>]*>[^<]*\bTURBOPACK\b[^<]*<\/script>/g;
const BUSCA = '<script type="module" src="/busca.js"></script>';
// O que pode sobrar: JSON-LD e os módulos próprios de `public/` (`/busca.js`,
// `/capa.js`...). Lista do que FICA, para que o próximo formato de runtime
// do Next reprove aqui em vez de passar calado, como o `_R_` passou.
const SCRIPT_PERMITIDO = /^<script (type="application\/ld\+json"|type="module" src="\/[a-z-]+\.js")>$/;

// Marcas que só o React usa para conferir a árvore ao hidratar: `<!-- -->`
// entre nós de texto (557 numa página de município), as fronteiras de
// Suspense e o `<div hidden>` que as guarda; mais o `data-precedence` das
// folhas de estilo e o `<meta next-size-adjust>`, que o runtime lê. Sem
// React, são só bytes; o texto que o leitor vê não muda.
const MARCAS_REACT = /<!--(?: |\$|\/\$)-->/g;
const RESTOS_NEXT = /<div hidden=""><\/div>| data-precedence="next"|<meta name="next-size-adjust" content=""\/>/g;

/** Devolve o HTML sem React, ou lança dizendo por quê. */
export function desidratar(html, onde) {
  const saida = html.replace(PAYLOAD, "").replace(RUNTIME, "").replace(PRELOAD_JS, "")
    .replace(TURBOPACK, "").replace(MARCAS_REACT, "").replace(RESTOS_NEXT, "");
  // As condições que tornam o resultado confiável. Cada uma já seria um
  // defeito silencioso: payload sobrando é peso inútil; runtime sobrando sem
  // payload é React quebrando no console; a busca sumindo é o campo mudo.
  if (saida.includes("__next_f")) throw new Error(`${onde}: sobrou payload RSC`);
  if (/src="\/_next\/[^"]*\.js"/.test(saida)) throw new Error(`${onde}: sobrou script do runtime`);
  for (const tag of saida.match(/<script\b[^>]*>/g) ?? []) {
    if (!SCRIPT_PERMITIDO.test(tag)) throw new Error(`${onde}: script fora da lista: ${tag}`);
  }
  if (!saida.includes(BUSCA)) throw new Error(`${onde}: sem ${BUSCA} — a busca ficaria muda`);
  return saida;
}

function htmls(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = path.join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome !== "_next") htmls(caminho, acc);
    } else if (nome.endsWith(".html")) {
      acc.push(caminho);
    }
  }
  return acc;
}

function principal() {
  if (!existsSync(OUT)) {
    console.error("out/ não existe — rode `npm run build` antes.");
    return 1;
  }
  let paginas = 0;
  let antes = 0;
  let depois = 0;
  const mantidas = [];
  for (const arq of htmls(OUT)) {
    const rel = path.relative(OUT, arq).replace(/\\/g, "/");
    if (HIDRATAM.has(rel)) {
      mantidas.push(rel);
      continue;
    }
    const html = readFileSync(arq, "utf-8");
    let novo;
    try {
      novo = desidratar(html, rel);
    } catch (e) {
      console.error(`\nRECUSADO: ${e.message}`);
      return 1;
    }
    paginas += 1;
    antes += Buffer.byteLength(html);
    depois += Buffer.byteLength(novo);
    if (!seco) writeFileSync(arq, novo, "utf-8");
  }
  for (const rel of HIDRATAM) {
    if (!mantidas.includes(rel)) {
      console.error(`\nRECUSADO: ${rel} está em HIDRATAM e não existe em out/.`);
      return 1;
    }
  }
  const mb = (n) => `${(n / 1e6).toFixed(0)} MB`;
  console.log(`${seco ? "[seco] " : ""}desidratadas: ${paginas} páginas, `
              + `${mb(antes)} -> ${mb(depois)} (−${((1 - depois / antes) * 100).toFixed(0)}%)`);
  console.log(`hidratam (mantidas): ${mantidas.join(", ")}`);
  return 0;
}

// Importado pelo teste, não roda; chamado pelo build, roda.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = principal();
}
