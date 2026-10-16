import { br } from "../../../lib/dados";
import { slugUf } from "../../../lib/estado";
import type { Contexto } from "./contexto";

/**
 * Os links de download do estado e da base completa.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoBaixar({ c }: { c: Contexto }) {
  const { snapshot, r, de, estilos } = c;
  return (
    <section className={estilos.texto} id="baixar">
      <h2>Baixar estes dados</h2>
      <ul className={estilos.downloads}>
        <li>
          <a href={`/estado/${slugUf(r.uf.sigla)}/dados.csv`} download>
            Municípios {de} em CSV
          </a>{" "}
          <span className={estilos.fonte}>— uma linha por município</span>
        </li>
        <li>
          <a href="/dados/municipios.xlsx" download>
            Base completa em planilha
          </a>{" "}
          <span className={estilos.fonte}>
            — os {br(snapshot.municipios.length)} municípios do país, com
            dicionário de colunas e procedência
          </span>
        </li>
        <li>
          <a href="/dados/municipios.csv" download>A mesma base em CSV</a>{" "}
          <span className={estilos.fonte}>— para ler por programa</span>
        </li>
      </ul>
    </section>
  );
}
