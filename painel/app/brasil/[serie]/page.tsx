import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import SerieBrasilSvg from "../../componentes/serie-brasil-svg";
import ComoLer from "../../componentes/como-ler";
import { br } from "../../../lib/dados";
import {
  APRESENTACAO, caminhoDaSerie, descricaoDaSerie, FONTE_COM_ARTIGO, inicioPeriodo, porTema,
  rotuloPeriodo, tituloDaSerie, type SerieBrasil,
} from "../../../lib/brasil";
import { catalogoDe, licencaDaSerie, trilha, jsonLdHtml } from "../../../lib/jsonld";
import { cartaoSocial, lerBrasil, SITE } from "../../../lib/servidor";
import { CAMINHO, NotaFaixas, Presidencia, TITULO } from "../comum";
import estilos from "../brasil.module.css";

/**
 * Uma série do país, com o gráfico inteiro, a tabela e o CSV.
 *
 * Até 16/10/2026 as 15 séries moravam juntas em `/brasil/` (558 KB, 102 KB
 * comprimidos), e o endereço de uma era a âncora `/brasil/#<série>`. Agora
 * cada uma tem a sua página, com título, descrição e cartão próprios, e a
 * `/brasil/` é o índice (item 12 da modernização). As âncoras velhas
 * continuam caindo no cartão da série, que leva o mesmo `id`.
 *
 * O desenho e as regras de neutralidade são as do componente
 * (`serie-brasil-svg.tsx`); a nota das faixas e a tabela de quem ocupou o
 * cargo vêm de `../comum.tsx`, as mesmas do índice.
 */
export const dynamicParams = false;

export async function generateStaticParams() {
  const { series } = await lerBrasil();
  return series.map((s) => ({ serie: s.codigo }));
}

type Props = { params: Promise<{ serie: string }> };

async function serieDe(params: Props["params"]): Promise<SerieBrasil> {
  const { serie } = await params;
  const s = (await lerBrasil()).series.find((x) => x.codigo === serie);
  if (!s) notFound();
  return s;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await serieDe(params);
  const caminho = caminhoDaSerie(s.codigo);
  const titulo = tituloDaSerie(s);
  const descricao = descricaoDaSerie(s);
  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: `${SITE}${caminho}` },
    ...cartaoSocial(titulo, descricao, caminho, `/og/brasil-${s.codigo}.png`),
  };
}

export default async function Pagina({ params }: Props) {
  const s = await serieDe(params);
  const b = await lerBrasil();
  const caminho = caminhoDaSerie(s.codigo);
  const nome = APRESENTACAO[s.codigo]?.titulo ?? s.nome;
  const csv = `${caminho}dados.csv`;
  const [primeiro, ultimo] = [s.pontos[0]![0], s.pontos.at(-1)![0]];
  const outras = b.series.filter((x) => x.codigo !== s.codigo);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${nome}: Brasil`,
    description: descricaoDaSerie(s),
    url: `${SITE}${caminho}`,
    license: licencaDaSerie(s),
    isAccessibleForFree: true,
    isBasedOn: [s.origem],
    inLanguage: "pt-BR",
    creator: { "@type": "Person", name: "Peter Wilhelm Kretzschmar" },
    identifier: `${SITE}${caminho}`,
    temporalCoverage:
      `${Math.floor(inicioPeriodo(primeiro))}/${Math.floor(inicioPeriodo(ultimo))}`,
    variableMeasured: [s.nome],
    includedInDataCatalog: catalogoDe(SITE),
    spatialCoverage: { "@type": "Place", name: "Brasil" },
    distribution: [{
      "@type": "DataDownload",
      encodingFormat: "text/csv",
      contentUrl: `${SITE}${csv}`,
      name: `${nome} em CSV`,
    }],
  };

  return (
    <main className={estilos.pagina} id="conteudo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml({
            "@context": "https://schema.org",
            ...trilha(SITE, [
              { nome: "Números Públicos", caminho: "/" },
              { nome: TITULO, caminho: CAMINHO },
              { nome, caminho },
            ]),
          }),
        }}
      />
      <nav className={estilos.trilha} aria-label="Você está em">
        <Link href="/" prefetch={false}>Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        <Link href={CAMINHO} prefetch={false}>{TITULO}</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{nome}</span>
      </nav>

      <h1 className={estilos.titulo}>{nome}</h1>
      <p className={estilos.chamada}>
        Série do país {FONTE_COM_ARTIGO[s.fonte] ?? s.fonte}, de{" "}
        {rotuloPeriodo(primeiro)} a {rotuloPeriodo(ultimo)}: os{" "}
        {br(s.pontos.length)} valores, desde o primeiro que a fonte publica
        nesta forma. Ao fundo, quem ocupava a Presidência da República em cada
        período.
      </p>
      <ComoLer tipo="brasil" />
      <NotaFaixas />

      <div className={estilos.serie}>
        <SerieBrasilSvg serie={s} mandatos={b.mandatos} csv={csv}
          meta={b.metaInflacao} comTitulo={false} />
      </div>

      <Presidencia mandatos={b.mandatos} />

      <section aria-labelledby="outras">
        <h2 id="outras" className={estilos.secao}>As outras séries do país</h2>
        {porTema(outras).map((g) => (
          <div key={g.id}>
            <h3 className={estilos.tema}>{g.nome}</h3>
            <ul className={estilos.outras}>
              {g.series.map((x) => (
                <li key={x.codigo}>
                  <Link href={caminhoDaSerie(x.codigo)} prefetch={false}>
                    {APRESENTACAO[x.codigo]?.titulo ?? x.nome}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className={estilos.texto}>
          <Link href={CAMINHO} prefetch={false}>Todas as {b.series.length} séries</Link>,
          com o último valor de cada uma e{" "}
          <Link href={`${CAMINHO}#metodo`} prefetch={false}>como cada uma é
          conferida</Link>.
        </p>
      </section>
      {/* Os botões de período do gráfico (Tudo · 10 anos · 5 anos): nascem
          escondidos, e sem o script o gráfico inteiro continua. */}
      <script type="module" src="/periodo.js" />
    </main>
  );
}
