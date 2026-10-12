import type { Metadata } from "next";
import Link from "next/link";

import { br, dataCurta, expandir, inteiroImpresso, periodoDe } from "../../lib/dados";
import {
  faixaDaLinha, FUNCOES_DA_PORTARIA, LIMITE_PLAUSIVEL, nomeQuadrimestre,
} from "../../lib/fiscal";
import { conjuntoDoSite, siteDe, trilha } from "../../lib/jsonld";
import { gruposComPagina } from "../../lib/inss";
import { cartaoSocial, lerFiscal, lerIdeb, lerInss, lerSnapshot, SITE } from "../../lib/servidor";
import estilos from "./ajuda.module.css";
import { anteriorDeFuncoes, atualDeFuncoes, naoInstaladosEm } from "../../lib/fiscal";
import { glossarioAZ, idDoVerbete } from "../../lib/glossario";
import { ListaComoLer } from "../componentes/como-ler";

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

const TITULO = "Ajuda — como ler os números deste site";

export const metadata: Metadata = {
  title: TITULO,
  description:
    "O que significa cada número: RCL ajustada, limite prudencial, despesa " +
    "liquidada, IDEB, e por que às vezes aparece um travessão.",
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
  const [snapshot, fiscal, ideb, inss] = await Promise.all([
    lerSnapshot(), lerFiscal(), lerIdeb("anos_iniciais"), lerInss(),
  ]);
  const idebFinais = await lerIdeb("anos_finais");
  const total = expandir(snapshot).length;
  const c = fiscal.cobertura;
  // Quem ainda não estava instalado foi consultado e não tinha relatório, mas
  // não "deixou de entregar": sai das duas pontas da frase do travessão.
  const naoInstalados = naoInstaladosEm(fiscal.exercicio);
  const obrigados = c.consultados - naoInstalados;
  const naoPublicaram = obrigados - c.publicaram;
  // Quem entregou o RGF Simplificado semestral no lugar do quadrimestral.
  const simplificados = fiscal.municipios.filter((l) => l[9] === true).length;
  const quadrimestre = nomeQuadrimestre(fiscal.exercicio, fiscal.periodo);
  const f = fiscal.funcoes;

  // O efeito real dos implausíveis sobre a média nacional, CALCULADO.
  //
  // A frase aqui dizia que "um valor de 371% entre mil e quatrocentos puxa a
  // média quase um ponto inteiro" — conta feita quando só o Nordeste estava
  // varrido, e falsa depois: um valor entre 3.244 desloca 0,10 ponto. Número
  // cravado em prosa vira mentira na coleta seguinte, e ninguém revisa a
  // página de ajuda. Agora sai da conta.
  //
  // E a classificação é a do SITE (`faixaDaLinha`), não um filtro próprio. O
  // que havia aqui era `v > 0 && v <= 100` — que tratava 0% como implausível,
  // ao contrário do resto do site, e não conhecia o terceiro caso (RCL
  // desmentida pela receita, 22/09/2026). Duas definições do mesmo rótulo na
  // mesma base é a segunda verdade que o ranking já registra como erro.
  const declaradas = fiscal.municipios.filter((m) => typeof m[5] === "number");
  const faixas = declaradas.map((m) => faixaDaLinha(fiscal, m));
  const declarados = declaradas.map((m) => m[5] as number);
  const plausiveis = declarados.filter((_, i) => faixas[i] !== "implausivel");
  const implausiveis = declarados.length - plausiveis.length;
  // Os que só são implausíveis pela RCL: o percentual em si cabe em 0–100%.
  const desmentidos = declarados.filter(
    (v, i) => faixas[i] === "implausivel" && v >= 0 && v <= LIMITE_PLAUSIVEL,
  ).length;
  const medi = (v: number[]) => v.reduce((s, x) => s + x, 0) / (v.length || 1);
  const deslocamento = plausiveis.length
    ? medi(declarados) - medi(plausiveis)
    : 0;

  // `WebPage`, e deliberadamente NÃO `FAQPage`.
  //
  // A página tem duas dezenas de perguntas e responderia ao formato, mas o `FAQPage`
  // exige repetir cada resposta como texto dentro do JSON-LD. Isso cria uma
  // segunda cópia do conteúdo, que se afasta da visível no primeiro ajuste de
  // redação — e dado estruturado que não bate com o que está na tela é
  // exatamente o que o Google trata como sinal ruim. Somando: o próprio Google
  // restringiu o resultado rico de FAQ a sites governamentais e de saúde em
  // 2023, então a duplicação seria paga sem nada em troca.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: TITULO,
    url: `${SITE}/ajuda/`,
    inLanguage: "pt-BR",
    // Referências para nós declarados NA CAPA: levam `name` e `url` porque
    // o Google lê cada página isolada e não resolve `@id` entre páginas.
    isPartOf: siteDe(SITE),
    about: conjuntoDoSite(SITE),
    description:
      "Glossário e perguntas frequentes sobre os números publicados: RCL " +
      "ajustada, limites da Lei de Responsabilidade Fiscal, despesa " +
      "liquidada por função, IDEB, Censo, Caged, emendas, saúde e as " +
      "convenções de ausência de dado, com um glossário de A a Z.",
  };

  return (
    <main className={estilos.pagina} id="conteudo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* A trilha, num bloco separado de proposito: o no acima ja funciona e a
          auditoria o confere; acrescentar um `@graph` mexeria na forma dele
          para ganhar nada. O Google aceita varios blocos por pagina. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            ...trilha(SITE, [
              { nome: "Números Públicos", caminho: "/" },
              { nome: "Ajuda", caminho: "/ajuda/" },
            ]),
          }),
        }}
      />
      <nav className={estilos.trilha} aria-label="Você está em">
        <Link href="/" prefetch={false}>Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">Ajuda</span>
      </nav>

      <header>
        <h1 className={estilos.titulo}>Ajuda</h1>
        <p className={estilos.chamada}>
          Este site publica números que os próprios municípios e o IBGE
          declararam. Alguns deles têm nomes técnicos que não se explicam
          sozinhos. Abaixo está o que cada um significa — e, quando a resposta
          não estiver aqui, para onde ir.
        </p>
      </header>

      <nav className={estilos.sumario} aria-label="Nesta página">
        <h2>Nesta página</h2>
        <ul>
          <li><a href="#como-ler">Como ler as páginas</a></li>
          <li><a href="#travessao">Por que aparece “—” no lugar de um número</a></li>
          <li><a href="#mediana">Média, mediana e pontos percentuais</a></li>
          <li><a href="#relatorios">Os relatórios fiscais: RGF, RREO e o SICONFI</a></li>
          <li><a href="#pessoal">Gasto com pessoal, RCL e os dois limites</a></li>
          <li><a href="#implausivel">O que quer dizer “valor implausível”</a></li>
          <li><a href="#funcao">Despesa por função, e o que é “liquidada”</a></li>
          <li><a href="#comparacao">Por que a comparação é entre anos</a></li>
          <li><a href="#saude">Saúde: o mínimo da Constituição e o SIOPS</a></li>
          <li><a href="#emendas">Emendas parlamentares: o que entra na conta</a></li>
          <li><a href="#ideb">O que é o IDEB, e por que só a rede municipal</a></li>
          <li><a href="#censo">Censo, PIB e as outras estatísticas do IBGE</a></li>
          <li><a href="#caged">Emprego com carteira: o Novo Caged</a></li>
          <li><a href="#brasil">Como ler o Brasil ao longo do tempo</a></li>
          <li><a href="#ranking">Como ler o ranking do gasto com pessoal</a></li>
          <li><a href="#inss">Quanto tempo o INSS está levando</a></li>
          <li><a href="#inflacao">Os valores estão corrigidos pela inflação?</a></li>
          <li><a href="#quando">De quando são os dados</a></li>
          <li><a href="#faltando">Meu município não aparece</a></li>
          <li><a href="#cobertura">Quais municípios estão cobertos</a></li>
          <li><a href="#baixar">Como baixar e abrir os dados</a></li>
          <li><a href="#licenca">Posso usar estes dados?</a></li>
          <li><a href="#erro">Achei um número errado</a></li>
          <li><a href="#outras">Onde perguntar o que este site não responde</a></li>
          <li><a href="#glossario">Glossário de A a Z</a></li>
        </ul>
      </nav>

      {/* O roteiro de cada tipo de página, o mesmo texto do "Como ler esta
          página" que fica fechado abaixo do título delas (`lib/como-ler.ts`). */}
      <section className={estilos.bloco} id="como-ler">
        <h2>Como ler as páginas</h2>
        <p>
          Logo abaixo do título de cada página há um quadro fechado, “Como ler
          esta página”. O que ele diz está reunido aqui.
        </p>
        <h3 className={estilos.subtitulo}>A página de um município</h3>
        <ListaComoLer tipo="municipio" naAjuda />
        <h3 className={estilos.subtitulo}>A página de um estado</h3>
        <ListaComoLer tipo="estado" naAjuda />
        <h3 className={estilos.subtitulo}>
          <Link href="/brasil/" prefetch={false}>O Brasil ao longo do tempo</Link>
        </h3>
        <ListaComoLer tipo="brasil" naAjuda />
        <h3 className={estilos.subtitulo}>
          <Link href="/ranking/gasto-com-pessoal/" prefetch={false}>
            O ranking do gasto com pessoal
          </Link>
        </h3>
        <ListaComoLer tipo="ranking" naAjuda />
        <h3 className={estilos.subtitulo}>
          <Link href="/ranking/emprego-com-carteira/" prefetch={false}>
            O ranking do emprego com carteira
          </Link>
        </h3>
        <ListaComoLer tipo="rankingEmprego" naAjuda />
      </section>

      <section className={estilos.bloco} id="travessao">
        <h2>Por que aparece “—” no lugar de um número</h2>
        <p>
          Porque o dado <strong>não existe</strong> na fonte — e isso é
          diferente de ser zero.
        </p>
        <p>
          No {quadrimestre}, <strong>{br(naoPublicaram)}</strong> dos{" "}
          {br(obrigados)} municípios consultados
          {naoInstalados > 0 && " que já estavam instalados"} não têm no
          SICONFI nem o Relatório de Gestão Fiscal quadrimestral nem o
          semestral simplificado. Isso não significa que gastem zero com
          pessoal: significa que o site não tem o número. Outros{" "}
          <strong>{br(simplificados)}</strong> entregaram só o simplificado, e o
          número deles aparece normalmente (veja{" "}
          <a href="#relatorios">os relatórios fiscais</a>).
        </p>
        <p>
          Escrever “0” ali seria inventar um número, e é assim que um painel
          passa a mentir sem que ninguém perceba. O travessão é a recusa a
          fazer isso.
        </p>
        <p>
          <strong>Mas nem todo travessão quer dizer a mesma coisa</strong>, e o
          site diz qual é qual em vez de juntar os três:
        </p>
        <ul className={estilos.lista}>
          <li>
            <strong>Sem relatório entregue</strong> — perguntamos pelo
            relatório quadrimestral e pelo semestral simplificado, e nenhum dos
            dois está no SICONFI.
          </li>
          <li>
            <strong>Ainda não consultado</strong> — nós é que ainda não
            perguntamos. É afirmação sobre nós, e some quando a coleta fecha.
          </li>
          <li>
            <strong>Presta contas como estado</strong> — o ente entrega o
            relatório, só que na esfera estadual. É o caso do{" "}
            <strong>Distrito Federal</strong>, que a estatística conta como
            município mas que não é um: ele publica o Relatório de Gestão
            Fiscal como estado. Marcá-lo como “não entregou” seria acusar de
            não prestar contas quem presta.
          </li>
          <li>
            <strong>Ainda não instalado no período</strong> — o município
            existe na lista do IBGE, mas só passou a ter prefeitura depois do
            exercício do relatório. É o caso de{" "}
            <strong>Boa Esperança do Norte (MT)</strong>, instalado em
            1º de janeiro de 2025: o relatório de 2024 não tinha quem o
            entregasse.
          </li>
        </ul>
      </section>

      {/* Os números do exemplo são de brinquedo, escolhidos para a conta ser
          feita de cabeça; nenhum vem do dado. */}
      <section className={estilos.bloco} id="mediana">
        <h2>Média, mediana e pontos percentuais</h2>
        <p>
          A <strong>média</strong> é a soma dividida pela quantidade. A{" "}
          <strong>mediana</strong> é o valor do meio, depois de pôr todos em
          ordem: metade fica abaixo dela, metade acima.
        </p>
        <p>
          Cinco municípios com 20, 30, 40, 45 e 90: a mediana é 40 (o do
          meio) e a média é 45 (225 dividido por 5). Se o último fosse 900 e
          não 90, a média iria a 207, e a mediana continuaria 40. Um valor
          extremo puxa a média; a mediana não se mexe.
        </p>
        <p>
          Por isso, para dizer se um número é alto ou baixo, o site o compara
          com a <strong>mediana dos municípios do mesmo estado</strong>, e não
          com a média: num estado, poucas cidades grandes puxariam a média
          para longe de quase todas as outras.
        </p>
        <p>
          <strong>Pontos percentuais</strong> são a diferença entre dois
          percentuais. Passar de 20% para 25% é subir 5 pontos percentuais —
          e é também um aumento de 25% sobre o valor de partida. As duas
          frases estão certas, e dizem coisas diferentes; o site usa a
          primeira.
        </p>
      </section>

      <section className={estilos.bloco} id="relatorios">
        <h2>Os relatórios fiscais: RGF, RREO e o SICONFI</h2>
        <p>
          A Lei de Responsabilidade Fiscal obriga todo município a publicar
          dois relatórios e a entregá-los ao <strong>SICONFI</strong>, o
          sistema do Tesouro Nacional. É de lá que vêm os números fiscais deste
          site, como o próprio município os declarou.
        </p>
        <ul className={estilos.lista}>
          <li>
            <strong>RGF, o Relatório de Gestão Fiscal</strong> — a cada{" "}
            <strong>quadrimestre</strong> (janeiro a abril, maio a agosto,
            setembro a dezembro). Traz a despesa com pessoal e a compara com
            os limites da lei. O município com menos de 50 mil habitantes pode
            optar por publicá-lo a cada <strong>semestre</strong>, numa versão
            simplificada (art. 63 da lei).{" "}
            Para quem optou pelo semestral, o site lê o{" "}
            <strong>do 2º semestre</strong>, que cobre os mesmos 12 meses do 3º
            quadrimestre: foram <strong>{br(simplificados)}</strong> municípios
            em {fiscal.exercicio}. Nos dois primeiros quadrimestres eles ficam
            sem ponto na série, porque nenhum semestre coincide com eles.
          </li>
          <li>
            <strong>RREO, o Relatório Resumido da Execução
            Orçamentária</strong> — a cada <strong>bimestre</strong>, com a
            receita e a despesa acumuladas desde janeiro. Dele vêm{" "}
            <a href="#funcao">a despesa por função</a> e a composição da
            receita. O último bimestre do ano traz o ano inteiro. Quem optou
            pelo RGF semestral entrega o <strong>RREO Simplificado</strong>,
            que continua bimestral e tem as mesmas contas: o site lê os dois.
          </li>
        </ul>
        <p>
          Os dois são entregues em datas diferentes, e um município pode ter um
          e não o outro. Por isso cada seção da página aparece, ou some, de
          acordo com o seu próprio relatório.
        </p>
      </section>

      <section className={estilos.bloco} id="pessoal">
        <h2>Gasto com pessoal, RCL e os dois limites</h2>
        <p>
          <strong>Receita corrente líquida (RCL)</strong> é o que sobra da
          arrecadação do município depois de descontar transferências que ele é
          obrigado a repassar. A <strong>RCL ajustada</strong> é essa mesma
          conta com os ajustes que a Lei de Responsabilidade Fiscal manda fazer
          — e é ela, não a bruta, o denominador do percentual publicado.
        </p>
        <p>
          O percentual que este site mostra é{" "}
          <strong>gasto com pessoal ÷ RCL ajustada</strong> (a lei diz
          <em>despesa com pessoal</em>). A Lei de
          Responsabilidade Fiscal fixa dois patamares para o Executivo
          municipal:
        </p>
        <ul className={estilos.lista}>
          <li>
            <strong>{br(fiscal.limites.prudencial, 2)}% — limite prudencial.</strong>{" "}
            Passar dele já proíbe criar cargo, conceder aumento e contratar.
          </li>
          <li>
            <strong>{br(fiscal.limites.legal, 2)}% — teto legal.</strong>{" "}
            O limite máximo propriamente dito.
          </li>
        </ul>
        <p>
          <strong>Este site não recalcula o percentual.</strong> Ele vem
          calculado e declarado pelo próprio município e homologado no SICONFI.
          Recalcular criaria uma segunda verdade que ninguém assinou. E o site
          não interpreta, não acusa e não declara ninguém em descumprimento —
          mostra o número publicado ao lado do limite.
        </p>
      </section>

      <section className={estilos.bloco} id="implausivel">
        <h2>O que quer dizer “valor implausível”</h2>
        <p>
          É a marca que aparece quando o município declarou um percentual que
          nenhuma prefeitura pode ter: acima de {LIMITE_PLAUSIVEL}% (gastaria
          com pessoal mais do que toda a sua receita) ou abaixo de zero (gasto
          negativo).
        </p>
        <p>
          Os dois casos existem no dado real de 2024. Guaratinga/BA declarou{" "}
          <strong>371,02%</strong>; Paripueira/AL declarou despesa negativa e,
          portanto, <strong>−19,35%</strong>. Não descrevem prefeituras em
          crise: descrevem formulários preenchidos errado.
        </p>
        <p>
          E há um terceiro caso, que o percentual sozinho não revela: ele pode
          estar entre 0 e 100% e ainda assim não descrever a prefeitura, quando
          foi calculado sobre uma receita corrente líquida que{" "}
          <strong>o próprio município desmente</strong>. Ele declara a receita
          em dois relatórios diferentes, e no país inteiro as duas declarações
          batem — a mediana da razão entre elas é 1,04. Quando a receita
          corrente passa do dobro da receita líquida usada no cálculo — ou passa
          de 1,4 vez <em>e</em> o percentual saltou mais de 30% sobre a própria
          história do município, que é o salto que uma receita líquida
          subdeclarada produz —, o denominador está baixo demais e o percentual
          sai inflado. Um sinal sozinho não basta: há municípios com a razão
          alta e o percentual de sempre, e municípios cujo percentual subiu com
          a receita batendo — nesses, o número descreve a prefeitura e continua
          valendo.
          Aparecida/SP, que declarou entre 44% e 52% de 2020 até o início de
          2024, declarou 93% no 3º quadrimestre de 2024 — com uma receita
          corrente duas vezes maior que a receita líquida usada na conta. São{" "}
          <strong>{br(desmentidos)}</strong> casos assim na coleta atual.
        </p>
        <p>
          Eles continuam sendo exibidos, e marcados. Corrigir seria inventar
          número; esconder seria escolher quais declarações você pode ver. Mas
          eles <strong>ficam fora das médias</strong>, do ranking e das frases
          de tendência, e o motivo é medido: são{" "}
          <strong>{br(implausiveis)}</strong> declarações implausíveis entre as{" "}
          {br(declarados.length)} entregues, e juntas elas puxam
          a média nacional em <strong>{br(deslocamento, 2)} ponto</strong>
          {inteiroImpresso(deslocamento, 2) >= 2 ? "s" : ""} — de{" "}
          {br(medi(plausiveis), 2)}% para{" "}
          {br(medi(declarados), 2)}%.
        </p>
      </section>

      <section className={estilos.bloco} id="funcao">
        <h2>Despesa por função, e o que é “liquidada”</h2>
        <p>
          <strong>Função orçamentária</strong> é a área em que o dinheiro foi
          gasto: educação, saúde, urbanismo, assistência social. São{" "}
          {FUNCOES_DA_PORTARIA} funções fixadas pela Portaria MOG 42/1999, e
          todo município usa a mesma lista — é o que torna a comparação possível.
        </p>
        <p>
          <strong>Liquidada</strong> quer dizer o que de fato foi gasto: o
          serviço foi prestado ou o material entregue, e a prefeitura reconheceu
          a dívida. É diferente de <em>dotação</em> (o que foi orçado, ou seja,
          a intenção) e de <em>empenhada</em> (o dinheiro reservado). Só a
          liquidada responde “quanto gastou”.
        </p>
        {f && (
          <p>
            Os valores publicados aqui são do {f.periodo}º bimestre de{" "}
            {atualDeFuncoes(f)?.exercicio}, e{" "}
            <strong>acumulam o ano inteiro</strong> até ali —
            não são o gasto daqueles dois meses.
          </p>
        )}
      </section>

      <section className={estilos.bloco} id="comparacao">
        <h2>Por que a comparação é entre anos, e não entre bimestres</h2>
        <p>
          Porque o relatório é <strong>acumulado</strong>. O 6º bimestre já
          contém o 4º — medindo os {br(c.publicaram)} municípios que publicaram
          os dois, <strong>63% do valor do 6º bimestre é literalmente o do
          4º</strong>. Compará-los seria comparar um número com ele mesmo mais
          um pedaço, e a fatia de cada função mal se moveria: menos de um ponto
          percentual, na mediana.
        </p>
        <p>
          Entre o mesmo bimestre de dois anos diferentes, os períodos não se
          sobrepõem, e a mudança é real. É por isso que a página compara{" "}
          {f && anteriorDeFuncoes(f)
            ? `${anteriorDeFuncoes(f)!.exercicio}/${f.periodo} com ` +
              `${atualDeFuncoes(f)!.exercicio}/${f.periodo}`
            : "o mesmo bimestre de dois anos"}.
        </p>
        <p>
          E a página só chama de mudança um deslocamento de{" "}
          <strong>1 ponto percentual ou mais</strong>. Abaixo disso ela diz que
          ficou praticamente igual — descrever movimento de meio ponto como
          tendência seria vender ruído como descoberta.
        </p>
      </section>

      <section className={estilos.bloco} id="saude">
        <h2>Saúde: o mínimo da Constituição e o SIOPS</h2>
        <p>
          A Constituição obriga o município a aplicar em ações e serviços
          públicos de saúde <strong>ao menos 15% da receita de impostos</strong>.
          Quanto cada um aplicou é ele mesmo que declara, ano a ano, ao{" "}
          <strong>SIOPS</strong>, o sistema do Ministério da Saúde. É de lá o
          percentual da seção de saúde, com a série de cada município desde
          2000, ou desde o primeiro ano que ele declarou.
        </p>
        <p>
          <strong>O mínimo não foi sempre 15%.</strong> A Emenda Constitucional
          29, de 2000, começou exigindo 7% e deu aos municípios até 2004 para
          chegar aos 15%. Entre 2001 e 2003 o piso de cada um dependia de onde
          ele tinha partido, e não há uma régua comum. Por isso a página só
          compara com os 15% os anos a partir de 2004.
        </p>
        <p>
          O Distrito Federal declara ao SIOPS como estado, e por isso não tem a
          série municipal.
        </p>
      </section>

      <section className={estilos.bloco} id="emendas">
        <h2>Emendas parlamentares: o que entra na conta</h2>
        <p>
          <strong>Emenda parlamentar</strong> é a parte do orçamento federal
          cujo destino deputados e senadores indicam. O dado vem do Portal da
          Transparência, da Controladoria-Geral da União.
        </p>
        <ul className={estilos.lista}>
          <li>
            <strong>Entra</strong> o que a União <strong>pagou</strong> à
            prefeitura e aos fundos municipais (como o de saúde), pelo mês do
            pagamento.
          </li>
          <li>
            <strong>Não entra</strong> o que foi só empenhado (reservado no
            orçamento, sem o dinheiro sair), nem o que foi pago a outros
            favorecidos no município, como o governo do estado, entidades e
            empresas.
          </li>
          <li>
            <strong>Valor negativo</strong> quer dizer que, no ano, os
            estornos superaram os pagamentos.
          </li>
        </ul>
        <p>
          <strong>A página mostra o último ano completo e o ano corrente.</strong>{" "}
          Até 2024, parte do dinheiro de emendas era paga ao Banco do Brasil,
          sem o município de destino; uma série longa mostraria um salto que é,
          em boa parte, mudança no jeito de registrar. A série desde 2015 está
          no download da página, com a mesma ressalva.
        </p>
      </section>

      <section className={estilos.bloco} id="ideb">
        <h2>O que é o IDEB, e por que só a rede municipal</h2>
        <p>
          O <strong>IDEB</strong> é o índice do INEP que combina duas coisas:
          quanto os alunos aprenderam (a prova do SAEB) e quantos avançaram de
          ano sem reprovar ou abandonar. Vai de <strong>0 a 10</strong>, e essa
          escala é a mesma em todo município do país — por isso os gráficos
          deste site usam eixo fixo, e duas páginas podem ser comparadas
          diretamente.
        </p>
        <p>
          Este site publica a <strong>rede municipal</strong>, e não a rede
          &ldquo;pública&rdquo;. A diferença importa: a rede pública inclui as
          escolas <em>estaduais</em>, que a prefeitura não administra nem
          financia. Como a página mostra ao lado quanto do orçamento{" "}
          <em>municipal</em> foi para educação, usar o índice da rede pública
          creditaria à prefeitura um resultado que não é dela.
        </p>
        <p>
          As <strong>etapas são separadas e não se comparam entre si</strong>.
          Anos iniciais (1º ao 5º) e anos finais (6º ao 9º) têm provas e
          escalas próprias, e as medianas dos dois conjuntos ficam a mais de um
          ponto de distância. Um número não é &ldquo;pior&rdquo; que o outro;
          eles medem coisas diferentes.
        </p>
        <p>
          <strong>2005 e {ideb.edicoes[ideb.edicoes.length - 1]} não têm
          meta</strong>, e travessão ali é ausência de alvo, não alvo não
          atingido. 2005 é a linha de base do índice; e o primeiro ciclo do
          IDEB encerrou em 2021, com as novas metas ainda em definição
          (Portaria MEC 26/2024).
        </p>
        <p>
          Algumas edições aparecem marcadas como{" "}
          <strong>&ldquo;com ressalva do INEP&rdquo;</strong>. É o próprio INEP
          avisando que aquela média foi calculada em condição atípica — por
          exemplo, com participação inferior a 50% na prova, ou a partir de
          avaliações estaduais por extravio das provas. O número é publicado
          como veio, com o aviso junto.
        </p>
        <p>
          Cobertura, contra os <strong>{br(snapshot.municipios.length)}</strong>{" "}
          municípios do país:
        </p>
        <ul className={estilos.lista}>
          <li>
            <strong>{br(ideb.cobertura.municipios)}</strong> têm rede municipal
            nos <strong>anos iniciais</strong> — faltam{" "}
            {br(snapshot.municipios.length - ideb.cobertura.municipios)}.
          </li>
          <li>
            <strong>{br(idebFinais.cobertura.municipios)}</strong> têm nos{" "}
            <strong>anos finais</strong> — faltam{" "}
            {br(snapshot.municipios.length - idebFinais.cobertura.municipios)},
            e essa é a diferença que surpreende: no Paraná,{" "}
            <strong>388 dos 399</strong> municípios não administram o 6º ao 9º
            ano.
          </li>
        </ul>
        <p>
          {/* "a rede é do estado" era afirmação categórica. Verificado em
              04/09/2026 reingerindo o arquivo do INEP com `--rede Estadual`:
              dos 138 sem rede municipal nos anos iniciais, 133 aparecem na
              estadual e 5 em nenhuma das duas. "Quase sempre" é o que o dado
              sustenta; "é" não era. */}
          Onde o município não administra aquela etapa, a rede é de outro ente
          — <strong>quase sempre a estadual</strong>. Conferimos: dos{" "}
          {br(snapshot.municipios.length - ideb.cobertura.municipios)} sem rede
          municipal nos anos iniciais, <strong>133 aparecem no próprio arquivo
          do INEP como rede estadual</strong>; cinco não aparecem em nenhuma das
          duas, e sobre esses não sabemos.
        </p>
        <p>
          Isso <strong>não é lacuna da coleta</strong>, e a página do município
          e a do estado dizem isso onde acontece — ver{" "}
          <a href="#faltando">meu município não aparece</a>.
        </p>
      </section>

      {/* A porta de entrada das páginas do INSS: sem ela, as dez páginas
          ficariam órfãs, sem nenhum link interno, e o rastreador só as acharia
          pelo sitemap. E é aqui que se explica a diferença entre as duas
          medidas, que cada página repete em uma frase. */}
      <section className={estilos.bloco} id="censo">
        <h2>Censo, PIB e as outras estatísticas do IBGE</h2>
        <ul className={estilos.lista}>
          <li>
            <strong>Censo Demográfico</strong> — a contagem de toda a
            população e de todos os domicílios, a mais recente em 2022. Conta
            as pessoas onde elas <strong>moram</strong>. Dele vêm a seção
            “Como se vive” e parte de “Trabalho e renda”.
          </li>
          <li>
            <strong>PIB</strong> — o valor de tudo o que se produziu no
            município num ano, a preços do próprio ano. O IBGE o publica com
            alguns anos de atraso, e a página diz de que ano é.{" "}
            <strong>PIB por habitante</strong> é o PIB dividido pela
            população.
          </li>
          <li>
            <strong>Cadastro Central de Empresas (Cempre)</strong> — conta
            empresas, órgãos públicos e entidades, e os empregos formais
            deles, onde a <strong>empresa</strong> está. Não inclui quem
            trabalha por conta própria sem CNPJ.
          </li>
          <li>
            <strong>PNAD Contínua</strong> — a pesquisa por amostra que mede
            a desocupação do país, dos estados e das capitais a cada
            trimestre. Não é desenhada para medir cada município.
          </li>
        </ul>
        <p>
          <strong>Não existe taxa de desemprego atual por município</strong> em
          nenhuma fonte oficial. A do Censo é de 2022, e a da PNAD mede de
          outro jeito: as duas não se comparam. E os recortes não precisam
          bater: o Censo conta quem mora no município; o cadastro de empresas
          e o Caged, quem trabalha numa empresa dele. Numa cidade vizinha de um
          polo, muita gente trabalha fora.
        </p>
      </section>

      <section className={estilos.bloco} id="caged">
        <h2>Emprego com carteira: o Novo Caged</h2>
        <p>
          O <strong>Novo Caged</strong>, do Ministério do Trabalho e Emprego,
          registra cada contratação e cada desligamento com carteira assinada,
          mês a mês, no município da empresa. A página mostra os últimos 12
          meses.
        </p>
        <ul className={estilos.lista}>
          <li>
            <strong>Saldo</strong> é admissões menos desligamentos. Positivo,
            abriram-se mais vagas com carteira do que se fecharam; negativo, o
            contrário.
          </li>
          <li>
            <strong>Só emprego celetista</strong>, sob a CLT. Servidor
            estatutário, quem trabalha por conta própria e quem trabalha sem
            carteira não entram.
          </li>
          <li>
            <strong>Um mês sozinho engana.</strong> Safra, comércio de fim de
            ano e obra pública mudam o saldo de um mês para o outro; os 12
            meses juntos dizem mais.
          </li>
        </ul>
        <p>
          <Link href="/ranking/emprego-com-carteira/" prefetch={false}>
            O ranking do emprego com carteira
          </Link>{" "}
          põe os municípios lado a lado: os maiores e os menores saldos dos 12
          meses, e o saldo por mil habitantes nas cidades de 100 mil
          habitantes ou mais.
        </p>
      </section>

      <section className={estilos.bloco} id="brasil">
        <h2>Como ler o Brasil ao longo do tempo</h2>
        <p>
          <Link href="/brasil/" prefetch={false}>A página do Brasil</Link>{" "}
          reúne séries do país inteiro, cada uma desde o primeiro dado que a
          fonte publica naquela forma, todas no mesmo eixo de tempo. Cada série
          é lida por dois caminhos da própria fonte, e só entra se os dois
          concordarem.
        </p>
        <ul className={estilos.lista}>
          <li>
            <strong>As faixas ao fundo mostram quem ocupava a Presidência, e
            não medem efeito.</strong> Estas séries se movem por muitos
            fatores, de dentro e de fora do país, e nenhum gráfico separa um do
            outro. Por isso a página não soma, não tira média e não compara
            mandatos.
          </li>
          <li>
            <strong>O selo acima de cada gráfico</strong> diz para que lado a
            série melhora: “Mais alto é melhor”, “Mais baixo é melhor”, na
            inflação “Melhor dentro da faixa da meta”, e “Nenhum lado é melhor
            por si” quando o número não tem direção boa.
          </li>
          <li>
            <strong>Resultado primário</strong> é o que o setor público
            arrecada menos o que gasta, sem contar os juros da dívida. Sobra é
            superávit; falta, déficit.
          </li>
        </ul>
      </section>

      <section className={estilos.bloco} id="ranking">
        <h2>Como ler o ranking do gasto com pessoal</h2>
        <p>
          <Link href="/ranking/gasto-com-pessoal/" prefetch={false}>
            O ranking
          </Link>{" "}
          lista os municípios cujo gasto com pessoal declarado passou do{" "}
          <a href="#pessoal">teto legal</a> do Executivo municipal, do maior
          para o menor.
        </p>
        <ul className={estilos.lista}>
          <li>
            <strong>Sem o relatório, o município não está na lista</strong> —
            e ficar fora não quer dizer estar dentro do limite.
          </li>
          <li>
            <strong>As declarações implausíveis</strong> ficam numa lista à
            parte, abaixo: nem escondidas, nem misturadas à conta (veja{" "}
            <a href="#implausivel">valor implausível</a>).
          </li>
          <li>
            O filtro acima da tabela mostra só os municípios de um estado, e o
            nome de cada um leva à página dele.
          </li>
        </ul>
      </section>

      <section className={estilos.bloco} id="inss">
        <h2>Quanto tempo o INSS está levando</h2>
        <p>
          O INSS publica, todo mês, os pedidos que ainda esperam resposta e os
          que foram negados. Com eles dá para medir{" "}
          <strong>duas coisas diferentes</strong>, e as páginas nunca as
          misturam:
        </p>
        <ul>
          <li>
            <strong>Há quanto tempo esperam os pedidos ainda sem resposta</strong>{" "}
            numa data. Não é &ldquo;quanto demora&rdquo;: quem foi atendido
            rápido já saiu da fila, e quem fica é quem está esperando mais.
          </li>
          <li>
            <strong>Quanto tempo levou para chegar o &ldquo;não&rdquo;</strong>,
            para quem teve o pedido negado no mês. É o único tempo até a decisão
            que os dados abertos permitem medir: os de benefícios concedidos não
            trazem a data do pedido.
          </li>
        </ul>
        <p>Por tipo de benefício:</p>
        <ul>
          {gruposComPagina(inss).map((g) => (
            <li key={g.chave}>
              <Link href={`/inss/${g.chave}/`} prefetch={false}>
                {g.nomePopular.charAt(0).toUpperCase() + g.nomePopular.slice(1)}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={estilos.bloco} id="inflacao">
        <h2>Os valores estão corrigidos pela inflação?</h2>
        <p>
          <strong>Não.</strong> Todos os valores em reais são{" "}
          <strong>nominais</strong>, exatamente como foram declarados. Quando a
          página diz que o gasto de um município cresceu 13% de um ano para o
          outro, parte disso é inflação.
        </p>
        <p>
          Deflacionar exigiria escolher um índice e uma data-base, e essa
          escolha muda o resultado. Preferimos publicar o número declarado e
          dizer claramente o que ele é.
        </p>
      </section>

      <section className={estilos.bloco} id="quando">
        <h2>De quando são os dados</h2>
        <p>
          Cada número carrega a data em que foi coletado, ao lado dele, na
          página onde aparece. Não há dado sem procedência neste site.
        </p>
        <ul className={estilos.lista}>
          <li>
            <strong>População e PIB:</strong> IBGE — Censo 2022, estimativa de
            população de {periodoDe(snapshot, "populacao-estimada")} e PIB
            municipal de {periodoDe(snapshot, "pib-municipal")}, a preços
            correntes. A estimativa e o PIB são atualizados quando o IBGE
            publica um ano novo (a estimativa sai em agosto; o PIB, em
            dezembro).
          </li>
          <li>
            <strong>Despesa com pessoal:</strong> SICONFI/Tesouro Nacional, RGF
            Anexo 01, {quadrimestre}
            {fiscal.coletadoEm ? `, coletado em ${dataCurta(fiscal.coletadoEm)}` : ""}.
          </li>
          {f && (
            <li>
              <strong>Despesa por função:</strong> SICONFI/Tesouro Nacional,
              RREO Anexo 02, {f.periodo}º bimestre de{" "}
              {/* A serie inteira, e nao so o ano em destaque: a procedencia
                  tem de dizer o intervalo que o dado cobre. */}
              {f.exercicios.length > 1
                ? `${f.exercicios[f.exercicios.length - 1]!.exercicio} a ` +
                  `${f.exercicios[0]!.exercicio}`
                : f.exercicios[0]?.exercicio}
              {atualDeFuncoes(f)?.coletadoEm
                ? `, coletado em ${dataCurta(atualDeFuncoes(f)!.coletadoEm)}`
                : ""}.
            </li>
          )}
        </ul>
      </section>

      <section className={estilos.bloco} id="faltando">
        <h2>Meu município não aparece, ou aparece sem alguns números</h2>
        <p>
          O site cobre <strong>{br(total)} municípios</strong> — todos os do
          Brasil segundo o IBGE. Se o seu não estiver, o mais provável é
          diferença de grafia na busca; tente pela{" "}
          <Link href="/" prefetch={false}>lista completa</Link> ou pela página do estado.
        </p>
        <p>
          Um caso é real e proposital: <strong>Fernando de Noronha</strong> tem
          página de município no IBGE mas é <em>distrito estadual</em> de
          Pernambuco, não município. Sem Executivo municipal, não entrega
          relatório fiscal — por isso aparece sem os números do Tesouro. As duas
          fontes estão certas: o IBGE conta território, o SICONFI conta quem
          presta contas.
        </p>
        <p>
          Município que existe mas está sem os números fiscais provavelmente não
          entregou o relatório — ver{" "}
          <a href="#travessao">por que aparece “—”</a>.
        </p>
        <p>
          E <strong>sem o IDEB é outra coisa</strong>, não a mesma ausência: o
          INEP publica por rede, e onde a prefeitura não administra aquelas
          escolas não há número municipal a publicar. Acontece em{" "}
          {br(snapshot.municipios.length - ideb.cobertura.municipios)}{" "}
          municípios nos anos iniciais e em{" "}
          {br(snapshot.municipios.length - idebFinais.cobertura.municipios)} nos
          anos finais — ver <a href="#ideb">o que é o IDEB</a>.
        </p>
      </section>

      <section className={estilos.bloco} id="cobertura">
        <h2>Quais municípios estão cobertos</h2>
        <p>
          <strong>Todos os {br(total)} do Brasil</strong>, segundo a lista de
          localidades do IBGE. A coleta começou pelo Nordeste, com verificação
          de cada número, e foi estendida ao país quando o método já estava
          conferido — não antes.
        </p>
        <p>
          Nem todo município aparece com todos os números, e a página sempre diz
          por quê. Um pode não ter entregue o relatório fiscal; outro pode não
          administrar escola de 1º ao 5º ano, e aí a rede é do estado. Ausência
          está sempre marcada — ver <a href="#travessao">por que aparece
          &ldquo;—&rdquo;</a>.
        </p>
      </section>

      <section className={estilos.bloco} id="baixar">
        <h2>Como baixar e abrir os dados</h2>
        <p>
          Todo número deste site pode ser baixado. Um painel de dado público que
          só deixa <em>olhar</em> está pela metade — número que ninguém consegue
          baixar é número que ninguém consegue contestar.
        </p>
        <ul className={estilos.lista}>
          <li>
            <a href="/dados/municipios.xlsx" download>
              Base completa em planilha do Excel
            </a>{" "}
            — os {br(total)} municípios, com três abas: os dados, o que
            significa cada coluna, e de onde cada número veio.
          </li>
          <li>
            <a href="/dados/municipios.csv" download>A mesma base em CSV</a> —
            para quem vai ler por programa.
          </li>
          <li>
            <strong>Por estado</strong> — o link está no fim de cada página de
            estado.
          </li>
          <li>
            <strong>Por município</strong> — no fim de cada página de município,
            com uma linha por indicador e período.
          </li>
        </ul>
        <p>
          Os arquivos usam <strong>ponto e vírgula</strong> como separador e{" "}
          <strong>vírgula</strong> como decimal, que é o que o Excel em
          português espera: basta abrir. Um CSV “padrão” internacional abriria
          com tudo amontoado numa coluna só.
        </p>
        <p>
          Se você for reimportar em outra ferramenta, o arquivo é UTF-8 com BOM.
          Municípios que não entregaram relatório aparecem como{" "}
          <code>nao</code> na coluna de publicação — nunca como zero.
        </p>
      </section>

      <section className={estilos.bloco} id="licenca">
        <h2>Posso usar estes dados?</h2>
        <p>
          Sim, e cada fonte diz em que termos. Os dados não são deste site: são
          de quem os publica, e é a licença de cada um que vale.
        </p>
        <ul className={estilos.lista}>
          <li>
            <strong>SICONFI/Tesouro Nacional</strong> (gasto com pessoal,
            despesa por função e receita): publicados pelo Tesouro sob a{" "}
            <a href="https://opendatacommons.org/licenses/odbl/1-0/" rel="noopener">
              Open Database License (ODbL) 1.0
            </a>
            . A base que este site monta a partir deles, incluídas as planilhas
            para baixar, segue sob a mesma ODbL: pode usar, adaptar e
            redistribuir, citando a fonte e mantendo a licença no que publicar.
          </li>
          <li>
            <strong>IBGE e INEP</strong> (população, PIB, Censo 2022 e IDEB):
            dados abertos do governo federal, de livre utilização desde que se
            cite a fonte (Decreto 8.777/2016).
          </li>
          <li>
            <strong>SIOPS/Ministério da Saúde</strong> (aplicação em saúde): o
            Portal de Dados Abertos do SUS publica o conjunto sob a licença{" "}
            <a href="https://creativecommons.org/licenses/by-nd/3.0/deed.pt_BR" rel="noopener">
              Creative Commons Atribuição-SemDerivações 3.0
            </a>
            . O percentual de cada município aparece aqui como o SIOPS o publica.
          </li>
        </ul>
        <p>
          O código do site é outra coisa: é software livre sob{" "}
          <a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="noopener">
            AGPL-3.0
          </a>
          , que vale para o programa, e não para os dados.
        </p>
        <p>
          Se for republicar, cite as fontes originais (IBGE, SICONFI/Tesouro
          Nacional, SIOPS/Ministério da Saúde e INEP), e não só este site. É
          delas que o número vem.
        </p>
      </section>

      <section className={estilos.bloco} id="erro">
        <h2>Achei um número errado</h2>
        <p>
          Há duas possibilidades, e vale separar antes de mais nada:
        </p>
        <ul className={estilos.lista}>
          <li>
            <strong>O número aqui está diferente do que a fonte publica.</strong>{" "}
            Aí o erro é nosso, e queremos saber. Abra uma questão no{" "}
            <a
              href="https://github.com/peterwkdev-creator/numeros-publicos/issues"
              rel="noopener"
            >
              repositório do projeto
            </a>{" "}
            com o município e o número que você viu.
          </li>
          <li>
            <strong>O número aqui é igual ao da fonte, e a fonte é que está
            estranha.</strong> Aí o erro é da declaração, e nós não podemos
            corrigi-lo — seria inventar um valor. O caminho é a prefeitura ou o
            tribunal de contas do estado. Os casos mais gritantes já aparecem
            marcados como <a href="#implausivel">implausíveis</a>.
          </li>
        </ul>
        <p>
          Todo o código de coleta é aberto, então dá para conferir exatamente
          como cada número foi lido da API.
        </p>
      </section>

      <section className={estilos.bloco} id="outras">
        <h2>Onde perguntar o que este site não responde</h2>
        <p>
          Muita dúvida sobre estes dados não é sobre o site: é sobre o que o
          município declarou, ou sobre a regra que ele seguiu. Esses lugares
          respondem o que nós não temos como responder:
        </p>
        <ul className={estilos.lista}>
          <li>
            <a href="https://siconfi.tesouro.gov.br/" rel="noopener">
              SICONFI — Tesouro Nacional
            </a>{" "}
            — a fonte dos relatórios fiscais, com todos os anexos, não só os dois
            usados aqui.
          </li>
          <li>
            <a href="https://sidra.ibge.gov.br/" rel="noopener">IBGE / SIDRA</a>{" "}
            — população, PIB e todas as outras estatísticas municipais.
          </li>
          <li>
            <strong>A prefeitura do município</strong>, pelo portal da
            transparência ou pelo pedido de acesso à informação (Lei 12.527/2011)
            — é quem pode explicar uma declaração específica.
          </li>
          <li>
            <strong>O tribunal de contas do estado</strong> — é quem fiscaliza
            as contas municipais.
          </li>
        </ul>
      </section>

      {/* O mesmo texto da explicação que abre no lugar do termo, nas outras
          páginas (`lib/glossario.ts`). O `id` de cada termo vem de
          `idDoVerbete`, com prefixo para não colidir com o de uma seção de
          mesmo nome (`caged`, `ideb`): é para ele que o "Ler mais" leva
          quando o termo não tem seção própria aqui. */}
      <section className={estilos.bloco} id="glossario">
        <h2>Glossário de A a Z</h2>
        <dl className={estilos.glossario}>
          {glossarioAZ().map(({ chave, verbete }) => (
            <div key={chave} id={idDoVerbete(chave)} className={estilos.verbete}>
              <dt>{verbete.termo}</dt>
              <dd>
                {verbete.curta}
                {verbete.secao && (
                  <>
                    {" "}
                    <a href={`#${verbete.secao}`}>Mais sobre isto</a>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

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
