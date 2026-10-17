import { br, concorda, fracaoDe, maiuscula } from "../../../lib/dados";
import type { Contexto } from "./contexto";

/**
 * Por que nem todo município do estado tem IDEB aqui.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoIdeb({ c }: { c: Contexto }) {
  const { r, semRede, semRedeFinais, de, estilos } = c;
  // O cartão do IDEB dizia "mediana de N municípios" e parava ali. Quem
  // lê supõe lacuna de coleta; não é. O INEP publica por REDE, e onde a
  // prefeitura não administra as escolas não há linha municipal.
  // Verificado, não suposto — ver a nota em `semRede`.
  if (!(semRede > 0 || semRedeFinais > 0)) return null;
  return (
    <section className={estilos.texto} id="ideb">
      <h2>
        {r.uf.municipios === 1
          ? `Por que falta o IDEB do município ${de}`
          : `Por que nem todo município ${de} tem IDEB aqui`}
      </h2>
      <p>
        O INEP publica o IDEB <strong>por rede</strong>, e este site mostra
        a <strong>municipal</strong> — a que a prefeitura administra, e a
        única que pareia com o orçamento dela. Onde as escolas são de outra
        rede, não há número municipal a publicar.
      </p>
      <ul className={estilos.lista}>
        {semRede > 0 && (
          <li>
            <strong>{maiuscula(fracaoDe(semRede, r.uf.municipios))}</strong> {de}{" "}
            {concorda(semRede, r.uf.municipios, "não tem", "não têm")} rede
            municipal nos <strong>anos iniciais</strong> (1º ao 5º).
          </li>
        )}
        {semRedeFinais > 0 && (
          <li>
            <strong>{maiuscula(fracaoDe(semRedeFinais, r.uf.municipios))}</strong>{" "}
            {concorda(semRedeFinais, r.uf.municipios, "não tem", "não têm")}{" "}
            nos <strong>anos finais</strong> (6º ao 9º)
            {r.uf.municipios > 1 &&
              ` — ${br((semRedeFinais * 100) / r.uf.municipios, 0)}% do estado`}
            .
          </li>
        )}
      </ul>
      <p className={estilos.ressalva}>
        <strong>Isto não é lacuna da coleta.</strong> É como a educação
        básica está dividida, e varia muito entre estados: no Paraná{" "}
        <strong>388 dos 399</strong> municípios não têm rede própria nos
        anos finais, enquanto em 16 unidades da federação nenhum município
        fica de fora nos anos iniciais. O gasto municipal com educação
        continua aparecendo — ele existe mesmo onde a rede é de outro ente.
      </p>
    </section>
  );
}
