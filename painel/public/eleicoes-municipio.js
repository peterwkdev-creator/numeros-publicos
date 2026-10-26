/**
 * O bloco "Eleições 2026" da página do município, sem React. Os números do
 * build já estão na página; aqui o navegador pede ao TSE o mesmo arquivo de
 * resultado (o endereço está em `data-url` de cada cargo) e, se TODOS os
 * cargos responderem com arquivo final e completo, troca votos, percentuais e
 * participação pelos do arquivo e diz a hora. Se um só falhar (rede, CORS,
 * TSE fora do ar, arquivo parcial), nada se troca: fica o do build, com a
 * frase da data da coleta, e nunca um bloco meio do build, meio ao vivo.
 * Nada se guarda.
 *
 * O arquivo é o `-u.json` do TSE: os candidatos ficam em
 * `carg[0].agr[].par[].cand[]` (`n` número, `vap` votos, `pvap` percentual
 * como o TSE publica, `dvt` destino do voto); a participação, em `e` (`te`
 * eleitorado, `c` comparecimento) e `v` (`vb` brancos, `tvn` nulos); `tf`
 * "s" marca o arquivo final; `dg` e `hg`, a data e a hora em que foi gerado.
 */

const bloco = document.querySelector("[data-eleicao-municipio]");
if (bloco) atualizar(bloco);

async function atualizar(bloco) {
  const cargos = [...bloco.querySelectorAll("[data-cargo][data-url]")];
  const status = bloco.querySelector("[data-eleicao-status]");
  if (cargos.length === 0 || !status) return;
  const lidos = await Promise.all(cargos.map(async (cargo) => {
    try {
      const r = await fetch(cargo.dataset.url, { cache: "no-store" });
      if (!r.ok) return null;
      const d = await r.json();
      const trocas = preparar(cargo, d);
      return trocas ? { trocas, gerado: quando(d) } : null;
    } catch {
      return null; // Sem acesso: fica o número do build.
    }
  }));
  if (lidos.some((l) => !l)) return;
  for (const { trocas } of lidos) for (const [e, t] of trocas) e.textContent = t;
  const gerado = lidos.map((l) => l.gerado).filter(Boolean).sort((a, b) => b.data - a.data)[0];
  const agora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  status.textContent = `Atualizado ao vivo do TSE às ${agora}` +
    (gerado ? ` (arquivo do TSE gerado em ${gerado.texto}).` : ".");
}

/** "25/10/2026" e "23:27:02" do arquivo, como data comparável e como texto. */
function quando(d) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(d.dg || ""));
  const h = /^(\d{2}):(\d{2})/.exec(String(d.hg || ""));
  if (!m || !h) return null;
  return {
    data: new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(h[1]), Number(h[2])),
    texto: `${d.dg} ${h[1]}:${h[2]}`,
  };
}

/** Um inteiro do arquivo, ou null se não for número. */
function inteiro(v) {
  const n = Number(v);
  return v !== undefined && v !== null && v !== "" && Number.isInteger(n) && n >= 0 ? n : null;
}

const fmt = (n) => n.toLocaleString("pt-BR");

/** As trocas de um cargo, sem aplicar; null se o arquivo não for final ou
 *  faltar qualquer número que a tabela mostra. */
function preparar(cargo, d) {
  if (d?.tf !== "s") return null;
  const cands = new Map();
  for (const agr of d?.carg?.[0]?.agr || []) {
    for (const par of agr.par || []) {
      for (const c of par.cand || []) cands.set(String(c.n), c);
    }
  }
  const trocas = [];
  const linhas = [...cargo.querySelectorAll("tr[data-n]")];
  if (linhas.length === 0) return null;
  for (const tr of linhas) {
    const c = cands.get(tr.dataset.n);
    const votos = inteiro(c?.vap);
    if (votos === null) return null;
    const v = tr.querySelector("[data-v]");
    const p = tr.querySelector("[data-p]");
    if (v) trocas.push([v, fmt(votos)]);
    if (p) {
      const valido = String(c.dvt || "").startsWith("V");
      if (valido && !/^\d+,\d{2}$/.test(String(c.pvap))) return null;
      trocas.push([p, valido ? `${c.pvap}%` : "anulado"]);
    }
  }
  for (const [sel, valor] of [["[data-c]", d.e?.c], ["[data-te]", d.e?.te], ["[data-vb]", d.v?.vb], ["[data-vn]", d.v?.tvn]]) {
    const e = cargo.querySelector(sel);
    if (!e) continue;
    const n = inteiro(valor);
    if (n === null) return null;
    trocas.push([e, fmt(n)]);
  }
  return trocas;
}
