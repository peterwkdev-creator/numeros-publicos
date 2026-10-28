"""MEI optantes pelo SIMEI por município: as Estatísticas do Simples Nacional.

Fonte: Receita Federal, "Estatísticas SIMEI" > "Optantes por UF e Município" >
"Total Geral de Microempreendedores Individuais"
(`www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATBHE/estatisticasSinac.app`).
Um formulário ASP.NET: um pedido por UF e data devolve uma tabela HTML
"Municipio | Total" com a linha TOTAL e o cabeçalho "Posição Consolidada até
dd/mm/aaaa". Espec: `especs/numeros-publicos-mei.md` (raiz).

## O conceito

Conta quem está **enquadrado no SIMEI na data** (decisão de 27/10/2026). Não
é o "MEI ativo" do Mapa de Empresas (13,7 mi no país, contra 17,7 mi aqui).

## As armadilhas medidas (espec, §3), cada uma com teste

1. A data às vezes é **recusada** ("O campo 'Data' deve ser preenchido
   corretamente") e a página volta sem tabela; é intermitente. Repete com
   pausa e teto; esgotado o teto, a fatia não se grava e a coleta termina
   vermelha.
2. `anoConsulta` **preenchido** dá "erro inesperado": a URL o leva vazio.
3. A tabela **omite** o município sem optante: ausência é sem linha, nunca
   zero. Conferências: nomes da tabela ⊂ lista TOM da UF, soma das linhas =
   TOTAL e, na posição mais recente, linhas = municípios do banco na UF.
4. A tabela não traz código nem segue a ordem enviada: a chave é o TOM
   achado **pelo nome dentro da UF**; nome sem par para a coleta.
5. As UFs vêm do `observatorio.db` (`municipio.uf_sigla`), nunca de lista à
   mão: faltar uma das 27 termina vermelho.
6. O passado é "posição consolidada": muda em coleta futura. A releitura
   substitui a fatia (data, UF) numa transação e diz o que mudou.
9. UF **sem nenhum optante** na data (11 UFs em 31/12/2009, medido em
   27/10/2026) volta "Não existem registros satisfazendo os critérios de
   pesquisa.", sem título nem tabela. É fatia vazia (total 0, sem linhas),
   gravada só se a resposta se repete numa sessão nova; na posição mais
   recente a conferência de linhas = municípios a recusa.
8. Nome com apóstrofo: a lista traz `MAE D'AGUA`, a tabela `MAE D&#39;AGUA`;
   os códigos vão entre aspas simples no `hfMunicipios`.

O de-para TOM → IBGE está em `simei_tom.csv` (procedência no cabeçalho dele).
"""

from __future__ import annotations

import csv
import datetime as dt
import html
import re
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable

BASE = ("https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/"
        "ATBHE/estatisticasSinac.app")
#: `anoConsulta` fica VAZIO (armadilha 2): com o ano, a página dá "erro
#: inesperado"; vazio, qualquer data responde. Medido em 27/10/2026.
URL_CONSULTA = (f"{BASE}/EstatisticasOptantesPorDataMunicipio.aspx"
                "?tipoConsulta=2&optanteSimei=&anoConsulta=")
URL_LISTA = f"{BASE}/ConsultaMunicipios.aspx"
URL_INICIO = f"{BASE}/Default.aspx"
#: Licença da fonte: ainda NÃO lida (espec, §2). Sem ela lida e gravada aqui,
#: o dado não se publica (`stack-ingestao.md`).
LICENCA = "não lida (página da Receita sem termo de uso conferido em 27/10/2026)"

DE_PARA = Path(__file__).with_name("simei_tom.csv")
UFS = frozenset("AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN "
                "RO RR RS SC SE SP TO".split())
PRIMEIRO_ANO = 2009   # o MEI começou em 01/07/2009: 2009 é meio ano (§3.7)
ULTIMO_ANO_FECHADO = 2025
#: Teto da repetição da data recusada (armadilha 1). Na pesquisa, toda UF
#: recusada respondeu na 1ª nova tentativa.
TENTATIVAS_DATA = 6
PAUSA = 1.0

_P = "ctl00$ctl00$Conteudo$"
RECUSA = "O campo 'Data' deve ser preenchido corretamente"
ERRO_INESPERADO = "ocorreu um erro inesperado"
SEM_REGISTROS = "Não existem registros satisfazendo os critérios de pesquisa"


class ErroSimei(RuntimeError):
    """A resposta da fonte não passou numa conferência: nada se grava."""


class DataRecusada(ErroSimei):
    """A página recusou a data e voltou sem tabela (armadilha 1)."""


class SemRegistros(ErroSimei):
    """A UF não tem optante na data (armadilha 9): confirmar antes de gravar."""


# ------------------------------------------------------------------ datas

def datas_da_serie(posicao: str) -> list[str]:
    """31/12 de 2009 a 2025 e a posição mais recente, em dd/mm/aaaa."""
    datas = [f"31/12/{a}" for a in range(PRIMEIRO_ANO, ULTIMO_ANO_FECHADO + 1)]
    if posicao not in datas:
        datas.append(posicao)
    return datas


def iso(data: str) -> str:
    """dd/mm/aaaa → aaaa-mm-dd (recusa o que não é data)."""
    return dt.datetime.strptime(data, "%d/%m/%Y").date().isoformat()


# ------------------------------------------------------------------ leitura do HTML

def _numero(texto: str) -> int:
    t = texto.strip()
    if not re.fullmatch(r"\d{1,3}(?:\.\d{3})*", t):
        raise ErroSimei(f"total {texto!r} não é um número inteiro")
    return int(t.replace(".", ""))


def campos_ocultos(pagina: str) -> dict[str, str]:
    return {n: html.unescape(v) for n, v in re.findall(
        r'<input type="hidden" name="(__[A-Z]+)" id="[^"]*" value="([^"]*)"',
        pagina)}


def posicao_consolidada(pagina: str) -> str:
    m = re.search(r"Posi\w+o Consolidada at\w (\d{2}/\d{2}/\d{4})", pagina)
    if not m:
        raise ErroSimei("página sem 'Posição Consolidada até dd/mm/aaaa'")
    return m.group(1)


def ler_lista(pagina: str) -> dict[str, str]:
    """A resposta de `ConsultaMunicipios.aspx`: `{nome: TOM}`. Nome repetido
    na UF tornaria a chave pelo nome ambígua: para."""
    lista: dict[str, str] = {}
    for tom, nome in re.findall(
            r'<option[^>]*value="(\d+)"[^>]*>([^<]*)</option>', pagina):
        nome = html.unescape(nome).strip()
        if nome in lista:
            raise ErroSimei(f"lista TOM com nome repetido: {nome}")
        lista[nome] = tom
    if not lista:
        raise ErroSimei("lista TOM vazia")
    return lista


def hf_municipios(toms: Iterable[str]) -> str:
    """Os códigos entre aspas simples, separados por vírgula (armadilha 8)."""
    return ",".join(f"'{t}'" for t in toms)


def ler_tabela(pagina: str, uf: str, data: str) -> tuple[dict[str, int], int, str]:
    """`({nome: total}, TOTAL, posição consolidada)` da resposta de uma UF e
    data. Confere que o título é o da UF e da data pedidas."""
    if RECUSA in pagina:
        raise DataRecusada(f"{uf} {data}: a fonte recusou a data")
    if ERRO_INESPERADO in pagina:
        raise ErroSimei(f"{uf} {data}: 'erro inesperado' da fonte "
                        "(anoConsulta preenchido?)")
    if SEM_REGISTROS in pagina:
        raise SemRegistros(f"{uf} {data}: a fonte diz que não há registros")
    titulo = re.search(r"Optantes em (\d{2}/\d{2}/\d{4}), no estado (\w\w),", pagina)
    if not titulo:
        raise ErroSimei(f"{uf} {data}: resposta sem o título da consulta")
    if titulo.groups() != (data, uf):
        raise ErroSimei(f"{uf} {data}: a resposta é de {titulo.group(2)} "
                        f"{titulo.group(1)}")
    posicao = posicao_consolidada(pagina)
    grade = re.search(r'<table[^>]*id="[^"]*gridDados"[^>]*>(.*?)</table>',
                      pagina, flags=re.S)
    if not grade:
        raise ErroSimei(f"{uf} {data}: resposta sem a tabela")
    linhas: dict[str, int] = {}
    total = None
    for nome, valor in re.findall(
            r"<td>([^<]*)</td>\s*<td[^>]*>([^<]*)</td>", grade.group(1)):
        nome = html.unescape(nome).strip()
        if nome == "TOTAL":
            total = _numero(valor)
            continue
        if nome in linhas:
            raise ErroSimei(f"{uf} {data}: {nome} repetido na tabela")
        linhas[nome] = _numero(valor)
    if total is None:
        raise ErroSimei(f"{uf} {data}: tabela sem a linha TOTAL")
    return linhas, total, posicao


def conferir(linhas: dict[str, int], total: int, lista: dict[str, str],
             uf: str, data: str, esperados: int | None = None) -> dict[str, int]:
    """`{TOM: total}`. Para se um nome não tem par na lista TOM (armadilha 4),
    se a soma não é o TOTAL ou, quando `esperados` vem (posição mais
    recente), se o número de linhas não é o de municípios do banco."""
    sem_par = sorted(set(linhas) - set(lista))
    if sem_par:
        raise ErroSimei(f"{uf} {data}: nomes da tabela sem par na lista TOM: "
                        f"{sem_par[:5]}")
    soma = sum(linhas.values())
    if soma != total:
        raise ErroSimei(f"{uf} {data}: soma das linhas {soma} ≠ TOTAL {total}")
    if esperados is not None and len(linhas) != esperados:
        raise ErroSimei(f"{uf} {data}: {len(linhas)} linhas, o banco tem "
                        f"{esperados} municípios na UF")
    return {lista[n]: v for n, v in linhas.items()}


# ------------------------------------------------------------------ de-para e UFs

def ler_de_para(caminho: str | Path = DE_PARA) -> dict[str, tuple[int, str]]:
    """`{TOM: (IBGE, UF)}` do `simei_tom.csv` (linhas `#` são a procedência)."""
    with open(caminho, encoding="utf-8", newline="") as f:
        leitor = csv.DictReader(l for l in f if not l.startswith("#"))
        return {r["tom"]: (int(r["ibge"]), r["uf"]) for r in leitor}


def municipios_do_banco(banco: str | Path) -> dict[str, set[int]]:
    """`{UF: {IBGE}}` do `observatorio.db`. Faltar UF para (armadilha 5)."""
    if not Path(banco).exists():
        raise ErroSimei(f"banco {banco} não existe")
    con = sqlite3.connect(f"file:{Path(banco).as_posix()}?mode=ro", uri=True)
    try:
        por_uf: dict[str, set[int]] = {}
        for codigo, uf in con.execute("SELECT codigo, uf_sigla FROM municipio"):
            por_uf.setdefault(uf, set()).add(int(codigo))
    finally:
        con.close()
    return conferir_ufs(por_uf)


def conferir_ufs(por_uf: dict[str, set[int]]) -> dict[str, set[int]]:
    faltam = sorted(UFS - set(por_uf))
    sobram = sorted(set(por_uf) - UFS)
    if faltam or sobram:
        raise ErroSimei(f"UFs do banco: faltam {faltam}, sobram {sobram}")
    return por_uf


def conferir_lista(lista: dict[str, str], de_para: dict[str, tuple[int, str]],
                   uf: str, banco_uf: set[int]) -> None:
    """A lista TOM da Receita, pelo de-para, é exatamente o banco na UF."""
    sem = sorted(t for t in lista.values() if t not in de_para)
    if sem:
        raise ErroSimei(f"{uf}: TOM sem par no simei_tom.csv: {sem[:5]}")
    troca = sorted(t for t in lista.values() if de_para[t][1] != uf)
    if troca:
        raise ErroSimei(f"{uf}: TOM de outra UF no de-para: {troca[:5]}")
    ibge = {de_para[t][0] for t in lista.values()}
    if ibge != banco_uf:
        raise ErroSimei(f"{uf}: a lista TOM tem {len(ibge)} municípios, o banco "
                        f"{len(banco_uf)} (diferença: "
                        f"{sorted(ibge ^ banco_uf)[:5]})")


# ------------------------------------------------------------------ a fonte

Pedir = Callable[[str, "dict[str, str] | None"], str]


def abrir_pedir(timeout: float = 60.0) -> Pedir:
    """Uma sessão com cookie (o formulário guarda estado nela)."""
    import http.cookiejar
    import urllib.parse
    import urllib.request
    op = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    op.addheaders = [("User-Agent", "Mozilla/5.0 (numerospublicos.com.br)"),
                     ("Referer", URL_INICIO)]

    def pedir(url: str, dados: dict[str, str] | None = None) -> str:
        corpo = urllib.parse.urlencode(dados).encode() if dados is not None else None
        with op.open(url, corpo, timeout=timeout) as r:
            return r.read().decode("utf-8")
    return pedir


@dataclass
class Formulario:
    """O formulário já em "Por Município": os campos ocultos e a posição."""
    campos: dict[str, str]
    posicao: str


def abrir_formulario(pedir: Pedir) -> Formulario:
    pedir(URL_INICIO, None)
    pagina = pedir(URL_CONSULTA, None)
    campos = campos_ocultos(pagina)
    campos.update({"__EVENTTARGET": f"{_P}AntesTabela$droplistOpcao",
                   "__EVENTARGUMENT": "",
                   f"{_P}AntesTabela$droplistOpcao": "Por Município"})
    pagina = pedir(URL_CONSULTA, campos)
    if f"{_P}AntesTabela$txtDtIni" not in pagina:
        raise ErroSimei("o formulário não abriu o campo de data 'Por Município'")
    return Formulario(campos_ocultos(pagina), posicao_consolidada(pagina))


def lista_tom(pedir: Pedir, uf: str) -> dict[str, str]:
    return ler_lista(pedir(URL_LISTA, {"uf": uf}))


def consultar(pedir: Pedir, form: Formulario, uf: str, data: str,
              lista: dict[str, str]) -> str:
    campos = dict(form.campos)
    campos.update({
        f"{_P}AntesTabela$droplistOpcao": "Por Município",
        f"{_P}AntesTabela$txtDtIni": data,
        f"{_P}AntesTabela$btnExibir": "Exibir Dados",
        f"{_P}AposTabela$ddlUf": uf,
        f"{_P}AposTabela$hfUF": uf,
        f"{_P}AposTabela$hfCheck": "true",
        f"{_P}AposTabela$hfMunicipios": hf_municipios(lista.values()),
    })
    return pedir(URL_CONSULTA, campos)


@dataclass
class Fatia:
    uf: str
    data: str                 # dd/mm/aaaa
    valores: dict[str, int]   # {TOM: total}
    total: int
    posicao: str
    tentativas: int = 1


def coletar_fatia(pedir: Pedir, form: Formulario, uf: str, data: str,
                  lista: dict[str, str], esperados: int | None = None,
                  tentativas: int = TENTATIVAS_DATA,
                  dormir: Callable[[float], None] | None = None,
                  reabrir: Callable[[], Formulario] | None = None) -> Fatia:
    """Uma UF numa data, com a repetição da data recusada (armadilha 1).
    Esgotado o teto, `DataRecusada` sobe: nada se grava."""
    import time
    dormir = dormir or time.sleep
    vazias = 0
    for n in range(1, tentativas + 1):
        try:
            pagina = consultar(pedir, form, uf, data, lista)
            linhas, total, posicao = ler_tabela(pagina, uf, data)
        except SemRegistros:
            vazias += 1
            if vazias == 2:      # a mesma resposta duas vezes: UF sem optante
                valores = conferir({}, 0, lista, uf, data, esperados)
                return Fatia(uf, data, valores, 0,
                             posicao_consolidada(pagina), n)
            dormir(PAUSA * 2 * n)
            if reabrir is not None:
                form = reabrir()
            continue
        except DataRecusada:
            if n == tentativas:
                raise DataRecusada(f"{uf} {data}: data recusada {n} vezes")
            dormir(PAUSA * 2 * n)
            if reabrir is not None:
                form = reabrir()
            continue
        valores = conferir(linhas, total, lista, uf, data, esperados)
        return Fatia(uf, data, valores, total, posicao, n)
    raise ErroSimei(f"{uf} {data}: sem resposta conclusiva em {tentativas} "
                    "tentativas")


# ------------------------------------------------------------------ banco

ESQUEMA = """
-- Uma linha por (data, município) COM optante: a fonte omite o município sem
-- optante, e a ausência fica sem linha (nunca zero). A fatia é (data, UF):
-- reler apaga e regrava a fatia na mesma transação (`stack-ingestao.md`).
CREATE TABLE IF NOT EXISTS simei (
    data TEXT NOT NULL, uf TEXT NOT NULL, municipio INTEGER NOT NULL,
    valor INTEGER NOT NULL, posicao TEXT NOT NULL, coletado_em TEXT NOT NULL,
    PRIMARY KEY (data, municipio));
CREATE INDEX IF NOT EXISTS idx_simei_municipio ON simei (municipio);

CREATE TABLE IF NOT EXISTS fatia (
    data TEXT NOT NULL, uf TEXT NOT NULL, linhas INTEGER NOT NULL,
    total INTEGER NOT NULL, posicao TEXT NOT NULL, tentativas INTEGER NOT NULL,
    origem TEXT NOT NULL, licenca TEXT NOT NULL, coletado_em TEXT NOT NULL,
    PRIMARY KEY (data, uf));
"""


def agora() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


@dataclass
class Mudanca:
    """O que a releitura mudou na fatia (armadilha 6)."""
    total_antes: int | None
    total_depois: int
    mudaram: list[tuple[int, int | None, int | None]] = field(default_factory=list)

    def resumo(self) -> str:
        if self.total_antes is None:
            return "nova"
        if not self.mudaram:
            return "igual à anterior"
        ex = ", ".join(f"{m}: {a}→{d}" for m, a, d in self.mudaram[:3])
        return (f"MUDOU: total {self.total_antes}→{self.total_depois}, "
                f"{len(self.mudaram)} municípios ({ex})")


class ArmazemSimei:
    def __init__(self, caminho: str | Path) -> None:
        self.con = sqlite3.connect(str(caminho))
        self.con.executescript(ESQUEMA)

    def __enter__(self) -> "ArmazemSimei":
        return self

    def __exit__(self, *_) -> None:
        self.con.close()

    def gravar(self, fatia: Fatia, de_para: dict[str, tuple[int, str]]) -> Mudanca:
        """Substitui a fatia (data, UF) numa transação e devolve o que mudou."""
        data, pos, quando = iso(fatia.data), iso(fatia.posicao), agora()
        novos = {de_para[t][0]: v for t, v in fatia.valores.items()}
        antes = dict(self.con.execute(
            "SELECT municipio, valor FROM simei WHERE data = ? AND uf = ?",
            (data, fatia.uf)))
        velho = self.con.execute(
            "SELECT total FROM fatia WHERE data = ? AND uf = ?",
            (data, fatia.uf)).fetchone()
        with self.con:
            self.con.execute("DELETE FROM simei WHERE data = ? AND uf = ?",
                             (data, fatia.uf))
            self.con.executemany(
                "INSERT INTO simei VALUES (?, ?, ?, ?, ?, ?)",
                [(data, fatia.uf, m, v, pos, quando) for m, v in novos.items()])
            self.con.execute(
                "INSERT OR REPLACE INTO fatia VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (data, fatia.uf, len(novos), fatia.total, pos, fatia.tentativas,
                 URL_CONSULTA, LICENCA, quando))
        mudaram = [(m, antes.get(m), novos.get(m))
                   for m in sorted(set(antes) | set(novos))
                   if antes.get(m) != novos.get(m)]
        return Mudanca(velho[0] if velho else None, fatia.total,
                       mudaram if velho else [])

    def totais_por_data(self) -> list[tuple[str, int, int, int]]:
        """`[(data, UFs, municípios com linha, total do país)]`."""
        return list(self.con.execute(
            "SELECT f.data, COUNT(*), SUM(f.linhas), SUM(f.total) FROM fatia f"
            " GROUP BY f.data ORDER BY f.data"))


# ------------------------------------------------------------------ a coleta

def coletar(pedir: Pedir, db: ArmazemSimei, banco_municipios: dict[str, set[int]],
            de_para: dict[str, tuple[int, str]], datas: list[str] | None = None,
            so_atual: bool = False, pausa: float = PAUSA,
            dormir: Callable[[float], None] | None = None,
            reabrir: Callable[[], Pedir] | None = None,
            saida=print) -> tuple[list[str], int]:
    """Todas as UFs do banco nas datas, em série, com pausa. Devolve
    `(falhas, repetições da data recusada)`: falha não impede as outras
    fatias, mas a coleta termina vermelha."""
    import time
    dormir = dormir or time.sleep
    estado = {"pedir": pedir, "form": abrir_formulario(pedir)}
    posicao = estado["form"].posicao
    if so_atual:
        datas = [posicao]
    datas = datas or datas_da_serie(posicao)
    saida(f"posição consolidada até {posicao}; {len(datas)} datas × "
          f"{len(banco_municipios)} UFs")

    def novo_form() -> Formulario:
        if reabrir is not None:
            estado["pedir"] = reabrir()
        estado["form"] = abrir_formulario(estado["pedir"])
        return estado["form"]

    falhas: list[str] = []
    repeticoes = 0
    for uf in sorted(banco_municipios):
        try:
            lista = lista_tom(estado["pedir"], uf)
            conferir_lista(lista, de_para, uf, banco_municipios[uf])
        except (ErroSimei, OSError) as e:
            falhas.append(f"{uf} (lista): {e}")
            saida(f"  [!] {uf}: {e}")
            continue
        for data in datas:
            dormir(pausa)
            esperados = len(banco_municipios[uf]) if data == posicao else None
            try:
                f = coletar_fatia(
                    lambda u, d=None: estado["pedir"](u, d), estado["form"], uf, data,
                    lista, esperados, dormir=dormir, reabrir=novo_form)
            except (ErroSimei, OSError) as e:
                falhas.append(f"{uf} {data}: {e}")
                saida(f"  [!] {uf} {data}: {e}")
                continue
            repeticoes += f.tentativas - 1
            if f.posicao != posicao:
                falhas.append(f"{uf} {data}: posição {f.posicao}, esperava {posicao}")
                saida(f"  [!] {uf} {data}: a posição mudou durante a coleta "
                      f"({posicao} → {f.posicao})")
                continue
            m = db.gravar(f, de_para)
            saida(f"  {uf} {data}: {len(f.valores)} de "
                  f"{len(banco_municipios[uf])} municípios, total {f.total}"
                  f"{f' ({f.tentativas} tentativas)' if f.tentativas > 1 else ''}"
                  f"; {m.resumo()}")
    return falhas, repeticoes
