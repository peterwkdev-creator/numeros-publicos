import { br } from "@/lib/dados";
import type { MedidaCenso } from "@/lib/censo";
import estilos from "./tabela-censo.module.css";

/**
 * A tabela do Censo 2022. Usada na página do município **e** na do estado.
 *
 * ## Por que componente, e não a tabela repetida nas duas
 *
 * As duas mostram as mesmas seis linhas com a mesma estrutura, e mudam só na
 * coluna de comparação. Copiar o markup e o CSS criaria duas verdades a manter
 * — e a primeira tentativa aqui expôs um jeito silencioso de isso quebrar: a
 * página do estado não tinha as classes `.serie`, `.num`, `.criterio` no seu
 * módulo, e `estilos.criterio` viraria `class="undefined"`. **O TypeScript não
 * acusa isso**, porque módulo CSS não é tipado a fundo; a tabela sairia sem
 * estilo, parecendo quase certa.
 *
 * ## A coluna de comparação é de quem chama, e as duas NÃO são a mesma coisa
 *
 * No município ela é a **mediana dos municípios**; no estado, a **taxa do
 * país**. Trocá-las de lugar seria erro grave e invisível: no esgoto, a mediana
 * municipal é 32,6% e a taxa nacional 64,7%, e as duas são corretas.
 *
 * Por isso o rótulo da coluna vem junto do valor, e não fixo no componente.
 */
export default function TabelaCenso({
  medidas,
  comparacao,
  legenda,
  rotuloValor = "Aqui",
}: {
  medidas: MedidaCenso[];
  /**
   * O cabeçalho da coluna do valor. "Aqui" serve ao município e ao estado, e
   * mente na capa — lá o "aqui" é o país inteiro, e o leitor precisa ler
   * "No Brasil" para saber sobre o que é a coluna.
   */
  rotuloValor?: string;
  comparacao: {
    /** O cabeçalho da terceira coluna. Diz CONTRA O QUÊ se compara. */
    rotulo: string;
    /** Por `chave` do par, em pontos percentuais. */
    valores: Record<string, number | null>;
  };
  legenda: string;
}) {
  return (
    <div className={estilos.rolagem}>
      <table className={estilos.tabela}>
        <caption className={estilos.legenda}>{legenda}</caption>
        <thead>
          <tr>
            <th scope="col">Indicador</th>
            <th scope="col" className={estilos.num}>{rotuloValor}</th>
            <th scope="col" className={estilos.num}>{comparacao.rotulo}</th>
          </tr>
        </thead>
        <tbody>
          {medidas.map((x) => {
            const outro = comparacao.valores[x.chave] ?? null;
            return (
              <tr key={x.chave}>
                <th scope="row">
                  {x.rotulo}
                  <span className={estilos.criterio}>
                    {x.contagem} que {x.criterio}
                  </span>
                </th>
                <td
                  className={`${estilos.num} tabular ${
                    x.percentual === null ? estilos.semDado : ""
                  }`}
                >
                  {x.percentual === null ? "—" : `${br(x.percentual, 1)}%`}
                  <span className={estilos.criterio}>
                    {/* A ausência diz o que é. São 9 municípios sem dado de
                        água e 26 sem esgoto, e "não sabemos" não é "nenhum". */}
                    {x.parte === null || x.total === null
                      ? "sem dado na fonte"
                      : `${br(x.parte)} de ${br(x.total)}`}
                  </span>
                </td>
                <td className={`${estilos.num} tabular`}>
                  {outro === null ? "—" : `${br(outro, 1)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
