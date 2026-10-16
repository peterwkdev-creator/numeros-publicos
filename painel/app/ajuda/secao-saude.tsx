import type { Contexto } from "./contexto";

/**
 * Saúde: o mínimo da Constituição e o SIOPS.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoSaude({ ctx }: { ctx: Contexto }) {
  const { estilos } = ctx;
  return (
    <section className={estilos.bloco} id="saude">
      <h2>Saúde: o mínimo da Constituição e o SIOPS</h2>
      <p>
        A Constituição obriga o município a aplicar em ações e serviços
        públicos de saúde <strong>ao menos 15% da receita de impostos</strong>.
        Quanto cada um aplicou é ele mesmo que declara, ano a ano, ao{" "}
        <strong>SIOPS</strong>, o sistema do Ministério da Saúde. É de lá o
        percentual da seção de saúde, com a série de cada município desde
        2000, ou desde o primeiro ano que ele declarou.
      </p>
      <p>
        <strong>O mínimo não foi sempre 15%.</strong> A Emenda Constitucional
        29, de 2000, começou exigindo 7% e deu aos municípios até 2004 para
        chegar aos 15%. Entre 2001 e 2003 o piso de cada um dependia de onde
        ele tinha partido, e não há uma régua comum. Por isso a página só
        compara com os 15% os anos a partir de 2004.
      </p>
      <p>
        O Distrito Federal declara ao SIOPS como estado, e por isso não tem a
        série municipal.
      </p>
    </section>
  );
}
