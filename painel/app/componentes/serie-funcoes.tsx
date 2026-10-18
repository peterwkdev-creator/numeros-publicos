import { br } from "@/lib/dados";
import type { PontoFuncoes } from "@/lib/fiscal";
import estilos from "./serie-funcoes.module.css";

/**
 * A composição do gasto ao longo dos anos. **Componente de servidor.**
 *
 * ## Por que PORCENTAGEM, e não reais
 *
 * Porque reais de 2020 e reais de 2024 não são a mesma coisa. Uma série
 * nominal mostraria "o gasto cresceu 40%" quando boa parte disso é inflação —
 * e deflacionar exigiria escolher um índice, um mês-base e uma fonte, três
 * decisões que este site não tem por que tomar no lugar de quem lê.
 *
 * A composição em porcentagem é **neutra à inflação** e responde a pergunta que
 * interessa: *a prioridade mudou?* O total nominal fica ao lado, dito como o
 * que é, para quem quiser a ordem de grandeza.
 *
 * ## Cada barra soma 100%, e é por isso que elas se comparam
 *
 * Barras de altura proporcional ao total pareceriam mais informativas e
 * seriam piores: a altura seria dominada pela inflação, e a composição — que é
 * o assunto — ficaria espremida nos anos antigos.
 *
 * ## O que o gráfico NÃO diz
 *
 * Não diz que o município gastou mais ou menos. Diz para onde foi a proporção.
 * Um ano ausente é **buraco**, não zero: quem não entregou o relatório não
 * gastou zero, e `serieFuncoesDe` já o omite em vez de inventar um ponto.
 */

/** Altura de cada barra e espaço entre elas, no sistema do `viewBox`. */
const ALTURA = 26;
const ESPACO = 10;
/** Largura reservada ao rótulo do ano, à esquerda. */
const ROTULO = 46;
const LARGURA = 320;
/** Faixa embaixo das barras para os números da escala, na fonte de 11. */
const ESCALA = 16;

export default function SerieFuncoes({ pontos }: { pontos: PontoFuncoes[] }) {
  // Uma barra só não é série: sem duas, não há "mudou" a mostrar, e o
  // componente se cala em vez de desenhar um gráfico de um ponto.
  if (pontos.length < 2) return null;

  const alturaTotal = pontos.length * (ALTURA + ESPACO) - ESPACO;
  const nomes = pontos[0]!.fatias.map((f) => f.nome);

  const primeiro = pontos[0]!;
  const ultimo = pontos[pontos.length - 1]!;
  const maiorMudanca = nomes
    .map((nome, i) => ({
      nome,
      pontos: (ultimo.fatias[i]?.percentual ?? 0)
        - (primeiro.fatias[i]?.percentual ?? 0),
    }))
    .sort((a, b) => Math.abs(b.pontos) - Math.abs(a.pontos))[0];
  // A maior fatia do último ano, para o rótulo falado (revisão 2, lote D).
  const maiorUltimo = ultimo.fatias
    .filter((f) => (f.percentual ?? 0) > 0)
    .sort((a, b) => (b.percentual ?? 0) - (a.percentual ?? 0))[0];

  return (
    <figure className={estilos.bloco}>
      <svg
        viewBox={`0 0 ${ROTULO + LARGURA} ${alturaTotal + ESCALA}`}
        className={estilos.grafico}
        role="img"
        aria-label={
          `Composição do gasto por função de ${primeiro.exercicio} a ` +
          `${ultimo.exercicio}, cada ano somando 100%. ` +
          (maiorMudanca
            ? `A maior mudança foi em ${maiorMudanca.nome}, ` +
              `${maiorMudanca.pontos >= 0 ? "de mais" : "de menos"} ` +
              `${br(Math.abs(maiorMudanca.pontos), 1)} pontos. `
            : "") +
          (maiorUltimo
            ? `Em ${ultimo.exercicio}, a maior fatia foi ${maiorUltimo.nome}, ` +
              `com ${br(maiorUltimo.percentual ?? 0, 1)}%. `
            : "") +
          "Os valores de cada ano estão na tabela abaixo."
        }
      >
        {pontos.map((p, linha) => {
          const y = linha * (ALTURA + ESPACO);
          let x = ROTULO;
          return (
            <g key={p.exercicio}>
              <text
                className={estilos.ano}
                x={ROTULO - 8}
                y={y + ALTURA / 2}
                dominantBaseline="central"
                textAnchor="end"
              >
                {p.exercicio}
              </text>
              {p.fatias.map((f, i) => {
                // Fatia sem percentual (total ausente ou zero) não vira barra
                // de largura zero invisível: ela simplesmente não entra.
                const largura = ((f.percentual ?? 0) * LARGURA) / 100;
                const atual = x;
                x += largura;
                if (largura <= 0) return null;
                return (
                  <rect
                    key={f.nome}
                    className={estilos.fatia}
                    data-funcao={Math.min(i, 8)}
                    x={atual}
                    y={y}
                    width={largura}
                    height={ALTURA}
                  >
                    <title>
                      {`${p.exercicio} · ${f.nome}: ${br(f.percentual ?? 0, 1)}%`}
                    </title>
                  </rect>
                );
              })}
            </g>
          );
        })}

        {/* A escala 0/50/100% (revisão 2, lote D): três linhas finas por cima
            das barras, para ler a proporção sem contar, e o número embaixo.
            `pointer-events: none` no CSS para não roubar o título das fatias. */}
        {[0, 50, 100].map((v) => {
          const xv = ROTULO + (v * LARGURA) / 100;
          return (
            <g key={`escala-${v}`}>
              <line className={estilos.grade} x1={xv} x2={xv}
                y1={0} y2={alturaTotal + 3} />
              <text className={estilos.escala} x={xv} y={alturaTotal + ESCALA - 3}
                textAnchor={v === 0 ? "start" : v === 100 ? "end" : "middle"}>
                {v}%
              </text>
            </g>
          );
        })}
      </svg>

      <figcaption className={estilos.legenda}>
        <ul className={estilos.chaves}>
          {nomes.map((nome, i) => (
            <li key={nome} className={estilos.chave}>
              <span
                className={estilos.amostra}
                data-funcao={Math.min(i, 8)}
                aria-hidden="true"
              />
              {nome}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
