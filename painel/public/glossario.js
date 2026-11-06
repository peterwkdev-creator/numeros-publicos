/**
 * A explicação do `<Termo>` (`app/componentes/termo.tsx`), posta na caixa só
 * quando a pessoa chega ao termo (06/11/2026).
 *
 * ## Por que
 *
 * Até aqui a frase ia escrita dentro de cada página: ~37 caixas na página de
 * município, 20% do texto, iguais nas 5.571 (medido em 05/11/2026). Agora o
 * HTML leva o termo, o "Ler mais na Ajuda" e o "Fechar"; a frase vem de
 * `/dados/glossario.json` (gerado de `lib/glossario.ts`, a mesma fonte do
 * glossário A–Z da `/ajuda/`, que segue inteiro no HTML).
 *
 * ## Quando a frase entra
 *
 * O arquivo se pede logo que a página carrega, se ela tem algum termo (um só
 * para o site todo; o navegador o guarda entre páginas). A frase entra na
 * caixa no primeiro sinal de que a pessoa vai lê-la, e só naquele termo:
 *
 * | Sinal | Quem |
 * |---|---|
 * | `focusin` no termo | teclado e leitor de tela: entra antes de o leitor ler a descrição (`aria-describedby`) |
 * | `pointerover` / `pointerdown` | mouse e toque (e a dica por hover do navegador sem Popover API) |
 * | `beforetoggle` da caixa | qualquer outro jeito de abrir |
 *
 * Se o arquivo chega depois de a caixa abrir, ela se preenche na chegada.
 * Sem script, ou se o pedido falhar, a caixa abre com o "Ler mais na Ajuda",
 * que leva à mesma frase.
 */

const ATRIBUTO = "data-termo";
const TEXTO = "data-termo-texto";

if (document.querySelector(`[${ATRIBUTO}]`)) iniciar();

function iniciar() {
  let frases = null;

  const preencher = (alvo) => {
    if (!frases || !alvo || alvo.textContent) return;
    const frase = frases[alvo.getAttribute(TEXTO)];
    if (typeof frase === "string") alvo.textContent = frase;
  };

  // O gatilho aponta para a frase pelo `aria-describedby`.
  const doGatilho = (no) => {
    const gatilho = no instanceof Element ? no.closest(`[${ATRIBUTO}]`) : null;
    if (!gatilho) return null;
    return document.getElementById(gatilho.getAttribute("aria-describedby") ?? "");
  };

  const aoChegar = (ev) => preencher(doGatilho(ev.target));
  document.addEventListener("focusin", aoChegar);
  document.addEventListener("pointerover", aoChegar, { passive: true });
  document.addEventListener("pointerdown", aoChegar, { passive: true });
  // `beforetoggle` não sobe pela árvore: só a captura o vê no documento.
  document.addEventListener(
    "beforetoggle",
    (ev) => {
      if (ev.target instanceof Element) preencher(ev.target.querySelector(`[${TEXTO}]`));
    },
    true,
  );

  fetch("/dados/glossario.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (!json) return;
      frases = json;
      // O que a pessoa já abriu ou focou antes de o arquivo chegar.
      preencher(doGatilho(document.activeElement));
      try {
        for (const caixa of document.querySelectorAll(":popover-open")) {
          preencher(caixa.querySelector(`[${TEXTO}]`));
        }
      } catch {
        // Navegador sem `:popover-open`: a dica é por hover e se preenche no
        // `pointerover` seguinte.
      }
    })
    .catch(() => {});
}
