/**
 * O snapshot fiscal, e a junção dele com o do IBGE. **Módulo puro** — sem I/O.
 *
 * `dados/fiscal.json` é produzido pelo motor do `sys-painel-fiscal`
 * (`python -m fiscal exportar`) e **copiado para cá**, versionado. A entrega é
 * explícita de propósito: um build que buscasse dado de outro repositório
 * falharia em silêncio no dia em que aquele repositório mudasse.
 *
 * A chave da junção é o **código IBGE do município** — a mesma dos dois lados,
 * e a razão de os dois sistemas conversarem sem nenhuma tradução.
 *
 * Dividido em `lib/fiscal/` em 16/10/2026 (item 10 da modernização): cada módulo
 * um assunto; este arquivo só reexporta.
 */

export * from "./fiscal/tipos";
export * from "./fiscal/serie";
export * from "./fiscal/funcoes";
export * from "./fiscal/pessoal";
export * from "./fiscal/indices";
export * from "./fiscal/receita";
