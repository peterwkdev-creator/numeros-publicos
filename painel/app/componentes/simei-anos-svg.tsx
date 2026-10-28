import { br } from "../../lib/dados";
import { dataBr, type PontoSimei } from "../../lib/simei";

/**
 * Os MEI optantes pelo SIMEI em 31/12 de cada ano e na posição atual, em
 * barras, em SVG embutido. Irmão do `CagedAnosSvg`: sem biblioteca, sem
 * JavaScript, uma cor só.
 *
 * ## O que muda em relação ao do Caged
 *
 * - **Estoque, não saldo:** o eixo começa no zero e as barras só sobem.
 * - **17 barras não cabem 17 números escritos** a 320 de largura: o valor sai
 *   escrito só na primeira barra e na da posição atual; todos estão no
 *   `aria-label` e na tabela logo abaixo.
 * - **A posição atual vem por último em outro tom** (a mesma cor, mais clara)
 *   e com a data escrita: não é um 31/12, é o retrato de agora.
 * - **Ano sem linha na fonte não tem barra**, e o vão diz "nenhum optante
 *   registrado". Não é zero: a Receita omite o município sem optante.
 */

const L = 320;
const A = 150;
const M = { topo: 24, base: 26, esq: 4, dir: 4 };

export default function SimeiAnosSvg({
  pontos,
  municipio,
}: {
  /** Do mais velho ao mais novo; o último é a posição atual. */
  pontos: PontoSimei[];
  municipio: string;
}) {
  if (pontos.length < 2) return null;
  const alto = Math.max(1, ...pontos.map((p) => p.valor ?? 0));
  const y = (v: number) => M.topo + ((alto - v) / alto) * (A - M.base - M.topo);
  const passo = (L - M.esq - M.dir) / pontos.length;
  const largura = passo * 0.7;
  const centro = (i: number) => M.esq + passo * (i + 0.5);
  const ultimo = pontos.length - 1;
  const ano = (p: PontoSimei) => p.data.slice(0, 4);
  const primeiro = pontos.findIndex((p) => p.valor !== null);

  const rotulo =
    `MEI optantes pelo SIMEI em ${municipio}: ` +
    pontos.map((p, i) =>
      `${i === ultimo ? dataBr(p.data) : `31/12/${ano(p)}`}, ` +
      (p.valor === null ? "nenhum optante registrado" : br(p.valor)),
    ).join("; ") +
    `. A última barra, em tom mais claro, é a posição atual. Os mesmos valores estão na tabela abaixo.`;

  return (
    <svg
      className="grafico-svg"
      viewBox={`0 0 ${L} ${A}`}
      role="img"
      aria-label={rotulo}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <text x={M.esq} y={9} fontSize="8" fill="var(--tinta-fraca)">
        MEI optantes, em 31/12 de cada ano
      </text>
      {pontos.map((p, i) => {
        const cx = centro(i);
        if (p.valor === null) {
          // O vão de quem a fonte omitiu: escrito na vertical, de baixo para cima.
          const yb = A - M.base - 2;
          return (
            <text
              key={p.data} x={cx + 2} y={yb} fontSize="6" fill="var(--tinta-fraca)"
              transform={`rotate(-90 ${cx + 2} ${yb})`}
            >
              nenhum optante registrado
            </text>
          );
        }
        const topo = y(p.valor);
        return (
          <g key={p.data}>
            <rect
              x={cx - largura / 2} y={topo}
              width={largura} height={Math.max(0, A - M.base - topo)}
              fill="var(--acento)"
              opacity={i === ultimo ? 0.5 : undefined}
            />
            {(i === ultimo || i === primeiro) && (
              <text
                x={i === ultimo ? L - M.dir : cx - largura / 2}
                y={topo - 3}
                textAnchor={i === ultimo ? "end" : "start"}
                fontSize="8" fill="var(--tinta)"
              >
                {br(p.valor)}
              </text>
            )}
          </g>
        );
      })}
      {/* Os anos de três em três, e a data da posição atual por extenso. */}
      {pontos.map((p, i) =>
        i < ultimo - 2 && (Number(ano(p)) - Number(ano(pontos[0]!))) % 3 === 0 ? (
          <text
            key={`a${p.data}`} x={centro(i)} y={A - M.base + 10}
            textAnchor="middle" fontSize="8" fill="var(--tinta-fraca)"
          >
            {ano(p)}
          </text>
        ) : null,
      )}
      <text
        x={L - M.dir} y={A - M.base + 10} textAnchor="end"
        fontSize="8" fill="var(--tinta)"
      >
        {dataBr(pontos[ultimo]!.data)}
      </text>
      <text
        x={L - M.dir} y={A - M.base + 20} textAnchor="end"
        fontSize="7" fill="var(--tinta-fraca)"
      >
        posição atual
      </text>
      <line
        x1={M.esq} x2={L - M.dir} y1={A - M.base} y2={A - M.base}
        stroke="var(--borda-forte)" strokeWidth="1"
      />
    </svg>
  );
}
