import { arquivoDoIndicador, INDICADORES_EXPLORAR } from "@/lib/explorar";
import { lerCaged, lerEmendas, lerFiscal, lerIdeb, lerSnapshot } from "@/lib/servidor";

/**
 * Um arquivo por indicador da página /explorar, buscado só por ela.
 *
 * O formato e as razões estão em `lib/explorar.ts`. Como no `indice.json`,
 * nenhum `Cache-Control` aqui: com `output: "export"` isto vira arquivo, e o
 * cache se decide em `cloudflare/_headers`.
 */
export const dynamic = "force-static";

export function generateStaticParams() {
  return INDICADORES_EXPLORAR.map((i) => ({ indicador: i.chave }));
}

export async function GET(
  _pedido: Request,
  { params }: { params: Promise<{ indicador: string }> },
) {
  const { indicador } = await params;
  const ind = INDICADORES_EXPLORAR.find((i) => i.chave === indicador);
  if (!ind) return new Response("indicador desconhecido", { status: 404 });
  const [snapshot, fiscal, ideb, idebFinais, caged, emendas] = await Promise.all([
    lerSnapshot(), lerFiscal(), lerIdeb("anos_iniciais"), lerIdeb("anos_finais"),
    lerCaged(), lerEmendas(),
  ]);
  const fontes = { snapshot, fiscal, ideb, idebFinais, caged, emendas };
  return new Response(JSON.stringify(arquivoDoIndicador(ind, fontes)), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
