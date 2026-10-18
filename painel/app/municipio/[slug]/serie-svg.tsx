import { br } from "../../../lib/dados";
import { eixoJusto } from "../../../lib/eixo";
import { HALO, SOBE, larguraDe, lugarDoValor } from "../../../lib/valor-final";
import {
  contiguos,
  indiceQuadrimestre,
  interrupcoes,
  pontoPlausivel,
  rotuloPonto,
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
 * A saída é `eixoJusto` (`lib/eixo.ts`): a escala vai dos dados, com pelo
 * menos 5 pontos de vão, e as marcas escritas à esquerda. Os dois limites
 * entram na escala e são **desenhados** quando estão perto dos dados (até meio
 * vão de distância); longe, ficam fora, e o gráfico escreve embaixo que eles
 * estão acima. Até 15/10/2026 a escala sempre esticava até o teto legal, e um
 * município em 25% via a própria série espremida no pé do desenho.
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

/** O vão mínimo do eixo, em pontos percentuais: meio ponto não vira salto. */
const VAO_MINIMO = 5;

/** "teto de 54%", "limites de 51,3% e 54%": o que ficou fora, para o pé do gráfico. */
function limites(vs: number[]): string {
  const ps = [...vs].sort((a, b) => a - b).map((v) => `${br(v, 1)}%`);
  return ps.length === 1 ? `limite de ${ps[0]}` : `limites de ${ps.join(" e ")}`;
}

const L = 300;   // largura do viewBox; o SVG escala para o container
const A = 84;    // altura (era 72; +12 no topo para a unidade do eixo)
const M = { topo: 22, base: 18, esq: 24, dir: 4 };

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

  const { baixo, alto, marcas, fora } = eixoJusto(bons.map((p) => p[3]), {
    vaoMinimo: VAO_MINIMO, reguas: [prudencial, legal],
  });
  const reguas = [
    { v: legal, cor: "var(--alerta)", texto: "teto legal", direita: true },
    { v: prudencial, cor: "var(--atencao)", texto: "prudencial", direita: false },
  ];
  const acima = fora.filter((v) => v > alto);
  const abaixo = fora.filter((v) => v < baixo);
  const foraDaEscala = [
    acima.length ? `↑ ${limites(acima)} acima` : "",
    abaixo.length ? `↓ ${limites(abaixo)} abaixo` : "",
  ].filter(Boolean).join(" · ");

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

  // O último valor escrito junto do último ponto, sem cobrir o rótulo de régua.
  const textoFinal = `${br(ultimo[3], 1)}%`;
  const valorFinal = lugarDoValor(
    textoFinal, x(ultimo), y(ultimo[3]), y(bons[bons.length - 2]![3]),
    {
      largura: L, teto: 1, piso: A - 4 - SOBE - 1,
      evitar: reguas.filter(({ v }) => !fora.includes(v)).map(({ v, texto, direita }) => {
        const w = larguraDe(`${texto} ${br(v, 1)}%`);
        return direita
          ? { x0: L - M.dir - w, x1: L - M.dir, base: y(v) - 3 }
          : { x0: M.esq, x1: M.esq + w, base: y(v) - 3 };
      }),
    },
  );

  const rotulo =
    `Gasto com pessoal de ${municipio} em ${bons.length} ` +
    `${bons.some((p) => p[4] === true) ? "relatórios" : "quadrimestres"}: ` +
    bons.map((p) => `${rotuloPonto(p)}, ${br(p[3], 2)}%`).join("; ") +
    `. ${subiu ? "Terminou acima" : "Terminou abaixo"} do primeiro valor. ` +
    // Quem ouve o gráfico precisa saber do buraco tanto quanto quem o vê: a
    // linha interrompida é informação, e sem isto ela se perderia.
    (buracos
      ? `A série tem ${buracos === 1 ? "uma interrupção" : `${buracos} interrupções`}` +
        `, em períodos sem relatório entregue. `
      : "") +
    `Limite prudencial ${br(prudencial, 2)}%, teto legal ${br(legal, 2)}%` +
    (fora.length ? `; ${fora.length === 2 ? "os dois ficam" : "um fica"} fora da escala do gráfico. ` : ". ") +
    `Os mesmos valores estão na tabela abaixo.`;

  return (
    <svg
      className="grafico-svg"
      viewBox={`0 0 ${L} ${A}`}
      role="img"
      aria-label={rotulo}
      // SEM `preserveAspectRatio="none"`. O viewBox tem 300 de largura e o
      // container passa de 500px: esticar sem manter proporção deformaria os
      // rótulos das réguas em ~1,8x na horizontal. Escala uniforme, altura
      // automática -- o traço perde nada e o texto continua legível.
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* As duas réguas. Tracejadas para não competir com o dado.
          Os rótulos vão para pontas OPOSTAS: as réguas distam 2,7 pontos,
          que na escala costumam ser ~7 unidades, e os dois rótulos alinhados
          à direita se sobrepunham inteiros (no telefone, com a fonte de 11,
          em toda página medida). */}
      {/* A unidade no topo do eixo, acima da régua mais alta: o topo de 22
          deixa a linha da unidade livre do rótulo de uma régua no alto. */}
      <text x={0} y={9} fontSize="8" fill="var(--tinta-fraca)">
        % da RCL
      </text>
      {marcas.map((v) => (
        <g key={`m-${v}`}>
          <line x1={M.esq} x2={L - M.dir} y1={y(v)} y2={y(v)}
            stroke="var(--borda)" strokeWidth="1" />
          <text x={M.esq - 3} y={y(v) + 3} textAnchor="end" fontSize="8"
            fill="var(--tinta-fraca)">
            {br(v, Number.isInteger(v) ? 0 : 1)}%
          </text>
        </g>
      ))}
      {reguas.filter(({ v }) => !fora.includes(v)).map(({ v, cor, texto, direita }) => (
        <g key={texto}>
          <line
            x1={M.esq} x2={L - M.dir} y1={y(v)} y2={y(v)}
            stroke={cor} strokeWidth="1" strokeDasharray="3 3" opacity="0.75"
          />
          <text
            x={direita ? L - M.dir : M.esq} y={y(v) - 3}
            textAnchor={direita ? "end" : "start"}
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

      <text x={valorFinal.x} y={valorFinal.y} textAnchor={valorFinal.anchor}
        fontSize="9" {...HALO}>
        {textoFinal}
      </text>

      {/* Só o primeiro e o último rótulo: seis datas no eixo viram borrão. */}
      <text x={M.esq} y={A - 4} fontSize="8" fill="var(--tinta-fraca)">
        {rotuloPonto(primeiro)}
      </text>
      <text x={L - M.dir} y={A - 4} fontSize="8" textAnchor="end" fill="var(--tinta-fraca)">
        {rotuloPonto(ultimo)}
      </text>
      {foraDaEscala && (
        <text x={(L + M.esq) / 2} y={A - 4} fontSize="8" textAnchor="middle"
          fill="var(--tinta-fraca)">
          {foraDaEscala}
        </text>
      )}
    </svg>
  );
}
