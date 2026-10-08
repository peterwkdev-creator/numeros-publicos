import { br, dataCurta } from "@/lib/dados";
import {
  anosDoEixo, anosHerdados, APRESENTACAO, casasDe, cobertura, contiguos,
  escala, faixas, meioPeriodo, resumo, rotuloPeriodo, SELO, trechosMeta,
  type Mandato, type MetaInflacao, type SerieBrasil,
} from "@/lib/brasil";
import estilos from "./serie-brasil.module.css";

/**
 * Uma série do país, com as faixas de quem ocupava a Presidência atrás.
 * **Componente de servidor.** Usado uma vez por série em `/brasil/`, sempre com o
 * MESMO `dominio`: o eixo de tempo é o mesmo em todos, e é isso que permite
 * olhar um embaixo do outro.
 *
 * ## O que o desenho se recusa a fazer
 *
 * - **Cor por pessoa ou partido.** Dois cinzas alternados, na ordem do cargo.
 * - **Faixa onde não há dado.** A faixa vai só até onde a série vai; antes
 *   dela, o gráfico diz em texto onde a série começa.
 * - **Resumo por mandato.** Nenhum valor de início e fim de cada um, nenhuma
 *   média: é o passo que transforma coincidência no tempo em placar (decisão
 *   do usuário, 05/10/2026).
 * - **Verbo de tendência no texto.** O rótulo para leitor de tela diz as
 *   pontas e os extremos, com o período de cada um, e não "subiu" ou "caiu".
 *
 * Nas séries fiscais, o ano da posse vem hachurado: o orçamento em execução
 * nele foi aprovado antes de quem tomou posse.
 *
 * ## Para quem não é economista
 *
 * Cada gráfico diz para que lado é melhor: um selo acima dele, e dentro do
 * desenho a palavra em cada lado (no alto e embaixo, ou dos dois lados do
 * zero). Na inflação, a faixa da meta de cada ano. No câmbio e nos juros o
 * selo diz que nenhum lado é melhor por si, e o desenho não leva palavra. Sem verde e vermelho: a
 * leitura vai escrita, e a cor continua sem dizer nada sobre as pessoas.
 */

const L = 360;
const A = 186;
const M = { topo: 30, base: 18, esq: 38, dir: 8 };
const FONTE = 10;
/** Largura aproximada de um caractere, em fração do corpo da fonte. */
const CARACTERE = 0.56;

export default function SerieBrasilSvg({
  serie,
  mandatos,
  dominio,
  csv,
  meta,
}: {
  serie: SerieBrasil;
  mandatos: Mandato[];
  dominio: [number, number];
  /** O endereço do CSV desta série. */
  csv: string;
  /** Desenhada só na série cuja leitura é a meta (a inflação). */
  meta: MetaInflacao;
}) {
  if (serie.pontos.length < 2) return null;
  const ap = APRESENTACAO[serie.codigo];
  const titulo = ap?.titulo ?? serie.nome;
  const casas = casasDe(serie);
  const [de, ate] = dominio;
  const [cobDe, cobAte] = cobertura(serie);
  const trechos = ap?.melhor === "meta" ? trechosMeta(meta.anos, cobDe, cobAte) : [];

  const x = (t: number) => M.esq + ((t - de) * (L - M.esq - M.dir)) / (ate - de);
  // A faixa da meta entra na escala: nenhum ano dela fica cortado.
  const { baixo, alto, marcas } = escala([
    ...serie.pontos.map((p) => p[1]),
    ...trechos.flatMap((t) => [t.inferior, t.superior]),
  ]);
  const y = (v: number) => M.topo + ((alto - v) / (alto - baixo)) * (A - M.topo - M.base);
  const xy = (t: number, v: number) => `${x(t).toFixed(2)},${y(v).toFixed(2)}`;

  // A faixa da meta em degraus, um por ano: o alto da esquerda para a
  // direita, e o baixo de volta.
  const contornoMeta = trechos.length === 0 ? "" : [
    ...trechos.map((t, i) => `${i ? "L" : "M"}${xy(t.de, t.superior)} L${xy(t.ate, t.superior)}`),
    ...[...trechos].reverse().map((t) => `L${xy(t.ate, t.inferior)} L${xy(t.de, t.inferior)}`),
    "Z",
  ].join(" ");

  // As palavras da leitura dentro do desenho, encostadas à esquerda (onde as
  // séries que começam depois deixam espaço vazio): dos dois lados do zero,
  // quando ele divide a leitura e aparece na escala; senão, no alto e embaixo.
  const ESQ = M.esq + 4;
  const leituras: { texto: string; y: number }[] = [];
  if (ap?.zero && baixo < 0 && alto > 0) {
    leituras.push({ texto: `↑ ${ap.zero.acima}`, y: y(0) - 4 },
      { texto: `↓ ${ap.zero.abaixo}`, y: y(0) + 11 });
  } else if (ap?.melhor === "alto" || ap?.melhor === "baixo") {
    const [cima, baixa] = ap.melhor === "alto" ? ["melhor", "pior"] : ["pior", "melhor"];
    leituras.push({ texto: `↑ ${cima}`, y: M.topo + 11 },
      { texto: `↓ ${baixa}`, y: A - M.base - 5 });
  }

  const linha = serie.pontos
    .map(([p, v], i) => {
      const anterior = serie.pontos[i - 1];
      const segue = anterior !== undefined && contiguos(anterior[0], p);
      return `${segue ? "L" : "M"}${x(meioPeriodo(p)).toFixed(2)},${y(v).toFixed(2)}`;
    })
    .join(" ");

  const fs = faixas(mandatos, cobDe, cobAte);
  const herdados = ap?.fiscal ? anosHerdados(mandatos, cobDe, cobAte) : [];
  const padrao = `herdado-${serie.codigo}`;
  const r = resumo(serie);
  // "R$ 3.061", "R$ 5,15 por dólar", "US$ 362,82 bilhões", "7,5%",
  // "51,27% do PIB": a moeda vai antes do número, o resto depois.
  const moeda = /^(R|US)\$/.exec(serie.unidade)?.[0];
  const valor = (v: number) =>
    moeda
      ? `${moeda} ${br(v, casas)}${serie.unidade.slice(moeda.length)}`
      : `${br(v, casas)}${serie.unidade}`;
  const comeco = cobDe - de > 1;

  const rotulo =
    `${titulo}, de ${rotuloPeriodo(r.primeiro[0])} a ${rotuloPeriodo(r.ultimo[0])}, ` +
    `${br(serie.pontos.length)} pontos. Primeiro valor ${valor(r.primeiro[1])}, ` +
    `último ${valor(r.ultimo[1])}. Menor ${valor(r.menor[1])}, em ` +
    `${rotuloPeriodo(r.menor[0])}; maior ${valor(r.maior[1])}, em ` +
    `${rotuloPeriodo(r.maior[0])}. ${ap ? `${SELO[ap.melhor]}. ` : ""}` +
    (trechos.length > 0 ? "A faixa em degraus mostra a meta de inflação de cada ano. " : "") +
    "As faixas ao fundo mostram quem ocupava a " +
    `Presidência: ${fs.map((f) => f.nome).join(", ")}. ` +
    "Os valores estão na tabela abaixo do gráfico.";

  return (
    <figure className={estilos.figura} id={serie.codigo} data-serie={serie.codigo}>
      <h3 className={estilos.titulo}>{titulo}</h3>
      <p className={estilos.unidade}>
        {serie.unidade}
        {" · "}
        {rotuloPeriodo(r.primeiro[0])} a {rotuloPeriodo(r.ultimo[0])}
      </p>
      {ap && (
        <p className={estilos.leitura}>
          <span className={estilos.selo} data-melhor={ap.melhor}>
            <span aria-hidden="true">
              {{ alto: "↑ ", baixo: "↓ ", meta: "▭ ", nenhum: "↕ " }[ap.melhor]}
            </span>
            {SELO[ap.melhor]}
          </span>{" "}
          {ap.como}
        </p>
      )}
      <svg
        className={estilos.grafico}
        viewBox={`0 0 ${L} ${A}`}
        role="img"
        aria-label={rotulo}
        data-dominio={`${de.toFixed(4)} ${ate.toFixed(4)}`}
      >
        {herdados.length > 0 && (
          <defs>
            <pattern id={padrao} width="5" height="5" patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)">
              <line className={estilos.hachura} x1="0" y1="0" x2="0" y2="5" />
            </pattern>
          </defs>
        )}

        {fs.map((f) => (
          <rect key={`f-${f.de}`} className={estilos.faixa} data-faixa={f.tom}
            x={x(f.de)} y={M.topo} width={x(f.ate) - x(f.de)} height={A - M.topo - M.base} />
        ))}
        {herdados.map(([a, b]) => (
          <rect key={`h-${a}`} data-herdado=""
            x={x(a)} y={M.topo} width={x(b) - x(a)} height={A - M.topo - M.base}
            fill={`url(#${padrao})`} />
        ))}
        {fs.flatMap((f) => f.divisas).map((d) => (
          <line key={`d-${d}`} className={estilos.divisa} data-divisa=""
            x1={x(d)} x2={x(d)} y1={M.topo} y2={A - M.base} />
        ))}

        {/* Os rótulos em duas linhas, pela mesma alternância do tom: dois
            vizinhos nunca dividem a linha, e um nome mais largo que a faixa
            (o de um período curto) não cobre o do lado. */}
        {fs.map((f) => {
          const largura = f.rotulo.length * FONTE * CARACTERE;
          const meio = Math.min(
            Math.max((x(f.de) + x(f.ate)) / 2, M.esq + largura / 2),
            L - M.dir - largura / 2,
          );
          return (
            <text key={`r-${f.de}`} className={estilos.rotulo} x={meio}
              y={f.tom === 0 ? 11 : 24} textAnchor="middle" fontSize={FONTE}>
              {f.rotulo}
            </text>
          );
        })}

        {trechos.length > 0 && (
          <path className={estilos.meta} d={contornoMeta}
            data-meta={trechos.map((t) => `${t.ano}:${t.inferior}:${t.superior}`).join(" ")} />
        )}

        {marcas.map((v) => (
          <g key={`m-${v}`}>
            <line className={v === 0 ? estilos.zero : estilos.grade}
              x1={M.esq} x2={L - M.dir} y1={y(v)} y2={y(v)} />
            <text className={estilos.eixo} x={M.esq - 4} y={y(v) + 3.5}
              textAnchor="end" fontSize={FONTE}>
              {br(v, Number.isInteger(v) ? 0 : 1)}
            </text>
          </g>
        ))}

        {anosDoEixo(dominio).map((a) => (
          <g key={`a-${a}`}>
            <line className={estilos.marca}
              x1={x(a)} x2={x(a)} y1={A - M.base} y2={A - M.base + 3} />
            <text className={estilos.eixo} x={x(a)} y={A - 4}
              textAnchor="middle" fontSize={FONTE}>
              {a}
            </text>
          </g>
        ))}

        {comeco && (
          <text className={estilos.eixo} x={(x(de) + x(cobDe)) / 2}
            y={(M.topo + A - M.base) / 2} textAnchor="middle" fontSize={FONTE}>
            <tspan x={(x(de) + x(cobDe)) / 2}>série começa</tspan>
            <tspan x={(x(de) + x(cobDe)) / 2} dy="1.2em">em {Math.floor(cobDe)}</tspan>
          </text>
        )}

        <path className={estilos.linha} d={linha} />
        <circle className={estilos.ponto} cx={x(meioPeriodo(r.ultimo[0]))}
          cy={y(r.ultimo[1])} r="2.6" />

        {/* Por cima da linha, com halo: a palavra tem de ler mesmo quando a
            série passa por ela. */}
        {leituras.map((l) => (
          <text key={`l-${l.texto}`} className={estilos.leituraSvg} x={ESQ}
            y={l.y} fontSize={FONTE}>
            {l.texto}
          </text>
        ))}
        {trechos.length > 0 && (
          <text className={estilos.leituraSvg} x={x(trechos[0]!.de) + 3}
            y={y(trechos[0]!.superior) - 4} fontSize={FONTE}>
            faixa da meta
          </text>
        )}
      </svg>

      <figcaption className={estilos.legenda}>
        <p>
          <strong>
            {rotuloPeriodo(r.ultimo[0])}: {valor(r.ultimo[1])}.
          </strong>{" "}
          {ap?.nota}
        </p>
        {trechos.length > 0 && (() => {
          // O último ano DESENHADO, e não o último da tabela: a frase fala do
          // que está no gráfico.
          const t = trechos[trechos.length - 1]!;
          const tol = meta.anos.find((a) => a[0] === t.ano)![2];
          return (
            <p data-meta-texto="">
              A meta de inflação é fixada pelo Conselho Monetário Nacional, com
              uma tolerância para cima e para baixo. Até 2024 ela valia para a
              inflação do ano fechado, em dezembro; desde 2025 vale para os 12
              meses terminados em cada mês. Em 2003 e 2004, a faixa é a da meta
              revista, que substituiu a fixada antes. A de {t.ano} é{" "}
              {br(t.meta, 2)}%, com tolerância de {br(tol, 1)} ponto percentual
              (de {br(t.inferior, 2)}% a {br(t.superior, 2)}%). Fonte:{" "}
              <a href={meta.fonte} rel="noopener">Banco Central, histórico das
              metas</a>, conferido com a{" "}
              <a href={meta.origem} rel="nofollow noopener">série 13521 do SGS
              (JSON)</a>.
            </p>
          );
        })()}
        {herdados.length > 0 && (
          <p>
            A hachura marca o ano de cada posse: o orçamento em execução nele
            foi aprovado antes dela.
          </p>
        )}
        <p className={estilos.ressalva}>
          As faixas mostram quem ocupava a Presidência e não medem efeito:
          estas séries se movem por muitos fatores, de dentro e de fora do país.
        </p>
        {/* Os rótulos dizem o que abrem: a resposta crua da API, e não uma
            página (a mesma lição dos cartões da capa). */}
        <p className={estilos.fonte}>
          Fonte: {serie.fonte}, “{serie.nome}”. Lida na{" "}
          <a href={serie.origem} rel="nofollow noopener">consulta à API (JSON)</a>{" "}
          e conferida ponto a ponto por uma{" "}
          <a href={serie.conferida.split(" + ")[0]} rel="nofollow noopener">segunda consulta</a>.
          Coletada em {dataCurta(serie.coletadoEm)}.{" "}
          <a href={csv} download>Baixar em CSV</a>
        </p>
      </figcaption>

      <details className={estilos.valores}>
        <summary>Ver os {br(serie.pontos.length)} valores</summary>
        {/* Focável: a caixa rola, e quem usa teclado precisa alcançá-la. */}
        <div className={estilos.rolagem} tabIndex={0} role="region"
          aria-label={`Valores: ${titulo}`}>
          <table>
            <caption className="so-leitor">{titulo}, {serie.unidade}</caption>
            <thead>
              <tr>
                <th scope="col">Período</th>
                <th scope="col">{serie.unidade}</th>
              </tr>
            </thead>
            <tbody>
              {serie.pontos.map(([p, v]) => (
                <tr key={p}>
                  <th scope="row">{rotuloPeriodo(p)}</th>
                  <td data-periodo={p}>{br(v, casas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
