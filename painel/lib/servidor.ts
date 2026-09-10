import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Snapshot } from "./dados";
import type { SnapshotFiscal } from "./fiscal";
import type { SnapshotIdeb } from "./ideb";

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
 * A imagem do cartão de compartilhamento.
 *
 * É a mesma para todo o site, e isso é escolha, não preguiça: gerar uma por
 * município seriam **5.571 PNGs** no build, e o limite que morde nesta
 * hospedagem é armazenamento de deployment retido, não largura de banda (ver
 * `github.md`). O cartão já carrega o nome e os números daquele município no
 * **título e na descrição** — a imagem faz o trabalho de existir, que é o que
 * separa um link com cartão de um link cru na linha do tempo de alguém.
 */
const IMAGEM_SOCIAL = {
  url: "/opengraph-image.png",
  width: 1280,
  height: 640,
  type: "image/png",
} as const;

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
): { openGraph: Record<string, unknown>; twitter: Record<string, unknown> } {
  const url = `${SITE}${caminho}`;
  return {
    openGraph: {
      title: titulo,
      description: descricao,
      url,
      locale: "pt_BR",
      type: "article",
      images: [IMAGEM_SOCIAL],
    },
    // `summary_large_image` repetido aqui, e não herdado: se um dia o layout
    // mudar de card, estas 5.598 páginas mudam junto sem ninguém pedir.
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descricao,
      images: [IMAGEM_SOCIAL.url],
    },
  };
}
