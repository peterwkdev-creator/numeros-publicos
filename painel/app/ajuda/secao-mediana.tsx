import type { Contexto } from "./contexto";

/**
 * Média, mediana e pontos percentuais.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoMediana({ ctx }: { ctx: Contexto }) {
  const { estilos } = ctx;
  // Os números do exemplo são de brinquedo, escolhidos para a conta ser
  // feita de cabeça; nenhum vem do dado.
  return (
    <section className={estilos.bloco} id="mediana">
      <h2>Média, mediana e pontos percentuais</h2>
      <p>
        A <strong>média</strong> é a soma dividida pela quantidade. A{" "}
        <strong>mediana</strong> é o valor do meio, depois de pôr todos em
        ordem: metade fica abaixo dela, metade acima.
      </p>
      <p>
        Cinco municípios com 20, 30, 40, 45 e 90: a mediana é 40 (o do
        meio) e a média é 45 (225 dividido por 5). Se o último fosse 900 e
        não 90, a média iria a 207, e a mediana continuaria 40. Um valor
        extremo puxa a média; a mediana não se mexe.
      </p>
      <p>
        Por isso, para dizer se um número é alto ou baixo, o site o compara
        com a <strong>mediana dos municípios do mesmo estado</strong>, e não
        com a média: num estado, poucas cidades grandes puxariam a média
        para longe de quase todas as outras.
      </p>
      <p>
        <strong>Pontos percentuais</strong> são a diferença entre dois
        percentuais. Passar de 20% para 25% é subir 5 pontos percentuais —
        e é também um aumento de 25% sobre o valor de partida. As duas
        frases estão certas, e dizem coisas diferentes; o site usa a
        primeira.
      </p>
    </section>
  );
}
