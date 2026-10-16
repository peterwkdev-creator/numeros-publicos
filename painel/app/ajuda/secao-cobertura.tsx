import { br } from "../../lib/dados";
import type { Contexto } from "./contexto";

/**
 * Quais municípios estão cobertos.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoCobertura({ ctx }: { ctx: Contexto }) {
  const { total, estilos } = ctx;
  return (
    <section className={estilos.bloco} id="cobertura">
      <h2>Quais municípios estão cobertos</h2>
      <p>
        <strong>Todos os {br(total)} do Brasil</strong>, segundo a lista de
        localidades do IBGE. A coleta começou pelo Nordeste, com verificação
        de cada número, e foi estendida ao país quando o método já estava
        conferido — não antes.
      </p>
      <p>
        Nem todo município aparece com todos os números, e a página sempre diz
        por quê. Um pode não ter entregue o relatório fiscal; outro pode não
        administrar escola de 1º ao 5º ano, e aí a rede é do estado. Ausência
        está sempre marcada — ver <a href="#travessao">por que aparece
        &ldquo;—&rdquo;</a>.
      </p>
    </section>
  );
}
