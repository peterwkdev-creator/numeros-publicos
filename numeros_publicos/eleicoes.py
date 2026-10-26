"""Eleições 2026: o resultado oficial do TSE para a página `/eleicoes-2026/`
e para o bloco da página de cada município.

A espec é `especs/numeros-publicos-eleicoes-2026.md`, no repositório de
trabalho. A fonte é o JSON de resultado que o próprio TSE publica em
`resultados.tse.jus.br` (o mesmo que o aplicativo de resultados lê):

    {BASE}/{eleição}/dados/{uf}/{uf}[{mun TSE}]-c{cargo}-e{eleição:06}-u.json

- eleição 6257/6258: federal, 1º/2º turno (04/10 e 25/10/2026);
- eleição 6259/6260: estadual, 1º/2º turno;
- cargo `c0001` presidente, `c0003` governador;
- `uf` minúsculo, `br` para o país e `zz` para o exterior.

Os municípios e o código do IBGE vêm de `{eleição}/config/mun-e{eleição}-cm.json`
(`cd` = código do TSE, `cdi` = código do IBGE).

## O que se confere antes de gravar

- Em cada arquivo, a soma dos votos dos candidatos é igual aos votos
  nominais que o próprio arquivo declara.
- Presidente: a soma das 27 UFs e do exterior é igual ao Brasil, candidato
  a candidato, e também no comparecimento, nos brancos e nos nulos.
- Cada cargo: a soma dos municípios de uma UF é igual à UF.

Qualquer diferença, ou qualquer arquivo que falte, faz a coleta terminar com
código diferente de zero e nada se grava (o JSON anterior fica como estava).

## Município sem par no TSE

O site tem os municípios do IBGE; o TSE, os da eleição. O município do site
que não tem `cdi` na tabela do TSE entra em `semPar` e a página mostra uma
nota: nunca um zero, que seria um resultado que não houve.

## Termos de uso

O que a coleta achou sobre licença está em `LICENCA` e vai gravado no JSON
ao lado da origem. Os números são do TSE; aqui só se copiam e se somam para
conferir.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable

BASE = "https://resultados.tse.jus.br/oficial/ele2026"

PRESIDENTE = "0001"
GOVERNADOR = "0003"

#: Eleição por (cargo, turno).
ELEICAO = {
    (PRESIDENTE, 1): 6257,
    (PRESIDENTE, 2): 6258,
    (GOVERNADOR, 1): 6259,
    (GOVERNADOR, 2): 6260,
}

UFS = ("ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms",
       "mg", "pa", "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc",
       "se", "sp", "to")

#: O que se achou sobre os termos de uso, lido na fonte em 26/10/2026. O
#: `resultados.tse.jus.br` não traz licença nem termos; o portal de dados
#: abertos do TSE publica os resultados de eleição com a licença indicada
#: no pacote (CKAN). Ver `ler_licenca_ckan`.
LICENCA = {
    "resultados": "O resultado (resultados.tse.jus.br) e o arquivo de urna não "
                  "trazem licença nem termos de uso no arquivo nem na página "
                  "(conferido em 26/10/2026).",
    "dadosAbertos": "O mesmo resultado, por boletim de urna, está no Portal de "
                    "Dados Abertos do TSE (dadosabertos.tse.jus.br, conjunto "
                    "resultados-2026-boletim-de-urna) sob Creative Commons "
                    "Atribuição (CC BY); a fonte é citada aqui.",
}

#: As colunas fixas do resultado compacto de cada município; depois delas,
#: os votos dos candidatos na ordem da lista do país (presidente) ou da UF
#: (governador).
CAMPOS = ("eleitorado", "comparecimento", "abstencao", "brancos", "nulos",
          "secoesTotalizadas", "secoesTotal")

TENTATIVAS = 5
PARALELOS = 8
PRAZO = 30.0
USER_AGENT = "numeros-publicos/0.1 (dados abertos; numerospublicos.com.br)"


class ErroEleicoes(RuntimeError):
    """A coleta não fecha: arquivo que falta ou soma que não bate."""


# --------------------------------------------------------------------------
# Endereços

def url_resultado(cargo: str, turno: int, abr: str, mun: str | None = None) -> str:
    e = ELEICAO[(cargo, turno)]
    nome = f"{abr}{mun or ''}-c{cargo}-e{e:06d}-u.json"
    return f"{BASE}/{e}/dados/{abr}/{nome}"


def url_config(eleicao: int) -> str:
    return f"{BASE}/{eleicao}/config/mun-e{eleicao:06d}-cm.json"


# --------------------------------------------------------------------------
# Leitura

def _int(v: object) -> int:
    return int(str(v or "0"))


def _pct(v: object) -> float:
    return float(str(v or "0").replace(",", "."))


def ler_resultado(dados: dict) -> dict:
    """Um `-u.json` do TSE na forma da página. Lê pela chave, nunca pela
    posição; o nome só se mostra."""
    cargos = dados.get("carg") or []
    if len(cargos) != 1:
        raise ErroEleicoes(f"esperava um cargo no arquivo, vieram {len(cargos)}")
    cands = []
    for agr in cargos[0].get("agr") or []:
        for par in agr.get("par") or []:
            for c in par.get("cand") or []:
                cands.append({
                    "n": str(c["n"]),
                    "nome": c.get("nmu") or c.get("nm"),
                    "partido": par.get("sg", ""),
                    "votos": _int(c.get("vap")),
                    "pct": _pct(c.get("pvap")),
                    # `e: "s"` marca também quem vai ao 2º turno (st "2º
                    # turno"); eleito é só st "Eleito" (26/10/2026, 11.198
                    # "Eleito" e 12.150 "2º turno" com `e: "s"`).
                    "eleito": str(c.get("st", "")).startswith("Eleito"),
                    "situacao": c.get("st", ""),
                    # "Válido", "Anulado", "Anulado sub judice": o voto do
                    # candidato anulado não entra nos válidos.
                    "destino": c.get("dvt", ""),
                })
    cands.sort(key=lambda c: (-c["votos"], c["n"]))
    s, e, v = dados.get("s") or {}, dados.get("e") or {}, dados.get("v") or {}
    # O voto em candidato anulado (ou anulado sub judice) é contado à parte
    # dos nominais: em 26/10/2026, governador do DF no 1º turno, 1.843.
    nominais = _int(v.get("vnom")) + _int(v.get("van")) + _int(v.get("vansj"))
    soma = sum(c["votos"] for c in cands)
    if soma != nominais:
        raise ErroEleicoes(
            f"{dados.get('cdabr')}: soma dos candidatos {soma} ≠ nominais "
            f"e anulados {nominais}")
    return {
        "gerado": f"{dados.get('dg')} {dados.get('hg')}",
        "final": dados.get("tf") == "s",
        "secoesTotal": _int(s.get("ts")),
        "secoesTotalizadas": _int(s.get("st")),
        "eleitorado": _int(e.get("te")),
        "comparecimento": _int(e.get("c")),
        "pctComparecimento": _pct(e.get("pc")),
        "abstencao": _int(e.get("a")),
        "pctAbstencao": _pct(e.get("pa")),
        "validos": _int(v.get("vv")),
        "anulados": _int(v.get("van")) + _int(v.get("vansj")),
        "brancos": _int(v.get("vb")),
        "pctBrancos": _pct(v.get("pvb")),
        "nulos": _int(v.get("tvn")),
        "pctNulos": _pct(v.get("ptvn")),
        "candidatos": cands,
    }


def compacto(r: dict, ordem: list[str]) -> list[int]:
    """O resultado de um município numa linha: `CAMPOS` e os votos na ordem
    dada. Candidato da lista que não está no arquivo é erro, não zero."""
    votos = {c["n"]: c["votos"] for c in r["candidatos"]}
    falta = [n for n in ordem if n not in votos]
    sobra = [n for n in votos if n not in ordem]
    if falta or sobra:
        raise ErroEleicoes(f"candidatos diferentes da lista: falta {falta}, sobra {sobra}")
    return [r[k] for k in CAMPOS] + [votos[n] for n in ordem]


def ler_municipios(config: dict) -> dict[str, list[dict]]:
    """A tabela do TSE: por UF, `[{tse, ibge, nome}]`; o exterior fica de fora."""
    saida: dict[str, list[dict]] = {}
    for abr in config.get("abr") or []:
        uf = abr["cd"].lower()
        if uf == "zz":
            continue
        saida[uf] = [{"tse": m["cd"], "ibge": str(m.get("cdi") or ""), "nome": m.get("nm", "")}
                     for m in abr.get("mu") or []]
    return saida


# --------------------------------------------------------------------------
# Conferência das somas

SOMAVEIS = ("eleitorado", "comparecimento", "abstencao", "brancos", "nulos",
            "validos", "anulados", "secoesTotal", "secoesTotalizadas")


def _somar(partes: list[dict]) -> dict:
    tot = {k: sum(p[k] for p in partes) for k in SOMAVEIS}
    votos: dict[str, int] = {}
    for p in partes:
        for c in p["candidatos"]:
            votos[c["n"]] = votos.get(c["n"], 0) + c["votos"]
    tot["votos"] = votos
    return tot


def conferir_soma(rotulo: str, todo: dict, partes: list[dict]) -> list[str]:
    """Diferenças entre o todo e a soma das partes (vazio quando bate)."""
    s = _somar(partes)
    erros = [f"{rotulo}: {k} soma {s[k]} ≠ {todo[k]}"
             for k in SOMAVEIS if s[k] != todo[k]]
    for c in todo["candidatos"]:
        if s["votos"].get(c["n"], 0) != c["votos"]:
            erros.append(f"{rotulo}: candidato {c['n']} soma "
                         f"{s['votos'].get(c['n'], 0)} ≠ {c['votos']}")
    return erros


# --------------------------------------------------------------------------
# Transporte: cache em disco, tentativas com espera, até 8 em paralelo

Pedir = Callable[[str], "dict | None"]


def pedir_http(cache: Path | None, reusar: bool = False,
               dormir: Callable[[float], None] = time.sleep) -> Pedir:
    """Devolve `pedir(url)`: o JSON, ou `None` se o TSE responder 404 (o
    arquivo não existe, como o 2º turno de governador onde não houve).
    Erro de rede ou 5xx: tenta de novo com espera crescente e, no fim,
    levanta. Cada resposta boa vai para o cache; com `reusar`, o que já
    está no cache não se pede de novo."""

    def caminho(url: str) -> Path | None:
        if cache is None:
            return None
        return cache / url.removeprefix(BASE + "/")

    def pedir(url: str) -> dict | None:
        p = caminho(url)
        if reusar and p is not None and p.exists():
            return json.loads(p.read_bytes().decode("utf-8"))
        ultimo: Exception | None = None
        for tentativa in range(TENTATIVAS):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=PRAZO) as r:
                    corpo = r.read()
                dados = json.loads(corpo.decode("utf-8"))
                if p is not None:
                    p.parent.mkdir(parents=True, exist_ok=True)
                    tmp = p.with_suffix(".tmp")
                    tmp.write_bytes(corpo)
                    os.replace(tmp, p)
                return dados
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                ultimo = e
            except (urllib.error.URLError, TimeoutError, ConnectionError,
                    json.JSONDecodeError, OSError) as e:
                ultimo = e
            dormir(min(2 ** tentativa, 30))
        raise ErroEleicoes(f"{url}: {ultimo}")

    return pedir


# --------------------------------------------------------------------------
# Coleta

def _em_paralelo(pedir: Pedir, urls: list[str], paralelos: int,
                 andamento: Callable[[int, int], None] | None) -> tuple[dict, list[str]]:
    respostas: dict[str, dict | None] = {}
    falhas: list[str] = []

    def um(url: str):
        try:
            return url, pedir(url), None
        except ErroEleicoes as e:
            return url, None, str(e)

    with ThreadPoolExecutor(max_workers=paralelos) as ex:
        for i, (url, dados, erro) in enumerate(ex.map(um, urls), 1):
            if erro:
                falhas.append(erro)
            else:
                respostas[url] = dados
            if andamento and (i % 500 == 0 or i == len(urls)):
                andamento(i, len(urls))
    return respostas, falhas


def coletar(pedir: Pedir, ibge_do_site: dict[str, str] | None = None,
            paralelos: int = PARALELOS,
            andamento: Callable[[int, int], None] | None = None,
            agora: Callable[[], str] | None = None) -> tuple[dict, dict]:
    """Baixa tudo e devolve `(resumo, municipios)`. Levanta `ErroEleicoes`
    com a lista inteira do que faltou ou não bateu."""
    erros: list[str] = []

    configs = {}
    for cargo, turno in ELEICAO:
        e = ELEICAO[(cargo, turno)]
        if e in configs:
            continue
        c = pedir(url_config(e))
        if c is None:
            raise ErroEleicoes(f"sem a tabela de municípios da eleição {e}")
        configs[e] = ler_municipios(c)

    # 1. O país, as UFs e o exterior; o 2º turno de governador só onde a UF
    #    responde (a lista sai da resposta, não de uma lista fixa).
    topo: list[str] = []
    for turno in (1, 2):
        topo += [url_resultado(PRESIDENTE, turno, a) for a in ("br", *UFS, "zz")]
        topo += [url_resultado(GOVERNADOR, turno, a) for a in UFS]
    r_topo, f = _em_paralelo(pedir, topo, paralelos, None)
    erros += f
    faltam = [u for u in topo if u in r_topo and r_topo[u] is None
              and f"-c{GOVERNADOR}-e{ELEICAO[(GOVERNADOR, 2)]:06d}" not in u]
    erros += [f"{u}: 404" for u in faltam]
    if erros:
        raise ErroEleicoes("\n".join(erros))

    def lido(cargo, turno, abr):
        d = r_topo.get(url_resultado(cargo, turno, abr))
        return ler_resultado(d) if d else None

    try:
        for u, d in r_topo.items():
            if d:
                ler_resultado(d)
    except ErroEleicoes as e:
        raise ErroEleicoes(f"{u}: {e}") from None

    presidente = {}
    for turno in (1, 2):
        br = lido(PRESIDENTE, turno, "br")
        ufs = {a: lido(PRESIDENTE, turno, a) for a in (*UFS, "zz")}
        erros += conferir_soma(f"presidente {turno}º turno, UFs + ZZ = BR",
                               br, list(ufs.values()))
        presidente[str(turno)] = {"brasil": br, "ufs": ufs}
    governador = {"1": {}, "2": {}}
    for turno in (1, 2):
        for a in UFS:
            r = lido(GOVERNADOR, turno, a)
            if r is not None:
                governador[str(turno)][a] = r
    if len(governador["1"]) != len(UFS):
        erros.append("governador 1º turno: faltam UFs")

    # 2. Os municípios: presidente nos dois turnos em todas as UFs;
    #    governador no 1º em todas e no 2º só nas UFs que o tiveram.
    alvos: list[tuple[str, int, str, dict]] = []
    for turno in (1, 2):
        for uf in UFS:
            for m in configs[ELEICAO[(PRESIDENTE, turno)]][uf]:
                alvos.append((PRESIDENTE, turno, uf, m))
        for uf in governador[str(turno)]:
            for m in configs[ELEICAO[(GOVERNADOR, turno)]][uf]:
                alvos.append((GOVERNADOR, turno, uf, m))
    urls = [url_resultado(c, t, uf, m["tse"]) for c, t, uf, m in alvos]
    r_mun, f = _em_paralelo(pedir, urls, paralelos, andamento)
    erros += f

    ordem = {
        "p1": [c["n"] for c in presidente["1"]["brasil"]["candidatos"]],
        "p2": [c["n"] for c in presidente["2"]["brasil"]["candidatos"]],
        "g1": {uf: [c["n"] for c in r["candidatos"]] for uf, r in governador["1"].items()},
        "g2": {uf: [c["n"] for c in r["candidatos"]] for uf, r in governador["2"].items()},
    }
    municipios: dict[str, dict] = {}
    partes: dict[tuple[str, int, str], list[dict]] = {}
    gerados: dict[str, list[str]] = {}
    for (cargo, turno, uf, m), url in zip(alvos, urls):
        if url not in r_mun:
            continue
        d = r_mun[url]
        if d is None:
            erros.append(f"{url}: 404")
            continue
        try:
            r = ler_resultado(d)
        except ErroEleicoes as e:
            erros.append(f"{url}: {e}")
            continue
        partes.setdefault((cargo, turno, uf), []).append(r)
        chave = ("p" if cargo == PRESIDENTE else "g") + str(turno)
        gerados.setdefault(chave, []).append(_iso(r["gerado"]))
        lista = ordem[chave] if cargo == PRESIDENTE else ordem[chave][uf]
        if not m["ibge"]:
            continue
        reg = municipios.setdefault(m["ibge"], {"uf": uf, "tse": m["tse"], "nome": m["nome"]})
        try:
            reg[chave] = compacto(r, lista)
        except ErroEleicoes as e:
            erros.append(f"{url}: {e}")

    for (cargo, turno, uf), ps in sorted(partes.items()):
        todo = (presidente[str(turno)]["ufs"][uf] if cargo == PRESIDENTE
                else governador[str(turno)][uf])
        nome = "presidente" if cargo == PRESIDENTE else "governador"
        erros += conferir_soma(f"{nome} {turno}º turno, municípios = {uf.upper()}", todo, ps)

    if erros:
        raise ErroEleicoes("\n".join(erros))

    sem_par = []
    if ibge_do_site is not None:
        sem_par = [{"ibge": i, "nome": n} for i, n in sorted(ibge_do_site.items())
                   if i not in municipios]
    resumo = {
        "fonte": {
            "orgao": "Tribunal Superior Eleitoral (TSE)",
            "origem": BASE,
            "exemplo": url_resultado(PRESIDENTE, 2, "br"),
            "municipios": url_config(ELEICAO[(PRESIDENTE, 2)]),
            "licenca": LICENCA,
            "coletadoEm": (agora or _agora)(),
        },
        "turnos": {"1": "2026-10-04", "2": "2026-10-25"},
        "presidente": presidente,
        "governador": governador,
        "municipios": {
            "campos": list(CAMPOS),
            "total": len(municipios),
            "gerado": {k: [min(v), max(v)] for k, v in sorted(gerados.items())},
            "semPar": sem_par,
        },
    }
    return resumo, {"campos": list(CAMPOS), "ordem": ordem,
                    "municipios": dict(sorted(municipios.items()))}


def _iso(gerado: str) -> str:
    """`25/10/2026 23:27:02` → `2026-10-25T23:27:02`, para ordenar."""
    d, h = gerado.split(" ")
    dia, mes, ano = d.split("/")
    return f"{ano}-{mes}-{dia}T{h}"


def _agora() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def ibge_do_snapshot(caminho: str | Path) -> dict[str, str]:
    """Os municípios do site (código IBGE → nome), do `snapshot.json`."""
    d = json.loads(Path(caminho).read_bytes().decode("utf-8"))
    return {str(m[0]): m[1] for m in d["municipios"]}


def gravar(caminho: str | Path, dados: dict, compacto_: bool = False) -> None:
    p = Path(caminho)
    p.parent.mkdir(parents=True, exist_ok=True)
    if compacto_:
        texto = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
    else:
        texto = json.dumps(dados, ensure_ascii=False, indent=1)
    tmp = p.with_suffix(".tmp")
    tmp.write_bytes((texto + "\n").encode("utf-8"))
    os.replace(tmp, p)
