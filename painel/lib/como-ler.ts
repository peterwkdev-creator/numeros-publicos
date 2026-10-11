/**
 * "Como ler esta página": o roteiro de cada tipo de página, numa fonte só.
 *
 * O mesmo texto aparece em dois lugares: no `<details>` fechado abaixo do
 * título (`componentes/como-ler.tsx`) e na seção "Como ler as páginas" da
 * `/ajuda/`. Escrito uma vez, para os dois não divergirem.
 *
 * ## O que entra, e o que não entra
 *
 * De 4 a 6 itens, cada um respondendo "onde olho" ou "o que isto quer dizer".
 * Não é o sumário (cada página de município e de estado já tem o "Nesta
 * página"), e por isso os links vão à `/ajuda/`, nunca a uma seção da própria
 * página: as seções são condicionais, e um item apontando para uma que não
 * existe naquele município seria link para lugar nenhum. Sem número que venha
 * do dado. Espec: `especs/numeros-publicos-tutorial.md`, peça 3b.
 */

export type ItemComoLer = {
  titulo: string;
  texto: string;
  /** Uma seção da `/ajuda/` que explica mais, se houver. */
  ajuda?: { ancora: string; rotulo: string };
};

export type TipoDePagina = "municipio" | "estado" | "brasil" | "ranking";

const FONTE: ItemComoLer = {
  titulo: "A fonte e a data ficam junto do número",
  texto: "Abaixo de cada número está de onde ele veio e quando foi coletado. O link da fonte abre o dado original.",
  ajuda: { ancora: "quando", rotulo: "De quando são os dados" },
};

const TRAVESSAO: ItemComoLer = {
  titulo: "“—” quer dizer que a fonte não tem o número",
  texto: "Nunca quer dizer zero. A página diz por que falta: relatório que não está na fonte, município sem rede própria, ou dado que a fonte não publica.",
  ajuda: { ancora: "travessao", rotulo: "Por que aparece “—”" },
};

const TERMOS: ItemComoLer = {
  titulo: "Palavra com sublinhado pontilhado tem explicação",
  texto: "Clique ou toque nela: a explicação abre ali mesmo, sem sair da página. Esc ou um toque fora fecha.",
  ajuda: { ancora: "glossario", rotulo: "Glossário de A a Z" },
};

export const COMO_LER: Record<TipoDePagina, ItemComoLer[]> = {
  municipio: [
    {
      titulo: "O topo resume",
      texto: "Os cartões do alto trazem população, PIB, PIB por habitante e gasto com pessoal. As seções abaixo explicam cada um e acrescentam saúde, receita, emendas, educação, Censo e emprego; o “Nesta página” leva direto a cada uma.",
    },
    FONTE,
    TRAVESSAO,
    {
      titulo: "A régua é o estado",
      texto: "Para dizer se um número é alto ou baixo, a página o compara com a mediana dos municípios do mesmo estado: metade deles fica abaixo dela, metade acima.",
      ajuda: { ancora: "mediana", rotulo: "O que é a mediana" },
    },
    TERMOS,
    {
      titulo: "Tudo se baixa",
      texto: "No fim da página, “Baixar estes dados” traz os números deste município em planilha, com a fonte de cada coluna.",
      ajuda: { ancora: "baixar", rotulo: "Como baixar e abrir" },
    },
  ],
  estado: [
    {
      titulo: "O topo soma os municípios",
      texto: "Os cartões do alto são a soma, a média ou a mediana dos municípios do estado, e cada um diz qual das três é.",
      ajuda: { ancora: "mediana", rotulo: "Média e mediana" },
    },
    FONTE,
    TRAVESSAO,
    {
      titulo: "O estado ao lado dos outros",
      texto: "Onde há com o que comparar, a página põe o estado entre os demais: quantos municípios entregaram o relatório fiscal e onde fica a mediana do gasto com pessoal.",
    },
    TERMOS,
    {
      titulo: "Cada município tem página",
      texto: "A lista dos municípios leva à página de cada um, com os números dele e a fonte de cada número.",
    },
  ],
  brasil: [
    {
      titulo: "Cada gráfico é uma série do país",
      texto: "Inteira desde o primeiro dado que a fonte publica naquela forma, e todos no mesmo eixo de tempo: o espaço vazio antes de uma série é o período em que ela ainda não existia.",
    },
    {
      titulo: "As faixas ao fundo não medem efeito",
      texto: "Mostram quem ocupava a Presidência em cada período. Estas séries se movem por muitos fatores, e nenhum gráfico separa um do outro.",
      ajuda: { ancora: "brasil", rotulo: "Como ler o Brasil ao longo do tempo" },
    },
    {
      titulo: "O selo diz para que lado a série melhora",
      texto: "“Mais alto é melhor” ou “Mais baixo é melhor” quando há um lado; na inflação, “Melhor dentro da faixa da meta”; e “Nenhum lado é melhor por si” quando o número não tem direção boa.",
    },
    FONTE,
    TERMOS,
  ],
  ranking: [
    {
      titulo: "O que a lista mostra",
      texto: "Os municípios cujo gasto com pessoal declarado passou do teto que a Lei de Responsabilidade Fiscal impõe ao Executivo municipal, em percentual da receita corrente líquida ajustada, do maior para o menor.",
      ajuda: { ancora: "pessoal", rotulo: "Gasto com pessoal e os limites" },
    },
    {
      titulo: "Sem o relatório, o município não está na lista",
      texto: "Sem o relatório quadrimestral no SICONFI não há número. Ficar fora da lista não quer dizer estar dentro do limite.",
      ajuda: { ancora: "travessao", rotulo: "Por que falta o número" },
    },
    {
      titulo: "Filtre pelo estado",
      texto: "O filtro acima da tabela mostra só os municípios de um estado; o nome de cada município leva à página dele. As declarações implausíveis ficam numa lista à parte, abaixo.",
    },
    FONTE,
    TERMOS,
  ],
};
