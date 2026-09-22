import { expandir } from "../../../lib/dados";
import { funcoesDe, indexarFiscal, receitaDe, ROTULO_FAIXA } from "../../../lib/fiscal";
import { trajetoriaDe } from "../../../lib/ideb";
import { lerFiscal, lerIdeb, lerSnapshot, SITE } from "../../../lib/servidor";
import { cabecalhosXlsx, xlsx, type Aba } from "../../../lib/xlsx";
import { rotuloDownload } from "../../../lib/censo";

/**
 * A base inteira como planilha do Excel.
 *
 * O CSV já existe e continua: ele serve quem programa. Este serve o público
 * real do site — vereador, jornalista, servidor de prefeitura — que abre
 * planilha, não arquivo de texto.
 *
 * ## O que a planilha tem e o CSV não
 *
 * **Número é número.** Num CSV, uma escolha errada de separador na importação
 * transforma toda a coluna em texto: aí a soma não fecha, o gráfico não sai, e
 * nada avisa. Aqui o Excel recebe o tipo pronto.
 *
 * **Três abas, e as duas últimas são o motivo de isto existir.** A de dados
 * responde "quanto"; a de dicionário responde "o que é esta coluna"; a de
 * procedência responde "de onde veio e quando". Num CSV essas duas respostas
 * teriam de virar um segundo arquivo que ninguém baixa junto — e um número sem
 * procedência é exatamente o que este site existe para não produzir.
 *
 * **Cabeçalho congelado.** Com 5.571 linhas, rolar sem cabeçalho é adivinhar
 * de qual coluna é o número que se está olhando.
 */
export const dynamic = "force-static";

export async function GET() {
  const [snapshot, fiscal, ideb, idebFinais] = await Promise.all([
    lerSnapshot(), lerFiscal(), lerIdeb("anos_iniciais"), lerIdeb("anos_finais"),
  ]);
  const porCodigo = indexarFiscal(fiscal);
  const municipios = expandir(snapshot);
  const ind = snapshot.indicadores;

  const cabecalho = [
    "Código IBGE", "Município", "UF",
    // `rotuloDownload` e nao `i.nome`: quatro indicadores do Censo compartilham
    // a variavel "Domicilios particulares permanentes ocupados", e a planilha
    // sairia com quatro colunas de cabecalho identico, lado a lado.
    ...ind.map((i) => rotuloDownload(i.codigo, i.nome)),
    // O par que produz o percentual entra ao lado dele. Numa planilha isso
    // vale ainda mais que na tela: quem abre o arquivo ordena e compara, e
    // "60,64%" não diz se a prefeitura move R$ 1,2 bilhão ou R$ 12 milhões.
    "Pessoal / RCL ajustada (%)", "Despesa com pessoal (R$)",
    "RCL ajustada (R$)", "Limite prudencial (%)", "Situação",
    "Despesa liquidada total (R$)", "Educação (R$)", "Saúde (R$)",
    "Receita corrente total (R$)", "Transferências correntes (R$)",
    "Impostos, taxas e contribuição de melhoria (R$)",
    "IDEB anos iniciais", "IDEB anos finais",
  ];

  const linhas = municipios.map((m) => {
    const f = porCodigo.get(m.codigo);
    const fn = funcoesDe(fiscal, m.codigo);
    // `receitaDe` e nao `receitaRecenteDe`: numa linha por municipio, recuar
    // poria anos diferentes em colunas vizinhas sem nada avisar.
    const rc = receitaDe(fiscal, m.codigo);
    const acha = (nome: string) =>
      fn?.fatias.find((x) => x.nome === nome)?.valor ?? null;
    return [
      m.codigo, m.nome, m.uf,
      ...ind.map((i) => m.valores[i.codigo] ?? null),
      f?.percentual ?? null,
      // Vazio, nunca zero: são 91 os municípios com despesa e sem RCL, porque
      // a fonte não publica a linha.
      f?.despesa ?? null,
      f?.rclAjustada ?? null,
      f?.limitePrudencial ?? null,
      // A situação vai por extenso, e não como código: quem abre a planilha
      // não tem a legenda ao lado, e "sem-dado" não se explica sozinho.
      ROTULO_FAIXA[f?.faixa ?? "nao-consultado"],
      fn?.total ?? null,
      acha("Educação"),
      acha("Saúde"),
      rc?.total ?? null,
      rc?.transferida ?? null,
      rc?.tributaria ?? null,
      trajetoriaDe(ideb, m.codigo)?.ultimo.observado ?? null,
      trajetoriaDe(idebFinais, m.codigo)?.ultimo.observado ?? null,
    ];
  });

  const dicionario: Aba = {
    nome: "Dicionário",
    larguras: [30, 62, 16, 30],
    linhas: [
      ["Coluna", "O que é", "Unidade", "Fonte"],
      ["Código IBGE", "O identificador do município no IBGE. É a chave que une as três fontes.", "—", "IBGE"],
      ...ind.map((i) => [
        i.nome,
        `Período ${i.periodo}. Agregado ${i.agregado}, variável ${i.variavel}.`,
        i.unidade,
        "IBGE",
      ]),
      ["Pessoal / RCL ajustada (%)",
       "O percentual da receita corrente líquida ajustada comprometido com pessoal, como o próprio município declarou. NÃO é recalculado aqui.",
       "%", "SICONFI — RGF Anexo 01"],
      ["Despesa com pessoal (R$)",
       "O numerador do percentual ao lado, em reais, como o município declarou. É a despesa com pessoal do Executivo no período.",
       "R$", "SICONFI — RGF Anexo 01"],
      ["RCL ajustada (R$)",
       "O denominador do percentual, em reais: a arrecadação do município menos as transferências que ele é obrigado a repassar, com os ajustes da Lei de Responsabilidade Fiscal. É a ajustada, não a bruta.",
       "R$", "SICONFI — RGF Anexo 01"],
      ["Limite prudencial (%)",
       "95% do teto legal. Passar dele já proíbe criar cargo, conceder aumento e contratar.",
       "%", "Lei de Responsabilidade Fiscal"],
      ["Situação",
       "Onde o município cai em relação aos limites. Três ausências diferentes, que NÃO devem ser lidas como a mesma coisa: \"Ainda não consultado\" é afirmação sobre a coleta; \"Sem relatório entregue\" é sobre o município; \"Presta contas como estado\" é sobre a esfera — o Distrito Federal entrega o relatório, na esfera estadual, porque não é um município.",
       "—", "calculado"],
      ["Despesa liquidada total (R$)",
       "O que de fato foi gasto no exercício até o bimestre — não o orçado nem o empenhado. Acumulado no ano.",
       "R$", "SICONFI — RREO Anexo 02"],
      ["Educação (R$)", "Despesa liquidada na função orçamentária Educação.", "R$", "SICONFI — RREO Anexo 02"],
      ["Saúde (R$)", "Despesa liquidada na função orçamentária Saúde.", "R$", "SICONFI — RREO Anexo 02"],
      ["Receita corrente total (R$)",
       "O que de fato entrou no caixa até o bimestre, acumulado no ano — não o que foi orçado. Só receita CORRENTE: não inclui empréstimos nem venda de bens, que são receita de capital e não custeiam o dia a dia.",
       "R$", "SICONFI — RREO Anexo 01"],
      ["Transferências correntes (R$)",
       "O que a União, o estado e os fundos repassam. É a maior origem na esmagadora maioria dos municípios brasileiros.",
       "R$", "SICONFI — RREO Anexo 01"],
      ["Impostos, taxas e contribuição de melhoria (R$)",
       "O que o próprio município cobra de quem mora e trabalha nele. ATENÇÃO: esta coluna e a anterior NÃO somam a receita corrente total — há outras seis origens (contribuições, patrimonial, agropecuária, industrial, serviços e outras receitas correntes) que não cabem nesta planilha. Para a decomposição completa, use o CSV de cada município.",
       "R$", "SICONFI — RREO Anexo 01"],
      ["IDEB anos iniciais", "Índice da rede MUNICIPAL, 1º ao 5º ano. Escala de 0 a 10.", "índice", "INEP"],
      ["IDEB anos finais",
       "Índice da rede MUNICIPAL, 6º ao 9º ano. NÃO se compara com os anos iniciais: provas e escalas próprias.",
       "índice", "INEP"],
      [],
      ["Célula vazia", "Significa AUSÊNCIA, nunca zero. O dado não existe na fonte.", "—", "—"],
    ],
  };

  const f = fiscal.funcoes;
  const procedencia: Aba = {
    nome: "Procedência",
    larguras: [34, 46, 22],
    linhas: [
      ["Fonte", "O que traz", "Coletado em"],
      [snapshot.fonte, "População, PIB e estimativa populacional", snapshot.geradoEm.slice(0, 10)],
      [fiscal.fonte,
       `Despesa com pessoal, ${fiscal.periodo}º quadrimestre de ${fiscal.exercicio}`,
       fiscal.coletadoEm?.slice(0, 10) ?? "—"],
      // A serie inteira, uma linha por exercicio: a procedencia tem de dizer
      // de QUANDO e cada numero, e um so ano esconderia os outros quatro.
      ...(f ? f.exercicios.map((e) => [
        f.fonte,
        `Despesa por função, ${f.periodo}º bimestre de ${e.exercicio}`,
        e.coletadoEm?.slice(0, 10) ?? "—",
      ]) : []),
      [ideb.fonte, `IDEB da rede municipal, edições ${ideb.edicoes[0]} a ${ideb.edicoes[ideb.edicoes.length - 1]}`,
       ideb.coletadoEm?.slice(0, 10) ?? "—"],
      [],
      ["Cobertura", "", ""],
      ["Municípios no IBGE", fiscal.cobertura.municipiosIbge, ""],
      ["Consultados no SICONFI", fiscal.cobertura.consultados, ""],
      ["Entregaram o relatório fiscal", fiscal.cobertura.publicaram, ""],
      ["Com rede municipal (anos iniciais)", ideb.cobertura.municipios, ""],
      [],
      ["Licença", "AGPL-3.0. Os dados de origem são públicos.", ""],
      ["Site", SITE, ""],
      ["Como conferir", "Cada número tem a sua página no site, com a fonte ao lado.", ""],
    ],
  };

  const arquivo = xlsx([
    {
      nome: "Municípios",
      larguras: [12, 26, 6, 16, 16, 16, 14, 14, 26, 20, 16, 16, 12, 12],
      linhas: [cabecalho, ...linhas],
    },
    dicionario,
    procedencia,
  ]);

  return new Response(new Uint8Array(arquivo), {
    headers: cabecalhosXlsx("numerospublicos-municipios.xlsx"),
  });
}
