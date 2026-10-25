import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Snapshot } from "./dados";
import type { SnapshotFiscal } from "./fiscal";
import type { SnapshotEstadosFiscal } from "./estados-fiscal";
import type { SnapshotIdeb } from "./ideb";
import type { SnapshotInss } from "./inss";
import type { SnapshotCaged, SnapshotCagedAnos } from "./caged";
import type { SnapshotEmendas } from "./emendas";
import type { SnapshotRegioes } from "./estado";
import type { SnapshotBrasil } from "./brasil";

/**
 * Leitura do snapshot gerado pelo motor Python. **Só no servidor.**
 *
 * Roda no build, num Server Component: o arquivo é lido do disco, não buscado
 * por rede. O visitante recebe HTML pronto, e o painel não tem responsabilidade
 * nenhuma de coletar dado — é a costura desenhada no ESPEC.md entre as duas
 * linguagens.
 *
 * Fica separado de `lib/dados.ts` porque aquele é importado também pelo
 * componente de cliente, e `node:fs` não pode ir para o navegador.
 */

let cache: Snapshot | null = null;

export async function lerSnapshot(): Promise<Snapshot> {
  if (cache) return cache;
  const arquivo = path.join(process.cwd(), "dados", "snapshot.json");
  cache = JSON.parse(await readFile(arquivo, "utf-8")) as Snapshot;
  return cache;
}

/**
 * O snapshot fiscal, entregue pelo motor do `sys-painel-fiscal` e versionado
 * aqui como `dados/fiscal.json`. Mesma leitura de disco no build, mesma razão.
 */
let cacheFiscal: SnapshotFiscal | null = null;

export async function lerFiscal(): Promise<SnapshotFiscal> {
  if (cacheFiscal) return cacheFiscal;
  const arquivo = path.join(process.cwd(), "dados", "fiscal.json");
  cacheFiscal = JSON.parse(await readFile(arquivo, "utf-8")) as SnapshotFiscal;
  return cacheFiscal;
}

/**
 * O dado dos 26 governos estaduais e do DF (`dados/estados-fiscal.json`),
 * entregue pelo `exportar-estados` do motor fiscal. Separado do
 * `fiscal.json` dos municípios: ver o topo de `lib/estados-fiscal.ts`.
 */
let cacheEstadosFiscal: SnapshotEstadosFiscal | null = null;

export async function lerEstadosFiscal(): Promise<SnapshotEstadosFiscal> {
  if (cacheEstadosFiscal) return cacheEstadosFiscal;
  const arquivo = path.join(process.cwd(), "dados", "estados-fiscal.json");
  cacheEstadosFiscal = JSON.parse(await readFile(arquivo, "utf-8")) as SnapshotEstadosFiscal;
  return cacheEstadosFiscal;
}

/**
 * O IDEB, entregue pelo motor do `sys-educacao-inep`. Duas etapas, dois
 * arquivos — e eles NÃO devem ser fundidos num só: anos iniciais e anos finais
 * têm escalas diferentes, e juntá-los num objeto convidaria a somá-los.
 */
const cacheIdeb: Record<string, SnapshotIdeb> = {};

export async function lerIdeb(
  etapa: "anos_iniciais" | "anos_finais" = "anos_iniciais",
): Promise<SnapshotIdeb> {
  const existente = cacheIdeb[etapa];
  if (existente) return existente;
  const nome = etapa === "anos_iniciais" ? "ideb.json" : "ideb-finais.json";
  const arquivo = path.join(process.cwd(), "dados", nome);
  const lido = JSON.parse(await readFile(arquivo, "utf-8")) as SnapshotIdeb;
  cacheIdeb[etapa] = lido;
  return lido;
}

/**
 * O INSS por grupo, escrito por `python -m numeros_publicos inss-exportar`.
 * Banco próprio (`inss.db`), sem relação com o snapshot do IBGE: são fontes e
 * ritmos diferentes, e fundi-los convidaria a juntar números que não se somam.
 */
let cacheInss: SnapshotInss | null = null;

/** As regiões imediatas do IBGE, para os "outros municípios" (11/10/2026). */
let cacheRegioes: SnapshotRegioes | null = null;

export async function lerRegioes(): Promise<SnapshotRegioes> {
  if (cacheRegioes) return cacheRegioes;
  const arquivo = path.join(process.cwd(), "dados", "regioes.json");
  cacheRegioes = JSON.parse(await readFile(arquivo, "utf-8")) as SnapshotRegioes;
  return cacheRegioes;
}

export async function lerInss(): Promise<SnapshotInss> {
  if (cacheInss) return cacheInss;
  const arquivo = path.join(process.cwd(), "dados", "inss.json");
  cacheInss = JSON.parse(await readFile(arquivo, "utf-8")) as SnapshotInss;
  return cacheInss;
}

/**
 * O Novo Caged, escrito por `python -m numeros_publicos caged-exportar` depois de
 * conferido contra o sumário do Ministério do Trabalho. Arquivo próprio, pela
 * razão do INSS: outra fonte, outro ritmo (mensal), e nada nele se soma ao
 * snapshot do IBGE.
 */
let cacheCaged: SnapshotCaged | null = null;

export async function lerCaged(): Promise<SnapshotCaged> {
  if (cacheCaged) return cacheCaged;
  const arquivo = path.join(process.cwd(), "dados", "caged.json");
  cacheCaged = JSON.parse(await readFile(arquivo, "utf-8")) as SnapshotCaged;
  return cacheCaged;
}

/**
 * Lê `dados/caged-anos.json` (a série anual do Novo Caged por município) uma
 * vez por build. Mesmo arranjo de `lerCaged`.
 */
let cacheCagedAnos: SnapshotCagedAnos | null = null;

export async function lerCagedAnos(): Promise<SnapshotCagedAnos> {
  if (cacheCagedAnos) return cacheCagedAnos;
  const arquivo = path.join(process.cwd(), "dados", "caged-anos.json");
  cacheCagedAnos = JSON.parse(await readFile(arquivo, "utf-8")) as SnapshotCagedAnos;
  return cacheCagedAnos;
}

/**
 * As emendas parlamentares pagas à prefeitura, escritas por `python -m
 * numeros_publicos emendas-exportar` com a soma fechada contra o banco (que
 * confere com o CSV da CGU ao centavo). Arquivo próprio, pela razão do Caged:
 * outra fonte e outro ritmo.
 */
let cacheEmendas: SnapshotEmendas | null = null;

export async function lerEmendas(): Promise<SnapshotEmendas> {
  if (cacheEmendas) return cacheEmendas;
  const arquivo = path.join(process.cwd(), "dados", "emendas.json");
  cacheEmendas = JSON.parse(await readFile(arquivo, "utf-8")) as SnapshotEmendas;
  return cacheEmendas;
}

/**
 * O Brasil ao longo do tempo, escrito por `python -m numeros_publicos
 * brasil-exportar`: as séries do país, cada uma conferida ponto a ponto por
 * uma segunda leitura da fonte, e quem ocupava a Presidência.
 */
let cacheBrasil: SnapshotBrasil | null = null;

export async function lerBrasil(): Promise<SnapshotBrasil> {
  if (cacheBrasil) return cacheBrasil;
  const arquivo = path.join(process.cwd(), "dados", "brasil.json");
  cacheBrasil = JSON.parse(await readFile(arquivo, "utf-8")) as SnapshotBrasil;
  return cacheBrasil;
}

/**
 * O endereço canônico do site, em variável de ambiente.
 *
 * O dominio proprio entrou em 03/09/2026: `numerospublicos.com.br`, registrado
 * no registro.br. O canonical e o `www`, e nao a raiz, porque `www` e um CNAME
 * que acompanha a Vercel sozinho -- a raiz seria um registro A com IP fixo, e a
 * propria Vercel avisa que esta expandindo a faixa de IPs. Site que quebra
 * quando um IP muda exige manutencao manual, que e o oposto do objetivo.
 *
 * A variavel continua existindo porque cravar endereco no codigo significaria
 * reescrever 5.571 tags `canonical` na proxima mudanca.
 */
export const SITE =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://www.numerospublicos.com.br";

/**
 * A imagem do cartão de compartilhamento: uma por estado, e não uma por página.
 *
 * Até 15/10/2026 o site inteiro mostrava a da capa (item 12 da revisão de
 * 11/10). Uma por município seriam **5.571 PNGs** num deploy que já tem
 * 11.296 arquivos, com teto de 20.000 na Cloudflare Pages. Com uma por
 * estado, o município mostra o mapa do seu estado, e o nome e os números dele
 * seguem no **título e na descrição** do cartão.
 *
 * Os PNGs saem de `scripts/gerar-cartoes.mjs`, rodado à mão, e ficam em
 * `public/og/`; o teste confere que existe um 1280×640 para cada UF. Sem
 * `imagem`, vale o da capa (`app/opengraph-image.png`).
 */
const IMAGEM_SOCIAL = {
  url: "/opengraph-image.png",
  width: 1280,
  height: 640,
  type: "image/png",
} as const;

/** O cartão do estado, que também é o dos municípios dele. */
export function imagemDoEstado(sigla: string): string {
  return `/og/${sigla.toLowerCase()}.png`;
}

/**
 * O cartão que aparece quando alguém cola o link — declarado nos DOIS
 * vocabulários, de propósito.
 *
 * ## O que estava errado, medido em 07/09/2026
 *
 * As páginas de município e de estado montavam `openGraph` no
 * `generateMetadata`, e isso **substitui** o objeto do layout inteiro em vez de
 * completá-lo. Duas consequências, nenhuma visível no site:
 *
 * - **`og:image` sumia.** A imagem do layout vem da convenção de arquivo
 *   (`app/opengraph-image.png`) e viajava dentro daquele objeto. Resultado:
 *   5.598 páginas compartilhavam sem cartão nenhum.
 * - **`twitter:*` ficava genérico.** Como as rotas não declaravam `twitter`,
 *   herdavam o do layout — e no X toda página de município se anunciava como
 *   *"Números Públicos · Dados abertos dos 5.571 municípios do Brasil"*, com o
 *   título e a descrição da capa.
 *
 * O segundo é o pior dos dois: o primeiro tira o cartão, o segundo **põe o
 * cartão errado**. E nenhum aparece na tela, na auditoria ou no HTML que se lê
 * de passagem — só ao colar o link em algum lugar.
 *
 * ## Por que os dois, e não só `og:`
 *
 * WhatsApp, LinkedIn, Slack, Discord e Facebook leem `og:`. **O X prefere
 * `twitter:` quando existe** — e existia, vindo do layout. Declarar os dois com
 * o mesmo conteúdo é o que faz o cartão ser o mesmo em todo lugar.
 */
export function cartaoSocial(
  titulo: string,
  descricao: string,
  caminho: string,
  imagem: string = IMAGEM_SOCIAL.url,
): { openGraph: Record<string, unknown>; twitter: Record<string, unknown> } {
  const url = `${SITE}${caminho}`;
  return {
    openGraph: {
      title: titulo,
      description: descricao,
      url,
      locale: "pt_BR",
      type: "article",
      images: [{ ...IMAGEM_SOCIAL, url: imagem }],
    },
    // `summary_large_image` repetido aqui, e não herdado: se um dia o layout
    // mudar de card, estas 5.598 páginas mudam junto sem ninguém pedir.
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descricao,
      images: [imagem],
    },
  };
}
