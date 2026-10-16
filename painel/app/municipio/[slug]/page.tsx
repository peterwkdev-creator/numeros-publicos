import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { br, dataCurta, descricaoDe, periodoDe } from "../../../lib/dados";
import { aberturaFiscalDe, tituloFiscalDe } from "../../../lib/titulo";
import { funcoesRecentesDe } from "../../../lib/fiscal";
import { trajetoriaDe } from "../../../lib/ideb";
import { cartaoSocial, imagemDoEstado, SITE } from "../../../lib/servidor";
// A ORDEM destes imports de CSS é a que o `page.tsx` tinha antes da divisão em
// seções (item 19, 15/10/2026). O bundler decide em que chunk cai cada CSS
// Module pela ordem em que são avaliados; com cada seção importando os
// componentes por si, ele reagrupou o CSS da capa, do estado e da ajuda
// (+10,7 KB no chunk compartilhado). Os imports sem nome só fixam a ordem;
// quem usa o componente é a seção. Mexer aqui muda o peso do site.
import TabelaCenso from "../../componentes/tabela-censo";
import "../../componentes/tabela-valores";
import "../../componentes/tabela-caged";
import "../../componentes/composicao-barras";
import "../../componentes/distribuicao-svg";
import "../../componentes/ideb-svg";
import Termo from "../../componentes/termo";
import "../../componentes/como-ler";
import NestaPagina, { comSumario, VoltaSumario } from "../../componentes/nesta-pagina";
import "./serie-svg";
import "./saude-svg";
import estilos from "./municipio.module.css";
import "../../componentes/serie-funcoes";
import { carregar } from "./apoio";
import { montarContexto } from "./contexto";
import type { Contexto } from "./contexto";
import Cabecalho from "./secao-cabecalho";
import SecaoCartoes from "./secao-cartoes";
import SecaoNoEstado from "./secao-no-estado";
import SecaoPessoal from "./secao-pessoal";
import SecaoIssoEMuito from "./secao-isso-e-muito";
import SecaoAoLongoDoTempo from "./secao-ao-longo-do-tempo";
import SecaoSaude from "./secao-saude";
import SecaoParaOndeVai from "./secao-para-onde-vai";
import SecaoDeOndeVem from "./secao-de-onde-vem";
import SecaoOQueMudou from "./secao-o-que-mudou";
import SecaoEmendas from "./secao-emendas";
import SecaoEducacao from "./secao-educacao";
import SecaoTrabalho from "./secao-trabalho";
import SecaoVizinhos from "./secao-vizinhos";
import SecaoBaixar from "./secao-baixar";

/**
 * Uma página por município — 5.571 delas, geradas no build.
 *
 * Existe por uma razão medida: o site inteiro tinha **uma** URL indexável, com
 * todos os municípios de dado dentro. Quem procura "gasto com pessoal prefeitura
 * de Imperatriz" nunca ia chegar a uma tabela que exige rolar e filtrar. Cada
 * município agora tem endereço próprio, título próprio e o dado dos dois
 * sistemas junto — que é o que nenhuma das duas fontes originais oferece.
 */

export async function generateStaticParams() {
  const { municipios } = await carregar();
  return municipios.map((m) => ({ slug: m.slug }));
}


// O título mora em `lib/titulo.ts`, com o experimento de 22/09/2026.

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const { municipios, fiscal, ideb } = await carregar();
  const m = municipios.find((x) => x.slug === slug);
  if (!m) return {};

  const pop = m.valores["populacao-censo-2022"] ?? null;
  // O implausível NÃO entra na descrição. A página o exibe marcado e
  // explicado; o trecho do buscador não tem espaço para a marca, e mostraria
  // "371,02% da receita em pessoal" (Guaratinga/BA) ou "92,78%" (Aparecida/SP,
  // RCL desmentida pela receita) como fato. Achado em 22/09/2026: o trecho
  // repetia no Google o que a página se recusava a afirmar.
  const pessoal =
    m.fiscal?.faixa === "implausivel" ? null : m.fiscal?.percentual ?? null;
  const maiorFuncao = funcoesRecentesDe(fiscal, m.codigo)?.fatias[0] ?? null;
  const ultimoIdeb = trajetoriaDe(ideb, m.codigo)?.ultimo.observado ?? null;
  // A descrição carrega os NÚMEROS, não adjetivos. É o que aparece no
  // resultado da busca, e número é o que faz alguém clicar num painel de dado.
  const partes = [
    pop !== null ? `${br(pop, 0)} habitantes` : null,
    pessoal !== null ? `${br(pessoal, 2)}% da receita em pessoal` : null,
    // A maior função é o número mais concreto da página inteira, e o único
    // que responde à pergunta que a pessoa realmente digitou na busca.
    maiorFuncao && maiorFuncao.percentual !== null
      ? `${br(maiorFuncao.percentual, 1)}% do gasto em ${maiorFuncao.nome.toLowerCase()}`
      : null,
    // "IDEB de <cidade>" é consulta com ciclo próprio, todo ano de divulgação.
    ultimoIdeb !== null ? `IDEB ${br(ultimoIdeb, 1)}` : null,
  ].filter(Boolean);

  // **A descrição cabe em ~155 caracteres, e o corte não é estético.** O Google
  // trunca a partir daí, então tudo depois disso é peso sem efeito. E o que
  // estava na cauda era a frase de procedência -- idêntica nas 1.794 páginas,
  // ou seja, o pedaço com MENOS valor de diferenciação ocupando o espaço do
  // que mais tem: os números deste município.
  // Nas UFs do experimento de título (ver `lib/titulo.ts`), a descrição abre
  // pelo veredito fiscal, e a população vai para depois. O limite prudencial é
  // o do PRÓPRIO município quando ele declara um: é esse que decidiu a faixa.
  const abertura = aberturaFiscalDe(m.nome, m.uf, m.fiscal?.faixa, pessoal, {
    legal: fiscal.limites.legal,
    prudencial: m.fiscal?.limitePrudencial ?? fiscal.limites.prudencial,
  });
  const resto = partes.filter((p) => !String(p).endsWith("da receita em pessoal"));
  const descricao = descricaoDe(
    abertura
      ? `${abertura}.${resto.length ? ` ${resto.join(", ")}.` : ""}`
      : `${m.nome} (${m.uf}): ${partes.join(", ")}.`,
    "Dados oficiais do IBGE, do Tesouro Nacional e do INEP.",
  );

  // O cartão de quem compartilha leva o MESMO título da aba e do Google (até
  // 12/10/2026 era "X (UF) — dados abertos", um nome a mais para a página).
  const titulo = tituloFiscalDe(m.nome, m.uf, m.fiscal?.faixa, pessoal);
  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: `${SITE}/municipio/${m.slug}/` },
    ...cartaoSocial(
      titulo,
      partes.join(" · ") || `Dados abertos de ${m.nome}/${m.uf}.`,
      `/municipio/${m.slug}/`,
      imagemDoEstado(m.uf),
    ),
  };
}

export default async function PaginaMunicipio(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const dados = await carregar();
  const { snapshot } = dados;
  const m = dados.municipios.find((x) => x.slug === slug);
  if (!m) notFound();
  const c: Contexto = {
    ...montarContexto(dados, m),
    // O ano de cada número vem do snapshot, que o recebe da própria fonte (ver
    // `periodoDe`). Escrito aqui, envelheceria em silêncio a cada publicação do
    // IBGE, como a "estimativa mais recente" que era de 2024 com a de 2026 no ar.
    anoEstimada: periodoDe(snapshot, "populacao-estimada"),
    anoPib: periodoDe(snapshot, "pib-municipal"),
    estilos,
  };
  const { fiscal, uf, pelaRegiao, vizinhos, medidas, medianas, serieFuncoes, taxasPais, comUf, medianasUf, legendaMedianas, temCensoTrabalho, temEmpresas, cagedM, emendasM, posPop, posPerCapita, f, posicao, serie, saude, funcoes, receita, comparacao } = c;

  return (
    <main className={`${estilos.pagina} ${comSumario}`} id="conteudo">
      <Cabecalho c={c} />
      <SecaoCartoes c={c} />
      {/* Cada item repete a condição que mostra a sua seção: um item sem seção
          seria link para lugar nenhum. O `conferir-links` reprova, nas 5.571
          páginas, âncora sem alvo e seção com `id` fora daqui. */}
      <NestaPagina itens={[
        !!((posPop || posPerCapita) && uf) && { id: "no-estado", titulo: "No estado" },
        { id: "gasto-com-pessoal", titulo: "Gasto com pessoal" },
        !!(posicao && f?.percentual !== null && f?.percentual !== undefined) &&
          { id: "isso-e-muito", titulo: "Isso é muito?" },
        serie.length > 1 && { id: "ao-longo-do-tempo", titulo: "Ao longo do tempo" },
        !!saude && { id: "saude", titulo: "Saúde" },
        !!(funcoes && funcoes.fatias.length > 0) &&
          { id: "para-onde-vai", titulo: "Para onde vai o dinheiro" },
        !!(receita && receita.total !== null && receita.total > 0) &&
          { id: "de-onde-vem", titulo: "De onde vem o dinheiro" },
        !!(comparacao || serieFuncoes.length >= 3) && {
          id: "o-que-mudou",
          titulo: comparacao ? "O que mudou" : "A composição ao longo dos anos",
        },
        !!emendasM && { id: "emendas", titulo: "Emendas parlamentares" },
        { id: "educacao", titulo: "Educação" },
        medidas.some((x) => x.percentual !== null) &&
          { id: "como-se-vive", titulo: "Como se vive" },
        (temCensoTrabalho || temEmpresas || cagedM !== null) &&
          { id: "trabalho-e-renda", titulo: "Trabalho e renda" },
        vizinhos.length > 0 && {
          id: "outros-municipios",
          titulo: pelaRegiao ? "Municípios da região" : "Outros municípios",
        },
        { id: "baixar", titulo: "Baixar os dados" },
      ]} />

      <SecaoNoEstado c={c} />
      <VoltaSumario />
      <SecaoPessoal c={c} />
      <VoltaSumario />
      <SecaoIssoEMuito c={c} />
      <VoltaSumario />
      <SecaoAoLongoDoTempo c={c} />
      <VoltaSumario />
      <SecaoSaude c={c} />
      <VoltaSumario />
      <SecaoParaOndeVai c={c} />
      <VoltaSumario />
      <SecaoDeOndeVem c={c} />
      <VoltaSumario />
      <SecaoOQueMudou c={c} />
      <VoltaSumario />
      <SecaoEmendas c={c} />
      <VoltaSumario />
      <SecaoEducacao c={c} />
      <VoltaSumario />
      {medidas.some((x) => x.percentual !== null) && (
        <section className={estilos.texto} id="como-se-vive">
          <h2>Como se vive em {m.nome}</h2>
          <p>
            Do <strong><Termo chave="censo">Censo de 2022</Termo></strong>. Cada linha traz{" "}
            <strong>quantos</strong>, e não só a proporção: é o número absoluto
            que permite conferir na fonte, e a porcentagem sozinha esconde o
            tamanho do lugar.
          </p>
          <TabelaCenso
            medidas={medidas}
            comparacoes={[
              ...(medianasUf ? [{ rotulo: "Mediana do estado", valores: medianasUf }] : []),
              { rotulo: "Mediana do país", valores: medianas },
            ]}
            rotuloValor={m.nome}
            legenda={`${m.nome} (${m.uf}) no Censo 2022, ${legendaMedianas}`}
          />
          <p className={estilos.ressalva}>
            <strong>
              {comUf
                ? "As medianas ao lado são dos municípios, não a taxa do estado nem a do país."
                : "A mediana ao lado é dos municípios, não a taxa do país."}
            </strong>{" "}
            São coisas diferentes, e o esgoto mostra por quê:
            metade dos municípios do país fica abaixo de{" "}
            <strong>{br(medianas["esgoto"] ?? 0, 1)}%</strong>, e ainda assim{" "}
            <strong>{br(taxasPais["esgoto"] ?? 0, 1)}%</strong> dos domicílios
            brasileiros têm ligação à rede — porque as cidades grandes concentram
            população e rede. Os dois números estão certos; trocá-los de nome não
            estaria.{" "}
            {/* Os dois saem do dado, e não do teclado. A primeira versao
                escreveu "26,9%" a mao -- medido numa categoria de esgoto que
                nem era a exibida -- e a tabela ao lado mostrava 32,6%. */}
            Fonte: IBGE, Censo Demográfico 2022, pelas APIs públicas de
            agregados.
          </p>
        </section>
      )}
      <VoltaSumario />

      <SecaoTrabalho c={c} />
      <VoltaSumario />
      <SecaoVizinhos c={c} />
      <VoltaSumario />
      <SecaoBaixar c={c} />
      <VoltaSumario />
      <footer className={estilos.rodape}>
        <p>
          Fontes: {snapshot.fonte} e {fiscal.fonte}
          {fiscal.coletadoEm ? ` · coleta fiscal em ${dataCurta(fiscal.coletadoEm)}` : ""}.
          Dados sob a{" "}
          <a href="/ajuda/#licenca">licença de cada fonte</a>; os do SICONFI,
          e as planilhas deste site, sob ODbL.
        </p>
      </footer>
    </main>
  );
}
