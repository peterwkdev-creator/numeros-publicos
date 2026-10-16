import { dataCurta, periodoDe } from "../../lib/dados";
import { atualDeFuncoes } from "../../lib/fiscal";
import type { Contexto } from "./contexto";

/**
 * De quando são os dados.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoQuando({ ctx }: { ctx: Contexto }) {
  const { snapshot, fiscal, quadrimestre, f, estilos } = ctx;
  return (
    <section className={estilos.bloco} id="quando">
      <h2>De quando são os dados</h2>
      <p>
        Cada número carrega a data em que foi coletado, ao lado dele, na
        página onde aparece. Não há dado sem procedência neste site.
      </p>
      <ul className={estilos.lista}>
        <li>
          <strong>População e PIB:</strong> IBGE — Censo 2022, estimativa de
          população de {periodoDe(snapshot, "populacao-estimada")} e PIB
          municipal de {periodoDe(snapshot, "pib-municipal")}, a preços
          correntes. A estimativa e o PIB são atualizados quando o IBGE
          publica um ano novo (a estimativa sai em agosto; o PIB, em
          dezembro).
        </li>
        <li>
          <strong>Despesa com pessoal:</strong> SICONFI/Tesouro Nacional, RGF
          Anexo 01, {quadrimestre}
          {fiscal.coletadoEm ? `, coletado em ${dataCurta(fiscal.coletadoEm)}` : ""}.
        </li>
        {f && (
          <li>
            <strong>Despesa por função:</strong> SICONFI/Tesouro Nacional,
            RREO Anexo 02, {f.periodo}º bimestre de{" "}
            {/* A serie inteira, e nao so o ano em destaque: a procedencia
                tem de dizer o intervalo que o dado cobre. */}
            {f.exercicios.length > 1
              ? `${f.exercicios[f.exercicios.length - 1]!.exercicio} a ` +
                `${f.exercicios[0]!.exercicio}`
              : f.exercicios[0]?.exercicio}
            {atualDeFuncoes(f)?.coletadoEm
              ? `, coletado em ${dataCurta(atualDeFuncoes(f)!.coletadoEm)}`
              : ""}.
          </li>
        )}
      </ul>
    </section>
  );
}
