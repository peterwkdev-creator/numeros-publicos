import { br } from "../../lib/dados";
import { eixoJusto } from "../../lib/eixo";
import type { Trajetoria } from "../../lib/ideb";

/**
 * A trajetória do IDEB contra a meta do INEP, em SVG embutido.
 *
 * Sem biblioteca e sem JavaScript, como o gráfico da série fiscal.
 *
 * ## A escala vai dos dados, com pelo menos 2 pontos de vão
 *
 * Até 15/10/2026 era FIXA de 0 a 10, para duas páginas serem comparáveis pela
 * posição. O custo era o desenho: um Ideb entre 4 e 7 deixava 60% da altura
 * vazia e espremia a trajetória (pedido do usuário: o gráfico enche a área).
 * Agora o eixo é o de `eixoJusto`, preso entre 0 e 10, com as marcas
 * escritas; o vão mínimo de 2 pontos impede o exagero (de 4,9 para 5,1 ocupa
 * um décimo da altura, não ela inteira).
 *
 * ## A meta é linha tracejada, não segunda série
 *
 * Duas linhas cheias fariam o leitor comparar a forma delas; o que importa é a
 * distância entre uma e outra em cada edição. E as edições **sem meta** (2005,
 * 2023 e 2025) simplesmente não recebem marca — inventar um alvo para interpolar seria
 * pior que a lacuna.
 */

const L = 320;
const A = 96;
const M = { topo: 8, base: 20, esq: 22, dir: 6 };
/** O vão mínimo do eixo, em pontos do índice. */
const VAO_MINIMO = 2;

export default function IdebSvg({
  trajetoria,
  municipio,
}: {
  trajetoria: Trajetoria;
  municipio: string;
}) {
  const { pontos } = trajetoria;
  if (pontos.length < 2) return null;

  const anos = pontos.map((p) => p.edicao);
  const minAno = Math.min(...anos);
  const maxAno = Math.max(...anos);
  const vao = Math.max(maxAno - minAno, 1);

  const x = (ano: number) =>
    M.esq + ((ano - minAno) / vao) * (L - M.esq - M.dir);
  const { baixo, alto, marcas } = eixoJusto(
    pontos.flatMap((p) => (p.projecao === null ? [p.observado] : [p.observado, p.projecao])),
    { vaoMinimo: VAO_MINIMO, limites: [0, 10] },
  );
  const y = (v: number) =>
    M.topo + ((alto - v) / (alto - baixo)) * (A - M.topo - M.base);

  const linha = pontos
    .map((p, i) => `${i ? "L" : "M"}${x(p.edicao)},${y(p.observado)}`)
    .join(" ");

  const comMeta = pontos.filter((p) => p.projecao !== null);
  const linhaMeta = comMeta
    .map((p, i) => `${i ? "L" : "M"}${x(p.edicao)},${y(p.projecao as number)}`)
    .join(" ");

  const rotulo =
    `IDEB de ${municipio}, ${trajetoria.rotuloEtapa}, rede municipal: ` +
    pontos.map((p) => `${p.edicao}, ${br(p.observado, 1)}`).join("; ") +
    `. O eixo vai de ${br(baixo, 1)} a ${br(alto, 1)}, numa escala que vai de 0 a 10. ` +
    (comMeta.length
      ? `A linha tracejada é a meta do INEP, publicada em ${
          comMeta.length
        } das ${pontos.length} edições. `
      : "") +
    `Os mesmos valores estão na tabela abaixo.`;

  return (
    <svg
      className="grafico-svg"
      viewBox={`0 0 ${L} ${A}`}
      role="img"
      aria-label={rotulo}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* As marcas do eixo, escritas: com a escala presa aos dados, é o
          número ao lado que diz onde a linha está. */}
      {marcas.map((v) => (
        <g key={v}>
          <line
            x1={M.esq} x2={L - M.dir} y1={y(v)} y2={y(v)}
            stroke="var(--borda)" strokeWidth="1"
          />
          <text
            x={M.esq - 4} y={y(v) + 3} textAnchor="end"
            fontSize="8" fill="var(--tinta-fraca)"
          >
            {br(v, Number.isInteger(v) ? 0 : 1)}
          </text>
        </g>
      ))}

      {linhaMeta && (
        <path
          d={linhaMeta}
          fill="none"
          stroke="var(--tinta-fraca)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      )}

      <path
        d={linha}
        fill="none"
        stroke="var(--acento)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />

      {pontos.map((p, i) => (
        <circle
          key={p.edicao}
          cx={x(p.edicao)} cy={y(p.observado)}
          r={i === pontos.length - 1 ? 3.5 : 2}
          fill="var(--acento)"
        />
      ))}

      <text x={M.esq} y={A - 4} fontSize="8" fill="var(--tinta-fraca)">
        {minAno}
      </text>
      <text
        x={L - M.dir} y={A - 4} fontSize="8" textAnchor="end"
        fill="var(--tinta-fraca)"
      >
        {maxAno}
      </text>
      {comMeta.length > 0 && (
        <text
          x={(L + M.esq) / 2} y={A - 4} fontSize="8" textAnchor="middle"
          fill="var(--tinta-fraca)"
        >
          — — meta do INEP
        </text>
      )}
    </svg>
  );
}
