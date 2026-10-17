import { comSinal, type CagedAno } from "../../lib/caged";

/**
 * O saldo do Novo Caged por ano fechado, em barras, em SVG embutido.
 *
 * Sem biblioteca e sem JavaScript, como os outros gráficos da página.
 *
 * ## O eixo passa pelo zero, e cada barra leva o número escrito
 *
 * Saldo é admissões menos desligamentos: o que importa é o lado do zero e o
 * tamanho. O eixo, por isso, vai sempre do menor valor ao maior com o zero
 * dentro (o `eixoJusto` não força o zero), e a barra sai da linha do zero para
 * cima ou para baixo. Sem marcas de eixo: o valor de cada ano está escrito na
 * ponta da barra, acima da positiva e abaixo da negativa.
 *
 * ## Uma cor só
 *
 * Barra positiva e negativa têm a mesma cor: o sinal escrito e a posição já
 * dizem o lado, e cor de "bom" e "ruim" seria julgamento que o dado não faz.
 */

const L = 320;
const A = 120;
const M = { topo: 14, base: 16, esq: 6, dir: 6 };
/** A folga abaixo da barra negativa, para o número escrito. */
const FOLGA_NEGATIVA = 14;

export default function CagedAnosSvg({
  anos,
  municipio,
}: {
  anos: CagedAno[];
  municipio: string;
}) {
  if (anos.length < 2) return null;

  const saldos = anos.map((a) => a.saldo);
  const baixo = Math.min(0, ...saldos);
  const alto = Math.max(0, ...saldos);
  const vao = alto - baixo || 1;
  const fim = A - M.base - (baixo < 0 ? FOLGA_NEGATIVA : 0);
  const y = (v: number) => M.topo + ((alto - v) / vao) * (fim - M.topo);

  const passo = (L - M.esq - M.dir) / anos.length;
  const largura = passo * 0.6;
  const centro = (i: number) => M.esq + passo * (i + 0.5);

  const rotulo =
    `Saldo do Novo Caged em ${municipio}, por ano: ` +
    anos.map((a) => `${a.ano}, ${comSinal(a.saldo)}`).join("; ") +
    `. As barras saem da linha do zero: para cima, mais admissões que desligamentos; para baixo, o contrário. ` +
    `Os mesmos valores estão na tabela abaixo.`;

  return (
    <svg
      className="grafico-svg"
      viewBox={`0 0 ${L} ${A}`}
      role="img"
      aria-label={rotulo}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {anos.map((a, i) => {
        const topo = Math.min(y(a.saldo), y(0));
        const altura = Math.abs(y(a.saldo) - y(0));
        return (
          <g key={a.ano}>
            {altura > 0 && (
              <rect
                x={centro(i) - largura / 2} y={topo}
                width={largura} height={altura}
                fill="var(--acento)"
              />
            )}
            <text
              x={centro(i)}
              y={a.saldo < 0 ? y(a.saldo) + 10 : y(a.saldo) - 3}
              textAnchor="middle" fontSize="8" fill="var(--tinta)"
            >
              {comSinal(a.saldo)}
            </text>
            <text
              x={centro(i)} y={A - 4} textAnchor="middle"
              fontSize="8" fill="var(--tinta-fraca)"
            >
              {a.ano}
            </text>
          </g>
        );
      })}

      {/* A linha do zero por cima das barras, para a base de cada uma ficar visível. */}
      <line
        x1={M.esq} x2={L - M.dir} y1={y(0)} y2={y(0)}
        stroke="var(--borda-forte)" strokeWidth="1"
      />
    </svg>
  );
}
