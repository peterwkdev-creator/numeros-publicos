import type { Metadata } from "next";
import Link from "next/link";

import SerieBrasilSvg from "../componentes/serie-brasil-svg";
import { br, dataCurta } from "../../lib/dados";
import {
  APRESENTACAO, dominio, inicioPeriodo, rotuloPeriodo,
  type SnapshotBrasil,
} from "../../lib/brasil";
import { catalogoDe, trilha, LICENCA_DADOS } from "../../lib/jsonld";
import { cartaoSocial, lerBrasil, SITE } from "../../lib/servidor";
import estilos from "./brasil.module.css";

const CAMINHO = "/brasil/";
const TITULO = "O Brasil ao longo do tempo";

/**
 * As séries do país, com quem ocupava a Presidência ao fundo.
 *
 * A espec é `especs/numeros-publicos-brasil-no-tempo.md`, no repositório de
 * trabalho; as regras de neutralidade (seção 4) moram em `lib/brasil.ts` e no
 * componente do gráfico, e viram teste em `tests/brasil.test.mts`. A página
 * só as junta: o mesmo eixo para todas, a nota que diz o que as faixas NÃO
 * medem, e a tabela de quem ocupou o cargo com a fonte de cada data.
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
    ...cartaoSocial(TITULO, descricao, CAMINHO),
  };
}

function anoInicial(b: SnapshotBrasil): number {
  return Math.floor(dominio(b.series)[0]);
}

const csvDe = (codigo: string) => `${CAMINHO}${codigo}/dados.csv`;

export default async function Pagina() {
  const b = await lerBrasil();
  const eixo = dominio(b.series);
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
    license: LICENCA_DADOS,
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
        São {b.series.length} séries do país, de {fontes.join(" e de ")}, cada uma inteira desde
        o primeiro dado que a fonte publica nesta forma. Ao fundo, quem ocupava
        a Presidência da República em cada período.
      </p>

      {/* A nota fixa da espec (seção 4, item 2), no topo e em cada gráfico:
          quem chega por um link direto a um gráfico também a lê. */}
      <div className={estilos.nota} role="note">
        <p>
          <strong>As faixas mostram quem ocupava o cargo, e não medem
          efeito.</strong> Estas séries se movem por muitos fatores, de dentro e
          de fora do país, e nenhum gráfico aqui separa um do outro. Por isso a
          página não soma, não tira média e não compara mandatos.
        </p>
        <p>
          Os {b.series.length} gráficos usam o mesmo eixo de tempo, de{" "}
          {Math.floor(eixo[0])} a {Math.floor(eixo[1])}: uma série que começa
          depois mostra o espaço vazio antes dela, em vez de esticar.
        </p>
      </div>

      <section aria-labelledby="series">
        <h2 id="series" className={estilos.secao}>As séries</h2>
        <div className={estilos.grade}>
          {b.series.map((s) => (
            <SerieBrasilSvg key={s.codigo} serie={s} mandatos={b.mandatos}
              dominio={eixo} csv={csvDe(s.codigo)} meta={b.metaInflacao} />
          ))}
        </div>
      </section>

      <section aria-labelledby="presidencia">
        <h2 id="presidencia" className={estilos.secao}>
          Quem ocupou a Presidência
        </h2>
        <p className={estilos.texto}>
          Cada período começa no dia em que a pessoa passou a exercer o cargo e
          termina no dia em que a seguinte assumiu. A data de cada linha vem da
          página oficial indicada nela.
        </p>
        <div className={estilos.rolagem}>
          <table className={estilos.tabela}>
            <caption className="so-leitor">
              Quem ocupou a Presidência da República, com as datas e a fonte
            </caption>
            <thead>
              <tr>
                <th scope="col">Quem</th>
                <th scope="col">De</th>
                <th scope="col">Até</th>
                <th scope="col">Como</th>
                <th scope="col">Fonte</th>
              </tr>
            </thead>
            <tbody>
              {b.mandatos.map((m) => (
                <tr key={m.inicio} data-mandato={m.inicio}>
                  <th scope="row">{m.nome}</th>
                  <td>{dataCurta(m.inicio)}</td>
                  <td>{m.fim ? dataCurta(m.fim) : "no cargo"}</td>
                  <td>{m.como}</td>
                  <td>
                    <a href={m.fonte} rel="noopener">
                      {new URL(m.fonte).hostname.replace(/^www\d*\./, "")}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
