import { COMO_LER, type TipoDePagina } from "../../lib/como-ler";
import estilos from "./como-ler.module.css";

/**
 * "Como ler esta página": um `<details>` fechado logo abaixo do título.
 *
 * Fechado por padrão, porque quem volta ao site já sabe ler a página e o
 * bloco aberto empurraria o primeiro número para baixo da dobra. É HTML puro:
 * abre e fecha sem JavaScript, com teclado e leitor de tela de graça, e
 * sobrevive à desidratação. O texto é o de `lib/como-ler.ts`, o mesmo da
 * seção "Como ler as páginas" da `/ajuda/` (`ListaComoLer`).
 */
export default function ComoLer({ tipo }: { tipo: TipoDePagina }) {
  return (
    <details className={estilos.comoLer}>
      <summary>Como ler esta página</summary>
      <ListaComoLer tipo={tipo} />
    </details>
  );
}

/**
 * A lista em si. Na `/ajuda/` o link é para a seção da mesma página; fora
 * dela, para a `/ajuda/`.
 */
export function ListaComoLer({ tipo, naAjuda = false }: { tipo: TipoDePagina; naAjuda?: boolean }) {
  return (
    <ol className={estilos.lista}>
      {COMO_LER[tipo].map((item) => (
        <li key={item.titulo}>
          <strong>{item.titulo}.</strong> {item.texto}
          {item.ajuda && (
            <>
              {" "}
              <a href={`${naAjuda ? "" : "/ajuda/"}#${item.ajuda.ancora}`}>
                {item.ajuda.rotulo}
              </a>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
