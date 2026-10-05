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

/** Os nomes já normalizados, uma vez por índice e não a cada tecla. */
const normalizados = new WeakMap();

/**
 * Prefixo antes de "contém", numa passada só — sem `sort` a cada tecla.
 *
 * Devolve também o **total**: "8 municípios" quando há 54 diz à pessoa que o
 * nome que ela procura não existe, quando ele só ficou fora do corte. Por
 * isso a passada vai até o fim, sobre nomes normalizados uma vez só.
 */
export function procurar(indice, alvo) {
  let nomes = normalizados.get(indice);
  if (!nomes) {
    nomes = indice.map((x) => normalizar(x[0]));
    normalizados.set(indice, nomes);
  }
  const prefixo = [];
  const meio = [];
  let total = 0;
  indice.forEach((x, i) => {
    const n = nomes[i];
    if (n.startsWith(alvo)) {
      total += 1;
      if (prefixo.length < MAXIMO) prefixo.push(x);
    } else if (n.includes(alvo)) {
      total += 1;
      if (meio.length < MAXIMO) meio.push(x);
    }
  });
  return { achados: [...prefixo, ...meio].slice(0, MAXIMO), total };
}

const inteiro = new Intl.NumberFormat("pt-BR");

/** O que o leitor de tela ouve. Com corte, diz o total e o que fazer. */
export function anuncio(total, termo) {
  if (!total) return `Nenhum município encontrado para ${termo}.`;
  if (total === 1) return `1 município encontrado para ${termo}.`;
  const frase = `${inteiro.format(total)} municípios encontrados para ${termo}`;
  return total > MAXIMO
    ? `${frase}; a lista mostra os ${MAXIMO} primeiros. Continue digitando para filtrar.`
    : `${frase}.`;
}

/** A última linha da lista quando há mais do que cabe nela. */
export function dicaDeCorte(total) {
  return total > MAXIMO
    ? `Mostrando ${MAXIMO} de ${inteiro.format(total)}. Continue digitando o nome.`
    : null;
}

/*
 * ## Os ouvintes moram no `document`, e os elementos são buscados a cada evento
 *
 * Achado numa revisão em 23/09/2026. A capa continua hidratando (tem a tabela
 * filtrável), e a marcação da busca faz parte da árvore do React. Se alguém
 * digita ANTES de a hidratação terminar — segundos, num celular lento —, este
 * script já pôs texto no `role="status"` e opções na lista; o React acusa
 * divergência, refaz a raiz no cliente e **troca o `<input>` por outro**. Com
 * ouvintes presos ao elemento, a busca da capa morria até recarregar.
 *
 * Delegados ao `document`, eles sobrevivem à troca: cada evento pergunta quem é
 * o campo agora. Há uma busca por página (os ids são fixos), então o estado é
 * um só. O teste de regressão troca a marcação por um clone, que é o que o
 * React faz, e cobra que a busca continue respondendo.
 */
const RAIZ = "search[data-busca]";
const CAMPO = `${RAIZ} [role="combobox"]`;

function partes() {
  const raiz = document.querySelector(RAIZ);
  const campo = raiz?.querySelector('[role="combobox"]');
  const lista = raiz?.querySelector('[role="listbox"]');
  const status = raiz?.querySelector('[role="status"]');
  if (!campo || !lista || !status) return null;
  return { campo, lista, status, caixa: campo.parentElement, erro: raiz.querySelector("[data-erro]") };
}

function iniciar() {
  let indice = null;
  let carregando = false;
  let achados = [];
  let total = 0;
  let ativo = -1;
  let aberto = false;

  const opcaoId = (lista, i) => `${lista.id}-o${i}`;

  function anunciar(texto) {
    const p = partes();
    if (p) p.status.textContent = texto;
  }

  /** A lista está à vista — a mesma condição que a desenha. */
  function visivel(p) {
    return aberto && !!normalizar(p.campo.value) && !!indice;
  }

  function desenhar() {
    const p = partes();
    if (!p) return;
    const { campo, lista } = p;
    // As classes vêm da própria marcação (CSS Modules têm nome com hash).
    const c = lista.dataset;
    const mostrar = visivel(p);
    lista.hidden = !mostrar;
    campo.setAttribute("aria-expanded", String(mostrar));
    if (mostrar && ativo >= 0) campo.setAttribute("aria-activedescendant", opcaoId(lista, ativo));
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
      li.id = opcaoId(lista, i);
      li.dataset.i = String(i);
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
      lista.append(li);
    });
    // Sem `data-i` e sem `id`: as setas e o ponteiro não chegam a ela, e
    // `aria-disabled` diz ao leitor de tela que não é um destino.
    const dica = dicaDeCorte(total);
    if (dica) {
      const li = document.createElement("li");
      li.className = c.classeVazio ?? "";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.setAttribute("aria-disabled", "true");
      li.textContent = dica;
      lista.append(li);
    }
  }

  function atualizar() {
    const p = partes();
    if (!p) return;
    const alvo = normalizar(p.campo.value);
    ({ achados, total } = !alvo || !indice
      ? { achados: [], total: 0 } : procurar(indice, alvo));
    ativo = -1;
    desenhar();
    if (indice && alvo) {
      anunciar(anuncio(total, p.campo.value));
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
      // Uma tentativa anterior pode ter falhado e mostrado o aviso; sem isto
      // ele ficava na tela, com `role="alert"`, ao lado da busca funcionando.
      const erro = partes()?.erro;
      if (erro) erro.hidden = true;
      atualizar();
    } catch (causa) {
      // Falha de rede não pode virar campo mudo.
      carregando = false;
      console.error("não foi possível carregar o índice de busca", causa);
      anunciar("A busca não pôde ser carregada.");
      const erro = partes()?.erro;
      if (erro) erro.hidden = false;
    }
  }

  function ir(x) {
    aberto = false;
    const p = partes();
    if (p) {
      p.campo.value = "";
      p.campo.blur();
    }
    desenhar();
    location.assign(`/municipio/${slugDe(x[0], x[1])}/`);
  }

  const doCampo = (ev) => ev.target instanceof Element && ev.target.matches(CAMPO);

  document.addEventListener("focusin", (ev) => {
    if (doCampo(ev)) void carregar();
  });
  document.addEventListener("input", (ev) => {
    if (!doCampo(ev)) return;
    aberto = true;
    void carregar();
    atualizar();
  });
  document.addEventListener("keydown", (ev) => {
    if (!doCampo(ev)) return;
    const p = partes();
    if (!p) return;
    const campo = p.campo;
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
        // Só com a lista à vista. Depois do Escape ela fecha e `achados`
        // continua cheio; sem esta guarda o Enter seguinte navegava para o
        // primeiro resultado sem nada na tela, e o Escape é o "desisto".
        if (!visivel(p)) break;
        const x = achados[ativo >= 0 ? ativo : 0];
        if (x) {
          ev.preventDefault();
          ir(x);
        }
        break;
      }
    }
  });
  // `pointerdown`, e não `click`, na opção: o clique tira o foco do campo antes
  // de disparar. E fecha ao clicar fora, pelo mesmo motivo.
  document.addEventListener("pointerdown", (ev) => {
    const p = partes();
    if (!p || !(ev.target instanceof Element)) return;
    const opcao = ev.target.closest("[data-i]");
    if (opcao && p.lista.contains(opcao)) {
      const x = achados[Number(opcao.dataset.i)];
      if (x) {
        ev.preventDefault();
        ir(x);
      }
      return;
    }
    if (aberto && !p.caixa.contains(ev.target)) {
      aberto = false;
      desenhar();
    }
  });
  document.addEventListener("mouseover", (ev) => {
    const p = partes();
    if (!p || !(ev.target instanceof Element)) return;
    const opcao = ev.target.closest("[data-i]");
    if (!opcao || !p.lista.contains(opcao)) return;
    const i = Number(opcao.dataset.i);
    if (ativo !== i) {
      ativo = i;
      desenhar();
    }
  });
}

if (typeof document !== "undefined" && document.querySelector(RAIZ)) iniciar();
