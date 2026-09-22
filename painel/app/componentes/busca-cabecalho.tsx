import e from "./busca-cabecalho.module.css";

/**
 * A busca do cabeçalho — presente em todas as páginas do site.
 *
 * ## O problema que ela resolve
 *
 * Antes dela, procurar um município exigia **voltar à capa**. Quem chega de uma
 * busca externa na página de Sobral e quer ver Quixadá tinha de subir dois
 * níveis. Com 5.571 municípios, "voltar ao começo" é o caminho mais longo que
 * existe.
 *
 * ## Componente de SERVIDOR, e o comportamento em `public/busca.js`
 *
 * Até 22/09/2026 isto era um componente de cliente, e era o ÚNICO nas 5.571
 * páginas de município. Por causa dele cada página levava o runtime do React
 * (~456 KB de JavaScript) e o payload RSC — 61% do HTML, uma segunda cópia
 * serializada do conteúdo. Para uma caixa de busca.
 *
 * Aqui fica só a marcação, idêntica à de antes. O comportamento — o combobox
 * da WAI-ARIA APG, o índice sob demanda, o teclado — mora em `public/busca.js`,
 * que se prende a `search[data-busca]`. As classes do CSS Module vão nos
 * `data-classe-*` da lista, porque o script cria as opções e não conhece os
 * nomes com hash. Ver o cabeçalho daquele arquivo para o padrão e as regras.
 *
 * Os ids são fixos: há exatamente uma busca por página.
 *
 * ## Sem JavaScript
 *
 * O campo não funciona, e a saída está escrita ao lado: cada página de estado
 * lista **todos** os seus municípios como link, e a capa lista os 27 estados.
 * A navegação do site inteiro funciona sem JavaScript; a busca é aceleração,
 * não muleta.
 */
export default function BuscaCabecalho() {
  const idCampo = "busca-cab";
  const idLista = "lista-cab";

  return (
    <search className={e.raiz} data-busca="">
      <div className={e.caixa}>
        <label htmlFor={idCampo} className="so-leitor">
          Buscar município
        </label>
        <svg
          className={e.lupa}
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx="7"
            cy="7"
            r="4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <line
            x1="10.5"
            y1="10.5"
            x2="14"
            y2="14"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <input
          id={idCampo}
          type="text"
          className={e.campo}
          role="combobox"
          aria-expanded="false"
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-describedby={`${idCampo}-ajuda`}
          autoComplete="off"
          spellCheck={false}
          placeholder="Buscar município"
        />

        <ul
          id={idLista}
          role="listbox"
          aria-label="Municípios encontrados"
          className={e.lista}
          hidden
          data-classe-ativa={e.ativa}
          data-classe-nome={e.nome}
          data-classe-uf={e.uf}
          data-classe-vazio={e.vazio}
        />
      </div>

      {/* A contagem é anunciada, não só desenhada. `aria-atomic` explícito
          porque `role="status"` não é atômico por padrão em todo ambiente —
          ver a técnica ARIA22 do WCAG. */}
      <p className="so-leitor" role="status" aria-atomic="true" />

      <p id={`${idCampo}-ajuda`} className="so-leitor">
        Digite o nome e use as setas para escolher. Enter abre a página do
        município.
      </p>

      <p className={e.erro} role="alert" data-erro="" hidden>
        Busca indisponível. <a href="/#municipios">Ver a lista completa</a>.
      </p>
    </search>
  );
}
