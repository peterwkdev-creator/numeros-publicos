import type { Metadata } from "next";
import Link from "next/link";

import { br } from "../../../lib/dados";
import { rankingPessoal } from "../../../lib/nacional";
import { LIMITE_PLAUSIVEL } from "../../../lib/fiscal";
import {
  catalogoDe, coberturaTemporal, FONTES, palavrasChave,
} from "../../../lib/jsonld";
import { cartaoSocial, lerFiscal, lerIdeb, lerSnapshot, SITE } from "../../../lib/servidor";
import estilos from "./ranking.module.css";

const CAMINHO = "/ranking/gasto-com-pessoal/";

/**
 * A página de cabeça que faltava.
 *
 * Medido em 07/09/2026: a consulta *"ranking municípios gasto com pessoal
 * LRF"* é servida hoje por **Tribunais de Contas, um por estado**, mais
 * notícia e índice de entidade. Não havia versão **nacional, gratuita e com
 * uma URL limpa** — e o dado para fazê-la já estava no banco há dias.
 *
 * O site tinha 5.571 páginas disputando cauda longa e **nenhuma** disputando
 * consulta de cabeça. Esta é uma página só, e é a única que alguém que escreve
 * sobre o assunto pode linkar — que é o gargalo real, já que o rastreamento
 * espera autoridade externa.
 */
export async function generateMetadata(): Promise<Metadata> {
  const fiscal = await lerFiscal();
  const r = rankingPessoal(fiscal);
  const titulo = "Municípios acima do limite de gasto com pessoal";
  const descricao =
    `${br(r.acimaDoTeto.length)} municípios declararam gasto com pessoal ` +
    `acima do teto de ${br(fiscal.limites.legal, 0)}% da receita corrente ` +
    `líquida. Lista nacional, com a fonte e a data de coleta.`;
  return {
    // SEM o sufixo " — Números Públicos": com ele o título dava 66 caracteres
    // e a auditoria reprovou (o Google corta perto de 60). A frase sozinha já
    // é a consulta que a página disputa, e é ela que precisa sobreviver ao
    // corte -- a marca aparece no domínio, ao lado do resultado.
    title: titulo,
    description: descricao,
    alternates: { canonical: `${SITE}${CAMINHO}` },
    ...cartaoSocial(titulo, descricao, CAMINHO),
  };
}

export default async function Pagina() {
  const [fiscal, snapshot, ideb] = await Promise.all([
    lerFiscal(), lerSnapshot(), lerIdeb(),
  ]);
  const r = rankingPessoal(fiscal);
  const legal = fiscal.limites.legal;
  const prudencial = fiscal.limites.prudencial;

  // A auditoria reprovou a primeira versão desta página com "sem JSON-LD" --
  // e o achado é irônico, porque "os números não estão estruturados" era um
  // dos defeitos que esta própria página nasceu para corrigir.
  //
  // Aqui o `ItemList` não é decoração: numa busca em que a Visão geral de IA
  // responde no lugar do clique, **ser liftável e citável passa a valer mais
  // que a posição**. Os dez primeiros vão nomeados, com o valor declarado.
  // Dez, e não 335: uma lista longa em metadado dilui e nenhum consumidor a
  // lê inteira.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Municípios acima do limite de gasto com pessoal",
    description:
      `Lista nacional dos ${r.acimaDoTeto.length} municípios brasileiros que ` +
      `declararam despesa com pessoal do Executivo acima de ${legal}% da ` +
      `receita corrente líquida ajustada, entre os ${r.publicaram} que ` +
      `entregaram o Relatório de Gestão Fiscal.`,
    url: `${SITE}${CAMINHO}`,
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    isAccessibleForFree: true,
    isBasedOn: FONTES,
    inLanguage: "pt-BR",
    creator: { "@type": "Person", name: "Peter Wilhelm Kretzschmar" },
    identifier: `${SITE}${CAMINHO}`,
    keywords: palavrasChave([
      "Lei de Responsabilidade Fiscal", "LRF", "gasto com pessoal", "SICONFI",
    ]),
    temporalCoverage: coberturaTemporal(snapshot, fiscal, ideb),
    variableMeasured: [
      "Despesa com pessoal sobre a receita corrente líquida ajustada",
    ],
    includedInDataCatalog: catalogoDe(SITE),
    spatialCoverage: { "@type": "Place", name: "Brasil" },
    distribution: [{
      "@type": "DataDownload",
      encodingFormat: "text/csv",
      contentUrl: `${SITE}/dados/municipios.csv`,
      name: "Todos os municípios em CSV",
    }],
    mainEntity: {
      "@type": "ItemList",
      name: `Municípios acima de ${legal}% da receita com pessoal`,
      numberOfItems: r.acimaDoTeto.length,
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      itemListElement: r.acimaDoTeto.slice(0, 10).map((m, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `${m.nome} (${m.uf})`,
        url: `${SITE}/municipio/${m.slug}/`,
        item: {
          "@type": "QuantitativeValue",
          name: "Despesa com pessoal sobre a receita corrente líquida",
          value: m.percentual,
          unitText: "%",
        },
      })),
    },
  };

  return (
    <main className={estilos.pagina} id="conteudo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <p className={estilos.trilha}>
        <Link href="/" prefetch={false}>Números Públicos</Link> › Ranking
      </p>

      <h1 className={estilos.titulo}>
        Municípios acima do limite de gasto com pessoal
      </h1>
      <p className={estilos.chamada}>
        Quanto cada prefeitura gasta com a folha de pagamento, em proporção da
        receita corrente líquida — e quais passaram do teto que a Lei de
        Responsabilidade Fiscal impõe ao Executivo municipal.
      </p>

      <div className={estilos.grade}>
        <div className={estilos.cartao}>
          <span className={estilos.rotulo}>
            Acima do teto de {br(legal, 0)}%
          </span>
          <span className={`${estilos.valor} ${estilos.acima} tabular`}>
            {br(r.acimaDoTeto.length)}
          </span>
        </div>
        <div className={estilos.cartao}>
          {/* NÃO crava "entre 51,3% e 54%": 16 municípios declaram limite
              prudencial próprio (57% ou 59,05%), e o rótulo exato seria falso
              para eles. O texto abaixo explica a faixa em palavras. */}
          <span className={estilos.rotulo}>
            Entre o prudencial e o teto
          </span>
          <span className={`${estilos.valor} tabular`}>
            {br(r.naFaixaPrudencial)}
          </span>
        </div>
        <div className={estilos.cartao}>
          <span className={estilos.rotulo}>Entregaram o relatório</span>
          <span className={`${estilos.valor} tabular`}>{br(r.publicaram)}</span>
        </div>
        {/* Este cartao tem o MESMO peso visual dos outros, de proposito. Sem
            ele a pagina seria lida como "os demais estao bem", e a verdade e
            que sobre estes nao se sabe nada. */}
        <div className={estilos.cartao}>
          <span className={estilos.rotulo}>Não entregaram</span>
          <span className={`${estilos.valor} tabular`}>
            {br(r.naoEntregaram)}
          </span>
        </div>
      </div>

      <section className={estilos.texto}>
        <p>
          Dos <strong>{br(r.universo)}</strong> municípios brasileiros,{" "}
          <strong>{br(r.publicaram)}</strong> entregaram o Relatório de Gestão
          Fiscal do {fiscal.periodo}º quadrimestre de {fiscal.exercicio}.
          Destes,{" "}
          <strong className={estilos.acima}>
            {br(r.acimaDoTeto.length)}
          </strong>{" "}
          declararam gasto com pessoal acima do teto de{" "}
          <strong>{br(legal, 0)}%</strong>, e{" "}
          <strong>{br(r.naFaixaPrudencial)}</strong> estão entre o limite
          prudencial e o teto — faixa em que a lei já exige medidas, mas em que
          não há infração.
        </p>
        <p>
          <strong>
            Os {br(r.naoEntregaram)} que não entregaram estão fora desta conta,
            e não estão bem por isso.
          </strong>{" "}
          Sobre eles não se sabe: não entregar é uma falha em si, e tratá-los
          como se estivessem dentro do limite seria inventar um dado que ninguém
          publicou.{" "}
          {r.mediana !== null && (
            <>
              Entre quem entregou, a mediana nacional é de{" "}
              <strong>{br(r.mediana, 2)}%</strong>.
            </>
          )}
        </p>
      </section>

      <div className={estilos.rolagem}>
        <table className={estilos.lista}>
          <caption>
            Municípios com gasto com pessoal acima de {br(legal, 0)}% da receita
            corrente líquida, do maior para o menor. Dado do{" "}
            <strong>{fiscal.periodo}º quadrimestre de {fiscal.exercicio}</strong>.
            Fonte: {fiscal.fonte}, coleta de{" "}
            {fiscal.coletadoEm?.slice(0, 10) ?? "data não registrada"}.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={estilos.posicao}>#</th>
              <th scope="col">Município</th>
              <th scope="col">UF</th>
              <th scope="col" className={estilos.num}>Pessoal / RCL</th>
              <th scope="col" className={estilos.num}>População</th>
            </tr>
          </thead>
          <tbody>
            {r.acimaDoTeto.map((m, i) => (
              <tr key={m.codigo}>
                <td className={estilos.posicao}>{i + 1}</td>
                <th scope="row">
                  <Link href={`/municipio/${m.slug}/`} prefetch={false}>
                    {m.nome}
                  </Link>
                </th>
                <td>{m.uf}</td>
                <td className={`${estilos.num} ${estilos.acima} tabular`}>
                  {br(m.percentual, 2)}%
                </td>
                <td className={`${estilos.num} tabular`}>
                  {m.populacao === null ? "—" : br(m.populacao)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {r.implausiveis.length > 0 && (
        <section className={estilos.texto}>
          <h2>{br(r.implausiveis.length)} declarações fora da faixa possível</h2>
          <p className={estilos.ressalva}>
            Estes municípios declararam valores acima de{" "}
            <strong>{br(LIMITE_PLAUSIVEL, 0)}%</strong> da receita — o que
            descreveria uma prefeitura gastando com a folha mais do que arrecada
            no ano inteiro.{" "}
            <strong>São quase certamente erros de preenchimento</strong>, e por
            isso ficam fora do ranking: ordená-los junto publicaria uma acusação
            produzida por um formulário errado.
          </p>
          <p className={estilos.ressalva}>
            Também não são escondidos — omiti-los faria esta página afirmar que
            o dado não existe, quando ele existe e está quebrado.{" "}
            {r.implausiveis.map((m, i) => (
              <span key={m.codigo}>
                {i > 0 ? " · " : ""}
                <Link href={`/municipio/${m.slug}/`} prefetch={false}>
                  {m.nome} ({m.uf})
                </Link>{" "}
                <span className={estilos.implausivel}>
                  {br(m.percentual, 2)}%
                </span>
              </span>
            ))}
          </p>
        </section>
      )}

      <section className={estilos.texto}>
        <h2>Como esta conta é feita</h2>
        <p className={estilos.ressalva}>
          O percentual é a Despesa Total com Pessoal do Executivo dividida pela
          Receita Corrente Líquida ajustada, exatamente como o próprio município
          declara no <strong>RGF Anexo 01</strong> ao SICONFI. O teto de{" "}
          {br(legal, 0)}% é o do Executivo municipal; o limite global do ente é
          60%, sendo 6% do Legislativo.{" "}
          {r.comoEstado > 0 && (
            <>
              O Distrito Federal fica fora da lista porque presta contas na
              esfera estadual — não é município, e contá-lo como faltoso seria
              uma acusação falsa.
            </>
          )}
        </p>
        <p className={estilos.ressalva}>
          Cada município tem a sua própria página, com a série no tempo, a
          composição do gasto por função e os dados do Censo.{" "}
          <Link href="/dados/municipios.csv" prefetch={false}>
            Baixar tudo em CSV
          </Link>{" "}
          ·{" "}
          <Link href="/ajuda/" prefetch={false}>
            Como ler estes números
          </Link>
        </p>
      </section>
    </main>
  );
}
