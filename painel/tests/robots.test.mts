// O `robots.txt` bloqueia os `dados.csv` de cada página e nada mais: as
// páginas e a base nacional (`/dados/municipios.{csv,xlsx}`) seguem abertas.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import robots from "../app/robots.ts";

/** Casa um padrão do robots.txt como o Google e o Bing: `*` é qualquer trecho, prefixo. */
function bloqueia(padrao: string, url: string): boolean {
  const re = padrao.split("*").map((p) => p.replace(/[.?+^$()[\]{}|\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${re}`).test(url);
}

const disallow = (): string[] => {
  const regra = robots().rules;
  const d = (Array.isArray(regra) ? regra[0] : regra).disallow ?? [];
  return Array.isArray(d) ? d : [d];
};

const bloqueado = (url: string) => disallow().some((p) => bloqueia(p, url));

test("robots: bloqueia o dados.csv das páginas de município, estado e série", () => {
  for (const url of [
    "/municipio/aparecida-sp/dados.csv",
    "/estado/sp/dados.csv",
    "/brasil/ipca/dados.csv",
  ]) {
    assert.ok(bloqueado(url), url);
  }
});

test("robots: páginas e base nacional seguem liberadas", () => {
  for (const url of [
    "/",
    "/municipio/aparecida-sp/",
    "/estado/sp/",
    "/brasil/ipca/",
    "/dados/municipios.csv",
    "/dados/municipios.xlsx",
    "/ajuda/",
  ]) {
    assert.ok(!bloqueado(url), url);
  }
});

test("robots: toda rota dados.csv do app está bloqueada", () => {
  // Rota nova de CSV por página sem linha no robots gastaria rastreio de novo.
  const app = path.join(import.meta.dirname, "..", "app");
  const rotas: string[] = [];
  const andar = (dir: string, rel: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const r = `${rel}/${e.name}`;
      if (e.name === "dados.csv") rotas.push(r);
      else andar(path.join(dir, e.name), r);
    }
  };
  andar(app, "");
  assert.ok(rotas.length >= 3, `achou ${rotas.length}`);
  for (const r of rotas) {
    const exemplo = r.replace(/\[[^\]]+\]/g, "x");
    assert.ok(bloqueado(exemplo), `${r} sem linha no robots`);
  }
});
