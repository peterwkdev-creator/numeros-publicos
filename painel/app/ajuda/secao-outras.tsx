import type { Contexto } from "./contexto";

/**
 * Onde perguntar o que este site não responde.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoOutras({ ctx }: { ctx: Contexto }) {
  const { estilos } = ctx;
  return (
    <section className={estilos.bloco} id="outras">
      <h2>Onde perguntar o que este site não responde</h2>
      <p>
        Muita dúvida sobre estes dados não é sobre o site: é sobre o que o
        município declarou, ou sobre a regra que ele seguiu. Esses lugares
        respondem o que nós não temos como responder:
      </p>
      <ul className={estilos.lista}>
        <li>
          <a href="https://siconfi.tesouro.gov.br/" rel="noopener">
            SICONFI — Tesouro Nacional
          </a>{" "}
          — a fonte dos relatórios fiscais, com todos os anexos, não só os dois
          usados aqui.
        </li>
        <li>
          <a href="https://sidra.ibge.gov.br/" rel="noopener">IBGE / SIDRA</a>{" "}
          — população, PIB e todas as outras estatísticas municipais.
        </li>
        <li>
          <strong>A prefeitura do município</strong>, pelo portal da
          transparência ou pelo pedido de acesso à informação (Lei 12.527/2011)
          — é quem pode explicar uma declaração específica.
        </li>
        <li>
          <strong>O tribunal de contas do estado</strong> — é quem fiscaliza
          as contas municipais.
        </li>
      </ul>
    </section>
  );
}
