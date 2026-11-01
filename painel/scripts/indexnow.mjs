/**
 * Avisa os buscadores que o site mudou, pelo protocolo IndexNow.
 *
 *     node scripts/indexnow.mjs            # só as páginas que mudaram desde o último envio
 *     node scripts/indexnow.mjs --seco     # mostra o que faria, sem enviar
 *     node scripts/indexnow.mjs --marcar   # grava a impressão atual, sem enviar
 *     node scripts/indexnow.mjs --forcar   # manda todas de qualquer jeito
 *
 * ## Por que isto existe
 *
 * Medido em 04/09/2026, um dia depois de publicar: o Google tinha **detectado**
 * as 5.600 URLs pelo sitemap e **rastreado apenas a capa**. Sitemap resolve
 * descoberta; ele não apressa nada. IndexNow é o outro lado — um aviso ativo de
 * que a URL mudou, e o buscador prioriza a fila dele.
 *
 * ## Quem escuta
 *
 * Bing, Yandex, Naver, Seznam, Yep e Amazon — não o Google, que mantém a API de
 * indexação restrita a ofertas de emprego e transmissões ao vivo.
 *
 * **E o Bing é a razão principal de valer a pena**, não pela busca dele: é o
 * índice que alimenta o ChatGPT Search e o Copilot. Para um site cujo conteúdo
 * é resposta factual com fonte ao lado, ser citável por assistente é
 * provavelmente mais valioso do que posição no Bing.
 *
 * ## A trava: só envia a página cujo conteúdo mudou
 *
 * A orientação do protocolo é enviar **quando o conteúdo muda**, e um site
 * estático se reconstrói inteiro a cada deploy — inclusive quando o que mudou
 * foi uma cor de CSS. Mandar 5.600 URLs por causa disso é abusar de uma cota
 * que cada buscador define e não publica.
 *
 * Até 01/11/2026 a trava era a impressão digital dos arquivos de `dados/`
 * inteiros: qualquer mudança neles (a Selic do mês, que só aparece em
 * `/brasil/`) mandava as ~5.600 URLs de uma vez. Lido em 01/11 no Bing
 * Webmaster Tools: "IndexNow is in batch mode" (moderado), com a orientação de
 * mandar só o que mudou, quando mudou.
 *
 * Agora a impressão é **por página**, tirada do HTML gerado sem o que é layout
 * (ver `impressaoDaPagina`), e o `.indexnow.json` guarda a de cada URL no
 * último envio. Vão só as URLs novas ou cuja impressão mudou. Um texto comum a
 * todas as páginas (o rodapé) ainda manda todas: é conteúdo, e o buscador deve
 * saber.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PAINEL = path.resolve(AQUI, "..");

const CHAVE = "f0aeb82722eec0f6b54f7d0c9b4274c8";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.numerospublicos.com.br";
const ENDPOINT = "https://api.indexnow.org/indexnow";
/** O protocolo recusa acima disto, com HTTP 422. */
const LOTE = 10000;
const ESTADO = path.join(PAINEL, ".indexnow.json");

const args = new Set(process.argv.slice(2));
const forcar = args.has("--forcar");
const seco = args.has("--seco");
const marcar = args.has("--marcar");

/**
 * A impressão digital do que a página *diz*: o título, a descrição, o JSON-LD
 * e o texto visível (os `<title>` dos gráficos entram, com o número de cada
 * barra). Fica de fora o que muda com o layout — o nome dos arquivos de CSS e
 * de JS, classes, atributos —, para que um ajuste de estilo não avise ninguém
 * e uma coleta nova avise só as páginas que ela mudou.
 */
export function impressaoDaPagina(html) {
  const titulo = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const meta = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const jsonld = [...html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )].map((m) => m[1]);
  const corpo = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const texto = (corpo ? corpo[1] : html)
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256")
    .update([titulo?.[1] ?? "", meta?.[1] ?? "", ...jsonld, texto].join("\u0000"))
    .digest("hex")
    .slice(0, 12);
}

/** O arquivo do `out/` que responde pela URL (`/x/` é `x/index.html`). */
export function arquivoDaUrl(url, out) {
  const caminho = decodeURIComponent(new URL(url).pathname);
  return path.join(out, caminho.endsWith("/") ? `${caminho}index.html` : caminho);
}

/**
 * Os caminhos novos ou com impressão diferente da do último envio. Sem estado
 * por página (primeiro envio, ou o formato de antes de 01/11), todos contam.
 */
export function mudadas(atual, anterior) {
  return Object.keys(atual).filter((c) => anterior?.[c] !== atual[c]);
}

/** Quantas URLs por seção (`/municipio/`, `/estado/`…), para o `--seco`. */
export function porSecao(caminhos) {
  const n = new Map();
  for (const c of caminhos) {
    const secao = `/${c.split("/")[1] ?? ""}`;
    n.set(secao, (n.get(secao) ?? 0) + 1);
  }
  return [...n].sort((a, b) => b[1] - a[1]);
}

/**
 * As URLs do sitemap gerado. Fonte única: se não está lá, não existe.
 *
 * **Desde 09/09/2026 `/sitemap.xml` é um ÍNDICE**, e este leitor segue os
 * filhos. Antes ele fazia um regex de `<loc>` no arquivo e pronto — e com o
 * índice aquele mesmo regex devolveria **28 arquivos de sitemap em vez de 5.601
 * páginas**, sem erro nenhum, anunciando ao buscador as URLs erradas.
 *
 * A guarda contra isso não é o `sitemapindex` no texto: é exigir que o
 * resultado final tenha ordem de grandeza de site, e não de índice. Um índice
 * lido como lista de páginas passaria em qualquer verificação de forma.
 */
function urlsDoSitemap() {
  const xml = path.join(PAINEL, "out", "sitemap.xml");
  if (!existsSync(xml)) {
    throw new Error(
      "out/sitemap.xml não existe — rode `npm run build` antes. Enviar URLs " +
      "que o build ainda não publicou pediria ao buscador para rastrear 404.",
    );
  }
  const locs = (texto) =>
    [...texto.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  const raiz = readFileSync(xml, "utf-8");
  if (!raiz.includes("<sitemapindex")) return locs(raiz);

  const urls = [];
  for (const filho of locs(raiz)) {
    // O índice traz URL absoluta; o arquivo mora no `out/` pelo caminho dela.
    const caminho = path.join(PAINEL, "out", new URL(filho).pathname);
    if (!existsSync(caminho)) {
      throw new Error(
        `o índice aponta para ${filho} e o arquivo não existe em out/. ` +
        "Enviar URLs de um sitemap que o build não produziu pediria ao " +
        "buscador para rastrear 404.",
      );
    }
    urls.push(...locs(readFileSync(caminho, "utf-8")));
  }
  return urls;
}

async function enviar(urls) {
  const corpo = JSON.stringify({
    host: new URL(SITE).host,
    key: CHAVE,
    keyLocation: `${SITE}/${CHAVE}.txt`,
    urlList: urls,
  });
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: corpo,
  });
  return { status: r.status, texto: (await r.text()).slice(0, 300) };
}

/**
 * O que cada código significa. Traduzido porque `200` e `202` são os dois
 * sucessos e `403` é o único que exige ação humana — e ler isso na hora
 * evita concluir "não funcionou" de um `202`.
 */
const SIGNIFICADO = {
  200: "aceito",
  202: "aceito; a chave ainda está sendo validada",
  400: "requisição malformada",
  403: "chave recusada",
  422: "URLs fora do domínio declarado, ou lote grande demais",
  429: "cota excedida — esperar e repetir",
};

/**
 * O 403 tem DOIS significados opostos, e o corpo da resposta é quem separa.
 *
 * Medido em 04/09/2026, no primeiro envio real: a conferência prévia passou —
 * a chave estava no ar, 32 bytes, `text/plain` — e mesmo assim veio 403, com
 * `errorCode: "SiteVerificationNotCompleted"`. **A verificação do IndexNow é
 * assíncrona**: publicar a chave não a conclui, só a torna possível.
 *
 * O rótulo original dizia "CHAVE INVÁLIDA — o arquivo na raiz não confere", e
 * teria mandado quem lesse conferir um arquivo perfeito. Um diagnóstico que
 * aponta para o lugar errado custa mais que nenhum diagnóstico.
 *
 * A conferência prévia continua valendo: ela é necessária e não suficiente.
 */
function diagnostico(status, corpo) {
  if (status !== 403) return SIGNIFICADO[status] ?? "código inesperado";
  let codigo = "";
  try {
    codigo = JSON.parse(corpo).errorCode ?? "";
  } catch {
    // Corpo não-JSON: cai no genérico, e o corpo cru é impresso de qualquer
    // forma pelo chamador.
  }
  if (codigo === "SiteVerificationNotCompleted") {
    return "a verificação do domínio ainda não concluiu — ESPERAR e repetir, " +
           "a chave está certa";
  }
  return `chave recusada${codigo ? ` (${codigo})` : ""} — conferir se o ` +
         "arquivo na raiz tem exatamente a chave enviada";
}

/**
 * O fluxo inteiro numa função, para poder sair por `return`.
 *
 * `process.exit()` com uma requisição em voo **aborta o processo no Windows**
 * — `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` — e o código de
 * saída se perde no meio do estouro. Quem chama o script num pipeline conclui
 * "passou" de uma falha. Sair por `return` deixa o Node fechar os handles.
 */
async function principal() {
  const out = path.join(PAINEL, "out");
  const atual = {};
  for (const url of urlsDoSitemap()) {
    const arquivo = arquivoDaUrl(url, out);
    if (!existsSync(arquivo)) {
      throw new Error(
        `${url} está no sitemap e ${path.relative(PAINEL, arquivo)} não existe. ` +
        "Enviar uma URL que o build não produziu pediria ao buscador para " +
        "rastrear 404.",
      );
    }
    atual[new URL(url).pathname] = impressaoDaPagina(readFileSync(arquivo, "utf-8"));
  }
  const total = Object.keys(atual).length;

  const anterior = existsSync(ESTADO)
    ? JSON.parse(readFileSync(ESTADO, "utf-8"))
    : null;
  if (anterior) console.log(`último envio: ${anterior.em} (${anterior.urls} URLs no sitemap)`);
  if (anterior && !anterior.paginas) {
    console.log(
      "O estado é do formato antigo, sem impressão por página: todas as URLs " +
      "contam como mudadas.\n  (`--marcar` grava a base sem enviar.)",
    );
  }

  const caminhos = forcar ? Object.keys(atual) : mudadas(atual, anterior?.paginas);
  console.log(
    `\n${total} URLs no sitemap; ${caminhos.length} ` +
    `${forcar ? "a enviar (--forcar)" : "com conteúdo novo ou mudado desde o último envio"}.`,
  );

  const gravar = (enviadas) => writeFileSync(
    ESTADO,
    `${JSON.stringify({
      em: new Date().toISOString(),
      urls: total,
      enviadas,
      paginas: Object.fromEntries(Object.entries(atual).sort(([a], [b]) => (a < b ? -1 : 1))),
    }, null, 2)}\n`,
    "utf-8",
  );

  if (marcar) {
    if (seco) {
      console.log("\n(--seco: nada gravado.)");
      return 0;
    }
    gravar(0);
    console.log("\n--marcar: impressão gravada em .indexnow.json, nada enviado.");
    return 0;
  }

  if (caminhos.length === 0) {
    console.log("\nNenhuma página mudou desde o último envio. Nada a avisar.");
    return 0;
  }

  if (seco) {
    console.log("\nPor seção:");
    for (const [secao, n] of porSecao(caminhos)) console.log(`  ${secao.padEnd(16)} ${n}`);
    console.log("\nAmostra:");
    for (const c of caminhos.slice(0, 5)) console.log(`  ${SITE}${c}`);
    console.log("\n(--seco: nada enviado, nada gravado.)");
    return 0;
  }

  /**
   * A chave TEM de estar no ar antes de submeter.
   *
   * Sem isto, o primeiro envio depois de gerar a chave volta **403** — e o 403 é
   * o único código que exige ação humana, então gastar uma submissão para
   * descobrir que o deploy ainda não subiu é o erro fácil de cometer uma vez por
   * chave. A conferência custa uma requisição e é feita contra o site VIVO,
   * nunca contra o `out/` local: o que o buscador vai ler é o publicado.
   */
  async function chaveNoAr() {
    const url = `${SITE}/${CHAVE}.txt`;
    try {
      const r = await fetch(url);
      if (!r.ok) return { ok: false, motivo: `HTTP ${r.status}` };
      const corpo = (await r.text()).trim();
      if (corpo !== CHAVE) {
        return { ok: false, motivo: `conteúdo diferente da chave (${corpo.length} bytes)` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, motivo: String(e).split("\n")[0] };
    }
  }

  const chave = await chaveNoAr();
  if (!chave.ok) {
    console.error(
      `\nA chave não está acessível em ${SITE}/${CHAVE}.txt — ${chave.motivo}.\n` +
      "Publique o site antes de avisar os buscadores: submeter com a chave fora " +
      "do ar devolve 403 e gasta a submissão.",
    );
    return 1;
  }
  console.log(`chave conferida no ar: ${SITE}/${CHAVE}.txt`);

  const urls = caminhos.map((c) => `${SITE}${c}`);
  let falhou = false;
  for (let i = 0; i < urls.length; i += LOTE) {
    const lote = urls.slice(i, i + LOTE);
    const { status, texto } = await enviar(lote);
    const nota = diagnostico(status, texto);
    console.log(`lote de ${lote.length}: HTTP ${status} — ${nota}`);
    if (texto.trim()) console.log(`  resposta: ${texto.trim()}`);
    if (status !== 200 && status !== 202) falhou = true;
  }

  if (falhou) {
    console.log("\nEnvio não concluído. O estado NÃO foi gravado, então a " +
                "próxima execução tenta de novo.");
    return 1;
  }

  gravar(urls.length);
  console.log(`\n✓ ${urls.length} URLs avisadas. Estado gravado em .indexnow.json.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await principal();
}
