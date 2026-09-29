import { br } from "@/lib/dados";
import type { ValorTrabalho } from "@/lib/trabalho";
import estilos from "./tabela-censo.module.css";

/**
 * Uma tabela de valores diretos (não pares): o número, e embaixo o que ele
 * conta. Usa o CSS da `TabelaCenso` de propósito, para as duas tabelas da
 * seção de trabalho se lerem como uma só.
 *
 * **Sem coluna de comparação**, e é decisão: "mediana dos municípios" de
 * empresas ou de pessoas ocupadas mede o tamanho da cidade, não a situação
 * dela, e uma coluna com travessão nas linhas de contagem leria como "sem
 * dado". A comparação que faz sentido (a mediana do salário) vai em prosa,
 * ao lado.
 */
export default function TabelaValores({
  linhas,
  valores,
  legenda,
}: {
  linhas: ValorTrabalho[];
  valores: Record<string, number | null>;
  legenda: string;
}) {
  return (
    <div className={estilos.rolagem}>
      <table className={estilos.tabela}>
        <caption className={estilos.legenda}>{legenda}</caption>
        <thead>
          <tr>
            <th scope="col">Indicador</th>
            <th scope="col" className={estilos.num}>Aqui</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const v = valores[l.codigo] ?? null;
            return (
              <tr key={l.chave}>
                <th scope="row">
                  {l.rotulo}
                  <span className={estilos.criterio}>{l.criterio}</span>
                </th>
                <td
                  className={`${estilos.num} tabular ${
                    v === null ? estilos.semDado : ""
                  }`}
                >
                  {v === null
                    ? "—"
                    : l.formato === "reais"
                      // Espaço inseparável: em 375px a célula quebrava o
                      // "R$" numa linha e o número na outra.
                      ? `R$ ${br(v)}`
                      : br(v)}
                  {v === null && (
                    <span className={estilos.criterio}>sem dado na fonte</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
