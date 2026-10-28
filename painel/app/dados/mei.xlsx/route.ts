import { expandir } from "../../../lib/dados";
import { lerSimei, lerSnapshot, SITE } from "../../../lib/servidor";
import { cabecalhoMei, dataBr, linhasMei, NOTA_AUSENCIA } from "../../../lib/simei";
import { cabecalhosXlsx, xlsx, type Aba } from "../../../lib/xlsx";

/**
 * Os MEI optantes pelo SIMEI como planilha: a mesma série do `mei.csv`, com
 * número como número, e as duas abas que o CSV não tem (dicionário e
 * procedência). Célula vazia é ausência na fonte, nunca zero, e o dicionário
 * diz isso. Um arquivo só para o país: ver `mei.csv/route.ts`.
 */
export const dynamic = "force-static";

export async function GET() {
  const [snapshot, simei] = await Promise.all([lerSnapshot(), lerSimei()]);
  const cabecalho = cabecalhoMei(simei, "xlsx");

  const dicionario: Aba = {
    nome: "Dicionário",
    larguras: [34, 80],
    linhas: [
      ["Coluna", "O que é"],
      ["Código IBGE", "O identificador do município no IBGE."],
      ["MEI em 31/12/AAAA",
       "Quantos microempreendedores individuais estavam enquadrados no SIMEI " +
       "(o sistema de valores fixos mensais do Simples Nacional) no município, " +
       `naquela data, na posição consolidada até ${dataBr(simei.posicao)}: ` +
       "a Receita pode mudar o passado numa consulta futura. 2009 é meio ano " +
       "(o MEI começou em 01/07/2009)."],
      [cabecalho[cabecalho.length - 1]!,
       "O mesmo, na data da posição consolidada mais recente."],
      ["Célula vazia", NOTA_AUSENCIA + "."],
    ],
  };
  const procedencia: Aba = {
    nome: "Procedência",
    larguras: [34, 90],
    linhas: [
      ["Campo", "Valor"],
      ["Fonte", simei.fonte],
      ["Endereço da consulta", simei.origem],
      ["Posição consolidada", dataBr(simei.posicao)],
      ["Coletado em", simei.coletadoEm.slice(0, 10)],
      ["Licença dos dados", simei.licenca],
      ["Mapa de Empresas",
       "Não é a mesma conta: o Mapa de Empresas conta só os MEI ativos, e só no total do país."],
      ["Site", SITE],
    ],
  };
  const arquivo = xlsx([
    {
      nome: "MEI",
      larguras: [12, 30, 6, ...simei.datas.map(() => 14)],
      linhas: [cabecalho, ...linhasMei(simei, expandir(snapshot), "xlsx")],
    },
    dicionario,
    procedencia,
  ]);
  return new Response(new Uint8Array(arquivo), {
    headers: cabecalhosXlsx("numerospublicos-mei.xlsx"),
  });
}
