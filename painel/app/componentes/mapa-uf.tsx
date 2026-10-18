import malha from "@/dados/malha-uf.json";
import {
  cssDasCamadas, FAIXAS, faixaDoValor, formatarExtremo, formatarValor,
  type CamadaMapa,
} from "@/lib/mapa";
import estilos from "./mapa-uf.module.css";
import FonteGrafico from "./fonte-grafico";

/**
 * Mapa dos 27 estados, colorido por indicador. **Componente de servidor.**
 *
 * ## Por que um mapa aqui, e não mais uma tabela
 *
 * A tabela por estado já existe logo abaixo e continua sendo a fonte dos
 * valores. O mapa responde a outra pergunta, que nenhuma tabela de 27 linhas
 * responde de relance: **onde isso está** — e se a diferença segue a região
 * ou não. Este comentário já citou dois estados vizinhos com as taxas
 * digitadas; número de estado se lê do dado, nunca daqui.
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
 * O custo é 27 caminhos × um atributo por camada, e 8 regras de CSS por
 * camada, geradas por `cssDasCamadas` num `<style>` (ver lá por quê). A malha
 * em si são **9,2 KB comprimidos**, medidos.
 *
 * ## O que o mapa NÃO é
 *
 * Não é instrumento de medida. A projeção é equiretangular com correção de
 * latitude — reconhecível, não exata. E ele **não substitui a tabela**: quem
 * usa leitor de tela recebe o `aria-label` e a tabela de valores que vem com o
 * próprio mapa, porque cor não se lê em voz alta. A tabela mora AQUI, e não na
 * página: até 11/10/2026 o `aria-label` mandava para "a tabela abaixo", e a da
 * capa não tinha nem esgoto nem alfabetização.
 */

/**
 * A fonte de cada camada, pela chave. `CamadaMapa` não tem campo de fonte nem
 * de período (18/10/2026); até ter, mora aqui, ao lado de quem a mostra.
 * Camada sem entrada fica sem linha: melhor nenhuma que uma errada. O ano do
 * PIB e o quadrimestre do RGF não estão no objeto da camada, e não se chutam.
 */
const FONTE_DA_CAMADA: Record<string, [fonte: string, periodo?: string]> = {
  esgoto: ["IBGE, Censo Demográfico", "2022"],
  agua: ["IBGE, Censo Demográfico", "2022"],
  lixo: ["IBGE, Censo Demográfico", "2022"],
  internet: ["IBGE, Censo Demográfico", "2022"],
  alfabetizacao: ["IBGE, Censo Demográfico", "2022"],
  superior: ["IBGE, Censo Demográfico", "2022"],
  desocupacao: ["IBGE, Censo Demográfico", "2022"],
  previdencia: ["IBGE, Censo Demográfico", "2022"],
  "pib-habitante": ["IBGE, PIB dos Municípios e Censo Demográfico 2022"],
  entrega: ["Tesouro Nacional, SICONFI, Relatório de Gestão Fiscal"],
  pessoal: ["Tesouro Nacional, SICONFI, Relatório de Gestão Fiscal"],
};

export default function MapaUf({
  camadas,
  destaque,
  nomes = {},
}: {
  camadas: CamadaMapa[];
  /**
   * Sigla a contornar. Na página do estado ela responde "onde eu estou nisto?",
   * que é a pergunta que um mapa de 27 formas parecidas deixa em aberto.
   */
  destaque?: string;
  /** Sigla para o nome, na tabela de valores. Sem ele, a tabela mostra a sigla. */
  nomes?: Record<string, string>;
}) {
  if (!camadas.length) return null;
  // O destacado vai POR ÚLTIMO: o SVG pinta na ordem do documento, e o
  // contorno grosso de um estado desenhado no meio fica coberto pelos vizinhos
  // desenhados depois — some justamente metade do destaque, do lado que faz
  // fronteira, que é quase todo ele.
  const siglas = Object.keys(malha.caminhos).sort()
    .sort((a, b) => Number(a === destaque) - Number(b === destaque));
  const css = cssDasCamadas(camadas.map((c) => c.chave), {
    bloco: estilos.bloco!, uf: estilos.uf!, texto: estilos.textoEscala!,
    extremos: estilos.extremos!,
  });
  const linhas = Object.keys(malha.caminhos)
    .map((sigla) => ({ sigla, nome: nomes[sigla] ?? sigla }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <figure className={estilos.bloco}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
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
          ". Os valores de cada estado estão na tabela logo após o mapa."
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
            const f = faixaDoValor(c.valores[sigla] ?? null, c.min, c.max);
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
        {/* Os extremos são os DA CAMADA (ver `dominio`): com 0% e 100% fixos,
            a rampa diria que o azul mais escuro do ensino superior é 100%. */}
        <span className={estilos.rampa} aria-hidden="true">
          {camadas.map((c) => (
            <span key={c.chave} className={estilos.extremos} data-de={c.chave}>
              <span className={estilos.extremo}>{formatarExtremo(c.min, c.formato)}</span>
              {Array.from({ length: FAIXAS }, (_, i) => (
                <span key={i} className={estilos.passo} data-faixa={i} />
              ))}
              <span className={estilos.extremo}>{formatarExtremo(c.max, c.formato)}</span>
            </span>
          ))}
          <span className={`${estilos.passo} ${estilos.passoSem}`} data-faixa="sem" />
          <span className={estilos.extremo}>sem dado</span>
        </span>
        {destaque && (
          <span className={estilos.chaveContorno}>
            Contorno grosso: {nomes[destaque] ?? destaque}, o estado desta página.
          </span>
        )}
        {/* A fonte da camada ativa, pela mesma troca de CSS do texto acima. */}
        {camadas.map((c) => {
          const fonte = FONTE_DA_CAMADA[c.chave];
          return fonte ? (
            <FonteGrafico key={c.chave} fonte={fonte[0]} periodo={fonte[1]}
              className={estilos.textoEscala} de={c.chave} />
          ) : null;
        })}
      </figcaption>

      <details className={estilos.valores}>
        <summary>Os valores do mapa, estado por estado</summary>
        <div className={`${estilos.rolagem} rola-x`}>
          <table className={estilos.tabela}>
            <caption className="so-leitor">
              Valor de cada estado em cada indicador do mapa.
            </caption>
            <thead>
              <tr>
                <th scope="col">Estado</th>
                {camadas.map((c) => (
                  <th key={c.chave} scope="col" className={estilos.numero}>
                    {c.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ sigla, nome }) => (
                <tr key={sigla}
                    className={sigla === destaque ? estilos.linhaDestaque : undefined}>
                  <th scope="row">{nome}</th>
                  {camadas.map((c) => (
                    <td key={c.chave}>
                      {formatarValor(c.valores[sigla] ?? null, c.formato)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
