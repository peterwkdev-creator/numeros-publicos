import type { Metadata } from "next";
import Link from "next/link";

import CartaoSerieBrasil from "../componentes/cartao-serie-brasil";
import ComoLer from "../componentes/como-ler";
import { br, dataCurta } from "../../lib/dados";
import {
  APRESENTACAO, dominio, fontesPorExtenso, inicioPeriodo, porTema, rotuloPeriodo,
  type SnapshotBrasil,
} from "../../lib/brasil";
import { catalogoDe, licencaDaSerie, trilha } from "../../lib/jsonld";
import { cartaoSocial, lerBrasil, SITE } from "../../lib/servidor";
import { CAMINHO, NotaFaixas, Presidencia, TITULO } from "./comum";
import estilos from "./brasil.module.css";

/**
 * O índice das séries do país: um cartão por série, com o último valor, e a
 * página de cada uma em `/brasil/<série>/` (desde 16/10/2026, item 12 da
 * modernização; antes, os 15 gráficos aqui, 102 KB comprimidos).
 *
 * A espec é `especs/numeros-publicos-brasil-no-tempo.md`, no repositório de
 * trabalho; as regras de neutralidade (seção 4) moram em `lib/brasil.ts` e no
 * componente do gráfico, e viram teste em `tests/brasil.test.mts`. Aqui ficam
 * a nota que diz o que as faixas NÃO medem, a tabela de quem ocupou o cargo
 * com a fonte de cada data, e como cada série é conferida.
 */
export async function generateMetadata(): Promise<Metadata> {
  const b = await lerBrasil();
  // Até 160 caracteres, que é onde o Google corta (a auditoria cobra).
  const descricao =
    "PIB, desemprego, renda, pobreza, inflação, dólar, juros, salário " +
    `mínimo, dívida e resultado primário desde ${anoInicial(b)}, com quem ` +
    "ocupava a Presidência. Dados oficiais.";
  return {
    title: `${TITULO}: economia e contas públicas`,
    description: descricao,
    alternates: { canonical: `${SITE}${CAMINHO}` },
    ...cartaoSocial(`${TITULO}: economia e contas públicas`, descricao, CAMINHO, "/og/brasil.png"),
  };
}

function anoInicial(b: SnapshotBrasil): number {
  return Math.floor(dominio(b.series)[0]);
}

const csvDe = (codigo: string) => `${CAMINHO}${codigo}/dados.csv`;

export default async function Pagina() {
  const b = await lerBrasil();
  const ultimos = b.series.map((s) => s.pontos[s.pontos.length - 1]![0]);
  const coleta = b.series.map((s) => s.coletadoEm).sort()[0]!;
  const fontes = [...new Set(b.series.map((s) => s.fonte))];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: TITULO,
    description:
      "Séries nacionais de atividade, trabalho, preços e contas públicas, " +
      "cada uma conferida ponto a ponto por uma segunda leitura da fonte, " +
      "com as datas de quem ocupava a Presidência da República.",
    url: `${SITE}${CAMINHO}`,
    // Uma licença só se todas as séries a têm: com o PRODES (CC BY-SA) ao
    // lado do SGS (ODbL), o índice não declara uma, e cada série declara a sua.
    ...(new Set(b.series.map(licencaDaSerie)).size === 1
      ? { license: licencaDaSerie(b.series[0]!) } : {}),
    isAccessibleForFree: true,
    isBasedOn: b.series.map((s) => s.origem),
    inLanguage: "pt-BR",
    creator: { "@type": "Person", name: "Peter Wilhelm Kretzschmar" },
    identifier: `${SITE}${CAMINHO}`,
    temporalCoverage:
      `${anoInicial(b)}/${Math.max(...ultimos.map((p) => Math.floor(inicioPeriodo(p))))}`,
    variableMeasured: b.series.map((s) => s.nome),
    includedInDataCatalog: catalogoDe(SITE),
    spatialCoverage: { "@type": "Place", name: "Brasil" },
    distribution: b.series.map((s) => ({
      "@type": "DataDownload",
      encodingFormat: "text/csv",
      contentUrl: `${SITE}${csvDe(s.codigo)}`,
      name: `${APRESENTACAO[s.codigo]?.titulo ?? s.nome} em CSV`,
    })),
  };

  return (
    <main className={estilos.pagina} id="conteudo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            ...trilha(SITE, [
              { nome: "Números Públicos", caminho: "/" },
              { nome: TITULO, caminho: CAMINHO },
            ]),
          }),
        }}
      />
      <nav className={estilos.trilha} aria-label="Você está em">
        <Link href="/" prefetch={false}>Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{TITULO}</span>
      </nav>

      <h1 className={estilos.titulo}>{TITULO}</h1>
      <p className={estilos.chamada}>
        São {b.series.length} séries do país, {fontesPorExtenso(fontes)}, cada uma inteira desde
        o primeiro dado que a fonte publica nesta forma. Ao fundo, quem ocupava
        a Presidência da República em cada período.
      </p>
      <ComoLer tipo="brasil" />

      {/* A nota fixa da espec (seção 4, item 2), aqui, na página de cada
          série e em cada gráfico: quem chega direto a uma série também a lê. */}
      <NotaFaixas>
        <p>
          Cada série tem a sua página, com o gráfico do primeiro ao último dado,
          as faixas, a tabela de valores e o CSV. Elas não começam no mesmo
          ano: o período de cada uma está no cartão.
        </p>
      </NotaFaixas>

      <section aria-labelledby="series">
        <h2 id="series" className={estilos.secao}>As séries</h2>
        {porTema(b.series).map((g) => (
          <div key={g.id}>
            <h3 id={g.id} className={estilos.tema}>{g.nome}</h3>
            <div className={estilos.cartoes}>
              {g.series.map((s) => <CartaoSerieBrasil key={s.codigo} serie={s} />)}
            </div>
          </div>
        ))}
      </section>

      <Presidencia mandatos={b.mandatos} />

      <section aria-labelledby="metodo">
        <h2 id="metodo" className={estilos.secao}>De onde vêm os números</h2>
        <div className={estilos.texto}>
          <p>
            Cada série é lida por dois caminhos da própria fonte (no IBGE, a
            API de agregados e o SIDRA; no Banco Central, a mesma série pedida
            em dois recortes de datas; no dólar, a média mensal contra a
            cotação de cada dia, até o arredondamento da quarta casa; na
            Selic, o histórico das decisões do Copom contra a série diária da
            meta; no salário mínimo do Ipea, a variação de cada mês contra o
            valor nominal e o INPC publicados pelo Banco Central), e só entra
            se os dois concordarem em todos os{" "}
            {br(b.series.reduce((n, s) => n + s.pontos.length, 0))} pontos.
            Nenhum valor é calculado aqui: o que o gráfico mostra é o que a
            fonte publica.
          </p>
          <p>
            A meta de inflação de {b.metaInflacao.anos.length} anos, de{" "}
            {b.metaInflacao.anos[0]![0]} a{" "}
            {b.metaInflacao.anos[b.metaInflacao.anos.length - 1]![0]}, vem da{" "}
            <a href={b.metaInflacao.fonte} rel="noopener">tabela do Banco
            Central</a> e só entra se cada ano bater com a série 13521 do SGS.
            O lado melhor de cada gráfico diz como a série se lê, e não quem a
            moveu.
          </p>
          <p>
            Últimos períodos publicados:{" "}
            {b.series
              .map((s, i) => `${APRESENTACAO[s.codigo]?.titulo ?? s.nome}, ${rotuloPeriodo(ultimos[i]!)}`)
              .join("; ")}
            . Coleta de {dataCurta(coleta)}.
          </p>
        </div>
      </section>
    </main>
  );
}
