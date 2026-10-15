import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import ComposicaoBarras from "../../componentes/composicao-barras";
import TiraEstados from "../../componentes/tira-estados";
import Termo from "../../componentes/termo";
import ComoLer from "../../componentes/como-ler";
import {
  br, concorda, dataCurta, dataPorExtenso, descricaoDe, escala, escalaComSinal,
  expandir, fracaoDe,
  milReaisParaReais, periodoDe,
} from "../../../lib/dados";
import { atualizadoEm } from "../../../lib/sitemap";
import { resumirEstado, slugUf } from "../../../lib/estado";
import { nomeQuadrimestre, ROTULO_FAIXA } from "../../../lib/fiscal";
import { medianaUltimaEdicao } from "../../../lib/ideb";
import { mediana, panoramaEstados, posicaoNaLista } from "../../../lib/nacional";
import { deEstado, emContracao } from "../../../lib/estado";
import { camadasPadrao } from "../../../lib/mapa";
import { medidasDe, taxasCache } from "../../../lib/censo";
import MapaUf from "../../componentes/mapa-uf";
import TabelaCenso from "../../componentes/tabela-censo";
import {
  FONTES, trilha, VARIAVEIS, catalogoDe, coberturaTemporal, palavrasChave, LICENCA_DADOS,
} from "../../../lib/jsonld";
import {
  lerCaged, lerEmendas, lerFiscal, lerIdeb, lerInss, lerSnapshot, SITE, cartaoSocial, imagemDoEstado,
} from "../../../lib/servidor";
import TabelaCaged from "../../componentes/tabela-caged";
import { cagedDeVarios, comSinal, contagem, nomeCompetencia } from "../../../lib/caged";
import {
  emendasDeVarios, mesDeCorte, porHabitante, porHabitanteDaUf,
} from "../../../lib/emendas";
import { dataBr, dias, inssDaUf, mesPorExtenso, pct } from "../../../lib/inss";
import estilos from "./estado.module.css";
import NestaPagina from "../../componentes/nesta-pagina";
import { atualDeFuncoes } from "../../../lib/fiscal";

/**
 * Uma página por estado — 27 delas.
 *
 * **Existe para consertar o grafo do site, não por simetria de navegação.**
 * Medido em 03/09/2026: das 1.794 páginas de município, 1.677 (93%) não
 * recebiam um único link interno. A home renderiza a lista num componente de
 * cliente, então o HTML dela não tem `href` para município nenhum; e o bloco
 * "outros municípios" apontava sempre para os 12 maiores do estado — 117
 * páginas no site inteiro, com 416 links entrando em cada.
 *
 * O sitemap resolve **descoberta**. Não resolve autoridade: página que só
 * existe no sitemap é página que o Google conhece e não tem motivo para
 * ranquear. Listando aqui **todos** os municípios do estado, as 1.677 órfãs
 * passam a estar a dois cliques da home.
 *
 * O segundo motivo é que a trilha já prometia este nível: ela dizia
 * `Números Públicos › Maranhão › Imperatriz` com "Maranhão" em texto morto.
 */

async function carregar() {
  const [snapshot, fiscal, ideb, idebFinais, caged, emendas, inss] = await Promise.all([
    lerSnapshot(), lerFiscal(), lerIdeb("anos_iniciais"), lerIdeb("anos_finais"),
    lerCaged(), lerEmendas(), lerInss(),
  ]);
  return {
    snapshot, fiscal, ideb, idebFinais, caged, emendas, inss,
    expandidos: expandir(snapshot),
  };
}

export async function generateStaticParams() {
  const { snapshot } = await carregar();
  return snapshot.ufs.map((u) => ({ uf: slugUf(u.sigla) }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ uf: string }> },
): Promise<Metadata> {
  const { uf } = await params;
  const { snapshot, fiscal, expandidos } = await carregar();
  const r = resumirEstado(snapshot, fiscal, expandidos, uf.toUpperCase());
  if (!r) return {};

  const acima = r.porFaixa["acima-legal"];
  // Concordância: o Distrito Federal tem UM ente, e "dos 1 municípios" no
  // título é o tipo de erro que faz o resultado de busca parecer gerado.
  // O cartão social leva o mesmo título (desde 12/10/2026).
  const titulo = r.uf.municipios === 1
    ? `${r.uf.nome} — dados abertos`
    : `${r.uf.nome} — dados abertos dos ${r.uf.municipios} municípios`;
  return {
    title: titulo,
    // Ver a nota do recorte em `municipio/[slug]/page.tsx`: ~155 caracteres é
    // onde o Google trunca, e a cauda era a mesma frase nas nove páginas.
    // O que aparece no Google, ANTES de a pessoa ver qualquer contexto da
    // página — por isso a contagem precisa carregar a base junto. "497
    // municípios ... 7 acima do limite legal" convida a ler 7/497, quando o
    // denominador é quem entregou: 75. E `descricaoDe` descarta a cauda em vez
    // de cortá-la no meio da palavra, que era o que o `.slice(155)` fazia.
    description: descricaoDe(
      (r.uf.municipios === 1
        ? `${r.uf.nome}: `
        : `Os ${r.uf.municipios} municípios ${deEstado(r.uf.sigla)}: `) +
        (r.mediaPessoal !== null
          ? `${r.publicaram} entregaram relatório fiscal, ` +
            `média de ${br(r.mediaPessoal, 2)}% da receita em pessoal e ` +
            `${acima} acima do limite legal.`
          // Sem média há dois motivos MUITO diferentes, e escrever o errado é
          // acusar quem presta contas: o DF entrega o RGF na esfera estadual,
          // porque não é município. Ver `PRESTA_COMO_ESTADO`.
          : r.comoEstado === r.uf.municipios
            ? "presta contas como estado, e não como município."
            : `${r.publicaram === 0 ? "nenhum município entregou" : `${r.publicaram} entregaram`} relatório fiscal.`),
      "Dados oficiais, com a fonte.",
    ),
    alternates: { canonical: `${SITE}/estado/${slugUf(r.uf.sigla)}/` },
    ...cartaoSocial(
      titulo,
      r.uf.municipios === 1
        ? `${r.uf.nome}, com procedência.`
        : `Os ${r.uf.municipios} municípios ${deEstado(r.uf.sigla)}, com procedência.`,
      `/estado/${slugUf(r.uf.sigla)}/`,
      imagemDoEstado(r.uf.sigla),
    ),
  };
}

export default async function PaginaEstado(
  { params }: { params: Promise<{ uf: string }> },
) {
  const { uf } = await params;
  const { snapshot, fiscal, ideb, idebFinais, caged, emendas, inss, expandidos } =
    await carregar();
  const r = resumirEstado(snapshot, fiscal, expandidos, uf.toUpperCase());
  if (!r) notFound();
  // Os mesmos argumentos do sitemap geral, que é o que lista os estados.
  const atualizado = atualizadoEm(snapshot, fiscal);
  // Quem presta contas como estado sai da conta de ausentes: ele entregou, na
  // esfera onde de fato presta contas. Somá-lo aqui seria repetir, uma casa
  // adiante, o erro que a faixa `como-estado` existe para corrigir.
  // E quem ainda não estava instalado no exercício, pelo mesmo motivo no eixo
  // do tempo: não havia prefeitura para entregar. Ver `INSTALADO_EM`.
  const ausentes = r.uf.municipios - r.publicaram - r.comoEstado - r.naoInstalados;

  // Os 27 estados, para situar este entre eles — o que só ficou possível com
  // a varredura nacional fechada. Ver a nota de desenho em `lib/nacional.ts`.
  const panorama = panoramaEstados(fiscal);
  const meu = panorama.find((x) => x.uf === r.uf.sigla);
  // Os dois pares de vizinhos da ressalva da entrega, lidos do dado: o texto
  // era digitado ("86% e 15%") e ficou falso quando o RGF Simplificado entrou
  // na conta. Sem contraste de 30 pontos nos dois pares, a frase sai.
  const taxaDe = (uf: string) => panorama.find((x) => x.uf === uf)?.taxa ?? null;
  const sc = taxaDe("SC"), rs = taxaDe("RS"), ba = taxaDe("BA"), ma = taxaDe("MA");
  const contraste = sc !== null && rs !== null && ba !== null && ma !== null &&
    Math.abs(sc - rs) >= 30 && Math.abs(ba - ma) >= 30;
  const posTaxa = meu
    ? posicaoNaLista(meu.taxa, panorama.map((x) => x.taxa))
    : null;
  const medianas = panorama
    .map((x) => x.mediana)
    .filter((v): v is number => v !== null);
  const posMediana = meu?.mediana != null
    ? posicaoNaLista(meu.mediana, medianas)
    : null;

  // Mediana e não média: o IDEB vai de 0 a 10, e um punhado de municípios
  // pequenos com nota extrema desloca a média sem descrever o estado.
  const medIdeb = medianaUltimaEdicao(ideb, r.municipios.map((m) => m.codigo));

  // Quantos municípios do estado NÃO têm rede municipal de ensino.
  //
  // O cartão dizia "mediana de N municípios" e parava ali, deixando o leitor
  // supor que o resto era lacuna da coleta. Não é: o INEP publica o IDEB por
  // REDE, e onde a prefeitura não administra as escolas não há linha municipal
  // a publicar. Verificado em 04/09/2026 reingerindo com `--rede Estadual`:
  // dos 138 sem rede municipal nos anos iniciais, 133 aparecem na estadual.
  //
  // O número dos anos finais é o que surpreende: no Paraná são 388 de 399.
  const semRede = r.municipios.filter(
    (m) => !ideb.municipios[String(m.codigo)]).length;
  const semRedeFinais = r.municipios.filter(
    (m) => !idebFinais.municipios[String(m.codigo)]).length;

  const de = deEstado(r.uf.sigla);

  // O Censo somado no estado, contra a mesma conta no pais. As duas sao
  // taxa ponderada (soma sobre soma), entao comparam diretamente -- ao
  // contrario da pagina do municipio, onde a coluna vizinha e a MEDIANA
  // dos municipios e precisa da ressalva que separa as duas coisas.
  const medidasCenso = medidasDe(r.uf.totais);

  // O Novo Caged somado nos municípios do estado (`cagedDeVarios`). Um teste
  // cobra que os 27 estados mais o "não identificado" dão o número oficial do
  // país; o do estado no sumário do MTE inclui ainda o que tem UF e não tem
  // município, e a ressalva diz isso.
  const cagedUf = cagedDeVarios(caged, r.municipios.map((m) => m.codigo));
  const semMunicipio =
    caged.naoIdentificado[0].reduce((s, x) => s + x, 0) +
    caged.naoIdentificado[1].reduce((s, x) => s + x, 0);

  // As emendas pagas às prefeituras do estado, somadas; por habitante do
  // estado (a estimativa do IBGE, a mais perto do ano do dinheiro) e, por
  // município, a mediana da mesma régua que a página de cada um usa.
  const emendasUf = emendasDeVarios(emendas, r.municipios.map((m) => m.codigo));
  const popEstimada = r.uf.totais["populacao-estimada"] ?? null;
  const anoEstimada = periodoDe(snapshot, "populacao-estimada");
  const emendasPh = porHabitante(emendasUf.cheio.reais, popEstimada);
  const phMunicipios = porHabitanteDaUf(emendas, snapshot, r.uf.sigla);
  const medianaPh = phMunicipios.length >= 5 ? mediana(phMunicipios) : null;

  // O INSS pelas agências do estado, benefício a benefício, ao lado do país.
  const inssUf = inss.fila ? inssDaUf(inss, r.uf.sigla) : [];
  const esperaUf = inssUf.reduce((t, x) => t + (x.fila?.n ?? 0), 0);
  const taxasPais = taxasCache(snapshot.municipios, snapshot.colunas);
  const pop = r.uf.totais["populacao-censo-2022"] ?? null;
  const pibReais = milReaisParaReais(r.uf.totais["pib-municipal"] ?? null);
  const quadrimestre = nomeQuadrimestre(fiscal.exercicio, fiscal.periodo);
  const bimestre = fiscal.funcoes
    ? `${fiscal.funcoes.periodo}º bimestre de ${atualDeFuncoes(fiscal.funcoes)?.exercicio ?? "?"}`
    : "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `Dados abertos dos municípios ${de}`,
    description:
      `População, PIB, despesa com pessoal e despesa liquidada por função ` +
      `${r.uf.municipios === 1 ? "do município" : `dos ${r.uf.municipios} municípios`} ` +
      `${de}, a partir das APIs públicas do ` +
      `IBGE e do SICONFI/Tesouro Nacional.`,
    url: `${SITE}/estado/${slugUf(r.uf.sigla)}/`,
    license: LICENCA_DADOS,
    isAccessibleForFree: true,
    // As fontes de onde este conjunto deriva. Estava só nas páginas de
    // município e na capa; a de estado dizia de onde o dado vinha em PROSA e
    // não em metadado, e o Dataset Search lê o metadado. Também inclui o INEP,
    // que a página usa para o IDEB mediano.
    isBasedOn: FONTES,
    inLanguage: "pt-BR",
    creator: { "@type": "Person", name: "Peter Wilhelm Kretzschmar" },
    // Ver a nota em `municipio/[slug]/page.tsx`: campos recomendados pela
    // documentação do Google para `Dataset`, que decidem se o conjunto aparece
    // descrito no Dataset Search.
    identifier: `${SITE}/estado/${slugUf(r.uf.sigla)}/`,
    keywords: palavrasChave([r.uf.nome, r.uf.sigla, "IDEB", "IBGE", "SICONFI"]),
    temporalCoverage: coberturaTemporal(snapshot, fiscal, ideb),
    variableMeasured: VARIAVEIS,
    includedInDataCatalog: catalogoDe(SITE),
    spatialCoverage: {
      "@type": "Place",
      name: `${r.uf.nome}, Brasil`,
    },
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "text/csv",
        contentUrl: `${SITE}/estado/${slugUf(r.uf.sigla)}/dados.csv`,
        name: `Municípios ${de} em CSV`,
      },
    ],
  };

  return (
    <main className={estilos.pagina} id="conteudo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* A trilha, num bloco separado de proposito: o `Dataset` acima ja
          funciona e a auditoria o confere: acrescentar um `@graph` mexeria na
          forma dele para ganhar nada. O Google aceita varios blocos. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            ...trilha(SITE, [
              { nome: "Números Públicos", caminho: "/" },
              { nome: r.uf.nome, caminho: `/estado/${slugUf(r.uf.sigla)}/` },
            ]),
          }),
        }}
      />

      <nav className={estilos.trilha} aria-label="Você está em">
        <Link href="/" prefetch={false}>Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{r.uf.nome}</span>
      </nav>

      <header>
        <h1 className={estilos.titulo}>
          {r.uf.nome} <span className={estilos.uf}>{r.uf.sigla}</span>
        </h1>
        <p className={estilos.chamada}>
          {r.uf.municipios === 1 ? "O" : "Os"}{" "}
          <strong>
            {r.uf.municipios === 1
              ? "município"
              : `${br(r.uf.municipios)} municípios`}
          </strong>{" "}
          {de}, com
          população, PIB, gasto com pessoal e despesa por função — cada número
          com a sua fonte ao lado.
        </p>
        {/* Mesma data e mesma função do sitemap; ver a página do município. */}
        <p className={estilos.atualizado}>
          Dados atualizados em{" "}
          <time dateTime={atualizado.toISOString()}>{dataPorExtenso(atualizado)}</time>.
        </p>
        <ComoLer tipo="estado" />
      </header>

      <section className={estilos.grade} aria-label="Totais do estado">
        <article className={estilos.cartao}>
          <h2 className={estilos.rotulo}>População</h2>
          <p className={`${estilos.valor} tabular`}>{br(pop)}</p>
          <p className={estilos.fonte}>Censo 2022 · IBGE</p>
        </article>

        <article className={estilos.cartao}>
          <h2 className={estilos.rotulo}>PIB somado</h2>
          <p className={`${estilos.valor} tabular`} title={escala(pibReais).exato}>
            {escala(pibReais).curto}
          </p>
          <p className={estilos.fonte}>
            {periodoDe(snapshot, "pib-municipal")}, a preços correntes · IBGE
          </p>
        </article>

        <article className={estilos.cartao}>
          <h2 className={estilos.rotulo}>
            Média de{" "}
            <Termo chave="gasto-com-pessoal">
              gasto com pessoal
            </Termo>
          </h2>
          <p className={`${estilos.valor} tabular`}>
            {r.mediaPessoal === null ? "—" : `${br(r.mediaPessoal, 2)}%`}
          </p>
          <p className={estilos.fonte}>
            {r.baseMedia === 0
              ? "sem base para calcular"
              : `média de ${br(r.baseMedia)} ${r.baseMedia === 1 ? "município" : "municípios"} com valor plausível`}{" "}
            · {quadrimestre} · SICONFI
          </p>
        </article>

        {medIdeb && (
          <article className={estilos.cartao}>
            <h2 className={estilos.rotulo}>IDEB mediano</h2>
            <p className={`${estilos.valor} tabular`}>
              {br(medIdeb.mediana, 1)}
            </p>
            <p className={estilos.fonte}>
              <Termo chave="rede-municipal">
                rede municipal
              </Termo>
              , anos iniciais · {medIdeb.edicao} · INEP
              <br />
              mediana de {br(medIdeb.base)} municípios, escala de 0 a 10
              {semRede > 0 && (
                <>
                  <br />
                  <strong>{br(semRede)}</strong>{" "}
                  {semRede === 1 ? "não tem" : "não têm"} rede municipal
                </>
              )}
            </p>
          </article>
        )}

        {r.publicaram === 0 ? (
          <article className={`${estilos.cartao} ${estilos["como-estado"]}`}>
            <h2 className={estilos.rotulo}>Teto legal</h2>
            <p className={`${estilos.valor} tabular`}>—</p>
            <p className={estilos.fonte}>
              {r.comoEstado === r.uf.municipios
                ? "Não se aplica: presta contas como estado, e não como município."
                : "Nenhum relatório municipal entregue no período."}
            </p>
          </article>
        ) : (
        <article className={`${estilos.cartao} ${estilos.destaque}`}>
          <h2 className={estilos.rotulo}>Acima do teto legal</h2>
          <p className={`${estilos.valor} tabular`}>
            {br(r.porFaixa["acima-legal"])}
          </p>
          {/* O denominador é quem ENTREGOU, nunca o total de municípios do
              estado. "7 de 497" convida a ler que 490 estão bem — quando 422
              deles apenas não prestaram contas, e sobre esses não se sabe
              nada. Ver a nota em `ResumoEstado.publicaram`. */}
          <p className={estilos.fonte}>
            de {br(r.publicaram)}{" "}
            {r.publicaram === 1 ? "município que entregou" : "que entregaram"}{" "}
            relatório, no {quadrimestre}
            {ausentes > 0 && (
              <>
                <br />
                <strong>{br(ausentes)}</strong>{" "}
                {ausentes === 1 ? "não entregou" : "não entregaram"}: sobre{" "}
                {ausentes === 1 ? "ele" : "esses"} não se sabe
              </>
            )}
            {r.comoEstado > 0 && (
              <>
                <br />
                {r.comoEstado === 1 ? "Outro ente presta" : `Outros ${br(r.comoEstado)} prestam`}{" "}
                contas como estado
              </>
            )}
            {r.naoInstalados > 0 && (
              <>
                <br />
                {r.naoInstalados === 1
                  ? "Outro município ainda não estava instalado"
                  : `Outros ${br(r.naoInstalados)} municípios ainda não estavam instalados`}
              </>
            )}
          </p>
        </article>
        )}
      </section>

      {/* Cada item repete a condição que mostra a sua seção; o
          `conferir-links` reprova âncora sem alvo e seção com `id` fora daqui.
          Ver `componentes/nesta-pagina.tsx`. */}
      <NestaPagina itens={[
        { id: "no-pais", titulo: "No país" },
        medidasCenso.some((x) => x.percentual !== null) &&
          { id: "como-se-vive", titulo: "Como se vive" },
        !!cagedUf && { id: "emprego", titulo: "Emprego com carteira" },
        emendasUf.comPagamento > 0 && { id: "emendas", titulo: "Emendas parlamentares" },
        inssUf.length > 0 && { id: "inss", titulo: "Pedidos ao INSS" },
        { id: "limite-de-pessoal", titulo: "Limite de pessoal" },
        !!r.funcoes && { id: "para-onde-vai", titulo: "Para onde vai o dinheiro" },
        (semRede > 0 || semRedeFinais > 0) && { id: "ideb", titulo: "IDEB" },
        !!(meu && posTaxa) && { id: "comparacao", titulo: "Entre os estados" },
        { id: "municipios", titulo: r.uf.municipios === 1 ? "O município" : "Os municípios" },
        { id: "baixar", titulo: "Baixar os dados" },
        { id: "outros-estados", titulo: "Outros estados" },
      ]} />

      {/* O mesmo mapa da capa, com a UF contornada. Ele responde a pergunta
          que a página do município levanta e não fecha — "e o meu estado, como
          está?" — sem custar coleta nova nem componente novo. As camadas vêm de
          `camadasPadrao` para que capa e estado não divirjam. */}
      <section className={estilos.texto} aria-labelledby="no-pais">
        <h2 id="no-pais">{r.uf.nome} no país</h2>
        <p>
          Os 27 estados no mesmo indicador, com {r.uf.sigla} em destaque. Os
          valores de cada um estão na tabela logo após o mapa.
        </p>
        <MapaUf
          camadas={camadasPadrao(snapshot.ufs, panorama)}
          destaque={r.uf.sigla}
          nomes={Object.fromEntries(snapshot.ufs.map((u) => [u.sigla, u.nome]))}
        />
      </section>

      {medidasCenso.some((x) => x.percentual !== null) && (
        <section className={estilos.texto} id="como-se-vive">
          <h2>Como se vive {emContracao(de)}</h2>
          <p>
            Do <strong><Termo chave="censo">Censo de 2022</Termo></strong>, somando os municípios do estado.
            A coluna do Brasil é a <strong>mesma conta no país inteiro</strong> —
            as duas são proporção de domicílios ou de pessoas, então comparam
            diretamente.
          </p>
          <TabelaCenso
            medidas={medidasCenso}
            comparacoes={[{ rotulo: "No Brasil", valores: taxasPais }]}
            rotuloValor={r.uf.nome}
            legenda={`${r.uf.nome} no Censo 2022, com o Brasil ao lado`}
          />
          <p className={estilos.ressalva}>
            {/* A distincao que a pagina do municipio precisa fazer (mediana de
                municipios contra taxa do pais) NAO se aplica aqui: as duas
                colunas sao taxa ponderada, e comparam direto. Dizer o contrario
                so para repetir a ressalva de la seria ruido. */}
            Estes números somam os municípios do estado — não são média das
            proporções municipais, que daria a uma cidade de 3 mil habitantes o
            mesmo peso da capital. Fonte: IBGE, Censo Demográfico 2022, pelas
            APIs públicas de agregados.
          </p>
        </section>
      )}

      {cagedUf && (
        <section className={estilos.texto} id="emprego">
          <h2>Emprego com carteira {emContracao(de)}</h2>
          <p>
            Do <strong><Termo chave="caged">Novo Caged</Termo></strong>, do
            Ministério do Trabalho,{" "}
            {r.uf.municipios > 1 ? `somando os municípios ${de}` : emContracao(de)}. De{" "}
            {nomeCompetencia(caged.competencias[0]!)} a{" "}
            {nomeCompetencia(caged.competencia)} foram{" "}
            <strong>{contagem(cagedUf.admissoes, "admissão", "admissões")}</strong>{" "}
            e{" "}
            <strong>
              {contagem(cagedUf.desligamentos, "desligamento", "desligamentos")}
            </strong>
            : <Termo chave="saldo">saldo</Termo> de{" "}
            <strong>{comSinal(cagedUf.saldo)}</strong>{" "}
            {Math.abs(cagedUf.saldo) === 1 ? "vaga" : "vagas"}. Só em{" "}
            {nomeCompetencia(caged.competencia)}, o saldo foi de{" "}
            <strong>{comSinal(cagedUf.ultimo.saldo)}</strong>{" "}
            {Math.abs(cagedUf.ultimo.saldo) === 1 ? "vaga" : "vagas"}.
            {cagedUf.comDado > 1 && (
              <>
                {" "}
                <strong>{fracaoDe(cagedUf.positivos, cagedUf.comDado)}</strong>{" "}
                {concorda(cagedUf.positivos, cagedUf.comDado, "fechou", "fecharam")}{" "}
                os 12 meses com mais contratações que desligamentos.
              </>
            )}{" "}
            <Link
              href={`/ranking/emprego-com-carteira/?uf=${r.uf.sigla.toLowerCase()}`}
              prefetch={false}
            >
              O ranking dos municípios, com as cidades grandes {deEstado(r.uf.sigla)} por habitante
            </Link>.
          </p>
          <TabelaCaged
            meses={cagedUf.meses}
            legenda={`${r.uf.nome} no Novo Caged, mês a mês` +
              (r.uf.municipios > 1 ? ", somando os municípios" : "")}
          />
          <p className={estilos.ressalva}>
            Só emprego <Termo chave="celetista">celetista</Termo>: servidor{" "}
            <Termo chave="estatutario">estatutário</Termo> e quem trabalha por
            conta própria não entram. Os meses já incluem as declarações
            entregues fora do prazo e as exclusões feitas até{" "}
            {nomeCompetencia(caged.competencia)}, e o mês mais recente ainda
            pode mudar. Aqui só entra o que tem município: as{" "}
            {br(semMunicipio)} movimentações que o Ministério não atribui a
            município nenhum entram só no total do país, e por isso o número
            que ele publica para o estado pode diferir um pouco. No país, os
            mesmos 12 meses somam{" "}
            <strong>{comSinal(caged.conferencia.doze.saldo)}</strong> vagas.{" "}
            <a href={caged.conferencia.sumario}>Sumário executivo do MTE</a>.
          </p>
        </section>
      )}

      {emendasUf.comPagamento > 0 && emendasUf.cheio.reais !== null && (
        <section className={estilos.texto} id="emendas">
          <h2>Emendas parlamentares pagas aos municípios {de}</h2>
          <p>
            Em {emendasUf.cheio.ano}, as prefeituras e os fundos municipais {de}{" "}
            receberam{" "}
            <strong title={escalaComSinal(emendasUf.cheio.reais).exato}>
              {escalaComSinal(emendasUf.cheio.reais).curto}
            </strong>{" "}
            em pagamentos de{" "}
            <Termo chave="emenda-parlamentar">emendas parlamentares</Termo>
            {emendasPh !== null && (
              <>
                : <strong>{"R$ "}{br(emendasPh, 2)}</strong> por habitante do
                estado, pela população estimada de {anoEstimada}
              </>
            )}
            . <strong>{fracaoDe(emendasUf.comPagamento, r.uf.municipios)}</strong>{" "}
            {concorda(emendasUf.comPagamento, r.uf.municipios, "teve", "tiveram")}{" "}
            algum pagamento no ano.
            {emendasUf.parcial && (
              emendasUf.parcial.reais === null ? (
                <>
                  {" "}Em {emendasUf.parcial.ano}, até {mesDeCorte(emendas.ultimoMes)},
                  nenhum pagamento foi registrado.
                </>
              ) : (
                <>
                  {" "}Em {emendasUf.parcial.ano}, até {mesDeCorte(emendas.ultimoMes)},
                  o saldo é de{" "}
                  <strong title={escalaComSinal(emendasUf.parcial.reais).exato}>
                    {escalaComSinal(emendasUf.parcial.reais).curto}
                  </strong>.
                </>
              )
            )}
          </p>
          {medianaPh !== null && (
            <p>
              Município a município, a{" "}
              <Termo chave="mediana">mediana</Termo> é de{" "}
              <strong>{"R$ "}{br(medianaPh, 2)}</strong> por habitante em{" "}
              {emendasUf.cheio.ano}: metade dos {br(phMunicipios.length)} que
              tiveram pagamento recebeu menos que isso, metade mais. A página de
              cada município mostra o valor dele contra esta mediana, e a divisão
              por tipo de emenda.
            </p>
          )}
          <p className={estilos.ressalva}>
            Conta o que a União <strong>pagou</strong> às prefeituras e aos
            fundos municipais (como o de saúde), pelo mês do pagamento, e não o
            que foi empenhado. Não entram os pagamentos ao próprio governo do
            estado, a entidades e a empresas.{" "}
            <strong>Até 2024, parte do dinheiro de emendas era paga ao Banco do
            Brasil, sem o município de destino</strong>; por isso os anos
            anteriores não se comparam com {emendasUf.cheio.ano}. Fonte:{" "}
            {emendas.fonte}, arquivo de {dataCurta(emendas.dataArquivo)}.
          </p>
        </section>
      )}

      {inssUf.length > 0 && inss.fila && (
        <section className={estilos.texto} id="inss">
          <h2>Pedidos ao INSS {emContracao(de)}</h2>
          <p>
            Do Portal de Dados Abertos do INSS. Em{" "}
            <strong>{dataBr(inss.fila.referencia)}</strong>, as agências {de}{" "}
            tinham <strong>{br(esperaUf)}</strong> pedidos esperando decisão nos
            benefícios abaixo. A <strong>espera típica</strong> é o meio da
            fila: metade dos pedidos esperava havia mais do que isso. Ao lado,
            a mesma conta no país, e quanto tempo levaram as negativas.
          </p>
          <div className={estilos.rolagem}>
            <table className={estilos.lista}>
              <caption>
                Pedidos ao INSS {emContracao(de)}, por benefício: a fila em{" "}
                {dataBr(inss.fila.referencia)}
                {inss.negados && <> e as negativas de {mesPorExtenso(inss.negados.mes)}</>}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Benefício</th>
                  <th scope="col" className={estilos.num}>Pedidos em espera</th>
                  <th scope="col" className={estilos.num}>Metade espera há mais de</th>
                  <th scope="col" className={estilos.num}>No país</th>
                  <th scope="col" className={estilos.num}>Há mais de 90 dias (% dos pedidos)</th>
                  <th scope="col" className={estilos.num}>Metade negada em até</th>
                </tr>
              </thead>
              <tbody>
                {inssUf.map(({ grupo, fila, negados }) => (
                  <tr key={grupo.chave}>
                    <th scope="row">
                      <Link href={`/inss/${grupo.chave}/`} prefetch={false}>
                        {grupo.nomePopular.charAt(0).toUpperCase() +
                          grupo.nomePopular.slice(1)}
                      </Link>
                    </th>
                    <td className={`${estilos.num} tabular`}>{fila ? br(fila.n) : "—"}</td>
                    <td className={`${estilos.num} tabular`}>
                      {fila ? dias(fila.mediana) : "—"}
                    </td>
                    <td className={`${estilos.num} tabular`}>{dias(grupo.fila!.mediana)}</td>
                    <td className={`${estilos.num} tabular`}>{fila ? pct(fila.acima90) : "—"}</td>
                    <td className={`${estilos.num} tabular`}>
                      {negados ? dias(negados.mediana) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={estilos.ressalva}>
            A espera é a dos pedidos <strong>ainda sem decisão</strong>, contada
            da criação do pedido até {dataBr(inss.fila.referencia)}; não é o
            tempo até a decisão. A negativa conta do pedido ao &ldquo;não&rdquo;.
            O estado é o da agência onde o pedido foi criado, na fila, e o da
            que negou, nas negativas
            {inss.negados && (
              <>
                : as {br(inss.negados.foraDasUfs.n)} negativas de{" "}
                {mesPorExtenso(inss.negados.mes)} decididas pela agência de
                automação do INSS, que atende o país inteiro (
                {pct(inss.negados.foraDasUfs.n / inss.negados.foraDasUfs.total)}{" "}
                do total), entram no país e em nenhum estado
              </>
            )}
            . Travessão: menos de {br(inss.minimoPedidos)} pedidos no estado,
            poucos para publicar. Fonte:{" "}
            <a href={inss.fonte.url}>{inss.fonte.nome}</a>.{" "}
            <Link href="/ajuda/#inss" prefetch={false}>Como ler estes números</Link>
          </p>
        </section>
      )}

      <section className={estilos.texto} id="limite-de-pessoal">
        <h2>
          {r.comoEstado === r.uf.municipios
            ? `O limite de pessoal ${de}`
            : `Onde os municípios ${de} estão em relação ao limite`}
        </h2>
        <p>
          A Lei de Responsabilidade Fiscal fixa{" "}
          <strong>{br(fiscal.limites.legal, 2)}%</strong> da receita corrente
          líquida ajustada como <Termo chave="teto-legal">teto</Termo> para o Executivo municipal, e{" "}
          <strong>{br(fiscal.limites.prudencial, 2)}%</strong> como{" "}
          <Termo chave="limite-prudencial">limite prudencial</Termo>. No {quadrimestre}:
        </p>
        <ul className={estilos.faixas}>
          {(["acima-legal", "acima-prudencial", "abaixo", "implausivel",
            "sem-dado", "nao-consultado", "como-estado", "nao-instalado"] as const)
            // Faixa vazia não vira linha: "0 ainda não consultado" é ruído
            // depois que a varredura fecha, e some sozinho quando fecha.
            .filter((f) => r.porFaixa[f] > 0)
            .map((f) => (
            <li key={f} className={estilos[f]}>
              <strong className="tabular">{br(r.porFaixa[f])}</strong>{" "}
              {ROTULO_FAIXA[f].toLowerCase()}
            </li>
          ))}
        </ul>
        {/* O caminho para a lista NACIONAL, e só quando este estado tem
            alguém nela. Medido em 07/09/2026: a página de ranking era
            alcançável apenas da capa, e as 27 páginas de estado -- que têm
            "Acima do limite legal" como título -- não levavam a ela.

            Condicionado porque num estado sem ninguém acima do teto o link
            prometeria uma lista que não fala daquele estado. */}
        {r.porFaixa["acima-legal"] > 0 && (
          <p className={estilos.ressalva}>
            <Link href="/ranking/gasto-com-pessoal/" prefetch={false}>
              Quais municípios do país estão acima do limite
            </Link>{" "}
            — a lista nacional, na mesma coleta.
          </p>
        )}
        {/* Só quando há o que excluir. Com zero implausíveis a frase virava
            "exclui os 0 fora da faixa", que anuncia uma correção que não
            aconteceu e faz o leitor procurar um problema inexistente. */}
        {r.porFaixa.implausivel > 0 ? (
          <p className={estilos.ressalva}>
            {/* Sem número de exemplo digitado: o texto dizia "371%" e "quase
                dois pontos", verdade num caso e repetido nos 27 estados. */}
            A média acima <strong>deixa de fora {r.porFaixa.implausivel === 1
              ? "o município" : `os ${br(r.porFaixa.implausivel)} municípios`}</strong>{" "}
            com percentual impossível: fora da faixa de 0 a 100% da receita, ou
            calculado sobre uma receita corrente líquida que a declaração de
            receita do próprio município desmente. É erro de preenchimento, e um
            só pode mover a média do estado inteiro.
          </p>
        ) : r.baseMedia > 0 ? (
          <p className={estilos.ressalva}>
            Nenhum município {de} declarou percentual implausível, então a
            média acima usa {r.baseMedia === 1 ? "o único" : `todos os ${br(r.baseMedia)}`}{" "}
            que {r.baseMedia === 1 ? "entregou" : "entregaram"} o relatório.
          </p>
        ) : null}
      </section>

      {r.funcoes && (
        <section className={estilos.texto} id="para-onde-vai">
          <h2>Para onde vai o dinheiro {de}</h2>
          <p>
            No {bimestre}, os <strong>{br(r.funcoes.municipios)}</strong>{" "}
            municípios que entregaram o relatório liquidaram{" "}
            <strong>{escala(r.funcoes.total).curto}</strong> de despesa. A soma
            é de valores absolutos, não a média das fatias: dar o mesmo peso a
            uma capital e a um município de três mil habitantes descreveria uma
            média, não o estado.
          </p>
          <div className={estilos.rolagem}>
            <ComposicaoBarras
              fatias={r.funcoes.fatias}
              total={r.funcoes.total}
              municipio={r.uf.nome}
              local={emContracao(de)}
            />
          </div>
        </section>
      )}

      {/* O cartão do IDEB dizia "mediana de N municípios" e parava ali. Quem
          lê supõe lacuna de coleta; não é. O INEP publica por REDE, e onde a
          prefeitura não administra as escolas não há linha municipal.
          Verificado, não suposto — ver a nota em `semRede`. */}
      {(semRede > 0 || semRedeFinais > 0) && (
        <section className={estilos.texto} id="ideb">
          <h2>Por que nem todo município {de} tem IDEB aqui</h2>
          <p>
            O INEP publica o IDEB <strong>por rede</strong>, e este site mostra
            a <strong>municipal</strong> — a que a prefeitura administra, e a
            única que pareia com o orçamento dela. Onde as escolas são de outra
            rede, não há número municipal a publicar.
          </p>
          <ul className={estilos.lista}>
            {semRede > 0 && (
              <li>
                <strong>{fracaoDe(semRede, r.uf.municipios)}</strong> {de}{" "}
                {concorda(semRede, r.uf.municipios, "não tem", "não têm")} rede
                municipal nos <strong>anos iniciais</strong> (1º ao 5º).
              </li>
            )}
            {semRedeFinais > 0 && (
              <li>
                <strong>{fracaoDe(semRedeFinais, r.uf.municipios)}</strong>{" "}
                {concorda(semRedeFinais, r.uf.municipios, "não tem", "não têm")}{" "}
                nos <strong>anos finais</strong> (6º ao 9º)
                {r.uf.municipios > 1 &&
                  ` — ${br((semRedeFinais * 100) / r.uf.municipios, 0)}% do estado`}
                .
              </li>
            )}
          </ul>
          <p className={estilos.ressalva}>
            <strong>Isto não é lacuna da coleta.</strong> É como a educação
            básica está dividida, e varia muito entre estados: no Paraná{" "}
            <strong>388 dos 399</strong> municípios não têm rede própria nos
            anos finais, enquanto em 16 unidades da federação nenhum município
            fica de fora nos anos iniciais. O gasto municipal com educação
            continua aparecendo — ele existe mesmo onde a rede é de outro ente.
          </p>
        </section>
      )}

      {/* A pergunta que a página do município faz e a do estado não fazia.
          Só ficou possível com os 5.570 municípios consultados — antes disso
          não havia contra o que comparar. Ver `lib/nacional.ts`. */}
      {meu && posTaxa && (
        <section className={estilos.texto} id="comparacao">
          {/* O número sai do panorama, nunca cravado: o Distrito Federal fica
              de fora (não entrega como município, ver `PRESTA_COMO_ESTADO`),
              então são 26 e não 27. Escrever "27" aqui seria a mesma mentira
              silenciosa que a mediana regional cravada já custou. */}
          <h2>
            {r.uf.nome} ao lado dos outros estados
          </h2>

          <h3 className={estilos.subtitulo}>Quantos prestam contas</h3>
          <p>
            <strong>{br(meu.publicaram)}</strong> dos{" "}
            <strong>{br(meu.municipios)}</strong> municípios {de}
            {/* `meu.municipios` não conta quem ainda não estava instalado:
                sem estas palavras, MT diria "dos 141" e tem 142. */}
            {r.naoInstalados > 0 && " já instalados"} entregaram o
            Relatório de Gestão Fiscal do {quadrimestre}, ou o{" "}
            <Termo chave="rgf-simplificado">simplificado</Termo> do 2º
            semestre, que cobre os mesmos 12 meses —{" "}
            <strong>{br(meu.taxa, 0)}%</strong>. Entre as{" "}
            {br(panorama.length)} com relatório municipal,{" "}
            {posTaxa.abaixo === 0 ? (
              <>nenhum entrega menos</>
            ) : (
              <>
                <strong>
                  {br(posTaxa.abaixo)}{" "}
                  {posTaxa.abaixo === 1 ? "entrega" : "entregam"} menos
                </strong>
              </>
            )}
            .
          </p>
          <div className={estilos.grafico}>
            {/* O título ficava só no <title> do SVG, que a tela não mostra:
                quem via a tira não sabia o que era cada ponto. */}
            <p className={estilos.fonte}>
              Municípios que entregaram o relatório fiscal do {quadrimestre},
              em % do total de cada estado. Cada ponto é uma unidade da
              federação; o losango é {r.uf.nome}. Fonte: Tesouro Nacional,
              SICONFI.
            </p>
            <TiraEstados
              panorama={panorama}
              destaque={r.uf.sigla}
              valorDe={(x) => x.taxa}
              formatar={(v) => `${br(v, 0)}%`}
              rotuloEixo="Percentual de municípios que entregaram o relatório fiscal, por estado"
              descricao={
                `As ${panorama.length} unidades da federação pelo percentual ` +
                `de municípios que entregaram o ` +
                `relatório fiscal. ${r.uf.nome} está em ${br(meu.taxa, 0)}%, ` +
                `acima de ${br(posTaxa.abaixo)} dos outros. O menor é ` +
                `${br(Math.min(...panorama.map((x) => x.taxa)), 0)}% e o maior ` +
                `${br(Math.max(...panorama.map((x) => x.taxa)), 0)}%.`
              }
            />
          </div>
          <p className={estilos.ressalva}>
            A entrega varia de{" "}
            <strong>
              {br(Math.min(...panorama.map((x) => x.taxa)), 0)}% a{" "}
              {br(Math.max(...panorama.map((x) => x.taxa)), 0)}%
            </strong>{" "}
            entre as unidades da federação
            {contraste ? (
              <>
                , e <strong>não é uma divisão regional</strong>: Santa Catarina
                entrega {br(sc!, 0)}% e o Rio Grande do Sul {br(rs!, 0)}%,
                vizinhos; a Bahia {br(ba!, 0)}% e o Maranhão {br(ma!, 0)}%,
                ambos no Nordeste.
              </>
            ) : "."}{" "}
            Entregar é obrigação da Lei de
            Responsabilidade Fiscal, mas não entregar tem causas que este painel
            não conhece — aqui está o número, não o motivo.
          </p>

          {meu.mediana !== null && posMediana && (
            <>
              <h3 className={estilos.subtitulo}>Quanto se gasta com pessoal</h3>
              <p>
                A <Termo chave="mediana">mediana</Termo> {de} é <strong>{br(meu.mediana, 2)}%</strong> da
                receita corrente líquida ajustada, calculada sobre{" "}
                <strong>{br(meu.base)}</strong>{" "}
                {meu.base === 1 ? "município" : "municípios"}. Entre os{" "}
                {br(medianas.length)} com base suficiente,{" "}
                {posMediana.abaixo === 0 ? (
                  <>nenhum tem mediana menor</>
                ) : (
                  <strong>
                    {br(posMediana.abaixo)}{" "}
                    {posMediana.abaixo === 1 ? "tem" : "têm"} mediana menor
                  </strong>
                )}
                .
              </p>
              <div className={estilos.grafico}>
                <p className={estilos.fonte}>
                  Mediana do gasto com pessoal dos municípios de cada estado
                  no {quadrimestre}, em % da receita corrente líquida, só onde
                  a base é suficiente. O losango é {r.uf.nome}. Fonte: Tesouro
                  Nacional, SICONFI.
                </p>
                <TiraEstados
                  panorama={panorama}
                  destaque={r.uf.sigla}
                  valorDe={(x) => x.mediana}
                  formatar={(v) => `${br(v, 2)}%`}
                  rotuloEixo="Mediana do gasto com pessoal, por estado"
                  descricao={
                    `As unidades da federação pela mediana do gasto com ` +
                    `pessoal. ` +
                    `${r.uf.nome} está em ${br(meu.mediana, 2)}%, acima de ` +
                    `${br(posMediana.abaixo)} das ${br(posMediana.de)} ` +
                    `com base suficiente.`
                  }
                />
              </div>
              <p className={estilos.ressalva}>
                {meu.taxa < 50 ? (
                  <>
                    <strong>Leia esta mediana com reserva.</strong> Ela descreve
                    os {br(meu.base)} municípios que entregaram — {br(meu.taxa, 0)}%
                    do estado. Sobre os outros não se sabe nada, e nada garante
                    que se pareçam com estes.
                  </>
                ) : (
                  <>
                    A mediana descreve os {br(meu.base)} municípios que
                    entregaram, não os {br(meu.municipios)}{" "}
                    {r.naoInstalados > 0 ? "já instalados" : "do estado"}. Sobre os
                    que não entregaram não se sabe nada.
                  </>
                )}
              </p>
            </>
          )}
        </section>
      )}

      <section className={estilos.texto} id="municipios">
        <h2>
          {r.uf.municipios === 1
            ? `O município ${de}`
            : `Os ${br(r.uf.municipios)} municípios ${de}`}
        </h2>
        <p>
          Em ordem alfabética. O percentual é o que o próprio município
          declarou ao SICONFI no {quadrimestre}; travessão significa que o
          relatório não foi entregue — não zero.
        </p>
      </section>

      <div className={estilos.rolagem}>
        <table className={estilos.lista}>
          <caption className="so-leitor">
            Municípios {de}, com a população do Censo 2022 e o gasto com
            pessoal no {quadrimestre}, em % da receita corrente líquida.
          </caption>
          <thead>
            <tr>
              <th scope="col">Município</th>
              <th scope="col" className={estilos.num}>População (Censo 2022)</th>
              <th scope="col" className={estilos.num}>
                Gasto com pessoal{" "}
                (% da <Termo chave="rcl">RCL</Termo>)
              </th>
              <th scope="col" className={estilos.situacao}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {r.municipios.map((m) => {
              const faixa = m.fiscal?.faixa ?? "nao-consultado";
              return (
                <tr key={m.codigo}>
                  <th scope="row">
                    {/* Ver a nota em `municipio/[slug]/page.tsx`: 645 links
                        nesta tabela, e a pré-busca especulativa dos que cabem
                        na tela custa centenas de KB antes de qualquer clique. */}
                    <Link href={`/municipio/${m.slug}/`} prefetch={false}>
                      {m.nome}
                    </Link>
                  </th>
                  <td className={`${estilos.num} tabular`}>
                    {br(m.valores["populacao-censo-2022"] ?? null)}
                  </td>
                  <td className={`${estilos.num} tabular`}>
                    {m.fiscal?.percentual === null ||
                    m.fiscal?.percentual === undefined
                      ? "—"
                      : `${br(m.fiscal.percentual, 2)}%`}
                  </td>
                  <td className={estilos.situacao}>
                    <span className={`${estilos.selo} ${estilos[faixa]}`}>
                      {ROTULO_FAIXA[faixa]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className={estilos.texto} id="baixar">
        <h2>Baixar estes dados</h2>
        <ul className={estilos.downloads}>
          <li>
            <a href={`/estado/${slugUf(r.uf.sigla)}/dados.csv`} download>
              Municípios {de} em CSV
            </a>{" "}
            <span className={estilos.fonte}>— uma linha por município</span>
          </li>
          <li>
            <a href="/dados/municipios.xlsx" download>
              Base completa em planilha
            </a>{" "}
            <span className={estilos.fonte}>
              — os {br(snapshot.municipios.length)} municípios do país, com
              dicionário de colunas e procedência
            </span>
          </li>
          <li>
            <a href="/dados/municipios.csv" download>A mesma base em CSV</a>{" "}
            <span className={estilos.fonte}>— para ler por programa</span>
          </li>
        </ul>
      </section>

      <section className={estilos.texto} id="outros-estados">
        <h2>Outros estados</h2>
        <ul className={estilos.estados}>
          {snapshot.ufs
            .filter((u) => u.sigla !== r.uf.sigla)
            .map((u) => (
              <li key={u.sigla}>
                <Link href={`/estado/${slugUf(u.sigla)}/`} prefetch={false}>
                  {u.nome}
                </Link>
              </li>
            ))}
        </ul>
      </section>

      <footer className={estilos.rodape}>
        <p>
          Fontes: {snapshot.fonte} e {fiscal.fonte}
          {fiscal.coletadoEm
            ? ` · coleta fiscal em ${dataCurta(fiscal.coletadoEm)}`
            : ""}
          . Dados sob a{" "}
          <a href="/ajuda/#licenca">licença de cada fonte</a>; os do SICONFI,
          e as planilhas deste site, sob ODbL.
        </p>
      </footer>
    </main>
  );
}
