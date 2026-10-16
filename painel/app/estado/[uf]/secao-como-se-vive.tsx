import TabelaCenso from "../../componentes/tabela-censo";
import Termo from "../../componentes/termo";
import { emContracao } from "../../../lib/estado";
import type { Contexto } from "./contexto";

/**
 * O Censo 2022 somado no estado, contra a mesma conta no país.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoComoSeVive({ c }: { c: Contexto }) {
  const { r, de, medidasCenso, taxasPais, estilos } = c;
  if (!(medidasCenso.some((x) => x.percentual !== null))) return null;
  return (
    <section className={estilos.texto} id="como-se-vive">
      <h2>Como se vive {emContracao(de)}</h2>
      <p>
        Do <strong><Termo chave="censo">Censo de 2022</Termo></strong>, somando os municípios do estado.
        A coluna do Brasil é a <strong>mesma conta no país inteiro</strong> —
        as duas são proporção de domicílios ou de pessoas, então comparam
        diretamente.
      </p>
      <TabelaCenso
        medidas={medidasCenso}
        comparacoes={[{ rotulo: "No Brasil", valores: taxasPais }]}
        rotuloValor={r.uf.nome}
        legenda={`${r.uf.nome} no Censo 2022, com o Brasil ao lado`}
      />
      <p className={estilos.ressalva}>
        {/* A distincao que a pagina do municipio precisa fazer (mediana de
            municipios contra taxa do pais) NAO se aplica aqui: as duas
            colunas sao taxa ponderada, e comparam direto. Dizer o contrario
            so para repetir a ressalva de la seria ruido. */}
        Estes números somam os municípios do estado — não são média das
        proporções municipais, que daria a uma cidade de 3 mil habitantes o
        mesmo peso da capital. Fonte: IBGE, Censo Demográfico 2022, pelas
        APIs públicas de agregados.
      </p>
    </section>
  );
}
