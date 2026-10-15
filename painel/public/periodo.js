/**
 * Os botões de período dos gráficos do `/brasil` (Tudo · 10 anos · 5 anos),
 * sem React — o comportamento sobre a marcação que
 * `app/componentes/serie-brasil-svg.tsx` gera no servidor (15/10/2026).
 *
 * ## Por que existe
 *
 * As séries longas vão de 13 a 38 anos num desenho de 360 de largura: o que
 * mudou nos últimos anos fica espremido no fim. O recorte redesenha a série
 * com os dois eixos refeitos para o período, sem lupa nem arrasto.
 *
 * ## O que ele promete, e o que não
 *
 * - Cada recorte já vem desenhado no HTML, escondido: aqui só se troca qual
 *   aparece. Nenhum número é calculado no navegador.
 * - O grupo nasce `hidden` e só aparece aqui: sem script, o gráfico inteiro
 *   continua na página e nada promete recortar.
 * - Botões de verdade com `aria-pressed`: o teclado chega pelo Tab, o Enter e
 *   o Espaço acionam, e o leitor de tela diz qual está ativo. O desenho que
 *   aparece tem o próprio `aria-label`, com o período recortado.
 * - A tabela de valores abaixo do gráfico não muda: ela é sempre a série
 *   inteira.
 */

for (const grupo of document.querySelectorAll("[data-periodos]")) {
  const figura = grupo.closest("figure");
  if (figura) iniciar(grupo, figura);
}

function iniciar(grupo, figura) {
  const botoes = [...grupo.querySelectorAll("button[data-periodo]")];
  const desenhos = [...figura.querySelectorAll("[data-recorte]")];
  // Sem um desenho para cada botão, o controle prometeria o que não há.
  const faltando = botoes.some(
    (b) => !desenhos.some((d) => d.dataset.recorte === b.dataset.periodo));
  if (faltando) return;

  grupo.hidden = false;
  for (const botao of botoes) {
    botao.addEventListener("click", () => {
      const escolhido = botao.dataset.periodo;
      for (const b of botoes) {
        b.setAttribute("aria-pressed", String(b === botao));
      }
      for (const d of desenhos) d.hidden = d.dataset.recorte !== escolhido;
    });
  }
}
