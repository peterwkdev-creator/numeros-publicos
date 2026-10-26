import { br } from "../../lib/dados";
import type { Resultado } from "../../lib/eleicoes";
import type { ContagemPartido } from "../../lib/eleicoes-cargos";
import { corDoPartido } from "../../lib/partidos";
import estilos from "./eleicoes.module.css";

/**
 * As peças que as duas páginas das eleições compartilham (26/10/2026, quando
 * `/eleicoes-2026/` virou a visão macro e o resto foi para `/dados/`).
 */

export function Barras({ r, legenda, lados }: {
  r: Resultado; legenda: string;
  /** Presidente, nos dois turnos: o lado (a cor) de Lula e Flávio, pelo
   *  número; os outros do 1º turno e o governador ficam cinza. */
  lados?: Record<string, "a" | "b">;
}) {
  const validos = r.candidatos.filter((c) => c.destino.startsWith("V"));
  const maior = Math.max(...validos.map((c) => c.pct), 1);
  return (
    <div className={`${estilos.rolagem} rola-x`}>
      <table className={estilos.barras}>
        <caption className="so-leitor">{legenda}</caption>
        <thead>
          <tr>
            <th scope="col">Candidato</th>
            <th scope="col" className={estilos.num}>Votos</th>
            <th scope="col" className={estilos.num}>% dos válidos</th>
            <th scope="col" className={estilos.colBarra}><span className="so-leitor">Barra</span></th>
          </tr>
        </thead>
        <tbody>
          {validos.map((c) => (
            <tr key={c.n}>
              <th scope="row">
                {c.nome} <span className={estilos.partido}>({c.partido})</span>
                {c.eleito && <span className={estilos.eleito}> eleito</span>}
                {c.situacao === "2º turno" && <span className={estilos.marca}> 2º turno</span>}
              </th>
              <td className={estilos.num}>{br(c.votos)}</td>
              <td className={estilos.num}>{br(c.pct, 2)}%</td>
              <td className={estilos.colBarra} aria-hidden="true">
                <span className={`${estilos.barra} ${lados?.[c.n] === "a" ? estilos.ladoA : lados?.[c.n] === "b" ? estilos.ladoB : ""}`}
                  style={{ width: `${(c.pct / maior) * 100}%` }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A barra de um todo em dois lados (26/10/2026): o placar do 2º turno, uma
 * linha por estado e o comparecimento. A barra só repete o texto que vem ao
 * lado (aria-hidden); o traço marca a metade. Cores em `--lado-a` e
 * `--lado-b` (`eleicoes.module.css`): vermelho e azul para os candidatos,
 * cinza e hachura para comparecimento e abstenção.
 */
export function Trilho({ a, b, meio, fino }: { a: number; b: number; meio?: boolean; fino?: boolean }) {
  return (
    <div className={estilos.regua} aria-hidden="true">
      <div className={`${estilos.trilho} ${fino ? estilos.fino : ""}`}>
        <span className={estilos.ladoA} style={{ width: `${a}%` }} />
        {/* Sem o lado B, sem o filete da borda dele. */}
        {b > 0 && <span className={estilos.ladoB} style={{ width: `${b}%` }} />}
      </div>
      {meio && <span className={estilos.meio} />}
    </div>
  );
}

/** A amostra da cor ao lado do nome: a cor nunca é a única pista. */
export const Amostra = ({ lado }: { lado: "a" | "b" }) => (
  <span className={`${estilos.amostra} ${lado === "a" ? estilos.ladoA : estilos.ladoB}`} aria-hidden="true" />
);

/** A amostra pela cor do partido (`partidos.module.css`). */
export const AmostraPartido = ({ cor }: { cor: string }) => (
  <span className={`${estilos.amostra} ${estilos.amostraCor}`} data-cor={cor} aria-hidden="true" />
);

/** Os dois lados escritos nas pontas, com a barra embaixo. */
export function Divisao({ a, b, meio, neutro, titulo }: {
  a: { rotulo: string; pct: number }; b: { rotulo: string; pct: number };
  meio?: boolean; neutro?: boolean; titulo?: string;
}) {
  return (
    <div className={`${estilos.divisao} ${neutro ? estilos.neutro : ""}`}>
      {titulo && <p className={estilos.tituloDivisao}>{titulo}</p>}
      <p className={estilos.pontas}>
        <span><Amostra lado="a" />{a.rotulo} <strong>{br(a.pct, 2)}%</strong></span>
        <span><Amostra lado="b" />{b.rotulo} <strong>{br(b.pct, 2)}%</strong></span>
      </p>
      <Trilho a={a.pct} b={b.pct} meio={meio} />
    </div>
  );
}

/**
 * Eleitos (ou cadeiras) por partido, com a barra na cor do partido. A barra
 * é um `<rect>` com `width` em atributo (sem `style` no HTML) e escala pela
 * maior contagem; repete o número ao lado, por isso `aria-hidden`.
 */
export function ContagemPartidos({ linhas, legenda, coluna, total, votos }: {
  linhas: ContagemPartido[]; legenda: string; coluna: string;
  /** O total de cadeiras ou vagas, para o rodapé da tabela. */
  total?: number;
  /** Mostra a coluna de votos somados. */
  votos?: boolean;
}) {
  const maior = Math.max(...linhas.map((l) => l.n), 1);
  return (
    <div className={`${estilos.rolagem} rola-x`}>
      <table className={estilos.barras}>
        <caption className="so-leitor">{legenda}</caption>
        <thead>
          <tr>
            <th scope="col">Partido</th>
            <th scope="col" className={estilos.num}>{coluna}</th>
            {votos && <th scope="col" className={estilos.num}>Votos</th>}
            <th scope="col" className={estilos.colBarra}><span className="so-leitor">Barra</span></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.partido}>
              <th scope="row"><AmostraPartido cor={corDoPartido(l.partido)} />{l.partido}</th>
              <td className={estilos.num}>{br(l.n)}</td>
              {votos && <td className={estilos.num}>{br(l.votos ?? 0)}</td>}
              <td className={estilos.colBarra} aria-hidden="true">
                <svg className={estilos.barraSvg} viewBox="0 0 100 1" preserveAspectRatio="none"
                  data-cor={corDoPartido(l.partido)} aria-hidden="true" focusable="false">
                  <rect width={Math.round((l.n / maior) * 1000) / 10} height="1" />
                </svg>
              </td>
            </tr>
          ))}
        </tbody>
        {total !== undefined && (
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className={estilos.num}>{br(linhas.reduce((s, l) => s + l.n, 0))} de {br(total)}</td>
              {votos && <td />}
              <td className={estilos.colBarra} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
