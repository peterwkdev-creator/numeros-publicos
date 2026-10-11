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
  bimestre: {
    termo: "Bimestre",
    curta: "Período de dois meses. O ano tem seis, e o relatório do 6º bimestre traz o ano inteiro acumulado.",
    secao: "relatorios",
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
  censo: {
    termo: "Censo Demográfico",
    curta: "A contagem de toda a população e de todos os domicílios do país, feita pelo IBGE; a mais recente é a de 2022.",
    secao: "censo",
  },
  "como-estado": {
    termo: "Presta contas como estado",
    curta: "O Distrito Federal entrega o relatório fiscal como estado, onde de fato responde, e não como município. O site cobre municípios, e por isso não há número aqui — o que falta é o recorte, não a prestação de contas.",
  },
  desocupacao: {
    termo: "Desocupação",
    curta: "Pessoas de 14 anos ou mais que estavam sem trabalho, tinham procurado um e podiam começar, em proporção de todos os que trabalham ou procuram trabalho.",
    secao: "censo",
  },
  "emenda-parlamentar": {
    termo: "Emenda parlamentar",
    curta: "A parte do orçamento federal cujo destino é indicado por deputados e senadores — uma prefeitura, um fundo de saúde, uma entidade. O site mostra o que a União pagou, não o que foi prometido.",
    secao: "emendas",
  },
  empenhada: {
    termo: "Despesa empenhada",
    curta: "O dinheiro reservado no orçamento para um gasto já contratado, antes de o serviço ser prestado ou o material entregue.",
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
    curta: "A despesa com servidores ativos, aposentados e pensionistas, em percentual da receita corrente líquida ajustada, como o próprio município declarou ao Tesouro. Os valores implausíveis ficam fora das médias.",
    secao: "pessoal",
  },
  ideb: {
    termo: "IDEB",
    curta: "O índice do INEP que combina o quanto os alunos aprenderam (prova do SAEB) com quantos avançaram de ano sem reprovar nem abandonar. Vai de 0 a 10, na mesma escala para todo o país.",
    secao: "ideb",
  },
  implausivel: {
    termo: "Valor implausível",
    curta: "O percentual declarado não pode descrever a prefeitura: acima de 100% da receita, negativo, ou calculado sobre uma receita que a declaração do próprio município desmente. Descreve um relatório preenchido errado, não uma crise; fica exibido e marcado, e fora das médias e do ranking.",
    secao: "implausivel",
  },
  liquidada: {
    termo: "Despesa liquidada",
    curta: "O que de fato foi gasto: o serviço foi prestado ou o material entregue, e a prefeitura reconheceu a dívida. Diferente da dotação (o orçado) e da empenhada (o reservado).",
    secao: "funcao",
  },
  "limite-prudencial": {
    termo: "Limite prudencial",
    curta: "O patamar de alerta da Lei de Responsabilidade Fiscal, a 95% do teto. Passar dele já proíbe criar cargo, conceder aumento e contratar — antes de o teto ser atingido.",
    secao: "pessoal",
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
  "minimo-saude": {
    termo: "Mínimo constitucional em saúde",
    curta: "A Constituição obriga o município a aplicar em saúde ao menos 15% da receita de impostos (Emenda Constitucional 29, de 2000, com a regra inteira desde 2004).",
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
    curta: "A pesquisa do IBGE, por amostra de domicílios, que mede a desocupação do país e dos estados a cada trimestre. Não é desenhada para medir cada município.",
    secao: "censo",
  },
  "pontos-percentuais": {
    termo: "Pontos percentuais",
    curta: "A diferença entre dois percentuais. De 20% para 25% são 5 pontos percentuais — e um aumento de 25% sobre o valor de partida.",
    secao: "mediana",
  },
  quadrimestre: {
    termo: "Quadrimestre",
    curta: "Período de quatro meses. O ano tem três, e o 3º termina em dezembro.",
    secao: "relatorios",
  },
  rcl: {
    termo: "Receita corrente líquida (RCL) ajustada",
    curta: "A arrecadação do município menos as transferências que ele é obrigado a repassar, com os ajustes que a Lei de Responsabilidade Fiscal manda fazer. É o denominador do percentual de gasto com pessoal.",
    secao: "pessoal",
  },
  "rede-municipal": {
    termo: "Rede municipal",
    curta: "As escolas que a prefeitura administra. A rede pública inclui também as estaduais e as federais.",
    secao: "ideb",
  },
  "resultado-primario": {
    termo: "Resultado primário",
    curta: "O que o governo arrecada menos o que gasta, sem contar os juros da dívida. Sobra é superávit; falta, déficit.",
    secao: "brasil",
  },
  rgf: {
    termo: "RGF (Relatório de Gestão Fiscal)",
    curta: "O relatório da despesa com pessoal comparada aos limites da Lei de Responsabilidade Fiscal. O município o entrega a cada quadrimestre; com menos de 50 mil habitantes, pode optar por um simplificado, a cada semestre.",
    secao: "relatorios",
  },
  rreo: {
    termo: "RREO (Relatório Resumido da Execução Orçamentária)",
    curta: "O relatório que o município entrega a cada bimestre, com a receita e a despesa acumuladas no ano.",
    secao: "relatorios",
  },
  saldo: {
    termo: "Saldo de empregos",
    curta: "Admissões menos desligamentos no período. Positivo, abriram-se mais vagas com carteira do que se fecharam.",
    secao: "caged",
  },
  "sem-relatorio": {
    termo: "Sem relatório entregue",
    curta: "O relatório quadrimestral do município não está no SICONFI, a base do Tesouro. Isso não quer dizer que gaste zero com pessoal: quer dizer que o site não tem o número. Município com menos de 50 mil habitantes pode publicar um relatório semestral simplificado, que o site ainda não lê.",
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
  travessao: {
    termo: "Travessão (—)",
    curta: "Não há o número na fonte. Nunca quer dizer zero.",
    secao: "travessao",
  },
} as const satisfies Record<string, Verbete>;

export type ChaveGlossario = keyof typeof GLOSSARIO;

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
