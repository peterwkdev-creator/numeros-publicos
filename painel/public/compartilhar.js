/**
 * "Compartilhar" e "Copiar link" no cabeçalho do município e do estado, sem
 * React — o comportamento sobre a marcação que
 * `app/componentes/compartilhar.tsx` gera no servidor (17/10/2026).
 *
 * ## O que ele promete, e o que não
 *
 * - O endereço é o canônico da página (`<link rel="canonical">`), sem a
 *   âncora nem parâmetro de quem chegou por um link: quem recebe abre a
 *   página do começo, no `www.`.
 * - Cada botão só aparece se o navegador faz o que ele diz: "Compartilhar"
 *   com `navigator.share` (a folha do sistema), "Copiar link" com a área de
 *   transferência. Sem nenhum dos dois, o grupo fica escondido.
 * - Nada sai do navegador por aqui: nenhum contador, nenhuma rede social
 *   embutida. O site não coleta nada sobre quem o visita.
 * - O resultado vai para o `role="status"`: "Link copiado." ou, se a cópia
 *   falhar, o endereço escrito para copiar à mão. Cancelar a folha do
 *   sistema não é erro e não diz nada.
 */

const grupo = document.querySelector("[data-compartilhar]");
if (grupo) iniciar(grupo);

function iniciar(grupo) {
  const botaoCompartilhar = grupo.querySelector('[data-acao="compartilhar"]');
  const botaoCopiar = grupo.querySelector('[data-acao="copiar"]');
  const aviso = grupo.querySelector("[data-aviso]");
  if (!botaoCompartilhar || !botaoCopiar || !aviso) return;

  const canonico = document.querySelector('link[rel="canonical"]');
  const endereco = canonico ? canonico.href : location.origin + location.pathname;
  const podeCompartilhar = typeof navigator.share === "function";
  const podeCopiar = window.isSecureContext && !!navigator.clipboard?.writeText;
  if (!podeCompartilhar && !podeCopiar) return;

  // Esvazia antes de escrever: a mesma frase duas vezes seguidas não seria
  // anunciada de novo.
  const avisar = (texto) => {
    aviso.textContent = "";
    setTimeout(() => { aviso.textContent = texto; }, 50);
  };

  if (podeCompartilhar) {
    botaoCompartilhar.hidden = false;
    botaoCompartilhar.addEventListener("click", async () => {
      try {
        await navigator.share({ title: document.title, url: endereco });
      } catch (erro) {
        if (erro?.name !== "AbortError") {
          avisar(`Não deu para compartilhar. O endereço é ${endereco}`);
        }
      }
    });
  }
  if (podeCopiar) {
    botaoCopiar.hidden = false;
    botaoCopiar.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(endereco);
        avisar("Link copiado.");
      } catch {
        avisar(`Não deu para copiar. O endereço é ${endereco}`);
      }
    });
  }
  grupo.hidden = false;
}
