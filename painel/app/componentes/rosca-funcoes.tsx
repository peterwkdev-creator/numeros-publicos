import { br, escala } from "@/lib/dados";
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
 * Uma cor **fixa por função**, a mesma da série na página do município:
 * Educação é a mesma cor nos dois lugares. A cor sai de `funcao` (o índice em
 * `rotulos`), não da posição da fatia — se Saúde passar Educação num ano, as
 * fatias trocam de lugar e as cores vão junto. Paleta e medida de daltonismo:
 * `--rosca-*` em `app/globals.css`. A tabela ao lado continua dizendo o nome.
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
    ...cabeca.map((f) => ({ nome: f.nome, valor: f.valor, funcao: f.funcao })),
    ...(somaCauda > 0
      ? [{
          nome: `outras ${cauda.length} ${cauda.length === 1 ? "função" : "funções"}`,
          valor: somaCauda,
          funcao: NOMEADAS,
        }]
      : []),
  ];

  const arcos = fatiasDaRosca(entradas, total);
  // `fatiasDaRosca` pula fatia de valor zero: a função se acha pelo nome, não
  // pelo índice do arco. Sem índice (ou fora das 8), a cor de "outras".
  const funcaoDe = new Map(entradas.map((e) => [e.nome, e.funcao]));
  if (!arcos.length) return null;

  const maiores = arcos.slice(0, 2);
  const somaDuas = maiores.reduce((a, f) => a + f.percentual, 0);
  // A mesma escala do resto do site, partida em duas linhas: "R$ 1,07
  // trilhão" inteiro, no corpo do valor, não cabe no buraco de 124 unidades.
  const { curto, exato } = escala(total);
  const partes = /^(.*) (\S+)$/.exec(curto);
  const [valor, unidade] = partes ? [partes[1]!, partes[2]!] : [curto, ""];

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
            data-funcao={Math.min(funcaoDe.get(f.nome) ?? NOMEADAS, NOMEADAS)}
          />
        ))}
        {/* O total no buraco. `pointer-events: none` no CSS para não roubar o
            hover das fatias. */}
        <text className={estilos.totalRotulo} x="0" y="-14">
          total
        </text>
        <text className={estilos.totalValor} x="0" y="8">
          <title>{exato}</title>
          {valor}
        </text>
        {unidade && (
          <text className={estilos.totalRotulo} x="0" y="28">
            {unidade}
          </text>
        )}
      </svg>
    </div>
  );
}
