import { br } from "../../lib/dados";
import type { Posicao } from "../../lib/posicao";

/**
 * Onde este município cai na distribuição do seu estado.
 *
 * Um tipo de gráfico diferente dos outros dois do site, porque responde uma
 * pergunta diferente. O sparkline mostra **um município ao longo do tempo**; a
 * tabela de funções mostra **as partes de um todo**. Este mostra **um caso
 * dentro de uma população** — e é o único que responde "isso é muito?".
 *
 * ## Histograma, e não pontos
 *
 * Com 217 municípios, plotar um ponto para cada produz uma faixa borrada onde
 * não se distingue concentração. O histograma mostra a forma da distribuição:
 * se o estado inteiro se amontoa perto do teto legal, isso salta aos olhos, e
 * é exatamente o que um número sozinho esconde.
 *
 * ## As duas réguas ficam, e a terceira é o próprio município
 *
 * Sem os limites legais, o histograma seria uma curva bonita sem consequência.
 * Com eles, dá para ver **quantos** estão do lado errado, não só se este está.
 *
 * ## O que se recusa a fazer
 *
 * **Não ordena e não classifica.** A barra deste município é destacada por
 * posição e por rótulo, não por cor de alerta — a página não está dizendo que
 * ele é melhor ou pior que os vizinhos, só onde ele cai. Julgar é do leitor;
 * o painel põe a régua.
 *
 * ## A mediana e o nome, desenhados (18/10/2026)
 *
 * A mediana do estado estava só no texto, e a linha cheia só se explicava
 * pela legenda. Agora cada uma tem uma linha de rótulo acima do desenho:
 * em cima o município, embaixo dela a mediana, que é um traço fino na cor
 * do texto. Linhas separadas porque os dois valores costumam cair a poucos
 * pixels um do outro, como os dois limites legais embaixo.
 */

const L = 320;
// `A` de 132 e `topo` de 26 (eram 112 e 6): as duas linhas de rótulo de cima,
// com a mesma altura útil de antes para as colunas.
const A = 132;
//: `base` reserva espaço para DUAS linhas de rótulo escalonadas mais a
//: escala do eixo. Ver a nota dos rótulos, mais abaixo. O degrau de 16 e a
//: base de 44 cabem o rótulo de 11 unidades que o telefone usa
//: (`.grafico-svg` em `globals.css`), cuja caixa mede ~15 em 375px: com
//: degrau de 12 as caixas se sobrepunham 2,9px. Com 7 o vão sobra.
const M = { topo: 26, base: 44, esq: 4, dir: 4 };
const DEGRAU = 16;

/** 54 vira "54" e 51,3 vira "51,3": a régua com o número que ela marca,
 *  sem casas que não existem (até 11/10/2026 dizia só "teto legal"). */
const casas = (v: number) =>
  Number.isInteger(v) ? 0 : Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? 1 : 2;
const FAIXAS = 24;

/** Largura de um rótulo pela fonte de 11 do telefone, a maior do site
 *  (~0,56 em por letra): estimar por cima evita o nome sair do desenho. */
const larguraDe = (texto: string) => texto.length * 6.2;

/** Onde ancorar um rótulo ao lado de uma linha vertical em `xv`: do lado
 *  `preferido` se couber, do outro se não, centrado e preso às bordas se
 *  nenhum couber. */
function ancorar(
  xv: number,
  texto: string,
  preferido: "direita" | "esquerda",
): { x: number; anchor: "start" | "end" | "middle" } {
  const w = larguraDe(texto);
  const direita = xv + 4 + w <= L;
  const esquerda = xv - 4 - w >= 0;
  if (preferido === "direita" ? direita : !esquerda && direita) return { x: xv + 4, anchor: "start" };
  if (esquerda) return { x: xv - 4, anchor: "end" };
  return { x: Math.min(Math.max(xv, w / 2), L - w / 2), anchor: "middle" };
}

export default function DistribuicaoSvg({
  posicao,
  percentual,
  prudencial,
  legal,
  municipio,
  conjunto,
}: {
  posicao: Posicao;
  percentual: number;
  prudencial: number;
  legal: number;
  municipio: string;
  /** "do Maranhão", para o rótulo acessível. */
  conjunto: string;
}) {
  const { valores, base, percentil, mediana } = posicao;
  const min = Math.min(...valores, percentual);
  const max = Math.max(...valores, percentual, legal);
  const vao = Math.max(max - min, 1);

  // Contagem por faixa. `Math.min` na última para o valor máximo não cair
  // num índice fora do array.
  const contagem = new Array<number>(FAIXAS).fill(0);
  for (const v of valores) {
    const i = Math.min(FAIXAS - 1, Math.floor(((v - min) / vao) * FAIXAS));
    contagem[i] = (contagem[i] ?? 0) + 1;
  }
  const pico = Math.max(...contagem, 1);

  const x = (v: number) => M.esq + ((v - min) / vao) * (L - M.esq - M.dir);
  const larguraFaixa = (L - M.esq - M.dir) / FAIXAS;
  const alturaUtil = A - M.topo - M.base;
  const y = (n: number) => M.topo + alturaUtil - (n / pico) * alturaUtil;
  const esquerda = x(legal) > L * 0.75;

  // Os rótulos de cima: o município puxa para o lado com mais espaço, a
  // mediana para o lado oposto ao do município, para não cruzar a linha dele.
  const textoMunicipio = `${municipio} ${br(percentual, 2)}%`;
  const posMunicipio = ancorar(
    x(percentual), textoMunicipio, x(percentual) < L / 2 ? "direita" : "esquerda",
  );
  const textoMediana = `mediana do estado ${br(mediana, 2)}%`;
  const posMediana = ancorar(
    x(mediana), textoMediana, mediana < percentual ? "esquerda" : "direita",
  );

  const rotulo =
    `Distribuição do gasto com pessoal ${conjunto}: ${base} municípios com ` +
    `relatório entregue e valor plausível. A mediana é ${br(mediana, 2)}% e ` +
    `${municipio} está em ${br(percentual, 2)}%, acima de ${br(percentil, 0)}% ` +
    `deles. O limite prudencial é ${br(prudencial, 2)}% e o teto legal ` +
    `${br(legal, 2)}%.`;

  return (
    <svg
      className="grafico-svg"
      viewBox={`0 0 ${L} ${A}`}
      role="img"
      aria-label={rotulo}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* As colunas do histograma. Cinza: elas são o contexto, não o assunto. */}
      {contagem.map((n, i) =>
        n === 0 ? null : (
          <rect
            key={i}
            x={M.esq + i * larguraFaixa + 0.5}
            y={y(n)}
            width={Math.max(larguraFaixa - 1, 1)}
            height={M.topo + alturaUtil - y(n)}
            fill="var(--borda-forte)"
            opacity="0.55"
          />
        ),
      )}

      {/* As duas réguas legais, tracejadas como nos outros gráficos do site. */}
      {/* Os rótulos ficam em ALTURAS diferentes, e não lado a lado.
          Os dois limites distam 2,7 pontos percentuais (51,30 e 54,00), então
          numa escala que costuma cobrir 30 pontos eles caem a poucos pixels um
          do outro — e "prudencial" colidia com "teto legal" em **toda** página.
          Escalonar resolve sem encurtar o texto nem esconder um deles.
          Os dois rótulos vão para o MESMO lado das réguas: à esquerda quando
          o teto legal cai no último quarto da escala (quando ele é o máximo,
          o rótulo à direita sairia do desenho), à direita no resto. Em cima fica o rótulo que se afasta da outra
          régua; o de baixo, se ficasse em cima, seria cortado por ela, que
          desce até o seu próprio rótulo. */}
      {[
        { v: prudencial, texto: "prudencial", linha: esquerda ? 0 : 1 },
        { v: legal, texto: "teto legal", linha: esquerda ? 1 : 0 },
      ].map(({ v, texto, linha }) =>
        v < min || v > max ? null : (
          <g key={texto}>
            <line
              x1={x(v)} x2={x(v)} y1={M.topo}
              y2={M.topo + alturaUtil + 10 + linha * DEGRAU}
              stroke="var(--tinta-fraca)" strokeWidth="1" strokeDasharray="3 3"
            />
            <text
              x={esquerda ? x(v) - 2 : x(v) + 2}
              y={M.topo + alturaUtil + 10 + linha * DEGRAU}
              textAnchor={esquerda ? "end" : "start"}
              fontSize="7" fill="var(--tinta-fraca)"
            >
              {texto} {br(v, casas(v))}%
            </text>
          </g>
        ),
      )}

      {/* A mediana do estado: traço fino na cor do texto, sem tracejado (o
          tracejado é dos limites legais), com o rótulo na 2ª linha de cima. */}
      <line
        x1={x(mediana)} x2={x(mediana)}
        y1={M.topo - 2} y2={M.topo + alturaUtil}
        stroke="var(--tinta)" strokeWidth="1"
      />
      <text
        x={posMediana.x} y={M.topo - 4} textAnchor={posMediana.anchor}
        fontSize="7" fill="var(--tinta)"
      >
        {textoMediana}
      </text>

      {/* Este município: linha cheia e marcador. Destacado por FORMA e
          posição, não por cor de alerta -- o gráfico situa, não julga. A
          linha sobe até o rótulo com o nome, na 1ª linha de cima. */}
      <line
        x1={x(percentual)} x2={x(percentual)}
        y1={10} y2={M.topo + alturaUtil}
        stroke="var(--acento)" strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(percentual)} cy={M.topo - 3} r="3.5" fill="var(--acento)" />
      <text
        x={posMunicipio.x} y={10} textAnchor={posMunicipio.anchor}
        fontSize="7" fontWeight="600" fill="var(--acento)"
      >
        {textoMunicipio}
      </text>

      <text x={M.esq} y={A - 2} fontSize="7" fill="var(--tinta-fraca)">
        {br(min, 0)}%
      </text>
      <text
        x={L - M.dir} y={A - 2} textAnchor="end"
        fontSize="7" fill="var(--tinta-fraca)"
      >
        {br(max, 0)}%
      </text>
    </svg>
  );
}
