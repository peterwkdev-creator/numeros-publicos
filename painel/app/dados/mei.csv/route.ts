import { expandir } from "../../../lib/dados";
import { cabecalhosCsv, paraCsv } from "../../../lib/csv";
import { lerSimei, lerSnapshot } from "../../../lib/servidor";
import { cabecalhoMei, linhasMei } from "../../../lib/simei";

/**
 * Os MEI optantes pelo SIMEI, todos os municípios e todas as datas (31/12 de
 * cada ano desde 2009 e a posição atual), num CSV largo: uma linha por
 * município, uma coluna por data.
 *
 * Um arquivo só para o país, e não um por município: 5.571 CSVs e 5.571 XLSX
 * a mais passariam do teto de 20.000 arquivos da Cloudflare Pages
 * (`numeros-publicos-peso.md`). A série de cada município também sai, no
 * formato longo, no `dados.csv` da página dele.
 *
 * **Célula vazia é ausência na fonte, nunca zero**, e o arquivo diz isso no
 * cabeçalho, porque viaja sem a página.
 */
export const dynamic = "force-static";

export async function GET() {
  const [snapshot, simei] = await Promise.all([lerSnapshot(), lerSimei()]);
  return new Response(
    paraCsv(cabecalhoMei(simei, "csv"), linhasMei(simei, expandir(snapshot), "csv")),
    { headers: cabecalhosCsv("numerospublicos-mei.csv") },
  );
}
