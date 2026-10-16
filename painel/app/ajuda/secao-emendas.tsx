import type { Contexto } from "./contexto";

/**
 * Emendas parlamentares: o que entra na conta.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoEmendas({ ctx }: { ctx: Contexto }) {
  const { estilos } = ctx;
  return (
    <section className={estilos.bloco} id="emendas">
      <h2>Emendas parlamentares: o que entra na conta</h2>
      <p>
        <strong>Emenda parlamentar</strong> é a parte do orçamento federal
        cujo destino deputados e senadores indicam. O dado vem do Portal da
        Transparência, da Controladoria-Geral da União.
      </p>
      <ul className={estilos.lista}>
        <li>
          <strong>Entra</strong> o que a União <strong>pagou</strong> à
          prefeitura e aos fundos municipais (como o de saúde), pelo mês do
          pagamento.
        </li>
        <li>
          <strong>Não entra</strong> o que foi só empenhado (reservado no
          orçamento, sem o dinheiro sair), nem o que foi pago a outros
          favorecidos no município, como o governo do estado, entidades e
          empresas.
        </li>
        <li>
          <strong>Valor negativo</strong> quer dizer que, no ano, os
          estornos superaram os pagamentos.
        </li>
      </ul>
      <p>
        <strong>A página mostra o último ano completo e o ano corrente.</strong>{" "}
        Até 2024, parte do dinheiro de emendas era paga ao Banco do Brasil,
        sem o município de destino; uma série longa mostraria um salto que é,
        em boa parte, mudança no jeito de registrar. A série desde 2015 está
        no download da página, com a mesma ressalva.
      </p>
    </section>
  );
}
