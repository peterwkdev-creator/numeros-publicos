/**
 * Minifica os scripts de `public/` e põe o hash do conteúdo no nome.
 *
 *     node scripts/versionar-js.mjs          # reescreve o out/
 *     node scripts/versionar-js.mjs --seco   # só mede
 *
 * ## Por que existe
 *
 * Medido em 16/10/2026: os cinco scripts de `public/` saíam como escritos,
 * com comentário e nome longo, e o `busca.js` vai em TODA página (6,4 KB em
 * brotli; minificado, 2,4). E o Pages os servia com `max-age=14400,
 * must-revalidate`: depois de uma publicação, quem tinha o script velho no
 * cache seguia com ele por até 4 h, lendo o `indice.json` novo.
 *
 * Com o hash no nome, um arquivo nunca muda sob o mesmo nome, e `/js/*` vai
 * como `immutable` no `cloudflare/_headers` — o mesmo argumento do
 * `/_next/static/`. Os fontes continuam em `public/` com o nome de sempre:
 * o `next dev` e os testes os usam assim, e só o `out/` muda.
 *
 * ## A ordem importa
 *
 * Os scripts se importam (`capa.js` importa `busca.js` e `capa-lista.js`), e
 * o nome com hash de quem é importado entra no código de quem importa. Então
 * o hash de `capa.js` depende do de `busca.js`, e a versão sai na ordem das
 * dependências. Import que não seja `./<outro script>.js` é recusado: não
 * haveria como reescrevê-lo, e o módulo quebraria no navegador sem erro no
 * build.
 *
 * A página carrega `/js/busca.<hash>.js` e o `capa.js` importa
 * `./busca.<hash>.js`: a mesma URL, então o mesmo módulo, como antes.
 *
 * O minificador é o terser que o Next já traz (`next/dist/compiled/terser`),
 * para não somar dependência. Se uma versão do Next deixar de trazê-lo, o
 * build para aqui, com erro.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync } from "node:zlib";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(AQUI, "..", "out");
const seco = process.argv.includes("--seco");

/** Pasta dos scripts versionados, dentro do `out/` (e a regra do `_headers`). */
export const PASTA = "js";

const ESPECIFICADOR = /\b(from|import)(\s*\(?\s*)(["'])([^"']+)\3/g;
const RELATIVO = /^\.\/([a-z-]+)\.js$/;

/** Os scripts que `codigo` importa, pelo nome sem `.js`. Recusa o que não for `./<nome>.js`. */
export function importados(nome, codigo, conhecidos) {
  const acc = [];
  for (const m of codigo.matchAll(ESPECIFICADOR)) {
    const r = RELATIVO.exec(m[4]);
    if (!r || !conhecidos.has(r[1])) {
      throw new Error(`${nome}.js importa "${m[4]}", que não é outro script de public/`);
    }
    acc.push(r[1]);
  }
  return acc;
}

/** Os nomes em ordem de dependência: quem é importado vem antes. Recusa ciclo. */
export function ordem(fontes) {
  const nomes = new Set(fontes.keys());
  const feitos = [];
  const estado = new Map();
  const visitar = (n, cadeia) => {
    if (estado.get(n) === "feito") return;
    if (estado.get(n) === "andando") throw new Error(`import circular: ${[...cadeia, n].join(" -> ")}`);
    estado.set(n, "andando");
    for (const d of importados(n, fontes.get(n), nomes)) visitar(d, [...cadeia, n]);
    estado.set(n, "feito");
    feitos.push(n);
  };
  for (const n of [...nomes].sort()) visitar(n, []);
  return feitos;
}

/**
 * Versiona os fontes. `minificar(codigo)` devolve o código menor (o teste
 * passa a identidade). Devolve, por nome, o arquivo novo e o código.
 */
export async function versionar(fontes, minificar) {
  const saida = new Map();
  for (const n of ordem(fontes)) {
    const reescrito = fontes.get(n).replace(ESPECIFICADOR, (m, kw, meio, q, esp) => {
      const dep = RELATIVO.exec(esp)[1];
      return `${kw}${meio}${q}./${saida.get(dep).arquivo}${q}`;
    });
    const codigo = await minificar(reescrito);
    const hash = createHash("sha256").update(codigo).digest("hex").slice(0, 10);
    saida.set(n, { arquivo: `${n}.${hash}.js`, codigo });
  }
  return saida;
}

/** Troca `src="/<nome>.js"` por `src="/js/<nome>.<hash>.js"`. Devolve o HTML e quantas trocas. */
export function reescreverHtml(html, versoes) {
  let trocas = 0;
  const novo = html.replace(/(<script\b[^>]*\bsrc=")\/([a-z-]+)\.js(")/g, (m, a, nome, b) => {
    const v = versoes.get(nome);
    if (!v) return m;
    trocas += 1;
    return `${a}/${PASTA}/${v.arquivo}${b}`;
  });
  return { html: novo, trocas };
}

function htmls(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = path.join(dir, nome);
    if (statSync(caminho).isDirectory()) htmls(caminho, acc);
    else if (nome.endsWith(".html")) acc.push(caminho);
  }
  return acc;
}

async function principal() {
  if (!existsSync(OUT)) {
    console.error("out/ não existe — rode `npm run build` antes.");
    return 1;
  }
  const fontes = new Map(
    readdirSync(OUT).filter((n) => n.endsWith(".js")).map((n) => [n.slice(0, -3), readFileSync(path.join(OUT, n), "utf-8")]),
  );
  if (!fontes.size) {
    console.error("\nRECUSADO: nenhum .js na raiz do out/ (o build já foi versionado?).");
    return 1;
  }
  const { minify } = createRequire(import.meta.url)("next/dist/compiled/terser");
  let versoes;
  try {
    versoes = await versionar(fontes, async (c) => (await minify(c, { module: true, format: { comments: false } })).code);
  } catch (e) {
    console.error(`\nRECUSADO: ${e.message}`);
    return 1;
  }

  const br = (s) => brotliCompressSync(Buffer.from(s)).length;
  for (const [n, v] of versoes) {
    const f = fontes.get(n);
    console.log(`  ${n}.js -> ${PASTA}/${v.arquivo}: ${f.length} -> ${v.codigo.length} B (brotli ${br(f)} -> ${br(v.codigo)})`);
  }

  let paginas = 0;
  let trocas = 0;
  const reescritas = [];
  for (const arq of htmls(OUT)) {
    const r = reescreverHtml(readFileSync(arq, "utf-8"), versoes);
    if (/<script\b[^>]*\bsrc="\/[a-z-]+\.js"/.test(r.html)) {
      console.error(`\nRECUSADO: ${path.relative(OUT, arq)} carrega um script da raiz que não está no out/.`);
      return 1;
    }
    if (r.trocas) {
      paginas += 1;
      trocas += r.trocas;
      reescritas.push([arq, r.html]);
    }
  }
  if (!seco) {
    mkdirSync(path.join(OUT, PASTA), { recursive: true });
    for (const [n, v] of versoes) {
      writeFileSync(path.join(OUT, PASTA, v.arquivo), v.codigo, "utf-8");
      rmSync(path.join(OUT, `${n}.js`));
    }
    for (const [arq, html] of reescritas) writeFileSync(arq, html, "utf-8");
  }
  console.log(`${seco ? "[seco] " : ""}versionados: ${versoes.size} scripts; ${trocas} referências em ${paginas} páginas`);
  return 0;
}

// Importado pelo teste, não roda; chamado pelo build, roda.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await principal();
}
