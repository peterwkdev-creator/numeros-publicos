/**
 * A consulta de seção da página /eleicoes-2026/, sem React: o comportamento
 * sobre o formulário que `app/eleicoes-2026/page.tsx` gera no servidor.
 *
 * O navegador do visitante busca no TSE (resultados.tse.jus.br, que responde
 * com CORS ao domínio do site; a CSP o tem no `connect-src`):
 *
 * 1. `arquivo-urna/3221/config/{uf}/{uf}-p003221-cs.json`: municípios, zonas
 *    e seções do 2º turno (pleito 3221);
 * 2. `.../dados/{uf}/{mu}/{zo}/{se}/p003221-{uf}-m{mu}-z{zo}-s{se}-aux.json`:
 *    a lista de pastas (hashes) da seção, uma por urna que a seção usou;
 * 3. `.../{hash}/o03221{uf}{mu}{zo}{se}-log.jez`: o log da urna. É um ZIP com
 *    um arquivo `logd.dat` comprimido em deflate (lido em 26/10/2026), texto
 *    em latin1, uma linha por evento, campos separados por tabulação: data e
 *    hora, nível, número da urna, origem, mensagem e um código de controle.
 *    O log do 2º turno traz também o 1º turno da mesma urna.
 *
 * O ZIP é aberto aqui mesmo, pelo diretório central, e o deflate pelo
 * `DecompressionStream("deflate-raw")` do navegador: nenhuma biblioteca.
 * Nada se guarda nem passa pelo site.
 *
 * Eventos contados (igualdade da mensagem): "Urna pronta para receber votos",
 * "O voto do eleitor foi computado" e "Procedimento de encerramento
 * confirmado". Seção com mais de uma urna (urna substituída): os logs de
 * todas as pastas são lidos e somados, sem repetir a mesma linha.
 */

const BASE = "https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3221";
const DIAS = [
  { data: "04/10/2026", rotulo: "1º turno, 04/10" },
  { data: "25/10/2026", rotulo: "2º turno, 25/10" },
];
const PRONTA = "Urna pronta para receber votos";
const VOTO = "O voto do eleitor foi computado";
const FIM = "Procedimento de encerramento confirmado";

const form = document.querySelector("form[data-consulta-secao]");
if (form) iniciar(form);

function iniciar(form) {
  const uf = form.querySelector("#cs-uf");
  const mun = form.querySelector("#cs-mun");
  const zona = form.querySelector("#cs-zona");
  const secao = form.querySelector("#cs-secao");
  const botao = form.querySelector("button[type=submit]");
  const status = document.getElementById("cs-status");
  const saida = document.getElementById("cs-resultado");
  if (!uf || !mun || !zona || !secao || !botao || !status || !saida) return;
  // A config guarda a UF de que veio; `vez` muda a cada escolha, e resposta
  // que chega depois de outra escolha (UF A, depois B) é descartada.
  let config = null;
  let vez = 0;

  const avisar = (t) => { status.textContent = t; };
  const opcoes = (sel, itens, vazio) => {
    sel.replaceChildren(new Option(vazio, ""), ...itens.map(([v, t]) => new Option(t, v)));
    sel.disabled = itens.length === 0;
  };
  const limparDe = (...sels) => { for (const s of sels) opcoes(s, [], "—"); botao.disabled = true; };

  uf.addEventListener("change", async () => {
    limparDe(mun, zona, secao);
    saida.replaceChildren();
    config = null;
    const minha = ++vez;
    const u = uf.value;
    if (!u) { avisar(""); return; }
    avisar("Buscando os municípios no TSE…");
    try {
      const d = await json(`${BASE}/config/${u}/${u}-p003221-cs.json`);
      if (minha !== vez) return;
      const abr = (d.abr || []).find((a) => a.cd === u);
      if (!abr) throw new Error("estado não encontrado no arquivo");
      config = { uf: u, mu: abr.mu || [] };
      const lista = config.mu
        .map((m) => [m.cd, m.nm])
        .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
      opcoes(mun, lista, "Escolha o município");
      avisar(`${lista.length} municípios. Escolha o município.`);
    } catch (e) {
      if (minha === vez) avisar(`Não foi possível ler a lista do TSE (${e.message}). Tente de novo mais tarde.`);
    }
  });

  mun.addEventListener("change", () => {
    vez++;
    limparDe(zona, secao);
    saida.replaceChildren();
    const m = config?.mu.find((x) => x.cd === mun.value);
    if (!m) return;
    const zonas = m.zon.map((z) => [z.cd, `Zona ${Number(z.cd)}`]).sort((a, b) => a[0].localeCompare(b[0]));
    opcoes(zona, zonas, "Escolha a zona");
    if (zonas.length === 1) { zona.value = zonas[0][0]; zona.dispatchEvent(new Event("change")); }
    else avisar(`${zonas.length} zonas. Escolha a zona.`);
  });

  zona.addEventListener("change", () => {
    vez++;
    limparDe(secao);
    saida.replaceChildren();
    const z = config?.mu.find((x) => x.cd === mun.value)?.zon.find((x) => x.cd === zona.value);
    if (!z) return;
    const secoes = z.sec
      .map((s) => [s.ns, `Seção ${Number(s.ns)}${s.nsp ? ` (agregada à ${Number(s.nsp)})` : ""}`])
      .sort((a, b) => a[0].localeCompare(b[0]));
    opcoes(secao, secoes, "Escolha a seção");
    avisar(`${secoes.length} seções. Escolha a seção.`);
  });

  secao.addEventListener("change", () => { vez++; saida.replaceChildren(); botao.disabled = !secao.value; });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const u = uf.value, mu = mun.value, zo = zona.value;
    if (!config || config.uf !== u) return;
    const s = config.mu.find((x) => x.cd === mu)?.zon.find((x) => x.cd === zo)?.sec.find((x) => x.ns === secao.value);
    if (!s) return;
    const minha = ++vez;
    // Seção agregada não tem urna própria: o voto dela está na urna da principal.
    const se = s.nsp || s.ns;
    const nomeMun = mun.selectedOptions[0]?.textContent || mu;
    saida.replaceChildren();
    botao.disabled = true;
    avisar("Buscando o registro da urna no TSE…");
    try {
      const pasta = `${BASE}/dados/${u}/${mu}/${zo}/${se}`;
      const aux = await json(`${pasta}/p003221-${u}-m${mu}-z${zo}-s${se}-aux.json`);
      if (minha !== vez) return;
      const comLog = (aux.hashes || []).filter((h) => (h.arq || []).some((a) => a.tp === "log"));
      // Só as pastas totalizadas; se nenhuma estiver, as que houver, e o
      // resultado diz que não foram totalizadas.
      const totalizadas = comLog.filter((h) => /^totaliz/i.test(h.st || ""));
      const hashes = totalizadas.length ? totalizadas : comLog;
      if (hashes.length === 0) throw new Error("a seção não tem log publicado");
      const arquivos = hashes.map((h) => `${pasta}/${h.hash}/${h.arq.find((a) => a.tp === "log").nm}`);
      avisar(`Lendo ${arquivos.length === 1 ? "o log da urna" : `os ${arquivos.length} logs das urnas da seção`}…`);
      const linhas = new Set();
      for (const url of arquivos) {
        const texto = await lerLog(url);
        if (minha !== vez) return;
        for (const l of texto.split(/\r?\n/)) if (l) linhas.add(l);
      }
      const r = contar(linhas, u);
      mostrar(saida, r, {
        u, nomeMun, zo, se, agregada: s.nsp ? s.ns : null, arquivos,
        naoTotalizada: totalizadas.length === 0,
      });
      const t2 = r.get(DIAS[1].data);
      avisar(`Seção ${Number(se)} da zona ${Number(zo)}, ${nomeMun}: ` +
        `${fmt(t2.votos)} votos registrados em 25/10` +
        (t2.fim ? `, encerramento às ${t2.fim} de Brasília` : "") +
        `, ${fmt(t2.depois17)} a partir das 17h de Brasília.`);
    } catch (e) {
      if (minha === vez) avisar(`Não foi possível ler o registro da urna (${e.message}).`);
    } finally {
      if (minha === vez) botao.disabled = !secao.value;
    }
  });
}

const fmt = (n) => n.toLocaleString("pt-BR");

async function json(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`TSE respondeu ${r.status}`);
  return r.json();
}

async function lerLog(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`TSE respondeu ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const dados = await extrair(bytes, "logd.dat");
  return new TextDecoder("latin1").decode(dados);
}

/** Um arquivo de dentro do ZIP, pelo diretório central (vale também quando
 *  o cabeçalho local não traz o tamanho, com o bit 3 ligado). */
async function extrair(b, nome) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fim = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error("o arquivo não é um ZIP");
  const total = v.getUint16(fim + 10, true);
  let p = v.getUint32(fim + 16, true);
  for (let k = 0; k < total; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("ZIP malformado");
    const metodo = v.getUint16(p + 10, true);
    const tamanho = v.getUint32(p + 20, true);
    const n = v.getUint16(p + 28, true), x = v.getUint16(p + 30, true), c = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const este = new TextDecoder("latin1").decode(b.subarray(p + 46, p + 46 + n));
    p += 46 + n + x + c;
    if (este !== nome) continue;
    const ini = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const corpo = b.subarray(ini, ini + tamanho);
    if (metodo === 0) return corpo;
    if (metodo !== 8) throw new Error(`compressão ${metodo} não suportada`);
    let descompactar;
    try {
      descompactar = new DecompressionStream("deflate-raw");
    } catch {
      throw new Error("este navegador não abre arquivo compactado; uma versão recente do Chrome, Edge, Firefox ou Safari abre");
    }
    const fluxo = new Blob([corpo]).stream().pipeThrough(descompactar);
    return new Uint8Array(await new Response(fluxo).arrayBuffer());
  }
  throw new Error(`${nome} não está no arquivo`);
}

/** Quantas horas o fuso do estado fica atrás do de Brasília (sem horário de
 *  verão). Só é usado quando o log não permite medir: parte do Amazonas está
 *  duas horas atrás, e Fernando de Noronha uma à frente. */
const FUSO_UF = { ac: 2, am: 1, mt: 1, ms: 1, ro: 1, rr: 1 };

/** A votação abre às 8h de Brasília no país inteiro; a hora em que a urna
 *  ficou pronta, no relógio dela, diz quanto ele difere. Pronta às 07:00:01
 *  é uma hora atrás. Se a hora não estiver no começo de 5h a 9h (urna
 *  substituída no meio do dia, por exemplo), vale o fuso do estado. */
function atrasoDoRelogio(pronta, uf) {
  if (pronta) {
    const [h, m] = pronta.split(":").map(Number);
    if (h >= 5 && h <= 9 && m < 10) return { horas: 8 - h, como: "log" };
  }
  return { horas: FUSO_UF[uf] ?? 0, como: "estado" };
}

function emBrasilia(hora, atraso) {
  if (!hora) return null;
  const h = (Number(hora.slice(0, 2)) + atraso + 24) % 24;
  return `${String(h).padStart(2, "0")}${hora.slice(2)}`;
}

/** Por dia de eleição: hora em que a urna ficou pronta, a do encerramento,
 *  votos por hora e os votos a partir das 17h, tudo em hora de Brasília
 *  (as do relógio da urna ficam em `prontaUrna` e `fimUrna`). */
function contar(linhas, uf) {
  const bruto = new Map(DIAS.map((d) => [d.data, { horas: [], pronta: null, fim: null, urnas: new Set() }]));
  for (const l of linhas) {
    const c = l.split("\t");
    if (c.length < 5) continue;
    const dia = bruto.get(c[0].slice(0, 10));
    if (!dia) continue;
    const hora = c[0].slice(11, 19);
    const msg = c[4];
    if (msg === PRONTA) { if (!dia.pronta || hora < dia.pronta) dia.pronta = hora; dia.urnas.add(c[2]); }
    else if (msg === FIM) { if (!dia.fim || hora > dia.fim) dia.fim = hora; }
    else if (msg === VOTO) dia.horas.push(hora);
  }
  const r = new Map();
  for (const [data, d] of bruto) {
    const atraso = atrasoDoRelogio(d.pronta, uf);
    const porHora = new Map();
    let depois17 = 0;
    for (const hora of d.horas) {
      const b = emBrasilia(hora, atraso.horas);
      porHora.set(b.slice(0, 2), (porHora.get(b.slice(0, 2)) || 0) + 1);
      if (b >= "17:00:00") depois17 += 1;
    }
    r.set(data, {
      votos: d.horas.length, porHora, depois17, urnas: d.urnas, atraso,
      pronta: emBrasilia(d.pronta, atraso.horas), fim: emBrasilia(d.fim, atraso.horas),
      prontaUrna: d.pronta, fimUrna: d.fim,
    });
  }
  return r;
}

function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "style") e.style.cssText = v;
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...filhos);
  return e;
}

function comoAtraso(a) {
  if (a.horas === 0) return "relógio da urna no horário de Brasília";
  const quanto = `${Math.abs(a.horas)} h ${a.horas > 0 ? "atrás" : "à frente"} de Brasília`;
  return a.como === "log"
    ? `relógio da urna ${quanto}, pela hora em que ela ficou pronta`
    : `relógio da urna tomado como ${quanto}, pelo fuso do estado`;
}

function mostrar(saida, r, info) {
  const horas = new Set();
  for (const d of r.values()) for (const h of d.porHora.keys()) horas.add(h);
  const ordem = [...horas].sort();
  const maior = Math.max(1, ...[...r.values()].flatMap((d) => [...d.porHora.values()]));

  const resumo = el("ul");
  for (const { data, rotulo } of DIAS) {
    const d = r.get(data);
    const urna = d.atraso.horas === 0 ? ""
      : ` (no relógio da urna, ${d.prontaUrna ?? "—"} e ${d.fimUrna ?? "—"})`;
    resumo.append(el("li", {},
      el("strong", {}, `${rotulo}: `),
      d.votos === 0 && !d.pronta
        ? "nenhum registro desta data no log lido."
        : `urna pronta às ${d.pronta ?? "—"} e encerramento às ${d.fim ?? "—"}, hora de Brasília${urna}; ` +
          `${fmt(d.votos)} votos registrados, ${fmt(d.depois17)} a partir das 17h de Brasília ` +
          `(${comoAtraso(d.atraso)}).`));
  }

  const tabela = el("table");
  tabela.append(el("caption", { className: "so-leitor" }, "Votos registrados por hora de Brasília, nos dois turnos"));
  const cab = el("tr", {}, el("th", { scope: "col" }, "Hora de Brasília"));
  for (const { rotulo } of DIAS) cab.append(el("th", { scope: "col" }, rotulo));
  tabela.append(el("thead", {}, cab));
  const corpo = el("tbody");
  for (const h of ordem) {
    const tr = el("tr", {}, el("th", { scope: "row" }, `${h}h`));
    for (const { data } of DIAS) {
      const n = r.get(data).porHora.get(h) || 0;
      tr.append(el("td", {}, `${fmt(n)} `,
        el("span", { className: "barra-hora", "aria-hidden": "true", style: `width:${(n / maior) * 4}rem` })));
    }
    corpo.append(tr);
  }
  tabela.append(corpo);

  const fontes = el("p", { className: "ressalva" });
  if (info.naoTotalizada) fontes.append("Nenhuma pasta desta seção consta como totalizada no TSE; os números são do log publicado. ");
  fontes.append(info.arquivos.length > 1
    ? `A seção usou ${info.arquivos.length} urnas (substituição): os logs de todas foram lidos e somados. Arquivos originais: `
    : "Arquivo original: ");
  info.arquivos.forEach((u, i) => {
    if (i) fontes.append(", ");
    fontes.append(el("a", { href: u, rel: "noopener" }, u.split("/").pop()));
  });
  fontes.append(".");

  const titulo = `Seção ${Number(info.se)}, zona ${Number(info.zo)}, ${info.nomeMun} (${info.u.toUpperCase()})` +
    (info.agregada ? `, que recebe também a seção ${Number(info.agregada)} (agregada)` : "");
  saida.replaceChildren(el("h3", {}, titulo), resumo, el("div", { className: "rola-x" }, tabela), fontes);
}
