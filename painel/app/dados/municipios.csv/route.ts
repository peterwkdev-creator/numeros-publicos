import { expandir } from "../../../lib/dados";
import { cabecalhosCsv, paraCsv } from "../../../lib/csv";
import { funcoesDe, indexarFiscal, receitaDe } from "../../../lib/fiscal";
import { lerFiscal, lerSnapshot } from "../../../lib/servidor";
import { atualDeFuncoes, atualDeReceita } from "@/lib/fiscal";

/**
 * A base inteira num arquivo: 5.571 municípios, uma linha cada.
 *
 * O CSV por município serve a quem olha uma cidade; este serve a quem quer
 * comparar todas — jornalista, pesquisador, ou alguém conferindo se o painel
 * está mentindo. É o download que torna o resto verificável.
 *
 * Formato largo aqui, ao contrário do CSV por município: quem baixa a base
 * inteira quer uma linha por município para ordenar e filtrar direto.
 */
export const dynamic = "force-static";

export async function GET() {
  const [snapshot, fiscal] = await Promise.all([lerSnapshot(), lerFiscal()]);
  const porCodigo = indexarFiscal(fiscal);

  const indicadores = snapshot.indicadores;
  const cabecalho = [
    "codigo_ibge", "municipio", "uf",
    ...indicadores.map((i) => i.codigo),
    // O PAR que produz o percentual entra ao lado dele, pela mesma regra do
    // Censo: a proporção sozinha esconde o tamanho, e 60,64% não distingue uma
    // prefeitura de R$ 1,2 bilhão de uma de R$ 12 milhões. Aqui pesa mais que
    // na tela — **o arquivo viaja sem a explicação da página**, e é ele que
    // alguém republica. Mesma lição do `pessoal_publicou` de Brasília.
    "pessoal_pct_rcl", "pessoal_despesa", "pessoal_rcl_ajustada",
    "pessoal_limite_prudencial", "pessoal_publicou",
    "pessoal_exercicio", "pessoal_periodo",
    // Da despesa por função entram só o total e as duas maiores. As 28 viriam
    // com ~20 colunas vazias por linha para a maioria dos municípios, e quem
    // quiser a decomposição inteira tem o CSV do município, que é longo e a
    // traz completa. Aqui o que se quer é **comparar** 5.571 linhas.
    "despesa_liquidada_total", "despesa_educacao", "despesa_saude",
    "despesa_exercicio", "despesa_periodo",
    // Da receita entram o total e as duas origens que a página nomeia. **Elas
    // NAO somam o total** -- ha seis outras componentes --, e o dicionario diz
    // isso, porque aqui a tentacao de somar duas colunas e o total e maior que
    // na tela. O detalhe (impostos, taxas, transferencias por origem) fica so
    // no CSV do municipio, que e longo: ali cada linha se explica sozinha.
    "receita_corrente_total", "receita_transferencias", "receita_impostos_taxas",
    "receita_exercicio", "receita_periodo",
  ];

  // `undefined` quando o município não entregou o RREO. Vira campo vazio no
  // CSV, e não zero: "não entregou" e "gastou nada" não podem colapsar na
  // mesma célula.
  const acha = (
    fn: ReturnType<typeof funcoesDe>,
    nome: string,
  ): number | null => fn?.fatias.find((x) => x.nome === nome)?.valor ?? null;

  const linhas = expandir(snapshot).map((m) => {
    const f = porCodigo.get(m.codigo);
    const fn = funcoesDe(fiscal, m.codigo);
    // `receitaDe`, nunca `receitaRecenteDe`: numa linha por municipio, recuar
    // publicaria 2024 numa coluna e 2021 na vizinha sem nada avisar.
    const rc = receitaDe(fiscal, m.codigo);
    return [
      m.codigo, m.nome, m.uf,
      ...indicadores.map((i) => m.valores[i.codigo] ?? null),
      f?.percentual ?? null,
      // Vazio quando a fonte não publica a linha — são 91 os municípios com
      // despesa e sem RCL. Célula vazia e não zero, pela regra de sempre.
      f?.despesa ?? null,
      f?.rclAjustada ?? null,
      f?.limitePrudencial ?? null,
      // `publicou` distingue "não entregou" de "não consultado", e essa
      // diferença tem de sobreviver ao download. Vazio seria as duas coisas.
      //
      // E há um terceiro caso, que era publicado como `nao`: quem presta
      // contas COMO ESTADO. Escrever `nao` ali é afirmar que o ente não
      // prestou contas — falso, e num arquivo que viaja sem a explicação da
      // página, o que é pior que na tela. Ver `PRESTA_COMO_ESTADO`.
      f?.faixa === "como-estado"
        ? "presta_contas_como_estado"
        : f?.publicou === null || f?.publicou === undefined
          ? "nao_consultado"
          : f.publicou ? "sim" : "nao",
      fiscal.exercicio, fiscal.periodo,
      fn?.total ?? null,
      acha(fn, "Educação"),
      acha(fn, "Saúde"),
      fiscal.funcoes ? atualDeFuncoes(fiscal.funcoes)?.exercicio ?? null : null,
      fiscal.funcoes?.periodo ?? null,
      rc?.total ?? null,
      rc?.transferida ?? null,
      rc?.tributaria ?? null,
      fiscal.receita ? atualDeReceita(fiscal.receita)?.exercicio ?? null : null,
      fiscal.receita?.periodo ?? null,
    ];
  });

  return new Response(paraCsv(cabecalho, linhas), {
    headers: cabecalhosCsv("numerospublicos-municipios.csv"),
  });
}
