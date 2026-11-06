import { useId } from "react";

import { ancoraDe, type ChaveGlossario } from "../../lib/glossario";
import estilos from "./termo.module.css";

/**
 * Um termo técnico com a explicação no próprio lugar — no clique, no toque e
 * no teclado.
 *
 * ## O padrão, e por que mudou em 11/10/2026
 *
 * Era um `<a href="/ajuda/#...">` com a dica em `:hover`/`:focus-visible`. No
 * toque ele **navegava**: a pessoa saía da página para ler uma frase. No mouse
 * a dica não fechava com Esc (WCAG 1.4.13). Agora é a Popover API (Baseline
 * desde 01/2025), declarativa:
 *
 * | Como se chega | O que acontece |
 * |---|---|
 * | **Clique ou toque** | abre a explicação ao lado; a página não muda |
 * | **Teclado** | Tab chega ao termo, Enter abre, Esc fecha e o foco volta |
 * | **Leitor de tela** | `aria-describedby` lê a explicação junto do termo |
 * | **Fora da caixa** | toque ou clique fora fecha (o `popover="auto"`) |
 *
 * Abrir e fechar não pedem JavaScript: o `desidratar.mjs` tira o React da
 * página e isto continua funcionando (a frase, sim, vem por script: abaixo). Navegador sem Popover API cai na dica antiga,
 * por hover e foco (ver o CSS). Espec: `especs/numeros-publicos-tutorial.md`.
 *
 * ## O texto não está aqui, nem no HTML (desde 06/11/2026)
 *
 * Sai de `lib/glossario.ts`, pela `chave`: a mesma frase do glossário A–Z da
 * `/ajuda/`. O "Ler mais" leva à seção que explica por inteiro.
 *
 * A caixa sai do servidor **vazia**: o `public/glossario.js` (carregado pelo
 * `app/layout.tsx`) põe a frase, vinda de `/dados/glossario.json`, quando a
 * pessoa foca, aponta ou abre o termo. Embutida, a frase era 20% do texto da
 * página de município, igual nas 5.571 (medido em 05/11/2026, depois da queda
 * do Google em 02/10). Sem script, a caixa abre só com o "Ler mais na Ajuda".
 *
 * ## Onde pode ir
 *
 * É `<button>` seguido de `<span popover>`: vai em parágrafo, título e
 * cartão, e **não** dentro de link nem de outro botão (interativo dentro de
 * interativo é HTML inválido, e o navegador desmonta a marcação).
 */
export default function Termo({
  chave,
  children,
}: {
  /** A chave do verbete em `lib/glossario.ts`. */
  chave: ChaveGlossario;
  children: React.ReactNode;
}) {
  // Por INSTÂNCIA, e não pela chave: a página de município usa "pessoal" em
  // três lugares, e dois popovers com o mesmo id abririam sempre o primeiro.
  // O `useId` é estável entre builds (sai da posição na árvore), então o
  // `out/` não muda à toa. Sem os caracteres que o React põe no id, porque
  // ele vira nome de âncora no CSS, que só aceita identificador.
  const id = `termo-${chave}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <span
      className={estilos.termo}
      style={{ ["--ancora" as string]: `--${id}` }}
    >
      <button
        type="button"
        className={estilos.gatilho}
        popoverTarget={id}
        aria-describedby={`${id}-texto`}
        data-termo={chave}
      >
        {children}
      </button>
      <span popover="auto" id={id} className={estilos.dica}>
        {/* Vazio de propósito: a frase vem de `/dados/glossario.json` pelo
            `public/glossario.js`, quando a pessoa chega ao termo. */}
        <span id={`${id}-texto`} data-termo-texto={chave} />
        <span className={estilos.rodapeDica}>
          <a className={estilos.mais} href={`/ajuda/#${ancoraDe(chave)}`}>
            Ler mais na Ajuda →
          </a>
          <button
            type="button"
            className={estilos.fechar}
            popoverTarget={id}
            popoverTargetAction="hide"
          >
            Fechar
          </button>
        </span>
      </span>
    </span>
  );
}
