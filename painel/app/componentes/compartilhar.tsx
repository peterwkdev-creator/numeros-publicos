import estilos from "./compartilhar.module.css";

/**
 * "Compartilhar" e "Copiar link" no cabeçalho do município e do estado
 * (17/10/2026; M9 da auditoria de usabilidade de 05/10/2026: nada na página
 * convidava a mandá-la a alguém).
 *
 * Só a marcação; o comportamento é o de `public/compartilhar.js`, sem React.
 * Tudo nasce `hidden`: sem script, ou num navegador que não sabe copiar nem
 * compartilhar, nenhum botão promete o que não faz. O script mostra só o que
 * o navegador oferece (o "Compartilhar" abre a folha do sistema, comum no
 * celular). O aviso é um `role="status"` com `aria-atomic`, como a contagem
 * da busca: o leitor de tela diz "Link copiado." sem tirar o foco do botão.
 */
export default function Compartilhar() {
  return (
    <>
      <div className={estilos.compartilhar} data-compartilhar="" hidden>
        <button type="button" data-acao="compartilhar" hidden>Compartilhar</button>
        <button type="button" data-acao="copiar" hidden>Copiar link</button>
        <span className={estilos.aviso} role="status" aria-atomic="true" data-aviso="" />
      </div>
      <script type="module" src="/compartilhar.js" />
    </>
  );
}
