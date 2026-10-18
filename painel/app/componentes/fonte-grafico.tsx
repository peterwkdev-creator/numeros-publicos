import type { ReactNode } from "react";
import estilos from "./fonte-grafico.module.css";

/**
 * A linha "Fonte: … · período" logo abaixo de um gráfico.
 *
 * Até 18/10/2026 cada seção escrevia a sua, em três estilos, e algumas só no
 * fim da seção, longe do desenho: quem olhava o gráfico não via de onde nem de
 * quando ele vinha. Um componente só, para a linha ter **um estilo e um
 * lugar** — colada ao `<svg>`, como em `serie-brasil-svg.tsx`.
 *
 * `fonte` e `periodo` vêm dos campos do próprio dado (`fiscal.fonte`,
 * `ideb.fonte`, o exercício e o quadrimestre do ponto): esta linha não sabe
 * nada sobre nenhuma fonte, e não deve passar a saber.
 *
 * `className` e `de` existem para o mapa, que mostra a fonte da camada ativa
 * pela mesma troca de CSS do texto da legenda (`data-de`).
 */
export default function FonteGrafico({
  fonte,
  periodo,
  children,
  className,
  de,
}: {
  fonte: ReactNode;
  periodo?: ReactNode;
  /** Complemento depois do ponto final (um link, uma ressalva curta). */
  children?: ReactNode;
  className?: string;
  de?: string;
}) {
  // O ponto final é desta linha: fonte que já termina em ponto não o dobra.
  const texto = typeof fonte === "string" && fonte.endsWith(".")
    ? fonte.slice(0, -1) : fonte;
  return (
    <p
      className={className ? `${estilos.fonte} ${className}` : estilos.fonte}
      data-de={de}
    >
      Fonte: {texto}
      {periodo ? <> · {periodo}</> : null}.
      {children ? <> {children}</> : null}
    </p>
  );
}
