import ComposicaoBarras from "../../componentes/composicao-barras";
import { br, escala } from "../../../lib/dados";
import { emContracao } from "../../../lib/estado";
import type { Contexto } from "./contexto";

/**
 * A despesa por função, somada nos municípios do estado.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoParaOndeVai({ c }: { c: Contexto }) {
  const { r, de, bimestre, estilos } = c;
  if (!(r.funcoes)) return null;
  return (
    <section className={estilos.texto} id="para-onde-vai">
      <h2>Para onde vai o dinheiro {de}</h2>
      <p>
        No {bimestre}, os <strong>{br(r.funcoes.municipios)}</strong>{" "}
        municípios que entregaram o relatório liquidaram{" "}
        <strong>{escala(r.funcoes.total).curto}</strong> de despesa. A soma
        é de valores absolutos, não a média das fatias: dar o mesmo peso a
        uma capital e a um município de três mil habitantes descreveria uma
        média, não o estado.
      </p>
      <div className={`${estilos.rolagem} rola-x`}>
        <ComposicaoBarras
          fatias={r.funcoes.fatias}
          total={r.funcoes.total}
          municipio={r.uf.nome}
          local={emContracao(de)}
        />
      </div>
    </section>
  );
}
