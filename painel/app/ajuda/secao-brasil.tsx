import Link from "next/link";
import type { Contexto } from "./contexto";

/**
 * Como ler o Brasil ao longo do tempo.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 * No mesmo dia, o eixo comum saiu do texto: é o de cada série desde 15/10.
 */
export default function SecaoBrasil({ ctx }: { ctx: Contexto }) {
  const { estilos } = ctx;
  return (
    <section className={estilos.bloco} id="brasil">
      <h2>Como ler o Brasil ao longo do tempo</h2>
      <p>
        <Link href="/brasil/" prefetch={false}>A página do Brasil</Link>{" "}
        reúne séries do país inteiro, cada uma com a sua página, desde o
        primeiro dado que a fonte publica naquela forma e com o próprio eixo de
        tempo. Cada série é lida por dois caminhos da própria fonte, e só entra
        se os dois concordarem.
      </p>
      <ul className={estilos.lista}>
        <li>
          <strong>As faixas ao fundo mostram quem ocupava a Presidência, e
          não medem efeito.</strong> Estas séries se movem por muitos
          fatores, de dentro e de fora do país, e nenhum gráfico separa um do
          outro. Por isso a página não soma, não tira média e não compara
          mandatos.
        </li>
        <li>
          <strong>O selo de cada série</strong>, no cartão e acima do
          gráfico, diz para que lado a
          série melhora: “Mais alto é melhor”, “Mais baixo é melhor”, na
          inflação “Melhor dentro da faixa da meta”, e “Nenhum lado é melhor
          por si” quando o número não tem direção boa.
        </li>
        <li>
          <strong>Resultado primário</strong> é o que o setor público
          arrecada menos o que gasta, sem contar os juros da dívida. Sobra é
          superávit; falta, déficit.
        </li>
      </ul>
    </section>
  );
}
