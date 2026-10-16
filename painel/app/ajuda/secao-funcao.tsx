import { FUNCOES_DA_PORTARIA, atualDeFuncoes } from "../../lib/fiscal";
import type { Contexto } from "./contexto";

/**
 * Despesa por função, e o que é "liquidada".
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoFuncao({ ctx }: { ctx: Contexto }) {
  const { f, estilos } = ctx;
  return (
    <section className={estilos.bloco} id="funcao">
      <h2>Despesa por função, e o que é “liquidada”</h2>
      <p>
        <strong>Função orçamentária</strong> é a área em que o dinheiro foi
        gasto: educação, saúde, urbanismo, assistência social. São{" "}
        {FUNCOES_DA_PORTARIA} funções fixadas pela Portaria MOG 42/1999, e
        todo município usa a mesma lista — é o que torna a comparação possível.
      </p>
      <p>
        <strong>Liquidada</strong> quer dizer o que de fato foi gasto: o
        serviço foi prestado ou o material entregue, e a prefeitura reconheceu
        a dívida. É diferente de <em>dotação</em> (o que foi orçado, ou seja,
        a intenção) e de <em>empenhada</em> (o dinheiro reservado). Só a
        liquidada responde “quanto gastou”.
      </p>
      {f && (
        <p>
          Os valores publicados aqui são do {f.periodo}º bimestre de{" "}
          {atualDeFuncoes(f)?.exercicio}, e{" "}
          <strong>acumulam o ano inteiro</strong> até ali —
          não são o gasto daqueles dois meses.
        </p>
      )}
    </section>
  );
}
