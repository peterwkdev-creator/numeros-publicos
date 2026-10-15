import { br } from "../../../lib/dados";
import type { Contexto } from "./contexto";

/**
 * Os downloads da página.
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 */
export default function SecaoBaixar({ c }: { c: Contexto }) {
  const { snapshot, m , estilos } = c;
  return (
    <section className={estilos.texto} id="baixar">
      <h2>Baixar estes dados</h2>
      <p>
        Todo número desta página pode ser baixado e conferido. Um painel de
        dado público que só deixa <em>olhar</em> está pela metade — número que
        ninguém consegue baixar é número que ninguém consegue contestar.
      </p>
      <ul className={estilos.downloads}>
        <li>
          <a href={`/municipio/${m.slug}/dados.csv`} download>
            {m.nome} em CSV
          </a>{" "}
          <span className={estilos.fonte}>
            — só este município, uma linha por indicador e período
          </span>
        </li>
        <li>
          <a href="/dados/municipios.xlsx" download>
            Base completa em planilha
          </a>{" "}
          <span className={estilos.fonte}>
            — os {br(snapshot.municipios.length)} municípios, com dicionário de
            colunas e procedência em abas separadas
          </span>
        </li>
        <li>
          <a href="/dados/municipios.csv" download>A mesma base em CSV</a>{" "}
          <span className={estilos.fonte}>— para ler por programa</span>
        </li>
      </ul>
      <p className={estilos.ressalva}>
        Separador <strong>ponto e vírgula</strong> e decimal com{" "}
        <strong>vírgula</strong>, como o Excel em português espera. Municípios
        que não entregaram o relatório aparecem como{" "}
        <code>nao</code> na coluna de publicação — nunca como zero.
      </p>
    </section>
  );
}
