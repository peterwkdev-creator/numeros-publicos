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
          <a href="https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb" rel="noopener">
            INEP — IDEB
          </a>{" "}
          — as planilhas completas, com as outras redes e os resultados
          por escola.
        </li>
        <li>
          <a href="https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/acoes-e-programas/programas-projetos-acoes-obras-e-atividades/estatisticas-trabalho/novo-caged" rel="noopener">
            Novo Caged — Ministério do Trabalho
          </a>{" "}
          — o emprego com carteira por setor, ocupação e salário.
        </li>
        <li>
          <a href="https://www.gov.br/inss/pt-br" rel="noopener">INSS</a> — a
          situação de um pedido específico só o Meu INSS ou a central 135
          informam; este site mostra a fila em conjunto, não a de cada pessoa.
        </li>
        <li>
          <a href="https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares" rel="noopener">
            Portal da Transparência
          </a>{" "}
          — cada emenda com o autor, a área e o valor pago.
        </li>
        <li>
          <a href="https://dadosabertos.saude.gov.br/dataset/siops" rel="noopener">
            SIOPS — Ministério da Saúde
          </a>{" "}
          — os demonstrativos completos que cada município declara.
        </li>
        <li>
          <strong>As séries do país</strong> — o CSV de cada série traz o
          endereço exato, no Banco Central, no IBGE, no Ipea, no INPE ou no
          Ministério da Saúde, de onde cada número foi lido.
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
