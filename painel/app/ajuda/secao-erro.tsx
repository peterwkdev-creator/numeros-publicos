import type { Contexto } from "./contexto";

/**
 * Achei um número errado.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoErro({ ctx }: { ctx: Contexto }) {
  const { estilos } = ctx;
  return (
    <section className={estilos.bloco} id="erro">
      <h2>Achei um número errado</h2>
      <p>
        Há duas possibilidades, e vale separar antes de mais nada:
      </p>
      <ul className={estilos.lista}>
        <li>
          <strong>O número aqui está diferente do que a fonte publica.</strong>{" "}
          Aí o erro é nosso, e queremos saber. Abra uma questão no{" "}
          <a
            href="https://github.com/peterwkdev-creator/numeros-publicos/issues"
            rel="noopener"
          >
            repositório do projeto
          </a>{" "}
          com o município e o número que você viu.
        </li>
        <li>
          <strong>O número aqui é igual ao da fonte, e a fonte é que está
          estranha.</strong> Aí o erro é da declaração, e nós não podemos
          corrigi-lo — seria inventar um valor. O caminho é a prefeitura ou o
          tribunal de contas do estado. Os casos mais gritantes já aparecem
          marcados como <a href="#implausivel">implausíveis</a>.
        </li>
      </ul>
      <p>
        Todo o código de coleta é aberto, então dá para conferir exatamente
        como cada número foi lido da API.
      </p>
    </section>
  );
}
