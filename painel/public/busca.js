/**
 * A busca do cabeçalho, sem React — o comportamento sobre a marcação que
 * `app/componentes/busca-cabecalho.tsx` gera no servidor.
 *
 * ## Por que existe
 *
 * Medido em 22/09/2026: 61% de cada página de município era o payload RSC, a
 * segunda cópia serializada do conteúdo que o React usa para hidratar. E o ÚNICO
 * componente de cliente daquelas páginas era esta busca. Carregar ~456 KB de
 * runtime e duplicar a página para uma caixa de busca custava ao visitante (peso
 * no celular) e ao site (Deployment Storage da Vercel). Com este arquivo, o
 * `enxugar.mjs` pode tirar o React de toda página que não tem outro componente
 * de cliente.
 *
 * ## O mesmo padrão, as mesmas regras
 *
 * Combobox *Editable With List Autocomplete* da WAI-ARIA APG, como antes: o foco
 * do DOM nunca sai do campo (`aria-activedescendant` indica a opção), Alt+Seta
 * abre sem mover a seleção, Escape fecha e o segundo Escape limpa, Enter sem
 * opção destacada leva ao primeiro resultado, `pointerdown` e não `click` na
 * opção. O índice chega sob demanda, no primeiro foco.
 *
 * ## `slugDe` e `procurar` são exportados de propósito
 *
 * O slug decide o endereço da página, e o build o calcula em `lib/fiscal.ts`.
 * Aqui há uma segunda implementação, e duas implementações divergem — então um
 * teste importa este arquivo e compara as duas nos 5.571 nomes do snapshot.
 * Sem aquele teste, esta cópia seria o link morto de amanhã.
 */

export const MAXIMO = 8;

const normalizar = (s) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Cópia de `slugDe` em `lib/fiscal.ts`. O teste cobra a igualdade. */
export function slugDe(nome, uf) {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base}-${uf.toLowerCase()}`;
}

/** Prefixo antes de "contém", numa passada só — sem `sort` a cada tecla. */
export function procurar(indice, alvo) {
  const prefixo = [];
  const meio = [];
  for (const x of indice) {
    const n = normalizar(x[0]);
    if (n.startsWith(alvo)) {
      prefixo.push(x);
      if (prefixo.length >= MAXIMO) return prefixo;
    } else if (meio.length < MAXIMO && n.includes(alvo)) {
      meio.push(x);
    }
  }
  return [...prefixo, ...meio].slice(0, MAXIMO);
}

function iniciar(raizBusca) {
  const campo = raizBusca.querySelector('[role="combobox"]');
  const lista = raizBusca.querySelector('[role="listbox"]');
  const caixa = campo?.parentElement;
  const status = raizBusca.querySelector('[role="status"]');
  const erroModelo = raizBusca.querySelector("[data-erro]");
  if (!campo || !lista || !caixa || !status) return;

  // As classes vêm da própria marcação (CSS Modules têm nome com hash).
  const c = lista.dataset;
  let indice = null;
  let carregando = false;
  let achados = [];
  let ativo = -1;
  let aberto = false;

  const opcaoId = (i) => `${lista.id}-o${i}`;

  function anunciar(texto) {
    status.textContent = texto;
  }

  function desenhar() {
    const alvo = normalizar(campo.value);
    const mostrar = aberto && !!alvo && !!indice;
    lista.hidden = !mostrar;
    campo.setAttribute("aria-expanded", String(mostrar));
    if (mostrar && ativo >= 0) campo.setAttribute("aria-activedescendant", opcaoId(ativo));
    else campo.removeAttribute("aria-activedescendant");

    lista.replaceChildren();
    if (!achados.length) {
      const li = document.createElement("li");
      li.className = c.classeVazio ?? "";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.textContent = "Nenhum município com esse nome";
      lista.append(li);
      return;
    }
    achados.forEach((x, i) => {
      const li = document.createElement("li");
      li.id = opcaoId(i);
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === ativo));
      if (i === ativo && c.classeAtiva) li.className = c.classeAtiva;
      const nome = document.createElement("span");
      nome.className = c.classeNome ?? "";
      nome.textContent = x[0];
      const uf = document.createElement("span");
      uf.className = c.classeUf ?? "";
      uf.textContent = x[1];
      li.append(nome, uf);
      li.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        ir(x);
      });
      li.addEventListener("mousemove", () => {
        if (ativo !== i) {
          ativo = i;
          desenhar();
        }
      });
      lista.append(li);
    });
  }

  function atualizar() {
    const alvo = normalizar(campo.value);
    achados = !alvo || !indice ? [] : procurar(indice, alvo);
    ativo = -1;
    desenhar();
    if (indice && alvo) {
      anunciar(`${achados.length} ${achados.length === 1
        ? "município encontrado" : "municípios encontrados"} para ${campo.value}.`);
    } else if (!carregando) {
      anunciar("");
    }
  }

  async function carregar() {
    if (indice || carregando) return;
    carregando = true;
    anunciar("Carregando a busca.");
    try {
      const r = await fetch("/dados/indice.json");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      indice = await r.json();
      carregando = false;
      atualizar();
    } catch (causa) {
      // Falha de rede não pode virar campo mudo.
      carregando = false;
      console.error("não foi possível carregar o índice de busca", causa);
      anunciar("A busca não pôde ser carregada.");
      if (erroModelo) erroModelo.hidden = false;
    }
  }

  function ir(x) {
    aberto = false;
    campo.value = "";
    campo.blur();
    desenhar();
    location.assign(`/municipio/${slugDe(x[0], x[1])}/`);
  }

  campo.addEventListener("focus", () => void carregar());
  campo.addEventListener("input", () => {
    aberto = true;
    void carregar();
    atualizar();
  });
  campo.addEventListener("keydown", (ev) => {
    if (ev.altKey && ev.key === "ArrowDown") {
      ev.preventDefault();
      aberto = true;
      desenhar();
      return;
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      if (aberto) aberto = false;
      else campo.value = "";
      if (!aberto && !campo.value) atualizar();
      else desenhar();
      return;
    }
    if (!achados.length) return;
    switch (ev.key) {
      case "ArrowDown":
        ev.preventDefault();
        aberto = true;
        ativo = (ativo + 1) % achados.length;
        desenhar();
        break;
      case "ArrowUp":
        ev.preventDefault();
        aberto = true;
        ativo = ativo <= 0 ? achados.length - 1 : ativo - 1;
        desenhar();
        break;
      case "Home":
        if (aberto) {
          ev.preventDefault();
          ativo = 0;
          desenhar();
        }
        break;
      case "End":
        if (aberto) {
          ev.preventDefault();
          ativo = achados.length - 1;
          desenhar();
        }
        break;
      case "Enter": {
        const x = achados[ativo >= 0 ? ativo : 0];
        if (x) {
          ev.preventDefault();
          ir(x);
        }
        break;
      }
    }
  });
  // Fecha ao clicar fora; `pointerdown`, pelo mesmo motivo da opção.
  document.addEventListener("pointerdown", (ev) => {
    if (aberto && !caixa.contains(ev.target)) {
      aberto = false;
      desenhar();
    }
  });
}

if (typeof document !== "undefined") {
  for (const s of document.querySelectorAll("search[data-busca]")) iniciar(s);
}
