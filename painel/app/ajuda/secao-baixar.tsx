import { br } from "../../lib/dados";
import type { Contexto } from "./contexto";

/**
 * Como baixar e abrir os dados.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoBaixar({ ctx }: { ctx: Contexto }) {
  const { total, estilos } = ctx;
  return (
    <section className={estilos.bloco} id="baixar">
      <h2>Como baixar e abrir os dados</h2>
      <p>
        Todo número deste site pode ser baixado. Um painel de dado público que
        só deixa <em>olhar</em> está pela metade — número que ninguém consegue
        baixar é número que ninguém consegue contestar.
      </p>
      <ul className={estilos.lista}>
        <li>
          <a href="/dados/municipios.xlsx" download>
            Base completa em planilha do Excel
          </a>{" "}
          — os {br(total)} municípios, com três abas: os dados, o que
          significa cada coluna, e de onde cada número veio.
        </li>
        <li>
          <a href="/dados/municipios.csv" download>A mesma base em CSV</a> —
          para quem vai ler por programa.
        </li>
        <li>
          <strong>Por estado</strong> — o link está no fim de cada página de
          estado.
        </li>
        <li>
          <strong>Por município</strong> — no fim de cada página de município,
          com uma linha por indicador e período.
        </li>
      </ul>
      <p>
        Os arquivos usam <strong>ponto e vírgula</strong> como separador e{" "}
        <strong>vírgula</strong> como decimal, que é o que o Excel em
        português espera: basta abrir. Um CSV “padrão” internacional abriria
        com tudo amontoado numa coluna só.
      </p>
      <p>
        Se você for reimportar em outra ferramenta, o arquivo é UTF-8 com BOM.
        Municípios que não entregaram relatório aparecem como{" "}
        <code>nao</code> na coluna de publicação — nunca como zero.
      </p>
    </section>
  );
}
