/**
 * O glossário do site: uma frase por termo, e uma fonte só.
 *
 * ## Por que um módulo, e não a frase no lugar do uso
 *
 * Até 11/10/2026 cada `<Termo>` trazia a sua `dica` escrita à mão, e a mesma
 * ideia (a RCL ajustada) aparecia com três redações em três lugares. A dica,
 * o verbete do glossário A–Z da `/ajuda/` e o "Ler mais" passam a ler daqui:
 * mudou a frase, mudou em todo lugar. É a regra da casa para número cravado
 * em prosa, aplicada à definição.
 *
 * ## O que vai na frase
 *
 * Uma ou duas, neutras, sem adjetivo de valor e **sem número que venha do
 * dado** (o número muda na coleta seguinte; a frase não é revisada). Constante
 * de lei pode, com a lei dita.
 *
 * `secao` é a seção da `/ajuda/` que explica o termo por inteiro. Sem ela, o
 * "Ler mais" leva ao próprio verbete no glossário (`idDoVerbete`).
 * Um teste cobra que toda `secao` exista na `/ajuda/` e que toda chave usada
 * num `<Termo>` exista aqui.
 */

export type Verbete = {
  /** Como o termo aparece no glossário A–Z. */
  termo: string;
  /** A explicação curta, que abre no próprio lugar do termo. */
  curta: string;
  /** A seção da `/ajuda/` que explica por inteiro, se houver. */
  secao?: string;
};

export const GLOSSARIO = {
  "amazonia-legal": {
    termo: "Amazônia Legal e PRODES",
    curta: "A Amazônia Legal é a área que a lei define para a região: Acre, Amapá, Amazonas, Mato Grosso, Pará, Rondônia, Roraima, Tocantins e parte do Maranhão. O PRODES é o projeto do INPE que mede por satélite, ano a ano, o desmatamento por corte raso nela.",
    secao: "brasil",
  },
  "auxilio-inclusao": {
    termo: "Auxílio-inclusão",
    curta: "Pago à pessoa com deficiência que recebe o BPC, ou o recebeu nos últimos cinco anos, e passa a trabalhar com remuneração de até dois salários mínimos: o BPC é suspenso, e o auxílio vale metade dele (Lei 14.176/2021).",
    secao: "inss",
  },
  "balanco-de-pagamentos": {
    termo: "Balanço de pagamentos",
    curta: "O registro, feito pelo Banco Central, de tudo o que o país recebe do exterior e paga a ele num período: comércio, serviços, rendas e investimentos.",
    secao: "brasil",
  },
  bimestre: {
    termo: "Bimestre",
    curta: "Período de dois meses. O ano tem seis, e o relatório do 6º bimestre traz o ano inteiro acumulado.",
    secao: "relatorios",
  },
  bpc: {
    termo: "BPC (LOAS)",
    curta: "Benefício de Prestação Continuada, da Lei Orgânica da Assistência Social: um salário mínimo por mês ao idoso de 65 anos ou mais e à pessoa com deficiência, de família de baixa renda. Não é aposentadoria e não exige contribuição.",
    secao: "inss",
  },
  caged: {
    termo: "Caged (Novo Caged)",
    curta: "O registro, no Ministério do Trabalho, de cada contratação e de cada desligamento com carteira assinada, mês a mês, no município da empresa.",
    secao: "caged",
  },
  celetista: {
    termo: "Celetista",
    curta: "Quem trabalha com carteira assinada, sob a CLT. Servidor estatutário e quem trabalha por conta própria não entram no Caged.",
    secao: "caged",
  },
  cempre: {
    termo: "Cadastro Central de Empresas (Cempre)",
    curta: "O cadastro do IBGE que conta empresas, órgãos públicos e entidades, e os empregos formais deles, no município onde estão.",
    secao: "censo",
  },
  simei: {
    termo: "SIMEI (MEI)",
    curta: "O Sistema de Recolhimento em Valores Fixos Mensais do Simples Nacional: o enquadramento em que o microempreendedor individual (MEI) paga um valor fixo por mês. A Receita Federal publica quantos optantes há em cada município, numa data, com a posição consolidada até a data da consulta.",
  },
  censo: {
    termo: "Censo Demográfico",
    curta: "A contagem de toda a população e de todos os domicílios do país, feita pelo IBGE; a mais recente é a de 2022.",
    secao: "censo",
  },
  "como-estado": {
    termo: "Presta contas como estado",
    curta: "O Distrito Federal entrega o relatório fiscal como estado, onde de fato responde, e não como município. O site cobre municípios, e por isso não há número aqui — o que falta é o recorte, não a prestação de contas.",
  },
  comparecimento: {
    termo: "Comparecimento e abstenção",
    curta: "Comparecimento é quantos eleitores aptos foram votar; abstenção, quantos não foram. Os dois somam o eleitorado inteiro.",
  },
  contribuicoes: {
    termo: "Contribuições (receita)",
    curta: "Uma das origens da receita corrente. Entre elas, a dos servidores à previdência própria do município e a de iluminação pública.",
  },
  desocupacao: {
    termo: "Desemprego",
    curta: "Pessoas de 14 anos ou mais que estavam sem trabalho, tinham procurado um e podiam começar, em proporção de todos os que trabalham ou procuram trabalho. O IBGE chama de desocupação.",
    secao: "censo",
  },
  "divida-bruta-liquida": {
    termo: "Dívida bruta e dívida líquida",
    curta: "A bruta é o que os governos federal, estaduais e municipais devem. A líquida é a do setor público (inclui o Banco Central e as estatais): o que ele deve menos o que tem a receber, como as reservas internacionais.",
    secao: "brasil",
  },
  "divida-consolidada": {
    termo: "Dívida consolidada",
    curta: "Tudo o que o governo deve com prazo acima de um ano: empréstimos, renegociações, parcelamentos e precatórios vencidos e não pagos. É a dívida total que o Relatório de Gestão Fiscal declara.",
  },
  "divida-liquida": {
    termo: "Dívida consolidada líquida",
    curta: "A dívida consolidada menos o dinheiro em caixa e os valores a receber que a lei manda descontar. É a dívida que a lei limita. Fica negativa quando o que o governo tem e tem a receber passa do que ele deve.",
  },
  dotacao: {
    termo: "Dotação",
    curta: "O valor que o orçamento aprovado autoriza gastar numa despesa: o orçado, antes do empenho e da liquidação.",
    secao: "funcao",
  },
  "emenda-bancada": {
    termo: "Emenda de bancada estadual",
    curta: "A emenda apresentada em conjunto pelos deputados e senadores de um mesmo estado.",
    secao: "emendas",
  },
  "emenda-comissao": {
    termo: "Emenda de comissão",
    curta: "A emenda apresentada por uma comissão permanente da Câmara, do Senado ou do Congresso, e não por um parlamentar.",
    secao: "emendas",
  },
  "emenda-finalidade-definida": {
    termo: "Emenda individual com finalidade definida",
    curta: "A emenda de um deputado ou senador cujo dinheiro vai para um programa ou obra definido nela, e só pode ser usado ali.",
    secao: "emendas",
  },
  "emenda-parlamentar": {
    termo: "Emenda parlamentar",
    curta: "A parte do orçamento federal cujo destino é indicado por deputados e senadores — uma prefeitura, um fundo de saúde, uma entidade. O site mostra o que a União pagou, não o que foi prometido.",
    secao: "emendas",
  },
  "emenda-transferencia-especial": {
    termo: "Emenda individual de transferência especial",
    curta: "A emenda de um deputado ou senador cujo dinheiro vai direto ao caixa da prefeitura, sem projeto definido na emenda (a chamada emenda Pix).",
    secao: "emendas",
  },
  empenhada: {
    termo: "Despesa empenhada",
    curta: "O dinheiro reservado no orçamento para um gasto já contratado, antes de o serviço ser prestado ou o material entregue.",
    secao: "funcao",
  },
  "encargos-especiais": {
    termo: "Encargos especiais",
    curta: "A função que reúne as despesas que não pertencem a uma área de governo: pagamento da dívida, sentenças judiciais (precatórios), indenizações e outras.",
    secao: "funcao",
  },
  estatutario: {
    termo: "Servidor estatutário",
    curta: "Quem entrou no serviço público por concurso, sob o estatuto do órgão e não sob a CLT. Não aparece no Caged.",
    secao: "caged",
  },
  funcao: {
    termo: "Despesa por função",
    curta: "O gasto agrupado pela área a que se destina — saúde, educação, urbanismo —, numa classificação que a lei impõe igual a todo município.",
    secao: "funcao",
  },
  "gasto-com-pessoal": {
    termo: "Gasto com pessoal",
    curta: "A despesa com servidores ativos, aposentados e pensionistas, em percentual da receita corrente líquida ajustada, como o próprio município declarou ao Tesouro. Os valores impossíveis ficam fora da mediana e da média.",
    secao: "pessoal",
  },
  "governo-geral": {
    termo: "Governo geral e setor público",
    curta: "Governo geral é a União (com o INSS), os estados e os municípios. Setor público é o governo geral mais o Banco Central e as estatais não financeiras (sem Petrobras e Eletrobras).",
    secao: "brasil",
  },
  ideb: {
    termo: "IDEB",
    curta: "O índice do INEP que combina o quanto os alunos aprenderam (prova do SAEB) com quantos avançaram de ano sem reprovar nem abandonar. Vai de 0 a 10, na mesma escala para todo o país.",
    secao: "ideb",
  },
  implausivel: {
    termo: "Valor impossível (implausível)",
    curta: "O percentual declarado não pode descrever a prefeitura: acima de 100% da receita, negativo, ou calculado sobre uma receita que a declaração do próprio município desmente. Descreve um relatório preenchido errado, não uma crise; fica exibido e marcado, e fora das médias e do ranking.",
    secao: "implausivel",
  },
  ipca: {
    termo: "IPCA",
    curta: "O índice oficial de inflação do país, medido pelo IBGE: quanto subiram os preços do que as famílias compram. É por ele que se mede a meta de inflação.",
    secao: "brasil",
  },
  "limite-do-senado": {
    termo: "Limite da dívida (Senado)",
    curta: "A dívida consolidada líquida de um estado não pode passar de 2 vezes a receita corrente líquida (Resolução do Senado Federal nº 40/2001). A Lei de Responsabilidade Fiscal manda o Tribunal de Contas alertar o governo quando ela passa de 90% desse limite (art. 59, § 1º, III).",
  },
  "limite-prudencial": {
    termo: "Limite prudencial",
    curta: "O patamar de alerta da Lei de Responsabilidade Fiscal, a 95% do teto. Passar dele já proíbe criar cargo, conceder aumento e contratar — antes de o teto ser atingido.",
    secao: "pessoal",
  },
  liquidada: {
    termo: "Despesa liquidada",
    curta: "O que de fato foi gasto: o serviço foi prestado ou o material entregue, e a prefeitura reconheceu a dívida. Diferente da dotação (o orçado) e da empenhada (o reservado).",
    secao: "funcao",
  },
  media: {
    termo: "Média",
    curta: "A soma dividida pela quantidade. Poucos valores muito altos a puxam para cima, e por isso o site compara municípios pela mediana.",
    secao: "mediana",
  },
  mediana: {
    termo: "Mediana",
    curta: "O valor do meio: metade dos municípios fica abaixo dele, metade acima. Ao contrário da média, não se move com poucos valores extremos.",
    secao: "mediana",
  },
  "meta-ideb": {
    termo: "Meta do IDEB",
    curta: "O alvo que o INEP fixou, edição a edição, para cada rede de ensino, de 2007 a 2021. Para as edições seguintes não publicou meta.",
    secao: "ideb",
  },
  "minimo-saude": {
    termo: "Mínimo constitucional em saúde",
    curta: "A Constituição obriga o município a aplicar em saúde ao menos 15% da receita de impostos e transferências constitucionais, a base que a Lei Complementar 141/2012 define (Emenda Constitucional 29, de 2000, com a regra inteira desde 2004).",
    secao: "saude",
  },
  "nao-instalado": {
    termo: "Município ainda não instalado",
    curta: "O município só passou a ter prefeitura depois do período do relatório. Não havia quem o entregasse, e por isso não há número: o que falta é o município no período, não a prestação de contas.",
  },
  nominal: {
    termo: "Valor nominal",
    curta: "Em reais de cada ano, sem descontar a inflação. Comparar anos distantes assim mostra um crescimento maior que o do poder de compra.",
    secao: "inflacao",
  },
  "outras-receitas-correntes": {
    termo: "Outras receitas correntes",
    curta: "A receita corrente que não cabe nas demais origens, como multas, indenizações e restituições.",
  },
  pib: {
    termo: "PIB",
    curta: "Produto Interno Bruto: o valor de tudo o que se produziu no município num ano, calculado pelo IBGE, a preços correntes.",
    secao: "censo",
  },
  "pib-por-habitante": {
    termo: "PIB por habitante",
    curta: "O PIB do município dividido pela população. A página diz de que ano é cada um.",
    secao: "censo",
  },
  pnad: {
    termo: "PNAD Contínua",
    curta: "A pesquisa do IBGE, por amostra de domicílios, que mede o desemprego do país e dos estados a cada trimestre. Não é desenhada para medir cada município.",
    secao: "censo",
  },
  "poder-executivo": {
    termo: "Poder Executivo",
    curta: "A prefeitura, no município; o governo, no estado e na União. Não inclui a Câmara, a Assembleia nem o Congresso, que são o Legislativo e têm limite de pessoal próprio.",
    secao: "pessoal",
  },
  "pontos-percentuais": {
    termo: "Pontos percentuais",
    curta: "A diferença entre dois percentuais. De 20% para 25% são 5 pontos percentuais — e um aumento de 25% sobre o valor de partida.",
    secao: "mediana",
  },
  ppc: {
    termo: "Paridade de poder de compra (PPC)",
    curta: "Uma conversão entre moedas pelo custo de vida, e não pelo câmbio: quantos reais compram, aqui, o mesmo que um dólar compra nos Estados Unidos.",
    secao: "brasil",
  },
  quadrimestre: {
    termo: "Quadrimestre",
    curta: "Período de quatro meses. O ano tem três, e o 3º termina em dezembro.",
    secao: "relatorios",
  },
  rcl: {
    termo: "Receita corrente líquida (RCL) ajustada",
    curta: "Toda a receita corrente do município ou do estado (como os impostos dele e as transferências que recebe da União e, no caso do município, do estado) menos as deduções da Lei de Responsabilidade Fiscal, como a contribuição dos servidores à previdência própria, e com os ajustes que ela manda fazer. No governo estadual, deduz-se também a parte dos impostos que vai aos municípios. É o denominador do percentual de gasto com pessoal.",
    secao: "pessoal",
  },
  "receita-corrente": {
    termo: "Receita corrente",
    curta: "O dinheiro do dia a dia, sem empréstimo nem venda de bens: impostos, taxas, contribuições, transferências e as demais receitas que custeiam a prefeitura.",
  },
  "receita-patrimonial": {
    termo: "Receita patrimonial",
    curta: "O que o município ganha com o que tem: rendimento de aplicações, aluguéis e concessões.",
  },
  "rede-municipal": {
    termo: "Rede municipal",
    curta: "As escolas que a prefeitura administra. A rede pública inclui também as estaduais e as federais.",
    secao: "ideb",
  },
  "regiao-imediata": {
    termo: "Região imediata",
    curta: "O agrupamento de municípios vizinhos que o IBGE define em torno de uma cidade que atende ao dia a dia deles: compras, emprego, saúde e educação.",
  },
  "resultado-primario": {
    termo: "Resultado primário",
    curta: "O que o setor público arrecada menos o que gasta, sem contar os juros da dívida. No site vem como o Banco Central publica (necessidade de financiamento, somada em 12 meses): acima de zero é déficit; abaixo, superávit.",
    secao: "brasil",
  },
  rgf: {
    termo: "RGF (Relatório de Gestão Fiscal)",
    curta: "O relatório da despesa com pessoal comparada aos limites da Lei de Responsabilidade Fiscal. O município o entrega a cada quadrimestre; com menos de 50 mil habitantes, pode optar por um simplificado, a cada semestre.",
    secao: "relatorios",
  },
  "rgf-simplificado": {
    termo: "RGF Simplificado",
    curta: "A versão semestral do Relatório de Gestão Fiscal, que a Lei de Responsabilidade Fiscal (art. 63) permite ao município com menos de 50 mil habitantes. A do 2º semestre cobre os 12 meses até dezembro, o mesmo período do 3º quadrimestre.",
    secao: "relatorios",
  },
  rreo: {
    termo: "RREO (Relatório Resumido da Execução Orçamentária)",
    curta: "O relatório que o município entrega a cada bimestre, com a receita e a despesa acumuladas no ano. Quem optou pelo relatório fiscal semestral entrega a versão simplificada, também bimestral e com as mesmas contas.",
    secao: "relatorios",
  },
  saeb: {
    termo: "SAEB e fluxo escolar",
    curta: "O SAEB é a prova do INEP, de língua portuguesa e matemática, aplicada a cada dois anos. Fluxo escolar é quantos alunos são aprovados; o IDEB combina os dois.",
    secao: "ideb",
  },
  saldo: {
    termo: "Saldo de empregos",
    curta: "Admissões menos desligamentos com carteira no período. Positivo: houve mais contratações que desligamentos.",
    secao: "caged",
  },
  selic: {
    termo: "Selic e Copom",
    curta: "A Selic é a taxa básica de juros da economia. Quem fixa a meta da Selic é o Copom, o Comitê de Política Monetária do Banco Central, a cada reunião, para levar a inflação à meta.",
    secao: "brasil",
  },
  "sem-relatorio": {
    termo: "Sem relatório entregue",
    curta: "Nem o relatório quadrimestral nem o semestral simplificado do município estão no SICONFI, a base do Tesouro. Isso não quer dizer que gaste zero com pessoal: quer dizer que o site não tem o número.",
    secao: "travessao",
  },
  siconfi: {
    termo: "SICONFI",
    curta: "O sistema do Tesouro Nacional onde estados e municípios entregam os relatórios fiscais. É de lá que vêm a receita e a despesa deste site.",
    secao: "relatorios",
  },
  siops: {
    termo: "SIOPS",
    curta: "O sistema do Ministério da Saúde onde cada município declara quanto aplicou em saúde. É de lá o percentual da seção de saúde.",
    secao: "saude",
  },
  "teto-legal": {
    termo: "Teto legal (gasto com pessoal)",
    curta: "O máximo de despesa com pessoal que a Lei de Responsabilidade Fiscal permite ao Executivo municipal, em proporção da receita corrente líquida ajustada.",
    secao: "pessoal",
  },
  transferencias: {
    termo: "Transferências correntes",
    curta: "O dinheiro que a União, o estado e os fundos repassam ao município para o dia a dia, como o Fundo de Participação dos Municípios.",
  },
  travessao: {
    termo: "Travessão (—)",
    curta: "Não há o número na fonte. Nunca quer dizer zero.",
    secao: "travessao",
  },
  "valor-real": {
    termo: "Valor real",
    curta: "O valor descontada a inflação, em reais de uma mesma data, para que anos diferentes se comparem. O contrário do valor nominal.",
    secao: "inflacao",
  },
  "votos-validos": {
    termo: "Votos válidos",
    curta: "Os votos dados a um candidato ou a um partido, sem contar brancos e nulos. É sobre eles que se calcula a maioria para presidente, governador e prefeito.",
  },
} as const satisfies Record<string, Verbete>;

export type ChaveGlossario = keyof typeof GLOSSARIO;

/**
 * Nomes que vêm do DADO (função de despesa, origem da receita, tipo de
 * emenda) e ganham a explicação no lugar, na tabela de barras. Em caixa
 * baixa: a fonte grita (`RECEITA PATRIMONIAL`) e a tela escreve em caixa de
 * frase, e o mesmo nome tem de achar o verbete nas duas. Auditoria de termos,
 * M1, M2 e M15 (26/10/2026).
 */
const TERMO_DO_ROTULO: Record<string, ChaveGlossario> = {
  "encargos especiais": "encargos-especiais",
  "transferências correntes": "transferencias",
  "contribuições": "contribuicoes",
  "receita patrimonial": "receita-patrimonial",
  "outras receitas correntes": "outras-receitas-correntes",
  "individual: transferência especial": "emenda-transferencia-especial",
  "individual: finalidade definida": "emenda-finalidade-definida",
  "de bancada estadual": "emenda-bancada",
  "de comissão": "emenda-comissao",
};

/** O verbete de um nome que veio do dado, se houver. */
export function termoDoRotulo(nome: string): ChaveGlossario | undefined {
  return TERMO_DO_ROTULO[nome.toLocaleLowerCase("pt-BR")];
}

/**
 * O `id` do verbete no glossário A–Z. Com prefixo, porque várias chaves têm o
 * nome de uma seção da `/ajuda/` (`caged`, `ideb`, `mediana`), e `id` repetido
 * na página faz a âncora cair na primeira ocorrência.
 */
export function idDoVerbete(chave: ChaveGlossario): string {
  return `termo-${chave}`;
}

/** Para onde o "Ler mais" leva: a seção da ajuda, ou o próprio verbete. */
export function ancoraDe(chave: ChaveGlossario): string {
  const v: Verbete = GLOSSARIO[chave];
  return v.secao ?? idDoVerbete(chave);
}

/** O glossário em ordem alfabética do termo, como a `/ajuda/` o mostra. */
export function glossarioAZ(): { chave: ChaveGlossario; verbete: Verbete }[] {
  return (Object.keys(GLOSSARIO) as ChaveGlossario[])
    .map((chave) => ({ chave, verbete: GLOSSARIO[chave] as Verbete }))
    .sort((a, b) => a.verbete.termo.localeCompare(b.verbete.termo, "pt-BR"));
}
