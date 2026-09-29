import {
  atualizadoEm, caminhosDosFilhos, indiceDeSitemaps, ufsComSitemap,
} from "../../lib/sitemap";
import { dadoAtualizadoEm } from "../../lib/inss";
import { lerCaged, lerFiscal, lerInss, lerSnapshot, SITE } from "../../lib/servidor";

/**
 * `/sitemap.xml` — o ÍNDICE, e não mais a lista de URLs.
 *
 * ## Por que é um route handler, e não a convenção `app/sitemap.ts`
 *
 * A convenção do App Router só produz `<urlset>`: o tipo `MetadataRoute.Sitemap`
 * é uma lista de URLs, e não há forma de emitir `<sitemapindex>` por ela. E o
 * `generateSitemaps`, que divide um sitemap em vários, **não gera o índice** —
 * verificado na documentação da própria versão em uso antes de escrever isto.
 *
 * Então `app/sitemap.ts` saiu e este entrou no mesmo endereço. É o mesmo padrão
 * dos downloads (`app/dados/municipios.csv/route.ts`): segmento com ponto no
 * nome, `dynamic = "force-static"`, e o arquivo nasce no build.
 *
 * ## O que quebra ao trocar a forma deste arquivo
 *
 * **`scripts/indexnow.mjs` lia as URLs daqui**, com um regex de `<loc>`, e o
 * comentário dele dizia *"fonte única: se não está lá, não existe"*. Com um
 * índice, aquele regex passaria a devolver **28 arquivos de sitemap em vez de
 * 5.601 páginas** — e o envio seguiria, sem erro, anunciando ao buscador as
 * URLs erradas. Ele foi ensinado a seguir o índice junto com esta mudança.
 *
 * *A pergunta que a lista de verificação precisa responder ao trocar a forma de
 * um artefato não é "quem escreve nele?", é "quem LÊ dele?".*
 */

export const dynamic = "force-static";

export async function GET() {
  const [snapshot, fiscal, inss, caged] = await Promise.all([
    lerSnapshot(), lerFiscal(), lerInss(), lerCaged(),
  ]);
  const dataInss = dadoAtualizadoEm(inss);
  const caminhos = caminhosDosFilhos(ufsComSitemap(snapshot));
  // Os sitemaps de MUNICÍPIO levam também a data do Caged, que só muda as
  // páginas de município; o geral (capa, ajuda, estados) fica com a das
  // fontes que o mudam. É a mesma regra do filho do INSS: exagerar a mudança
  // gasta o rastreamento em página igual.
  const dataMunicipios = atualizadoEm(snapshot, fiscal, caged.coletadoEm);
  const porFilho: Record<string, Date> = Object.fromEntries(
    caminhos.filter((c) => c.startsWith("/municipio/"))
      .map((c) => [c, dataMunicipios]));
  if (dataInss) porFilho["/inss/sitemap.xml"] = new Date(dataInss);
  const corpo = indiceDeSitemaps(
    SITE,
    caminhos,
    atualizadoEm(snapshot, fiscal),
    porFilho,
  );
  return new Response(corpo, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
