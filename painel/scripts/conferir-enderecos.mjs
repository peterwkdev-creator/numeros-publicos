/**
 * Confere que nenhum endereço de município já publicado some sem 301.
 *
 *     node scripts/conferir-enderecos.mjs              # confere
 *     node scripts/conferir-enderecos.mjs --acrescentar  # grava os novos na lista
 *
 * ## O vão que isto fecha
 *
 * O endereço da página nasce do nome do IBGE (`slugDe`). Em 23/11/2026 o
 * IBGE renomeou 2104552 (MA), de Governador Edison Lobão para Ribeirãozinho
 * do Maranhão, e o cron publicou sozinho: a página nova nasceu, a velha deu
 * **404** no ar, e tudo ficou verde. O `conferir-links` não pega, porque nada
 * dentro do site aponta para o endereço velho; quem aponta é o buscador e
 * quem guardou o link.
 *
 * ## Como ele confere
 *
 * A memória do que já foi publicado é `cloudflare/enderecos-de-municipio.txt`
 * (versionada, um endereço por linha). Ele nunca a deriva do snapshot nem de
 * `slugDe`: o lado que se confere é o `out/` que o build gerou (os sitemaps
 * por UF) e o `_redirects` que a publicação copia.
 *
 * 1. Endereço da lista que saiu do sitemap: `/municipio/<velho>`,
 *    `/municipio/<velho>/` e `/municipio/<velho>/dados.csv` têm de casar uma
 *    regra 301 do `_redirects` que leve a um arquivo que existe no `out/`.
 * 2. Endereço do sitemap fora da lista: reprova também, senão a lista
 *    apodrece e o próximo nome trocado passa. `--acrescentar` grava os novos
 *    depois de conferir que são municípios novos, não renomeados.
 *
 * O casamento das regras imita o da Cloudflare Pages no que este arquivo usa:
 * a primeira linha que casa vence; `/*` no fim casa o resto (inclusive vazio)
 * e vira `:splat` no destino.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(AQUI, "..", "out");
const CLOUDFLARE = path.resolve(AQUI, "..", "..", "cloudflare");
const LISTA = path.join(CLOUDFLARE, "enderecos-de-municipio.txt");
const REDIRECTS = path.join(CLOUDFLARE, "_redirects");

/** Os endereços `/municipio/<slug>/` que os sitemaps por UF do `out/` listam. */
export function enderecosDoSitemap(out) {
  const pasta = path.join(out, "municipio", "sitemap");
  const achados = new Set();
  for (const arq of readdirSync(pasta)) {
    if (!arq.endsWith(".xml")) continue;
    const xml = readFileSync(path.join(pasta, arq), "utf8");
    for (const m of xml.matchAll(/<loc>https?:\/\/[^/<]+(\/municipio\/[^<]+\/)<\/loc>/g)) {
      achados.add(m[1]);
    }
  }
  return achados;
}

/** As regras do `_redirects`, na ordem: `{ de, para, codigo }`. */
export function lerRegras(texto) {
  const regras = [];
  for (const crua of texto.split(/\r?\n/)) {
    const linha = crua.trim();
    if (!linha || linha.startsWith("#")) continue;
    const [de, para, codigo = "302"] = linha.split(/\s+/);
    regras.push({ de, para, codigo });
  }
  return regras;
}

/** Para onde a primeira regra que casa leva o endereço, ou `null`. */
export function destino(regras, endereco) {
  for (const { de, para, codigo } of regras) {
    if (de.endsWith("/*")) {
      const base = de.slice(0, -1);
      if (endereco.startsWith(base)) {
        return { para: para.replace(":splat", endereco.slice(base.length)), codigo };
      }
    } else if (de === endereco) {
      return { para, codigo };
    }
  }
  return null;
}

/** O arquivo do `out/` que o endereço serve, ou `null`. */
function arquivoDe(out, endereco) {
  const rel = endereco.replace(/^\//, "");
  const alvo = endereco.endsWith("/")
    ? path.join(out, rel, "index.html")
    : path.join(out, rel);
  return existsSync(alvo) ? alvo : null;
}

/** Os problemas: lista de frases. Vazio = aprovado. */
export function conferir({ out, lista, regras }) {
  const noSitemap = enderecosDoSitemap(out);
  const problemas = [];
  for (const velho of lista) {
    if (noSitemap.has(velho)) continue;
    const pedidos = [velho.slice(0, -1), velho, `${velho}dados.csv`];
    for (const pedido of pedidos) {
      const d = destino(regras, pedido);
      if (!d) {
        problemas.push(`${pedido}: saiu do sitemap e não tem regra no _redirects`);
      } else if (d.codigo !== "301") {
        problemas.push(`${pedido}: a regra dá ${d.codigo}, não 301`);
      } else if (!arquivoDe(out, d.para)) {
        problemas.push(`${pedido}: a regra leva a ${d.para}, que não existe no out/`);
      }
    }
  }
  const conhecidos = new Set(lista);
  const novos = [...noSitemap].filter((e) => !conhecidos.has(e)).sort();
  return { problemas, novos };
}

function principal() {
  const lista = readFileSync(LISTA, "utf8").split(/\r?\n/).map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const regras = lerRegras(readFileSync(REDIRECTS, "utf8"));
  const { problemas, novos } = conferir({ out: OUT, lista, regras });

  if (novos.length && process.argv.includes("--acrescentar") && !problemas.length) {
    const texto = readFileSync(LISTA, "utf8");
    const fim = texto.endsWith("\n") ? "" : "\n";
    writeFileSync(LISTA, texto + fim + novos.join("\n") + "\n");
    console.log(`acrescentados à lista: ${novos.length}`);
    novos.length = 0;
  }

  for (const p of problemas) console.error(`ENDEREÇO PERDIDO  ${p}`);
  for (const n of novos) console.error(`ENDEREÇO NOVO     ${n} (fora de cloudflare/enderecos-de-municipio.txt)`);
  console.log(`${lista.length} endereços na lista; ${problemas.length} perdidos; ${novos.length} novos fora da lista`);
  if (problemas.length || novos.length) {
    console.error(
      "Município renomeado: 301 do velho para o novo em cloudflare/_redirects " +
      "(sem barra, com barra/* e :splat) e o novo na lista. Município novo: " +
      "rodar com --acrescentar.");
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal();
}
