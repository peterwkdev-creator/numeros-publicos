import malha from "@/dados/malha-uf.json";
import { FAIXAS, faixaDoValor, type CamadaMapa } from "@/lib/mapa";
import estilos from "./mapa-uf.module.css";

/**
 * Mapa dos 27 estados, colorido por indicador. **Componente de servidor.**
 *
 * ## Por que um mapa aqui, e não mais uma tabela
 *
 * A tabela por estado já existe logo abaixo e continua sendo a fonte dos
 * valores. O mapa responde a outra pergunta, que nenhuma tabela de 27 linhas
 * responde de relance: **onde isso está**. E no caso deste site ele prova uma
 * afirmação que a página faz e não conseguia mostrar — que a taxa de entrega do
 * relatório fiscal **não é regional**: Santa Catarina entrega 86% e o Rio
 * Grande do Sul 15%, vizinhos.
 *
 * ## A troca de indicador é CSS, não JavaScript
 *
 * Cada caminho carrega a faixa de cada indicador num `data-`, e um grupo de
 * `<input type="radio">` acima decide qual `data-` a folha de estilo usa. Isso
 * significa **zero JavaScript**: o mapa funciona com JS desligado, aparece no
 * HTML que o buscador lê, e não acrescenta nada ao payload do cliente — que é a
 * conta que esta página já pagou uma vez, quando 13 indicadores nas props
 * custariam +149 KB.
 *
 * O custo é 27 caminhos × 3 atributos, e 3 × 5 regras de CSS. A malha em si são
 * **9,2 KB comprimidos**, medidos.
 *
 * ## O que o mapa NÃO é
 *
 * Não é instrumento de medida. A projeção é equiretangular com correção de
 * latitude — reconhecível, não exata. E ele **não substitui a tabela**: quem
 * usa leitor de tela recebe o `aria-label` e os valores logo abaixo, porque
 * cor não se lê em voz alta.
 */

export default function MapaUf({
  camadas,
  destaque,
}: {
  camadas: CamadaMapa[];
  /**
   * Sigla a contornar. Na página do estado ela responde "onde eu estou nisto?",
   * que é a pergunta que um mapa de 27 formas parecidas deixa em aberto.
   */
  destaque?: string;
}) {
  if (!camadas.length) return null;
  // O destacado vai POR ÚLTIMO: o SVG pinta na ordem do documento, e o
  // contorno grosso de um estado desenhado no meio fica coberto pelos vizinhos
  // desenhados depois — some justamente metade do destaque, do lado que faz
  // fronteira, que é quase todo ele.
  const siglas = Object.keys(malha.caminhos).sort()
    .sort((a, b) => Number(a === destaque) - Number(b === destaque));

  return (
    <figure className={estilos.bloco}>
      <fieldset className={estilos.opcoes}>
        <legend className={estilos.legendaOpcoes}>Colorir o mapa por</legend>
        {camadas.map((c, i) => (
          <span key={c.chave} className={estilos.opcao}>
            {/* O input fica ANTES do svg no DOM para o seletor `~` alcançá-lo.
                Escondido visualmente, nunca com `display:none`: leitor de tela
                também não lê o que está escondido assim. */}
            <input
              type="radio"
              name="mapa-indicador"
              id={`mapa-${c.chave}`}
              value={c.chave}
              defaultChecked={i === 0}
              className={estilos.radio}
            />
            <label htmlFor={`mapa-${c.chave}`} className={estilos.rotuloOpcao}>
              {c.rotulo}
            </label>
          </span>
        ))}
      </fieldset>

      <svg
        viewBox={malha.viewBox}
        className={estilos.mapa}
        role="img"
        aria-label={
          "Mapa dos 27 estados do Brasil, colorido pelo indicador selecionado" +
          (destaque ? `, com ${destaque} em destaque` : "") +
          ". Os valores de cada estado estão na tabela abaixo."
        }
      >
        {/* A hachura de "sem dado".
            Medido em 06/09/2026: numa rampa de cinco tons de um matiz so, nao
            existe cor que fique a 3:1 do fundo E distinguivel da faixa
            vizinha -- as faixas adjacentes ficam em 1,04:1, que e o normal de
            um coropleto. Entao "nao sabemos" tem de se distinguir por algo que
            NAO seja luminosidade, e a hachura diagonal e a convencao
            cartografica exatamente por isso: funciona em qualquer vizinhanca,
            em daltonismo, em alto contraste e no papel. */}
        <defs>
          <pattern
            id="mapa-sem-dado"
            width="9"
            height="9"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="9" height="9" className={estilos.hachuraFundo} />
            <line x1="0" y1="0" x2="0" y2="9" className={estilos.hachuraRisco} />
          </pattern>
        </defs>
        {siglas.map((sigla) => {
          const dados: Record<string, string> = {};
          for (const c of camadas) {
            const f = faixaDoValor(c.valores[sigla] ?? null);
            dados[`data-${c.chave}`] = f === null ? "sem" : String(f);
          }
          return (
            <path
              key={sigla}
              d={(malha.caminhos as Record<string, string>)[sigla]}
              className={`${estilos.uf} ${sigla === destaque ? estilos.destacada : ""}`}
              {...dados}
            >
              {/* Só o nome: o valor muda com o indicador escolhido, e um título
                  que envelhece ao trocar diria a coisa errada com confiança. */}
              <title>{sigla}</title>
            </path>
          );
        })}
      </svg>

      <figcaption className={estilos.escala}>
        {camadas.map((c) => (
          <span key={c.chave} className={estilos.textoEscala} data-de={c.chave}>
            {c.legenda}
          </span>
        ))}
        <span className={estilos.rampa} aria-hidden="true">
          <span className={estilos.extremo}>0%</span>
          {Array.from({ length: FAIXAS }, (_, i) => (
            <span key={i} className={estilos.passo} data-faixa={i} />
          ))}
          <span className={estilos.extremo}>100%</span>
          <span className={`${estilos.passo} ${estilos.passoSem}`} data-faixa="sem" />
          <span className={estilos.extremo}>sem dado</span>
        </span>
      </figcaption>
    </figure>
  );
}
