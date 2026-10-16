import { br } from "../../lib/dados";
import type { Contexto } from "./contexto";

/**
 * Gasto com pessoal, RCL e os dois limites.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoPessoal({ ctx }: { ctx: Contexto }) {
  const { fiscal, estilos } = ctx;
  return (
    <section className={estilos.bloco} id="pessoal">
      <h2>Gasto com pessoal, RCL e os dois limites</h2>
      <p>
        <strong>Receita corrente líquida (RCL)</strong> é o que sobra da
        arrecadação do município depois de descontar transferências que ele é
        obrigado a repassar. A <strong>RCL ajustada</strong> é essa mesma
        conta com os ajustes que a Lei de Responsabilidade Fiscal manda fazer
        — e é ela, não a bruta, o denominador do percentual publicado.
      </p>
      <p>
        O percentual que este site mostra é{" "}
        <strong>gasto com pessoal ÷ RCL ajustada</strong> (a lei diz
        <em>despesa com pessoal</em>). A Lei de
        Responsabilidade Fiscal fixa dois patamares para o Executivo
        municipal:
      </p>
      <ul className={estilos.lista}>
        <li>
          <strong>{br(fiscal.limites.prudencial, 2)}% — limite prudencial.</strong>{" "}
          Passar dele já proíbe criar cargo, conceder aumento e contratar.
        </li>
        <li>
          <strong>{br(fiscal.limites.legal, 2)}% — teto legal.</strong>{" "}
          O limite máximo propriamente dito.
        </li>
      </ul>
      <p>
        <strong>Este site não recalcula o percentual.</strong> Ele vem
        calculado e declarado pelo próprio município e homologado no SICONFI.
        Recalcular criaria uma segunda verdade que ninguém assinou. E o site
        não interpreta, não acusa e não declara ninguém em descumprimento —
        mostra o número publicado ao lado do limite.
      </p>
    </section>
  );
}
