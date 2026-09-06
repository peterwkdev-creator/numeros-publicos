import { br } from "@/lib/dados";
import type { FatiaFuncao } from "@/lib/fiscal";
import { fatiasDaRosca, VIEW_BOX_ROSCA } from "@/lib/rosca";
import estilos from "./rosca-funcoes.module.css";

/**
 * A composição do gasto como rosca. **Componente de servidor.**
 *
 * ## Por que ao lado da tabela, e não no lugar dela
 *
 * A rosca é boa numa coisa só: mostrar que **duas funções levam metade do
 * gasto**. Ela é ruim em comparar a 5ª com a 6ª, que é justamente onde a
 * tabela de barras é boa — e a tabela também é o que um leitor de tela lê. As
 * duas lado a lado usam a largura que a página desperdiçava e cada uma faz o
 * que a outra não faz.
 *
 * Por isso o SVG é `role="img"` com rótulo de resumo: repetir 9 valores em voz
 * alta, com a tabela logo ao lado, seria a mesma informação duas vezes.
 *
 * ## O buraco no meio não é enfeite
 *
 * Ele carrega o total. Uma rosca sem número no centro obriga a olhar a legenda
 * para saber a ordem de grandeza do que está sendo repartido — e a ordem de
 * grandeza é metade da informação quando se fala de R$ 1,07 trilhão.
 *
 * ## As cores
 *
 * Rampa de um matiz só, escura para clara na ordem das fatias. Não é escolha
 * estética: a auditoria de daltonismo desta base reprovaria uma paleta
 * categórica, e aqui a cor não precisa identificar a função — a tabela ao lado
 * identifica. A cor só precisa **separar vizinhas**.
 */

/** As mesmas 8 nomeadas da tabela, mais "outras": as duas têm de concordar. */
const NOMEADAS = 8;

export default function RoscaFuncoes({
  fatias,
  total,
}: {
  fatias: FatiaFuncao[];
  total: number;
}) {
  if (!fatias.length || !(total > 0)) return null;

  const cabeca = fatias.slice(0, NOMEADAS);
  const cauda = fatias.slice(NOMEADAS);
  const somaCauda = cauda.reduce((a, f) => a + f.valor, 0);
  const entradas = [
    ...cabeca.map((f) => ({ nome: f.nome, valor: f.valor })),
    ...(somaCauda > 0
      ? [{
          nome: `outras ${cauda.length} ${cauda.length === 1 ? "função" : "funções"}`,
          valor: somaCauda,
        }]
      : []),
  ];

  const arcos = fatiasDaRosca(entradas, total);
  if (!arcos.length) return null;

  const maiores = arcos.slice(0, 2);
  const somaDuas = maiores.reduce((a, f) => a + f.percentual, 0);

  return (
    <div className={estilos.bloco}>
      <svg
        viewBox={VIEW_BOX_ROSCA}
        className={estilos.rosca}
        role="img"
        aria-label={
          `Composição do gasto em ${arcos.length} fatias. ` +
          `${maiores.map((f) => f.nome).join(" e ")} somam ` +
          `${br(somaDuas, 0)}% do total. Os valores estão na tabela ao lado.`
        }
      >
        {arcos.map((f, i) => (
          <path
            key={f.nome}
            d={f.caminho}
            className={estilos.fatia}
            data-ordem={Math.min(i, 8)}
          />
        ))}
        {/* O total no buraco. `pointer-events: none` no CSS para não roubar o
            hover das fatias. */}
        <text className={estilos.totalRotulo} x="0" y="-8">
          total
        </text>
        <text className={estilos.totalValor} x="0" y="12">
          {compacto(total)}
        </text>
      </svg>
    </div>
  );
}

/**
 * O total em escala legível: "R$ 1,07 tri".
 *
 * O valor vem em reais e chega à casa do trilhão. Escrito por extenso não cabe
 * no buraco da rosca, e cortado não se lê — a escala resolve os dois, e o
 * número exato continua na tabela ao lado.
 */
function compacto(valor: number): string {
  const escalas: [number, string][] = [
    [1e12, "tri"], [1e9, "bi"], [1e6, "mi"], [1e3, "mil"],
  ];
  for (const [divisor, sufixo] of escalas) {
    if (Math.abs(valor) >= divisor) {
      return `R$ ${br(valor / divisor, 2)} ${sufixo}`;
    }
  }
  return `R$ ${br(valor)}`;
}
