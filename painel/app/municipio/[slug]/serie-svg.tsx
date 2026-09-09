import { br } from "../../../lib/dados";
import {
  contiguos,
  indiceQuadrimestre,
  interrupcoes,
  pontoPlausivel,
  rotuloPeriodo,
  type PontoSerie,
} from "../../../lib/fiscal";

/**
 * A série de despesa com pessoal como um traço, em SVG embutido.
 *
 * Sem biblioteca e sem JavaScript: é um `<svg>` no HTML, gerado no build.
 * Uma biblioteca de gráfico custaria mais bytes que a página inteira para
 * desenhar seis pontos.
 *
 * ## A escala vertical, que é onde um gráfico mente com mais facilidade
 *
 * Um eixo começando em zero comprimiria tudo: os valores vivem entre 30% e 70%,
 * e a variação que interessa sumiria numa faixa fina no alto. Um eixo colado
 * nos dados faria o contrário — exageraria meio ponto percentual até parecer
 * despencada.
 *
 * A saída é **ancorar nos limites legais**, não nos dados: a escala vai do
 * menor entre (dados, limite prudencial) ao maior entre (dados, teto legal), e
 * as duas linhas de limite são **desenhadas**. O leitor não precisa confiar na
 * escala, porque vê a régua junto com a medida — e a pergunta real ("está acima
 * do limite?") passa a ser respondida pela posição, não por um número.
 *
 * ## O que fica de fora
 *
 * Pontos implausíveis (fora de 0–100%) **não entram na linha**. Guaratinga/BA
 * declarou 371%: plotado, achataria os outros cinco pontos contra o eixo e o
 * gráfico viraria uma linha reta com um pico. Eles continuam visíveis na tabela
 * logo abaixo, marcados — é lá que a declaração aparece, não aqui.
 *
 * ## O eixo horizontal é TEMPO, e a linha se interrompe no buraco
 *
 * Até 09/09/2026 o `x` era a posição no array, o que estava certo enquanto a
 * série tinha 6 quadrimestres contíguos: todo município tinha todos os pontos.
 * Com os 15 de 2020 a 2024 deixou de estar — **286 dos 3.814 municípios têm
 * pontos não consecutivos**, e o maior buraco desenhava **40 meses como um
 * passo só**.
 *
 * E o filtro acima é a **segunda** fonte do mesmo defeito: tirar um ponto
 * implausível da lista aproxima os vizinhos, e a linha passava por cima do
 * furo como se nada tivesse acontecido.
 *
 * Duas correções, e as duas são necessárias. O `x` passa a vir do índice no
 * tempo, então o vão fica proporcional à ausência. E a linha **quebra** no
 * buraco — um `M` no lugar do `L` inicia outro traço —, porque vão largo
 * sozinho ainda sugere continuidade, e continuidade é o que não houve.
 *
 * **Preencher o buraco não é uma opção**: interpolar inventaria uma entrega
 * que o município não fez, e é a distinção que este projeto inteiro mantém.
 *
 * É a classe de defeito que não dói onde nasce: nada aqui estava errado, e a
 * mudança do DADO quebrou um desenho correto sem tocar numa linha do desenho.
 *
 * ## Acessibilidade
 *
 * `role="img"` com `aria-label` que diz a tendência em palavras, e a tabela de
 * apoio logo abaixo com todos os valores. A orientação oficial para painéis de
 * dado público exige as duas coisas, não uma ou outra.
 */

const L = 300;   // largura do viewBox; o SVG escala para o container
const A = 72;    // altura
const M = { topo: 10, base: 18, esq: 4, dir: 4 };

export default function SerieSvg({
  pontos,
  prudencial,
  legal,
  municipio,
}: {
  pontos: PontoSerie[];
  prudencial: number;
  legal: number;
  municipio: string;
}) {
  const bons = pontos.filter(pontoPlausivel);
  if (bons.length < 2) return null;

  const valores = bons.map((p) => p[3]);
  const min = Math.min(...valores, prudencial);
  const max = Math.max(...valores, legal);
  const folga = Math.max((max - min) * 0.15, 1);
  const baixo = min - folga;
  const alto = max + folga;

  const primeiro = bons[0]!;
  const ultimo = bons[bons.length - 1]!;

  // O eixo cobre o VÃO NO TEMPO entre o primeiro e o último ponto, não a
  // quantidade de pontos. `Math.max(..., 1)` protege o caso de dois pontos no
  // mesmo período, que não deveria existir e não vale uma divisão por zero.
  const inicio = indiceQuadrimestre(primeiro[0], primeiro[1]);
  const vao = Math.max(indiceQuadrimestre(ultimo[0], ultimo[1]) - inicio, 1);

  const x = (p: PontoSerie) =>
    M.esq +
    ((indiceQuadrimestre(p[0], p[1]) - inicio) * (L - M.esq - M.dir)) / vao;
  const y = (v: number) =>
    M.topo + ((alto - v) / (alto - baixo)) * (A - M.topo - M.base);

  // `M` inicia traço novo, `L` continua o anterior: a linha se interrompe em
  // todo par que não é vizinho no tempo. Um município com todos os pontos
  // isolados vira só bolinhas, sem traço nenhum — que é a verdade sobre ele.
  const linha = bons
    .map((p, i) => {
      const anterior = bons[i - 1];
      const segue = anterior !== undefined && contiguos(anterior, p);
      return `${segue ? "L" : "M"}${x(p)},${y(p[3])}`;
    })
    .join(" ");

  // A MESMA contagem que a prosa da página usa. Duas implementações do mesmo
  // conceito divergem, e aqui a divergência seria visível: o traço quebrando
  // num lugar e o texto falando de outro.
  const buracos = interrupcoes(bons);
  const subiu = ultimo[3] > primeiro[3];

  const rotulo =
    `Despesa com pessoal de ${municipio} em ${bons.length} quadrimestres: ` +
    bons.map((p) => `${rotuloPeriodo(p[0], p[1])}, ${br(p[3], 2)}%`).join("; ") +
    `. ${subiu ? "Terminou acima" : "Terminou abaixo"} do primeiro valor. ` +
    // Quem ouve o gráfico precisa saber do buraco tanto quanto quem o vê: a
    // linha interrompida é informação, e sem isto ela se perderia.
    (buracos
      ? `A série tem ${buracos === 1 ? "uma interrupção" : `${buracos} interrupções`}` +
        `, em quadrimestres sem relatório entregue. `
      : "") +
    `Limite prudencial ${br(prudencial, 2)}%, teto legal ${br(legal, 2)}%. ` +
    `Os mesmos valores estão na tabela abaixo.`;

  return (
    <svg
      viewBox={`0 0 ${L} ${A}`}
      role="img"
      aria-label={rotulo}
      // SEM `preserveAspectRatio="none"`. O viewBox tem 300 de largura e o
      // container passa de 500px: esticar sem manter proporção deformaria os
      // rótulos das réguas em ~1,8x na horizontal. Escala uniforme, altura
      // automática -- o traço perde nada e o texto continua legível.
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* As duas réguas. Tracejadas para não competir com o dado. */}
      {[
        { v: legal, cor: "var(--alerta)", texto: "teto legal" },
        { v: prudencial, cor: "var(--atencao)", texto: "prudencial" },
      ].map(({ v, cor, texto }) => (
        <g key={texto}>
          <line
            x1={M.esq} x2={L - M.dir} y1={y(v)} y2={y(v)}
            stroke={cor} strokeWidth="1" strokeDasharray="3 3" opacity="0.75"
          />
          <text
            x={L - M.dir} y={y(v) - 3} textAnchor="end"
            fontSize="8" fill={cor} opacity="0.9"
          >
            {texto} {br(v, 1)}%
          </text>
        </g>
      ))}

      <path
        d={linha}
        fill="none"
        stroke="var(--acento)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />

      {bons.map((p, i) => (
        <circle
          key={`${p[0]}-${p[1]}`}
          cx={x(p)} cy={y(p[3])}
          r={i === bons.length - 1 ? 3.5 : 2}
          fill="var(--acento)"
        />
      ))}

      {/* Só o primeiro e o último rótulo: seis datas no eixo viram borrão. */}
      <text x={M.esq} y={A - 4} fontSize="8" fill="var(--tinta-fraca)">
        {rotuloPeriodo(primeiro[0], primeiro[1])}
      </text>
      <text x={L - M.dir} y={A - 4} fontSize="8" textAnchor="end" fill="var(--tinta-fraca)">
        {rotuloPeriodo(ultimo[0], ultimo[1])}
      </text>
    </svg>
  );
}
