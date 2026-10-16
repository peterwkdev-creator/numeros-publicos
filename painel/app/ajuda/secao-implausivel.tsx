import { br, inteiroImpresso } from "../../lib/dados";
import { LIMITE_PLAUSIVEL } from "../../lib/fiscal";
import type { Contexto } from "./contexto";

/**
 * O que quer dizer "valor implausível".
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoImplausivel({ ctx }: { ctx: Contexto }) {
  const { declarados, plausiveis, implausiveis, desmentidos, medi, deslocamento, estilos } = ctx;
  return (
    <section className={estilos.bloco} id="implausivel">
      <h2>O que quer dizer “valor implausível”</h2>
      <p>
        É a marca que aparece quando o município declarou um percentual que
        nenhuma prefeitura pode ter: acima de {LIMITE_PLAUSIVEL}% (gastaria
        com pessoal mais do que toda a sua receita) ou abaixo de zero (gasto
        negativo).
      </p>
      <p>
        Os dois casos existem no dado real de 2024. Guaratinga/BA declarou{" "}
        <strong>371,02%</strong>; Paripueira/AL declarou despesa negativa e,
        portanto, <strong>−19,35%</strong>. Não descrevem prefeituras em
        crise: descrevem formulários preenchidos errado.
      </p>
      <p>
        E há um terceiro caso, que o percentual sozinho não revela: ele pode
        estar entre 0 e 100% e ainda assim não descrever a prefeitura, quando
        foi calculado sobre uma receita corrente líquida que{" "}
        <strong>o próprio município desmente</strong>. Ele declara a receita
        em dois relatórios diferentes, e no país inteiro as duas declarações
        batem — a mediana da razão entre elas é 1,04. Quando a receita
        corrente passa do dobro da receita líquida usada no cálculo — ou passa
        de 1,4 vez <em>e</em> o percentual saltou mais de 30% sobre a própria
        história do município, que é o salto que uma receita líquida
        subdeclarada produz —, o denominador está baixo demais e o percentual
        sai inflado. Um sinal sozinho não basta: há municípios com a razão
        alta e o percentual de sempre, e municípios cujo percentual subiu com
        a receita batendo — nesses, o número descreve a prefeitura e continua
        valendo.
        Aparecida/SP, que declarou entre 44% e 52% de 2020 até o início de
        2024, declarou 93% no 3º quadrimestre de 2024 — com uma receita
        corrente duas vezes maior que a receita líquida usada na conta. São{" "}
        <strong>{br(desmentidos)}</strong> casos assim na coleta atual.
      </p>
      <p>
        Eles continuam sendo exibidos, e marcados. Corrigir seria inventar
        número; esconder seria escolher quais declarações você pode ver. Mas
        eles <strong>ficam fora das médias</strong>, do ranking e das frases
        de tendência, e o motivo é medido: são{" "}
        <strong>{br(implausiveis)}</strong> declarações implausíveis entre as{" "}
        {br(declarados.length)} entregues, e juntas elas puxam
        a média nacional em <strong>{br(deslocamento, 2)} ponto</strong>
        {inteiroImpresso(deslocamento, 2) >= 2 ? "s" : ""} — de{" "}
        {br(medi(plausiveis), 2)}% para{" "}
        {br(medi(declarados), 2)}%.
      </p>
    </section>
  );
}
