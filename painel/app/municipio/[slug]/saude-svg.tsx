import { br } from "../../../lib/dados";

/**
 * A aplicação de recursos próprios em saúde, 2000–2025, como um traço.
 *
 * Mesmo desenho do `serie-svg.tsx` e pelos mesmos motivos: SVG embutido, sem
 * biblioteca e sem JavaScript. Aqui são 26 pontos em vez de 15.
 *
 * ## O eixo é o TEMPO, e a linha quebra no buraco
 *
 * A lição já custou caro uma vez neste site, no gráfico de gasto com pessoal:
 * espaçar por índice desenha oito meses e quarenta meses do mesmo jeito. Esta
 * série nasce com a correção — `x` vem do ano, e um ano sem valor interrompe o
 * traço em vez de ser costurado por cima.
 *
 * A base é quase completa (3 células ausentes em 4.784 no Ceará), então o
 * buraco é raro — e é justamente por ser raro que ele precisa aparecer.
 *
 * ## A régua é 15%, e ela só é desenhada de 2004 em diante
 *
 * A EC 29/2000 fixou **7% para 2000** e mandou cada ente fechar a própria
 * diferença "à razão de, pelo menos, um quinto por ano" até **15% em 2004**.
 * Entre 2001 e 2003 o piso é individual, e **não existe régua nacional**.
 *
 * Estender a linha de 15% para trás seria o caminho fácil e produziria uma
 * acusação falsa: em 2000, contra 15%, 3.428 municípios pareceriam
 * descumpridores de uma regra que ainda não valia para eles.
 */

const L = 300;
const A = 78;
const M = { topo: 10, base: 18, esq: 4, dir: 4 };

/** O primeiro ano em que os 15% valem cheios — ver o comentário acima. */
const ANO_DO_PISO_CHEIO = 2004;
const PISO = 15;

export default function SaudeSvg({
  pontos,
  municipio,
}: {
  pontos: [ano: number, valor: number][];
  municipio: string;
}) {
  if (pontos.length < 2) return null;

  const valores = pontos.map((p) => p[1]);
  const min = Math.min(...valores, PISO);
  const max = Math.max(...valores, PISO);
  const folga = Math.max((max - min) * 0.15, 1);
  const baixo = min - folga;
  const alto = max + folga;

  const primeiro = pontos[0]!;
  const ultimo = pontos[pontos.length - 1]!;
  const vao = Math.max(ultimo[0] - primeiro[0], 1);

  const x = (ano: number) =>
    M.esq + ((ano - primeiro[0]) * (L - M.esq - M.dir)) / vao;
  const y = (v: number) =>
    M.topo + ((alto - v) / (alto - baixo)) * (A - M.topo - M.base);

  // `M` inicia traço novo: anos vizinhos continuam a linha, um buraco a corta.
  const linha = pontos
    .map(([ano, v], i) => {
      const anterior = pontos[i - 1];
      const segue = anterior !== undefined && ano - anterior[0] === 1;
      return `${segue ? "L" : "M"}${x(ano)},${y(v)}`;
    })
    .join(" ");

  const buracos = pontos.filter(
    (p, i) => i > 0 && p[0] - pontos[i - 1]![0] !== 1,
  ).length;

  // A régua começa em 2004, ou no primeiro ano da série se ela for mais nova.
  const inicioDaRegua = Math.max(ANO_DO_PISO_CHEIO, primeiro[0]);
  const temRegua = inicioDaRegua <= ultimo[0];

  const abaixoDoPiso = pontos.filter(
    ([ano, v]) => ano >= ANO_DO_PISO_CHEIO && v < PISO,
  ).length;

  const rotulo =
    `Recursos próprios aplicados em saúde por ${municipio}, ` +
    `de ${primeiro[0]} a ${ultimo[0]}: ` +
    `${br(primeiro[1], 2)}% no primeiro ano e ${br(ultimo[1], 2)}% no último. ` +
    (abaixoDoPiso
      ? `${abaixoDoPiso === 1 ? "Um exercício ficou" : `${abaixoDoPiso} exercícios ficaram`} ` +
        `abaixo do mínimo de 15% que vale desde 2004. `
      : `Nenhum exercício ficou abaixo do mínimo de 15% desde 2004. `) +
    (buracos
      ? `A série tem ${buracos === 1 ? "uma interrupção" : `${buracos} interrupções`}, ` +
        `em anos sem dado na fonte. `
      : "") +
    `Os mesmos valores estão na tabela abaixo.`;

  return (
    <svg
      viewBox={`0 0 ${L} ${A}`}
      role="img"
      aria-label={rotulo}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {temRegua && (
        <g>
          {/* A régua PARA em 2004 do lado esquerdo, de propósito. */}
          <line
            x1={x(inicioDaRegua)} x2={L - M.dir} y1={y(PISO)} y2={y(PISO)}
            stroke="var(--alerta)" strokeWidth="1" strokeDasharray="3 3"
            opacity="0.75"
          />
          <text
            x={L - M.dir} y={y(PISO) - 3} textAnchor="end"
            fontSize="8" fill="var(--alerta)" opacity="0.9"
          >
            mínimo 15% (desde 2004)
          </text>
        </g>
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

      {pontos.map(([ano, v], i) => (
        <circle
          key={ano}
          cx={x(ano)} cy={y(v)}
          r={i === pontos.length - 1 ? 3.5 : 1.6}
          fill="var(--acento)"
        />
      ))}

      <text x={M.esq} y={A - 4} fontSize="8" fill="var(--tinta-fraca)">
        {primeiro[0]}
      </text>
      <text x={L - M.dir} y={A - 4} fontSize="8" textAnchor="end" fill="var(--tinta-fraca)">
        {ultimo[0]}
      </text>
    </svg>
  );
}
