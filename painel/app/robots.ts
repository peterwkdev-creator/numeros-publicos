import type { MetadataRoute } from "next";

import { SITE } from "../lib/servidor";

// Com `output: "export"`, sitemap e robots sao route handlers e o Next exige
// que sejam declarados estaticos -- sem isto o build morre com
// `export const dynamic = "force-static" not configured on route`. Nao e
// opcional aqui: nao existe servidor para gerar isto sob demanda.
export const dynamic = "force-static";


/**
 * `robots.txt`, publicado pela convenção de arquivo do App Router.
 *
 * Antes disto o site respondia **404** em `/robots.txt` e em `/sitemap.xml` —
 * medido em 03/09/2026. Não é fatal, mas é o primeiro lugar onde um rastreador
 * olha, e um 404 ali não dá nenhuma pista de que existem 5.603 páginas.
 *
 * Tudo é liberado de propósito: é dado público, republicado sob a licença de
 * cada fonte (ver `LICENCA_DADOS` em `lib/jsonld.ts`), e não há nada aqui que
 * não deva ser indexado.
 *
 * **Menos os `dados.csv` de cada página** (02/11/2026). Eles já respondem
 * `X-Robots-Tag: noindex`, mas o Google precisa baixar o arquivo para ver
 * isso: na amostra de 30/10, 2 das 10 "rastreadas, não indexadas" eram
 * `dados.csv`, enquanto 3.966 páginas seguiam sem visita nenhuma. Bloquear
 * aqui deixa essas visitas para as páginas. A base nacional
 * (`/dados/municipios.{csv,xlsx}`) fica liberada: é a `distribution` que o
 * Dataset Search deve achar.
 */
const BLOQUEADOS = [
  "/municipio/*/dados.csv",
  "/estado/*/dados.csv",
  "/brasil/*/dados.csv",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: BLOQUEADOS },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
