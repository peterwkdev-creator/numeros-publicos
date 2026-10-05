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
 * opção destacada leva ao primeiro resultado (mas não a uma sugestão),
 * `pointerdown` e não `click` na opção. O índice chega sob demanda, no
 * primeiro foco.
 *
 * ## `slugDe` e `procurar` são exportados de propósito
 *
 * O slug decide o endereço da página, e o build o calcula em `lib/fiscal.ts`.
 * Aqui há uma segunda implementação, e duas implementações divergem — então um
 * teste importa este arquivo e compara as duas nos 5.571 nomes do snapshot.
 * Sem aquele teste, esta cópia seria o link morto de amanhã.
 */

export const MAXIMO = 8;

/**
 * A chave que se compara: sem acento, sem caixa e só com letra e número.
 *
 * "Sant'Ana", "Santana" e "sant ana" viram a mesma chave, e "embu guacu" acha
 * Embu-Guaçu. Medido na auditoria de usabilidade de 05/10/2026:
 * "santana do livramento" não achava Sant'Ana do Livramento, porque o
 * apóstrofo ficava na chave do nome e não na do que se digitou.
 */
export const chave = (s) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");

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

/** As chaves dos nomes, uma vez por índice e não a cada tecla. */
const normalizados = new WeakMap();

function chaves(indice) {
  let nomes = normalizados.get(indice);
  if (!nomes) {
    nomes = indice.map((x) => chave(x[0]));
    normalizados.set(indice, nomes);
  }
  return nomes;
}

/**
 * O endereço de uma entrada do índice. Estado tem um terceiro campo e vai à
 * página dele (`slugUf` em `lib/estado.ts`, que o teste compara); município
 * vai pelo slug.
 */
export function destino(x) {
  return x[2] ? `/estado/${x[1].toLowerCase()}/` : `/municipio/${slugDe(x[0], x[1])}/`;
}

/** O que vai ao lado do nome: a UF do município, ou "estado". */
export const onde = (x) => (x[2] ? "estado" : x[1]);

/**
 * Nome exato, depois prefixo, depois "contém", numa passada só — sem `sort`
 * a cada tecla.
 *
 * A faixa do nome exato entrou com os estados (05/10/2026): "parana" casa
 * por prefixo com dezenas de nomes, e sem ela o Paraná e Paranã/TO dependiam
 * de a população os pôr entre os 8.
 *
 * Devolve também o **total**: "8 resultados" quando há 54 diz à pessoa que o
 * nome que ela procura não existe, quando ele só ficou fora do corte. Por
 * isso a passada vai até o fim, sobre nomes normalizados uma vez só.
 */
export function procurar(indice, alvo) {
  const nomes = chaves(indice);
  const exato = [];
  const prefixo = [];
  const meio = [];
  let total = 0;
  indice.forEach((x, i) => {
    const n = nomes[i];
    if (n === alvo) {
      total += 1;
      if (exato.length < MAXIMO) exato.push(x);
    } else if (n.startsWith(alvo)) {
      total += 1;
      if (prefixo.length < MAXIMO) prefixo.push(x);
    } else if (n.includes(alvo)) {
      total += 1;
      if (meio.length < MAXIMO) meio.push(x);
    }
  });
  return { achados: [...exato, ...prefixo, ...meio].slice(0, MAXIMO), total };
}

/**
 * A menor distância de edição entre `a` e algum COMEÇO de `b`: quem digita
 * "fortales" ainda não terminou, e o nome inteiro estaria a duas letras.
 * Para assim que a linha inteira passa do teto, que é o caso de quase todo
 * nome, então a passada sobre os 5.571 custa pouco mais que a do `procurar`.
 */
function distanciaAoComeco(a, b, teto) {
  if (b.length < a.length - teto) return teto + 1;
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        anterior[j] + 1,
        atual[j - 1] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      atual.push(v);
      if (v < menor) menor = v;
    }
    if (menor > teto) return teto + 1;
    anterior = atual;
  }
  return Math.min(...anterior);
}

export const SUGESTOES = 3;

/**
 * Quando nada casa, os nomes a uma ou duas letras do que se digitou:
 * "fortalesa" acha Fortaleza. Abaixo de 4 letras não sugere (com 3, tudo
 * fica perto de tudo); até 5 aceita uma letra errada, a partir de 6, duas.
 * Na mesma distância vale a ordem do índice, que é a população.
 */
export function sugerir(indice, alvo) {
  if (alvo.length < 4) return [];
  const teto = alvo.length < 6 ? 1 : 2;
  const nomes = chaves(indice);
  const perto = [];
  nomes.forEach((n, i) => {
    const d = distanciaAoComeco(alvo, n, teto);
    if (d <= teto) perto.push([d, i]);
  });
  perto.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return perto.slice(0, SUGESTOES).map(([, i]) => indice[i]);
}

const inteiro = new Intl.NumberFormat("pt-BR");

/**
 * O que o leitor de tela ouve. Com corte, diz o total e o que fazer; sem
 * nada, diz onde está a saída (o link para a lista por estado, que vem
 * logo depois do campo na ordem do Tab).
 */
export function anuncio(total, termo) {
  if (!total) {
    return `Nenhum município ou estado encontrado para ${termo}. Tab leva à lista por estado.`;
  }
  if (total === 1) return `1 resultado para ${termo}.`;
  const frase = `${inteiro.format(total)} resultados para ${termo}`;
  return total > MAXIMO
    ? `${frase}; a lista mostra os ${MAXIMO} primeiros. Continue digitando para filtrar.`
    : `${frase}.`;
}

/** O anúncio quando nada casa e há nomes parecidos. */
export function anuncioSugestao(termo, sugestoes) {
  const nomes = sugestoes.map((x) => `${x[0]} (${onde(x)})`).join(", ");
  return `Nenhum município ou estado encontrado para ${termo}. Você quis dizer: ${nomes}?`;
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
  return {
    campo,
    lista,
    status,
    caixa: campo.parentElement,
    erro: raiz.querySelector("[data-erro]"),
    // A janela que envolve a lista e a saída; as duas são opcionais, para o
    // script novo não quebrar sobre uma página guardada com a marcação velha.
    janela: raiz.querySelector("[data-janela]"),
    saida: raiz.querySelector("[data-saida]"),
  };
}

function iniciar() {
  let indice = null;
  let carregando = false;
  let achados = [];
  let total = 0;
  // `achados` são sugestões aproximadas, e não resultados: nada casou.
  let sugestao = false;
  let ativo = -1;
  let aberto = false;

  const opcaoId = (lista, i) => `${lista.id}-o${i}`;

  function anunciar(texto) {
    const p = partes();
    if (p) p.status.textContent = texto;
  }

  /** A lista está à vista — a mesma condição que a desenha. */
  function visivel(p) {
    return aberto && !!chave(p.campo.value) && !!indice;
  }

  function desenhar() {
    const p = partes();
    if (!p) return;
    const { campo, lista } = p;
    // As classes vêm da própria marcação (CSS Modules têm nome com hash).
    const c = lista.dataset;
    const mostrar = visivel(p);
    lista.hidden = !mostrar;
    if (p.janela) p.janela.hidden = !mostrar;
    // Sem resultado (com ou sem sugestão), a saída: "Ver a lista por estado".
    // É link FORA da lista, e não opção dela: listbox só tem `option`, e uma
    // opção que navega para outro lugar mentiria sobre o que o Enter faz.
    if (p.saida) p.saida.hidden = !(mostrar && !total);
    campo.setAttribute("aria-expanded", String(mostrar));
    if (mostrar && ativo >= 0) campo.setAttribute("aria-activedescendant", opcaoId(lista, ativo));
    else campo.removeAttribute("aria-activedescendant");

    lista.replaceChildren();
    if (!achados.length) {
      const li = document.createElement("li");
      li.className = c.classeVazio ?? "";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.textContent = "Nenhum município ou estado com esse nome";
      lista.append(li);
      return;
    }
    // Sem `data-i` e sem `id`, como a dica de corte abaixo: só avisa que o que
    // vem depois é palpite, para ninguém ler "Fortaleza" como resultado de
    // "fortalesa" sem perceber a troca.
    if (sugestao) {
      const li = document.createElement("li");
      li.className = c.classeVazio ?? "";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.setAttribute("aria-disabled", "true");
      li.textContent = "Nenhum município ou estado com esse nome. Você quis dizer:";
      lista.append(li);
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
      uf.textContent = onde(x);
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
    const alvo = chave(p.campo.value);
    ({ achados, total } = !alvo || !indice
      ? { achados: [], total: 0 } : procurar(indice, alvo));
    sugestao = false;
    if (indice && alvo && !total) {
      achados = sugerir(indice, alvo);
      sugestao = achados.length > 0;
    }
    ativo = -1;
    desenhar();
    if (indice && alvo) {
      anunciar(sugestao ? anuncioSugestao(p.campo.value, achados) : anuncio(total, p.campo.value));
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
    location.assign(destino(x));
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
        // Sugestão só se aceita escolhendo: o Enter direto levaria a um
        // município que a pessoa não digitou.
        const x = ativo >= 0 ? achados[ativo] : sugestao ? undefined : achados[0];
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
  // A saída fecha a janela no `click`, e não no `pointerdown`: esconder o
  // link antes de o botão subir cancelaria o próprio clique. Na capa o link
  // só rola até a seção, e sem isto a janela ficava aberta por cima dela.
  document.addEventListener("click", (ev) => {
    const p = partes();
    if (!p?.saida || !(ev.target instanceof Element) || !p.saida.contains(ev.target)) return;
    aberto = false;
    p.campo.value = "";
    atualizar();
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
