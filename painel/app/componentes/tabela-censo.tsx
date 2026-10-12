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
 * ## As colunas de comparação são de quem chama, e NÃO são a mesma coisa
 *
 * No município elas são a **mediana dos municípios** do estado e a do país;
 * no estado, a **taxa do país**. Trocá-las de lugar seria erro grave e invisível: no esgoto, a mediana
 * municipal é 32,6% e a taxa nacional 64,7%, e as duas são corretas.
 *
 * Por isso o rótulo de cada coluna vem junto do valor, e não fixo no
 * componente.
 */
export default function TabelaCenso({
  medidas,
  comparacoes,
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
  comparacoes: {
    /** O cabeçalho da coluna. Diz CONTRA O QUÊ se compara. */
    rotulo: string;
    /** Por `chave` do par, em pontos percentuais. */
    valores: Record<string, number | null>;
  }[];
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
            {comparacoes.map((c) => (
              <th key={c.rotulo} scope="col" className={estilos.num}>{c.rotulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {medidas.map((x) => {
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
                    {/* A ausência diz o que é: "não sabemos" não é "nenhum".
                        Até 29/09/2026 eram 33 casos aqui, e todos eram o `-`
                        do IBGE, que é ZERO; lido certo, sobram os municípios
                        novos demais para o Censo. */}
                    {x.parte === null || x.total === null
                      ? "sem dado na fonte"
                      : `${br(x.parte)} de ${br(x.total)}`}
                  </span>
                </td>
                {comparacoes.map((c) => {
                  const outro = c.valores[x.chave] ?? null;
                  return (
                    <td key={c.rotulo} className={`${estilos.num} tabular`}>
                      {outro === null ? "—" : `${br(outro, 1)}%`}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
