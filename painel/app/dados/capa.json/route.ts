import { INDICADORES_DA_CAPA, projetar } from "@/lib/dados";
import { faixasEmLinha } from "@/lib/fiscal";
import { lerFiscal, lerSnapshot } from "@/lib/servidor";

/**
 * As 5.571 linhas da tabela de municípios da capa, para filtrar no navegador.
 *
 * ## Por que um arquivo, e não as linhas dentro da capa
 *
 * Até 15/10/2026 elas iam nas props do único componente de cliente do site, e
 * a capa pesava 626 KB de HTML (174 KB comprimidos) mais o runtime do React,
 * para toda visita. Quase ninguém filtra: quem chega lê o resumo do país e
 * segue para um estado ou um município. Como o `indice.json` da busca, este
 * arquivo é buscado **na primeira interação com a tabela** e custa zero para
 * quem não a usa (item 10 da revisão de 11/10).
 *
 * ## O formato
 *
 * - `codigos`: os indicadores, na ordem das colunas. O `capa.js` os compara
 *   com os cabeçalhos da página e, se não baterem (página de um build e JSON
 *   de outro, no meio de uma publicação), desiste e deixa a tabela estática:
 *   melhor não filtrar do que pôr o PIB na coluna da população.
 * - `linhas`: as de `projetar`, em array de arrays, sem repetir chave.
 * - `faixas`: uma letra por linha (`faixasEmLinha`), na mesma ordem.
 *
 * O slug não vai: o `capa.js` usa o `slugDe` do `busca.js`, conferido nos
 * 5.571 nomes por teste.
 */
export const dynamic = "force-static";

export async function GET() {
  const [snapshot, fiscal] = await Promise.all([lerSnapshot(), lerFiscal()]);
  const capa = projetar(snapshot, INDICADORES_DA_CAPA);
  const corpo = {
    codigos: capa.indicadores.map((i) => i.codigo),
    linhas: capa.linhas,
    faixas: faixasEmLinha(capa.linhas, fiscal),
  };
  // Sem `Cache-Control`: com `output: "export"` isto vira arquivo, e o cache
  // se decide em `cloudflare/_headers` (ver o `indice.json`).
  return new Response(JSON.stringify(corpo), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
