import { br } from "../../lib/dados";
import { anteriorDeFuncoes, atualDeFuncoes } from "../../lib/fiscal";
import type { Contexto } from "./contexto";

/**
 * Por que a comparação é entre anos.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoComparacao({ ctx }: { ctx: Contexto }) {
  const { c, f, estilos } = ctx;
  return (
    <section className={estilos.bloco} id="comparacao">
      <h2>Por que a comparação é entre anos, e não entre bimestres</h2>
      <p>
        Porque o relatório é <strong>acumulado</strong>. O 6º bimestre já
        contém o 4º — medindo os {br(c.publicaram)} municípios que publicaram
        os dois, <strong>63% do valor do 6º bimestre é literalmente o do
        4º</strong>. Compará-los seria comparar um número com ele mesmo mais
        um pedaço, e a fatia de cada função mal se moveria: menos de um ponto
        percentual, na mediana.
      </p>
      <p>
        Entre o mesmo bimestre de dois anos diferentes, os períodos não se
        sobrepõem, e a mudança é real. É por isso que a página compara{" "}
        {f && anteriorDeFuncoes(f)
          ? `${anteriorDeFuncoes(f)!.exercicio}/${f.periodo} com ` +
            `${atualDeFuncoes(f)!.exercicio}/${f.periodo}`
          : "o mesmo bimestre de dois anos"}.
      </p>
      <p>
        E a página só chama de mudança um deslocamento de{" "}
        <strong>1 ponto percentual ou mais</strong>. Abaixo disso ela diz que
        ficou praticamente igual — descrever movimento de meio ponto como
        tendência seria vender ruído como descoberta.
      </p>
    </section>
  );
}
