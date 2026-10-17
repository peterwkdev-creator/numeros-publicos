import type { Metadata } from "next";

import { cartaoSocial, lerCagedAnos, lerFiscal, lerIdeb, lerInss, lerSnapshot, SITE } from "../../lib/servidor";
// A ORDEM destes imports de CSS é a que o `page.tsx` tinha antes da divisão em
// seções (item 10 da modernização, 16/10/2026): o bundler decide em que chunk
// cai cada CSS Module pela ordem em que são avaliados. O import sem nome só a
// fixa; quem usa o componente é a seção. Mexer aqui muda o peso do site.
import estilos from "./ajuda.module.css";
import "../componentes/como-ler";
import { montarContexto, TITULO } from "./contexto";
import type { Contexto } from "./contexto";
import Cabecalho from "./secao-cabecalho";
import Sumario from "./secao-sumario";
import SecaoComoLer from "./secao-como-ler";
import SecaoTravessao from "./secao-travessao";
import SecaoMediana from "./secao-mediana";
import SecaoRelatorios from "./secao-relatorios";
import SecaoPessoal from "./secao-pessoal";
import SecaoImplausivel from "./secao-implausivel";
import SecaoFuncao from "./secao-funcao";
import SecaoComparacao from "./secao-comparacao";
import SecaoSaude from "./secao-saude";
import SecaoEmendas from "./secao-emendas";
import SecaoIdeb from "./secao-ideb";
import SecaoCenso from "./secao-censo";
import SecaoCaged from "./secao-caged";
import SecaoBrasil from "./secao-brasil";
import SecaoRanking from "./secao-ranking";
import SecaoInss from "./secao-inss";
import SecaoInflacao from "./secao-inflacao";
import SecaoQuando from "./secao-quando";
import SecaoFaltando from "./secao-faltando";
import SecaoCobertura from "./secao-cobertura";
import SecaoBaixar from "./secao-baixar";
import SecaoLicenca from "./secao-licenca";
import SecaoErro from "./secao-erro";
import SecaoOutras from "./secao-outras";
import SecaoGlossario from "./secao-glossario";

/**
 * A página de ajuda — o que fazer quando o número não se explica sozinho.
 *
 * Um painel de dado público falha de um jeito específico: o número está certo,
 * a fonte está citada, e o leitor mesmo assim não sabe o que está vendo. "RCL
 * ajustada", "despesa liquidada", "limite prudencial" e um travessão no lugar
 * de um valor são todos opacos para quem não trabalha com contabilidade
 * pública — que é praticamente todo mundo que chega aqui por uma busca.
 *
 * ## Três decisões de desenho
 *
 * **As perguntas são as reais, não as convenientes.** "Por que aparece um
 * travessão" e "achei um número errado" são as duas que mais aparecem em
 * qualquer painel de dado, e as duas que mais tentam ser evitadas.
 *
 * **Cada resposta diz TAMBÉM onde a resposta não está aqui.** Metade das
 * dúvidas de um site assim não é sobre o site: é sobre o que o município
 * declarou, e isso só a prefeitura e o SICONFI respondem. Mandar a pessoa para
 * o lugar certo é mais útil que uma resposta educada e inútil.
 *
 * **Os números da página são calculados, não escritos à mão.** Uma ajuda que
 * diz "1.794 municípios" em texto fixo vira mentira na próxima coleta, e
 * ninguém revisa a página de ajuda.
 */

export const metadata: Metadata = {
  title: TITULO,
  description:
    "Como ler cada número: gasto com pessoal e RCL, IDEB, Censo, Caged, " +
    "saúde, emendas, a fila do INSS e as séries do país, e o que o travessão quer dizer.",
  alternates: { canonical: `${SITE}/ajuda/` },
  // Pelo `cartaoSocial`, como as outras páginas: o `openGraph` à mão deixava o
  // `twitter:title` herdado do layout.
  ...cartaoSocial(
    TITULO,
    "Como ler os números, de onde eles vêm e o que fazer com eles.",
    "/ajuda/",
  ),
};

export default async function PaginaAjuda() {
  const [snapshot, fiscal, ideb, inss, cagedAnos] = await Promise.all([
    lerSnapshot(), lerFiscal(), lerIdeb("anos_iniciais"), lerInss(), lerCagedAnos(),
  ]);
  const idebFinais = await lerIdeb("anos_finais");
  const ctx: Contexto = {
    ...montarContexto({ snapshot, fiscal, ideb, idebFinais, inss, cagedAnos }),
    estilos,
  };

  return (
    <main className={estilos.pagina} id="conteudo">
      <Cabecalho ctx={ctx} />
      <Sumario ctx={ctx} />
      <SecaoComoLer ctx={ctx} />
      <SecaoTravessao ctx={ctx} />
      <SecaoMediana ctx={ctx} />
      <SecaoRelatorios ctx={ctx} />
      <SecaoPessoal ctx={ctx} />
      <SecaoImplausivel ctx={ctx} />
      <SecaoFuncao ctx={ctx} />
      <SecaoComparacao ctx={ctx} />
      <SecaoSaude ctx={ctx} />
      <SecaoEmendas ctx={ctx} />
      <SecaoIdeb ctx={ctx} />
      <SecaoCenso ctx={ctx} />
      <SecaoCaged ctx={ctx} />
      <SecaoBrasil ctx={ctx} />
      <SecaoRanking ctx={ctx} />
      <SecaoInss ctx={ctx} />
      <SecaoInflacao ctx={ctx} />
      <SecaoQuando ctx={ctx} />
      <SecaoFaltando ctx={ctx} />
      <SecaoCobertura ctx={ctx} />
      <SecaoBaixar ctx={ctx} />
      <SecaoLicenca ctx={ctx} />
      <SecaoErro ctx={ctx} />
      <SecaoOutras ctx={ctx} />
      <SecaoGlossario ctx={ctx} />

      <footer className={estilos.rodape}>
        <p>
          Ainda com dúvida? Abra uma questão no{" "}
          <a
            href="https://github.com/peterwkdev-creator/numeros-publicos/issues"
            rel="noopener"
          >
            repositório
          </a>
          . Não há formulário nem cadastro neste site — ele é estático de
          propósito, e não coleta nada sobre quem o visita.
        </p>
      </footer>
    </main>
  );
}
