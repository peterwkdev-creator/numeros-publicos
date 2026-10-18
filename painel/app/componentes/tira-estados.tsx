import { br } from "../../lib/dados";
import type { PanoramaUf } from "../../lib/nacional";

/**
 * Os 27 estados numa tira, com um deles marcado.
 *
 * ## Um quarto tipo de gráfico, porque a pergunta é outra
 *
 * O site já tem três. O *sparkline* mostra **um município ao longo do tempo**;
 * a tabela de funções, **as partes de um todo**; o histograma, **um caso dentro
 * de uma população grande e anônima**. Este mostra **poucos casos, nomeados e
 * ordenados** — e é a forma certa para 27, onde um histograma seria caricatura
 * (barras de um ou dois estados cada) e uma tabela de 27 linhas obrigaria a
 * varrer tudo para achar o seu.
 *
 * ## Marca por forma, não só por cor
 *
 * O estado desta página ganha **losango, rótulo e traço vertical**; os outros,
 * pontos pequenos. Distinguir só por cor reprovaria no critério 1.4.1 do WCAG
 * e sumiria em daltonismo — o mesmo erro que as faixas fiscais já custaram.
 *
 * ## Não é ranque
 *
 * Não há número de posição, nem pódio, nem cor de alerta. A tira ordena para
 * poder situar; dizer "22º lugar" afirmaria um juízo que o dado não sustenta.
 *
 * ## O Brasil desenhado e os extremos nomeados (18/10/2026)
 *
 * Até ali a tira tinha só o losango e dois números nas pontas: "acima da
 * média do país?" e "quem é o menor?" mandavam para a tabela da capa, outra
 * página. A referência do país é um traço curto na cor do texto, com o
 * rótulo numa linha só dela, abaixo do eixo; as pontas dizem a sigla.
 */

const L = 320;
// `A` de 56 (era 44) e `base` de 26 (era 14): uma linha para o rótulo do
// Brasil e outra para os extremos, que com a fonte de 11 do telefone não
// cabem lado a lado quando o país cai perto de uma ponta.
const A = 56;
// `topo` de 16: o rótulo do estado, com a fonte de 11 do telefone, encostava
// na borda de cima com 14.
const M = { esq: 8, dir: 8, topo: 16, base: 26 };

/** "AP", "SC e PR" ou "4 UFs": quem ocupa uma ponta, empates incluídos. */
function siglasEm(pontos: { uf: string; v: number }[], v: number): string {
  const ufs = pontos.filter((p) => p.v === v).map((p) => p.uf);
  return ufs.length > 2 ? `${ufs.length} UFs` : ufs.join(" e ");
}

export default function TiraEstados({
  panorama,
  destaque,
  valorDe,
  formatar,
  rotuloEixo,
  descricao,
  referencia,
}: {
  panorama: PanoramaUf[];
  /** A sigla da UF desta página. */
  destaque: string;
  valorDe: (p: PanoramaUf) => number | null;
  formatar: (v: number) => string;
  /** "% dos municípios que entregaram", para o rótulo acessível. */
  rotuloEixo: string;
  /** A frase completa que o leitor de tela ouve. */
  descricao: string;
  /** O país, desenhado como traço: `{ valor, rotulo: "Brasil" }`. */
  referencia?: { valor: number; rotulo: string } | null;
}) {
  const pontos = panorama
    .map((p) => ({ uf: p.uf, v: valorDe(p) }))
    .filter((x): x is { uf: string; v: number } => x.v !== null);
  if (pontos.length < 3) return null;

  const meu = pontos.find((x) => x.uf === destaque);
  const ref = referencia ?? null;
  const vs = pontos.map((x) => x.v);
  const minUf = Math.min(...vs);
  const maxUf = Math.max(...vs);
  // O país entra na escala por garantia: a taxa agregada fica entre os
  // estados, mas a mediana nacional não tem essa obrigação.
  const min = ref ? Math.min(minUf, ref.valor) : minUf;
  const max = ref ? Math.max(maxUf, ref.valor) : maxUf;
  const vao = Math.max(max - min, 0.001);
  const x = (v: number) => M.esq + ((v - min) / vao) * (L - M.esq - M.dir);
  const y = M.topo + (A - M.topo - M.base) / 2;

  return (
    <svg
      className="grafico-svg"
      viewBox={`0 0 ${L} ${A}`}
      role="img"
      aria-label={descricao}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <title>{rotuloEixo}</title>

      {/* O eixo. Fino e fraco: é referência, não assunto. */}
      <line
        x1={M.esq} x2={L - M.dir} y1={y} y2={y}
        stroke="var(--borda-forte)" strokeWidth="1"
      />

      {/* Os outros 26. Pontos pequenos, sem rótulo: nomear os 27 numa tira de
          320 unidades produziria uma parede de siglas ilegível. Quem quiser o
          nome de um vizinho tem a tabela de estados na capa. */}
      {pontos
        .filter((p) => p.uf !== destaque)
        .map((p) => (
          <circle
            key={p.uf}
            cx={x(p.v)} cy={y} r="2.6"
            fill="var(--borda-forte)"
            opacity="0.75"
          />
        ))}

      {meu && (
        <g>
          <line
            x1={x(meu.v)} x2={x(meu.v)}
            y1={y - 9} y2={y + 9}
            stroke="var(--acento)" strokeWidth="1.5"
          />
          {/* Losango, e não círculo maior: em preto e branco, ou para quem não
              distingue a cor, a FORMA é o que separa este ponto dos outros. */}
          <path
            d={`M ${x(meu.v)} ${y - 5} L ${x(meu.v) + 5} ${y} L ${x(meu.v)} ${y + 5} L ${x(meu.v) - 5} ${y} Z`}
            fill="var(--acento)"
          />
          {/* Centrado sobre o losango, menos perto das pontas: ali o rótulo
              começa ou termina no losango, senão metade dele sairia do
              desenho (com a fonte de 11 do telefone, "MA 51,32%" tem ~50). */}
          <text
            x={x(meu.v) < 30 ? x(meu.v) - 5 : x(meu.v) > L - 30 ? x(meu.v) + 5 : x(meu.v)}
            y={y - 11}
            textAnchor={x(meu.v) < 30 ? "start" : x(meu.v) > L - 30 ? "end" : "middle"}
            fontSize="8"
            fontWeight="600"
            fill="var(--acento)"
          >
            {meu.uf} {formatar(meu.v)}
          </text>
        </g>
      )}

      {/* O país: traço curto na cor do texto, sem losango nem acento, para
          não competir com o estado da página. O rótulo fica na linha de
          baixo do eixo, centrado, e encosta numa ponta perto da borda. */}
      {ref && (
        <g>
          <line
            x1={x(ref.valor)} x2={x(ref.valor)} y1={y - 6} y2={y + 6}
            stroke="var(--tinta)" strokeWidth="1.5"
          />
          <text
            x={x(ref.valor) < 50 ? x(ref.valor) - 2 : x(ref.valor) > L - 50 ? x(ref.valor) + 2 : x(ref.valor)}
            y={y + 15}
            textAnchor={x(ref.valor) < 50 ? "start" : x(ref.valor) > L - 50 ? "end" : "middle"}
            fontSize="7"
            fill="var(--tinta)"
          >
            {ref.rotulo} {formatar(ref.valor)}
          </text>
        </g>
      )}

      {/* Os extremos, para a tira ter escala, com a sigla de quem está lá. */}
      <text x={M.esq} y={A - 3} fontSize="7" fill="var(--tinta-fraca)">
        {siglasEm(pontos, minUf)} {formatar(minUf)}
      </text>
      <text
        x={L - M.dir} y={A - 3} textAnchor="end"
        fontSize="7" fill="var(--tinta-fraca)"
      >
        {siglasEm(pontos, maxUf)} {formatar(maxUf)}
      </text>
    </svg>
  );
}

/** `br` reexportado para o formatador padrão de percentual da tira. */
export const pct = (casas = 0) => (v: number) => `${br(v, casas)}%`;
