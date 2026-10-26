import { lerEleicoes } from "@/lib/eleicoes";
import { lerCargos } from "@/lib/eleicoes-cargos";
import { montarMacro } from "@/lib/eleicoes-macro";

/**
 * A dica e o cartão de cada estado em cada cargo do mapa de `/eleicoes-2026/`
 * (26/10/2026).
 *
 * ## Por que um arquivo, e não `data-*` na página
 *
 * A cor de cada estado vai no próprio mapa (`data-c-<cargo>`, seis palavras
 * por estado): trocar de cargo funciona mesmo se este arquivo falhar. Já a
 * dica e o cartão são seis cargos × 27 estados de texto, só úteis para quem
 * passa o cursor ou clica; dentro do HTML, pesariam a página para toda visita
 * e para o buscador. Como o `capa.json`, o `public/eleicoes-macro.js` o busca
 * uma vez e o navegador o guarda.
 *
 * `cargos` repete a ordem dos botões: o script a compara com a da página e,
 * se não bater (página de um build e arquivo de outro), não abre cartão em
 * vez de abrir o de outro cargo.
 */
export const dynamic = "force-static";

export async function GET() {
  const [e, c] = await Promise.all([lerEleicoes(), lerCargos()]);
  const macro = montarMacro(e, c);
  const corpo = {
    cargos: macro.map((m) => m.chave),
    ufs: Object.fromEntries(macro.map((m) => [m.chave, m.ufs])),
  };
  return Response.json(corpo);
}
