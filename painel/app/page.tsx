import type { Metadata } from "next";
import Link from "next/link";

import {
  br, dataCurta, dataLegivel, dataPorExtenso, INDICADORES_DA_CAPA, projetar, rotuloCurto,
  unidadeDaColuna, valorDoIndicador,
} from "@/lib/dados";
import { slugUf } from "@/lib/estado";
import { rotuloPeriodo, slugDe } from "@/lib/fiscal";
import { funcoesDoPais, panoramaEstados } from "@/lib/nacional";
import MapaUf from "./componentes/mapa-uf";
import { camadasPadrao } from "@/lib/mapa";
import {
  medianasCache, medidasDoPaisCache,
} from "@/lib/censo";
import TabelaCenso from "./componentes/tabela-censo";
import ComposicaoBarras from "./componentes/composicao-barras";
import RoscaFuncoes from "./componentes/rosca-funcoes";
import {
  coberturaTemporal, FONTES_DA_BASE, FONTES_DO_SITE, idCatalogo, palavrasChave, VARIAVEIS_DA_BASE, LICENCA_DADOS,
  jsonLdHtml,
} from "@/lib/jsonld";
import {
  lerBrasil, lerCaged, lerEmendas, lerFiscal, lerIdeb, lerInss, lerSnapshot, SITE,
} from "@/lib/servidor";
import { periodosDasFontes } from "@/lib/periodos";
import { atualizadoEm } from "@/lib/sitemap";
import { porTema } from "@/lib/brasil";
import { Municipios } from "./municipios";
import Termo from "./componentes/termo";
import BuscaCabecalho from "./componentes/busca-cabecalho";
import s from "./page.module.css";
import FonteGrafico from "./componentes/fonte-grafico";

/**
 * A capa era a ÚNICA página do site sem `canonical`.
 *
 * As 5.571 de município e as 27 de estado sempre tiveram — cada uma declara a
 * sua em `generateMetadata`. A capa não declara metadados próprios: herda os do
 * layout, e lá não há `alternates`. Faltou justamente na página que mais recebe
 * link de fora, e que é alcançável por mais formas que qualquer outra (raiz e
 * `www`, com e sem barra, e com o que quer que venha grudado numa campanha).
 *
 * É a marca desta classe de defeito: o caso geral foi resolvido com cuidado, e
 * o caso único ficou de fora porque não passou pelo mesmo lugar do código.
 */
export const metadata: Metadata = {
  alternates: { canonical: `${SITE}/` },
};

/**
 * Server Component: lê o snapshot do disco **no build** e devolve HTML pronto.
 * Nada é buscado pelo navegador de quem visita.
 */
//: A ordem em que o IBGE lista as regiões, e a que todo brasileiro reconhece.
//: Alfabética poria Centro-Oeste antes de Norte e Nordeste, o que não é como
//: ninguém pensa no mapa.
const REGIOES = ["Norte", "Nordeste", "Sudeste", "Sul", "Centro-Oeste"];

/**
 * Os exemplos clicáveis sob a busca do herói: uma capital, uma cidade média e
 * uma pequena, de três regiões. A escolha é de tamanho e de lugar, não de
 * mérito, e não muda o que o site afirma de nenhum deles. O nome e a UF saem
 * do snapshot (e o build para se o município sumir), não de texto digitado.
 */
const EXEMPLOS = [
  "recife-pe", // capital, Nordeste
  "santa-maria-rs", // cidade média, Sul
  "alto-paraiso-de-goias-go", // cidade pequena, Centro-Oeste
];

export default async function Pagina() {
  const snapshot = await lerSnapshot();
  // A capa mostra os SEUS indicadores, não todos os do snapshot: com os dez do
  // Censo 2022 no banco, iterar o snapshot inteiro daria 13 cartões e 13
  // colunas numéricas, e mandaria +149 KB comprimidos nas props de toda visita.
  // Ver `INDICADORES_DA_CAPA`.
  const capa = projetar(snapshot, INDICADORES_DA_CAPA);
  const [fiscal, ideb, brasil, caged, emendas, inss] = await Promise.all([
    lerFiscal(), lerIdeb("anos_iniciais"), lerBrasil(), lerCaged(), lerEmendas(), lerInss(),
  ]);
  const periodos = periodosDasFontes({ snapshot, caged, fiscal, ideb, emendas, inss });
  // Os temas e a contagem saem do dado: a lista escrita à mão citava 6 das
  // 15 séries (achado em 16/10/2026, depois do item 12).
  const temasDoBrasil = porTema(brasil.series);
  const listaDeTemas = temasDoBrasil
    .map((g) => g.nome.charAt(0).toLowerCase() + g.nome.slice(1))
    .join("; ");
  // A mesma data que o sitemap anuncia para a capa e que as páginas de estado
  // mostram: a mais recente entre o IBGE e o fiscal. Até 17/10/2026 a capa
  // dizia "Última coleta" com a data do IBGE (29/09) enquanto o sitemap
  // anunciava 15/10: duas datas para a mesma página.
  const atualizado = atualizadoEm(snapshot, fiscal);

  // JSON-LD da capa. As páginas de município e de estado já declaravam
  // `Dataset`; a capa, que é a raiz do site e a que o Google encontra primeiro,
  // não declarava nada -- então o buscador via 1.804 conjuntos de dados sem um
  // que os agrupasse. `hasPart` faz esse papel.
  const pais = funcoesDoPais(fiscal);
  const estados = panoramaEstados(fiscal);

  const camadasDoMapa = camadasPadrao(snapshot.ufs, estados);

  // O Censo do país inteiro, ao lado da mediana dos municípios. É a única
  // página onde essas duas colunas convivem, e é de propósito: a distância
  // entre elas É o achado. No esgoto são 64,7% dos domicílios contra 32,6% nos
  // municípios — os dois corretos, e o primeiro puxado pelas cidades grandes.
  const medidasPais = medidasDoPaisCache(snapshot.municipios, snapshot.colunas);
  const medianasMunicipais = medianasCache(snapshot.municipios, snapshot.colunas);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE}/#site`,
        name: "Números Públicos",
        url: `${SITE}/`,
        inLanguage: "pt-BR",
        publisher: { "@id": `${SITE}/#autor` },
      },
      {
        "@type": "Person",
        "@id": `${SITE}/#autor`,
        name: "Peter Wilhelm Kretzschmar",
      },
      {
        // O catálogo que agrupa os 5.571 conjuntos por município. É a estrutura
        // que a documentação do Google descreve para coleções: `DataCatalog`
        // para o todo, `Dataset` para cada parte, e `includedInDataCatalog`
        // ligando as duas pontas. Sem ele, um índice de dados vê 5.571
        // conjuntos soltos e nada dizendo que são um só corpo.
        "@type": "DataCatalog",
        "@id": idCatalogo(SITE),
        name: "Números Públicos",
        url: `${SITE}/`,
        inLanguage: "pt-BR",
        publisher: { "@id": `${SITE}/#autor` },
        license: LICENCA_DADOS,
      },
      {
        "@type": "Dataset",
        "@id": `${SITE}/#dados`,
        includedInDataCatalog: { "@id": idCatalogo(SITE) },
        identifier: `${SITE}/`,
        keywords: palavrasChave(["IBGE", "SICONFI", "INEP", "IDEB"]),
        name: "Dados abertos dos municípios brasileiros",
        description:
          `População, PIB, despesa com pessoal, despesa por função e IDEB dos ` +
          `${br(capa.linhas.length)} municípios dos 27 estados do Brasil, a ` +
          `partir das APIs públicas do IBGE, do SICONFI/Tesouro Nacional e do ` +
          `INEP, com a fonte e a data de coleta ao lado de cada número.`,
        url: `${SITE}/`,
        license: LICENCA_DADOS,
        isAccessibleForFree: true,
        inLanguage: "pt-BR",
        creator: { "@id": `${SITE}/#autor` },
        // A cobertura temporal e espacial são o que distingue este conjunto de
        // qualquer outro que cite as mesmas fontes.
        temporalCoverage: coberturaTemporal(snapshot, fiscal, ideb),
        spatialCoverage: {
          "@type": "Place",
          name: "Brasil",
        },
        variableMeasured: VARIAVEIS_DA_BASE,
        distribution: [
          {
            "@type": "DataDownload",
            encodingFormat:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            contentUrl: `${SITE}/dados/municipios.xlsx`,
            name: "Base completa em planilha, com dicionário e procedência",
          },
          {
            "@type": "DataDownload",
            encodingFormat: "text/csv",
            contentUrl: `${SITE}/dados/municipios.csv`,
            name: `Base completa: ${br(capa.linhas.length)} municípios em CSV`,
          },
        ],
        isBasedOn: FONTES_DA_BASE,
      },
    ],
  };

  return (
    <main className={s.pagina} id="conteudo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />
      {/* Herói e aviso lado a lado em tela larga. Antes o aviso ficava abaixo,
          e o herói — limitado a 60ch, que é o certo para leitura — deixava
          ~500px de altura vazios à direita. Empilha em tela estreita. */}
      <div className={s.topo}>
      <header className={s.cabecalho}>
        {/* O `h1` diz o que o site responde. O nome já está na barra, e
            repeti-lo aqui gastava o maior texto da capa em informação que a
            pessoa já tinha. */}
        <h1 className={s.titulo}>
          Os números oficiais do seu município, com a fonte ao lado de cada um
        </h1>
        <p className={s.subtitulo}>
          População, PIB, gasto com pessoal, despesa por função, IDEB e emprego
          com carteira dos <strong>{br(capa.linhas.length)} municípios</strong>{" "}
          e dos {br(snapshot.ufs.length)} estados do Brasil.
        </p>
        {/* A ação nº 1 do site. Até 15/10/2026 o campo só existia na barra
            (36px de altura) e o texto mandava procurá-lo "no alto da página".
            É a mesma busca da barra, com ids e nome de landmark próprios;
            o `busca.js` serve às duas. */}
        <div className={s.busca}>
          <BuscaCabecalho
            prefixo="capa"
            nome="Busca de município ou estado"
            grande
            placeholder="Digite o nome de um município ou estado"
          />
        </div>
        <div className={s.exemplos}>
          <span id="exemplos-rotulo">Por exemplo:</span>
          <ul aria-labelledby="exemplos-rotulo">
            {EXEMPLOS.map((slug) => {
              const l = capa.linhas.find((x) => slugDe(x[1], x[2]) === slug);
              if (!l) throw new Error(`exemplo da capa fora do snapshot: ${slug}`);
              return (
                <li key={slug}>
                  <Link href={`/municipio/${slug}/`} prefetch={false}>
                    {l[1]} ({l[2]})
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </header>

      <p className={s.aviso}>
        Trabalho independente, sem vínculo com nenhum órgão público e sem
        relação com qualquer processo de contratação. Começou pelo Nordeste,
        sobre um termo de referência público, e hoje cobre o país inteiro.
      </p>
      </div>

      {/* Os números do próprio site, num só lugar: o que cobre e de onde vem. */}
      <div className={s.faixaBloco}>
      <dl className={s.faixa} aria-label="O que o site cobre">
        <div>
          <dt>Municípios</dt>
          <dd className="tabular">{br(capa.linhas.length)}</dd>
        </div>
        <div>
          <dt>Estados</dt>
          <dd className="tabular">{br(snapshot.ufs.length)}</dd>
        </div>
        <div className={s.faixaFontes}>
          <dt>Fontes oficiais</dt>
          <dd>{FONTES_DO_SITE}</dd>
        </div>
        <div>
          <dt>Dados atualizados em</dt>
          <dd>
            <time dateTime={atualizado.toISOString()}>{dataPorExtenso(atualizado)}</time>
          </dd>
        </div>
      </dl>

      {/* De quando é cada número (M9 (4), espec `numeros-publicos-novidades.md`):
          o período e a data da coleta por fonte, recolhidos para o topo não crescer.
          Nada se chama "novo": a linha diz de quando é o dado, não que mudou. */}
      <details className={s.periodos}>
        <summary>Período de cada fonte</summary>
        <ul>
          {periodos.map((p) => (
            <li key={p.fonte}>
              <Link href={p.href}>{p.fonte}</Link>: {p.periodo}
              {p.coletadoEm && (
                <> · coletado em {dataCurta(p.coletadoEm)}</>
              )}
              .
            </li>
          ))}
        </ul>
      </details>
      </div>

      {/* As portas de entrada. Brasil, estados e rankings só se achavam no
          rodapé ou no meio da página; quem não sabe o nome de uma cidade não
          tinha por onde começar. Cada cartão leva a um lugar que já existia. */}
      <section className={s.portas} aria-labelledby="por-onde">
        <h2 className={s.secaoTitulo} id="por-onde">Por onde começar</h2>
        <ul className={s.portasLista}>
          <li className={s.porta}>
            <h3>Município</h3>
            <p>
              Uma página para cada um dos {br(capa.linhas.length)}: população,
              contas públicas, educação e emprego.
            </p>
            <p className={s.portaLinks}>
              <a href="#busca-capa">Ir para a busca</a>
              <a href="#municipios">Ver a lista</a>
            </p>
          </li>
          <li className={s.porta}>
            <h3>Estados</h3>
            <p>
              Os {br(snapshot.ufs.length)} estados no mapa e na tabela de totais,
              agrupados por região.
            </p>
            <p className={s.portaLinks}>
              <a href="#por-estado">Ver o mapa e a tabela</a>
            </p>
          </li>
          {/* O único caminho da capa até `/brasil/`: sem link de lugar nenhum, a
              página fica invisível para o rastreador (o defeito do concorrente
              medido em 07/09, o mesmo que motivou o link do ranking). */}
          <li className={s.porta}>
            <h3>Brasil</h3>
            <p>
              {brasil.series.length} séries do país, em {temasDoBrasil.length}{" "}
              temas: {listaDeTemas}. Cada uma tem a sua página, com quem
              ocupava a Presidência em cada período.
            </p>
            <p className={s.portaLinks}>
              <Link href="/brasil/" prefetch={false}>O Brasil ao longo do tempo</Link>
            </p>
          </li>
          {/* `id="rankings"`: o item "Rankings" da barra do topo apontava para
              cá até 17/10/2026, quando `/ranking/` ganhou página-índice; a
              âncora fica para quem a guardou. */}
          <li className={s.porta} id="rankings">
            <h3>Rankings</h3>
            <p>
              Listas nacionais, com a fonte e a data de coleta, para comparar
              os municípios entre si.
            </p>
            <p className={s.portaLinks}>
              <Link href="/ranking/gasto-com-pessoal/" prefetch={false}>
                Gasto com pessoal acima do limite
              </Link>
              <Link href="/ranking/emprego-com-carteira/" prefetch={false}>
                Emprego com carteira
              </Link>
            </p>
          </li>
        </ul>
      </section>

      <section className={s.cartoes} aria-label="Totais do Brasil">
        {capa.indicadores.map((ind) => (
          <article key={ind.codigo} className={s.cartao}>
            <h2 className={s.cartaoRotulo}>
              {ind.nome} · {ind.periodo}
            </h2>
            {/* Escalado pela unidade que a fonte declara. O total do PIB
                saía com dez dígitos e um "Mil Reais" ao lado; agora sai
                "R$ 9,01 trilhões", com o valor cheio no `title`. */}
            <p
              className={`${s.cartaoValor} tabular`}
              title={valorDoIndicador(ind.totalRegiao, ind.unidade).exato}
            >
              {valorDoIndicador(ind.totalRegiao, ind.unidade).curto}
              {valorDoIndicador(ind.totalRegiao, ind.unidade).unidadeVisivel && (
                <span className={s.cartaoUnidade}>
                  {valorDoIndicador(ind.totalRegiao, ind.unidade).unidadeVisivel}
                </span>
              )}
            </p>
            {/* "agregado 5938, variável 37" era o nome da API, não do dado: a
                tabela é o número que o IBGE mostra no SIDRA, e a variável
                segue no endereço do link e no dicionário da planilha. */}
            <p className={s.cartaoFonte}>
              Fonte: IBGE, tabela {ind.agregado}.{" "}
              {/* O rótulo DIZ o que abre. Antes era "Ver a consulta na fonte",
                  que promete uma página e entrega a resposta crua da API —
                  um despejo de JSON na cara de quem só queria ver de onde o
                  número veio. A procedência continua a um clique, e agora
                  quem clica sabe no que está clicando. Para quem quer o dado
                  utilizável, o caminho é "Baixar dados", no cabeçalho. */}
              {ind.origem ? (
                <a href={ind.origem} rel="nofollow noopener"
                   className={s.linkTecnico}>
                  o dado bruto <span className={s.formato}>JSON</span>
                </a>
              ) : null}
            </p>
          </article>
        ))}
      </section>

      {/* A capa listava indicadores e estados, e não respondia "para onde vai
          o dinheiro" — a pergunta que a página do município e a do estado já
          respondiam. O dado estava no disco desde que a varredura nacional
          fechou. Ver a nota de desenho em `lib/nacional.ts`. */}
      {pais && (
        <section className={s.secao} aria-labelledby="para-onde">
          <h2 className={s.secaoTitulo} id="para-onde">
            Para onde vai o dinheiro
          </h2>
          <p className={s.secaoNota}>
            Despesa{" "}
            <Termo chave="liquidada">
              <strong>liquidada</strong>
            </Termo>{" "}
            — o que de fato foi gasto, não o
            orçado nem o empenhado — acumulada até o {pais.periodo}º <Termo chave="bimestre">bimestre</Termo> de{" "}
            {pais.exercicio}, somada nos{" "}
            <strong>{br(pais.municipios)}</strong> municípios que entregaram o
            relatório.
          </p>

          {/* Rosca e tabela lado a lado, e cada uma faz o que a outra não faz:
              a rosca mostra que duas funções levam metade; a tabela compara a
              5ª com a 6ª e é o que o leitor de tela lê. De quebra ocupam a
              largura que esta seção desperdiçava. Em tela estreita empilham. */}
          <div className={s.duasVistas}>
            <RoscaFuncoes fatias={pais.fatias} total={pais.total}
              periodo={`${pais.periodo}º bimestre de ${pais.exercicio}`} />
            <div className={s.aoLado}>
              <ComposicaoBarras
                fatias={pais.fatias}
                total={pais.total}
                municipio={`${br(pais.municipios)} municípios do Brasil`}
                cores
              />
            </div>
          </div>
          <FonteGrafico
            fonte={<>Tesouro Nacional, SICONFI (<Termo chave="rreo">RREO</Termo>)</>}
            periodo={`despesa liquidada acumulada até o ${pais.periodo}º bimestre de ${pais.exercicio}`}
          />

          {/* A ressalva vai junto do número, não num rodapé. Chamar isto de
              "gasto dos municípios brasileiros" erra por quase metade, e a
              distância entre a soma e essa frase é exatamente esta. */}
          <p className={s.secaoNota}>
            <strong>Isto não é o gasto dos municípios brasileiros.</strong> É o
            dos <strong>{br(pais.municipios)}</strong> que publicaram o
            relatório — {br((pais.municipios * 100) / capa.linhas.length, 0)}% dos{" "}
            {br(capa.linhas.length)}. Os outros não aparecem aqui porque não há
            número deles, e somar zero por eles seria inventar um.
          </p>
          {/* O unico link da capa para a pagina de ranking. Ela precisa de
              caminho a partir da home, ou repete o defeito medido no
              concorrente em 07/09: paginas de cidade atras de uma busca em JS,
              sem link de lugar nenhum, invisiveis para o rastreador. */}
          <p className={s.secaoNota}>
            <Link href="/ranking/gasto-com-pessoal/" prefetch={false}>
              Quais municípios estão acima do limite de gasto com pessoal
            </Link>{" "}
            — a lista nacional, com a fonte e a ressalva de quem não entregou.
          </p>
        </section>
      )}

      {medidasPais.some((x) => x.percentual !== null) && (
        <section className={s.secao} aria-labelledby="como-se-vive">
          <h2 className={s.secaoTitulo} id="como-se-vive">
            Como se vive no Brasil
          </h2>
          <p className={s.secaoNota}>
            Do <strong><Termo chave="censo">Censo de 2022</Termo></strong>, somando os{" "}
            {br(capa.linhas.length)} municípios. As duas colunas respondem
            perguntas diferentes: a primeira é a proporção no país, a segunda é
            o município do meio.
          </p>
          <TabelaCenso
            medidas={medidasPais}
            comparacoes={[{
              rotulo: "Mediana dos municípios",
              valores: medianasMunicipais,
            }]}
            rotuloValor="No Brasil"
            legenda="Brasil no Censo 2022, com a mediana dos municípios ao lado"
          />
          <p className={s.secaoNota}>
            <strong>A distância entre as duas colunas é o achado.</strong> No
            esgoto, a proporção do país é mais que o dobro da{" "}
            <Termo chave="mediana">mediana</Termo> municipal:
            as cidades grandes concentram população e rede, então a maioria das
            casas tem ligação enquanto a maioria dos municípios não chega perto
            disso. Quem citar um dos números como se fosse o outro erra por
            muito. Fonte: IBGE, Censo Demográfico 2022.
          </p>
        </section>
      )}

      <section className={s.secao} aria-labelledby="por-estado">
        <h2 className={s.secaoTitulo} id="por-estado">
          Por estado
        </h2>
        <p className={s.secaoNota}>
          Soma dos municípios de cada estado, agrupados por região. O total
          nacional confere com o agregado que o próprio IBGE publica — é assim
          que se sabe que a coleta está <strong>completa</strong>, e não apenas
          que um número está certo.
        </p>
        <MapaUf
          camadas={camadasDoMapa}
          nomes={Object.fromEntries(snapshot.ufs.map((u) => [u.sigla, u.nome]))}
        />

        <div className={`${s.rolagem} rola-x`}>
          <table className={s.tabela}>
            <caption>
              Totais por unidade da federação, calculados a partir dos
              municípios. Fontes: IBGE e, na entrega do relatório, Tesouro
              Nacional (SICONFI).
            </caption>
            <thead>
              <tr>
                <th scope="col">Estado</th>
                <th scope="col" className={s.numero}>
                  Municípios
                </th>
                {/* A taxa de entrega entra AQUI, e não numa seção própria:
                    esta tabela já é onde os 27 se comparam, e o achado — a
                    entrega varia de 14% a 100% sem padrão regional — só se lê
                    como achado quando os estados estão lado a lado. Agrupada
                    por região, a tabela ainda desmente sozinha a leitura
                    regional que a taxa convida a fazer. */}
                <th scope="col" className={s.numero}>
                  Entregaram o <Termo chave="rgf">relatório fiscal</Termo>{" "}
                  <span className={s.ausente}>
                    ({rotuloPeriodo(fiscal.exercicio, fiscal.periodo)}, % dos municípios)
                  </span>
                </th>
                {capa.indicadores.map((i) => (
<th key={i.codigo} scope="col" className={s.numero}
                      title={i.nome}>
                    {rotuloCurto(i.codigo, i.nome)}{" "}
                    <span className={s.ausente}>
                      ({i.periodo}
                      {/* A unidade estava só no cartão. Na tabela os números
                          ficam CRUS de propósito -- comparar 27 estados pede
                          coluna alinhada, e "R$ 2,72 tri" ao lado de
                          "R$ 857,59 bi" é pior de comparar que dois inteiros
                          --, mas então a unidade tem de estar dita aqui. */}
                      {unidadeDaColuna(i.codigo)
                        ? `, ${unidadeDaColuna(i.codigo)}`
                        : ""})
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            {/* Agrupada por região, e não numa lista plana de 27 linhas.
                O `<tbody>` por região é o agrupamento que o HTML de tabela
                oferece de verdade — leitor de tela anuncia o cabeçalho do
                grupo, e não é só um estilo. */}
            {REGIOES.map((regiao) => (
              <tbody key={regiao}>
                <tr>
                  <th scope="colgroup" colSpan={3 + capa.indicadores.length}
                      className={s.grupo}>
                    {regiao}
                  </th>
                </tr>
              {snapshot.ufs.filter((u) => u.regiao === regiao).map((uf) => (
                <tr key={uf.sigla}>
                  <th scope="row">
                    {/* O unico link interno que a home tinha para conteudo era
                        nenhum: a lista de municipios e componente de cliente,
                        entao o HTML dela nao trazia `href` nenhum. Estes 27
                        links sao a raiz do grafo do site. */}
                    <Link href={`/estado/${slugUf(uf.sigla)}/`}>{uf.nome}</Link>{" "}
                    <span className={s.ausente}>({uf.sigla})</span>
                  </th>
                  <td className={`${s.numero} tabular`}>
                    {br(uf.municipios)}
                  </td>
                  <td className={`${s.numero} tabular`}>
                    {(() => {
                      const e = estados.find((x) => x.uf === uf.sigla);
                      // Sem linha no panorama a célula fica em travessão, e o
                      // título explica por quê: é o Distrito Federal, que não
                      // entrega como município porque não é um.
                      if (!e) {
                        return (
                          <span
                            className={s.ausente}
                            title="Presta contas como estado, não como município"
                          >
                            —
                          </span>
                        );
                      }
                      return `${br(e.taxa, 0)}%`;
                    })()}
                  </td>
                  {capa.indicadores.map((i) => (
                    <td
                      key={i.codigo}
                      className={`${s.numero} tabular ${
                        uf.totais[i.codigo] == null ? s.ausente : ""
                      }`}
                    >
                      {br(uf.totais[i.codigo])}
                    </td>
                  ))}
                </tr>
              ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      <Municipios
        linhas={capa.linhas}
        indicadores={capa.indicadores}
      />

      <footer className={s.rodape}>
        <p>
          <strong>Procedência.</strong> Cada número guarda quando foi
          coletado e de qual endereço da fonte veio. Valor ausente na fonte aparece como
          “—”, nunca como zero: confundir “não sabemos” com “zero” é como um
          painel passa a mentir sem ninguém notar.
        </p>
        <p>
          <strong>Fonte.</strong> {snapshot.fonte}. Base montada em{" "}
          <time dateTime={snapshot.geradoEm}>
            {dataLegivel(snapshot.geradoEm)}
          </time>
          .
        </p>
        <p>
          <strong>Código aberto.</strong> Este painel é software livre sob a{" "}
          <a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="noopener">
            GNU AGPL v3 ou posterior
          </a>
          . O código-fonte completo, incluindo o motor de ingestão, está em{" "}
          <a
            href="https://github.com/peterwkdev-creator/numeros-publicos"
            rel="noopener"
          >
            github.com/peterwkdev-creator/numeros-publicos
          </a>
          . Quem modificar e oferecer este serviço pela rede precisa
          disponibilizar o código correspondente — é a seção 13 da AGPL, e é o
          motivo de a licença ser esta e não a MIT.
        </p>
      </footer>
      {/* A tabela de municípios: busca `/dados/capa.json` na primeira
          interação e filtra sem React (15/10/2026). */}
      <script type="module" src="/capa.js" />
    </main>
  );
}
