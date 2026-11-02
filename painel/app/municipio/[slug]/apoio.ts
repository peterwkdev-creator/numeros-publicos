import { expandir } from "../../../lib/dados";
import { indexarFiscal, slugDe } from "../../../lib/fiscal";
import { lerCaged, lerCagedAnos, lerEmendas, lerFiscal, lerIdeb, lerPix, lerRegioes, lerSimei, lerSnapshot } from "../../../lib/servidor";

/**
 * Os dados do build, lidos uma vez e compartilhados por todas as páginas de município.
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 */
export async function carregar() {
  const [snapshot, fiscal, ideb, idebFinais, caged, cagedAnos, emendas, regioes, simei, pix] = await Promise.all([
    lerSnapshot(), lerFiscal(), lerIdeb("anos_iniciais"), lerIdeb("anos_finais"),
    lerCaged(), lerCagedAnos(), lerEmendas(), lerRegioes(), lerSimei(), lerPix(),
  ]);
  const porCodigo = indexarFiscal(fiscal);
  const municipios = expandir(snapshot).map((m) => ({
    ...m,
    slug: slugDe(m.nome, m.uf),
    fiscal: porCodigo.get(m.codigo) ?? null,
  }));
  return { snapshot, fiscal, ideb, idebFinais, caged, cagedAnos, emendas, regioes, simei, pix, municipios };
}

export type Dados = Awaited<ReturnType<typeof carregar>>;
export type Municipio = Dados["municipios"][number];
