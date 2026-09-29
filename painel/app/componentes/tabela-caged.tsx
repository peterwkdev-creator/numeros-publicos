import { br } from "@/lib/dados";
import { comSinal, competenciaCurta, type MesCaged } from "@/lib/caged";
import estilos from "./tabela-censo.module.css";

/**
 * Os 12 meses do Novo Caged de um município, do mais velho ao mais novo.
 *
 * Tabela, e não gráfico, de propósito: o número de cada mês é o que alguém
 * vai conferir no painel do Ministério, e numa cidade pequena o saldo oscila
 * entre −3 e +4 — uma barra desenharia ruído com a autoridade de tendência.
 * Usa o CSS da `TabelaCenso` para a seção inteira se ler como uma só.
 *
 * **O saldo vem logo depois do mês**, e não no fim: medido em 375 px, as
 * quatro colunas somavam 419 px num espaço de 343, e a coluna que ficava
 * escondida atrás da rolagem era justamente a que responde à pergunta.
 */
export default function TabelaCaged({
  meses,
  legenda,
}: {
  meses: MesCaged[];
  legenda: string;
}) {
  return (
    <div className={estilos.rolagem}>
      <table className={`${estilos.tabela} ${estilos.compacta}`}>
        <caption className={estilos.legenda}>{legenda}</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col" className={estilos.num}>Saldo</th>
            <th scope="col" className={estilos.num}>Admissões</th>
            <th scope="col" className={estilos.num}>Desligamentos</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.competencia}>
              <th scope="row">{competenciaCurta(m.competencia)}</th>
              <td className={`${estilos.num} tabular`}>{comSinal(m.saldo)}</td>
              <td className={`${estilos.num} tabular`}>{br(m.admissoes)}</td>
              <td className={`${estilos.num} tabular`}>{br(m.desligamentos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
