import { cabecalhosCsv, paraCsv } from "../../../../lib/csv";
import { lerBrasil } from "../../../../lib/servidor";

/**
 * Uma série de `/brasil/` em CSV, uma linha por período.
 *
 * O arquivo viaja sem a página, então cada linha leva a unidade, a fonte, o
 * endereço da leitura e a data da coleta. **Não leva quem ocupava a
 * Presidência**: um período que atravessa uma posse (o trimestre de agosto de
 * 2016) não tem um ocupante só, e a coluna obrigaria a escolher. A tabela de
 * quem ocupou o cargo, com as datas, está na página.
 */
export const dynamic = "force-static";

export async function generateStaticParams() {
  const { series } = await lerBrasil();
  return series.map((s) => ({ serie: s.codigo }));
}

export async function GET(
  _pedido: Request,
  { params }: { params: Promise<{ serie: string }> },
) {
  const { serie } = await params;
  const s = (await lerBrasil()).series.find((x) => x.codigo === serie);
  if (!s) return new Response("não encontrado", { status: 404 });

  const cabecalho = [
    "serie", "periodo", "valor", "unidade", "nome_oficial", "fonte",
    "origem", "conferida_por", "coletado_em",
  ];
  const linhas = s.pontos.map(([p, v]) => [
    s.codigo, p, v, s.unidade, s.nome, s.fonte, s.origem, s.conferida,
    s.coletadoEm,
  ]);

  return new Response(paraCsv(cabecalho, linhas), {
    headers: cabecalhosCsv(`brasil-${s.codigo}.csv`),
  });
}
