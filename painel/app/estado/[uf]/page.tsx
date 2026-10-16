import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { br, dataCurta, descricaoDe, expandir } from "../../../lib/dados";
import { deEstado, resumirEstado, slugUf } from "../../../lib/estado";
import {
  lerCaged, lerEmendas, lerFiscal, lerIdeb, lerInss, lerSnapshot, SITE, cartaoSocial, imagemDoEstado,
} from "../../../lib/servidor";
// A ORDEM destes imports de CSS é a que o `page.tsx` tinha antes da divisão em
// seções (item 10 da modernização, 16/10/2026). O bundler decide em que chunk
// cai cada CSS Module pela ordem em que são avaliados; os imports sem nome só
// a fixam, e quem usa o componente é a seção. Mexer aqui muda o peso do site.
// Ver o mesmo aviso em `municipio/[slug]/page.tsx`.
import "../../componentes/composicao-barras";
import "../../componentes/tira-estados";
import "../../componentes/termo";
import "../../componentes/como-ler";
import "../../componentes/mapa-uf";
import "../../componentes/tabela-censo";
import "../../componentes/tabela-caged";
import estilos from "./estado.module.css";
import NestaPagina, { comSumario, VoltaSumario } from "../../componentes/nesta-pagina";
import { montarContexto } from "./contexto";
import type { Contexto } from "./contexto";
import Cabecalho from "./secao-cabecalho";
import SecaoTotais from "./secao-totais";
import SecaoNoPais from "./secao-no-pais";
import SecaoComoSeVive from "./secao-como-se-vive";
import SecaoEmprego from "./secao-emprego";
import SecaoEmendas from "./secao-emendas";
import SecaoInss from "./secao-inss";
import SecaoLimiteDePessoal from "./secao-limite-de-pessoal";
import SecaoParaOndeVai from "./secao-para-onde-vai";
import SecaoIdeb from "./secao-ideb";
import SecaoComparacao from "./secao-comparacao";
import SecaoMunicipios from "./secao-municipios";
import SecaoBaixar from "./secao-baixar";
import SecaoOutrosEstados from "./secao-outros-estados";

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
  const dados = await carregar();
  const { snapshot, fiscal, expandidos } = dados;
  const r = resumirEstado(snapshot, fiscal, expandidos, uf.toUpperCase());
  if (!r) notFound();
  const c: Contexto = { ...montarContexto(dados, r), estilos };
  const { medidasCenso, cagedUf, emendasUf, inssUf, semRede, semRedeFinais, meu, posTaxa } = c;

  return (
    <main className={`${estilos.pagina} ${comSumario}`} id="conteudo">
      <Cabecalho c={c} />
      <SecaoTotais c={c} />

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

      <SecaoNoPais c={c} />
      <VoltaSumario />
      <SecaoComoSeVive c={c} />
      <VoltaSumario />
      <SecaoEmprego c={c} />
      <VoltaSumario />
      <SecaoEmendas c={c} />
      <VoltaSumario />
      <SecaoInss c={c} />
      <VoltaSumario />
      <SecaoLimiteDePessoal c={c} />
      <VoltaSumario />
      <SecaoParaOndeVai c={c} />
      <VoltaSumario />
      <SecaoIdeb c={c} />
      <VoltaSumario />
      <SecaoComparacao c={c} />
      <VoltaSumario />
      <SecaoMunicipios c={c} />
      <VoltaSumario />
      <SecaoBaixar c={c} />
      <VoltaSumario />
      <SecaoOutrosEstados c={c} />
      <VoltaSumario />

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
