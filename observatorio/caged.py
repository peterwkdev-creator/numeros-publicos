"""O Novo Caged: admissões e desligamentos de emprego com carteira, por mês.

Fonte: microdados do Ministério do Trabalho no FTP público
(`ftp.mtps.gov.br/pdet/microdados/NOVO CAGED/AAAA/AAAAMM/`), três arquivos
`.7z` por mês de declaração:

| arquivo | o que traz |
|---|---|
| `CAGEDMOVAAAAMM` | as movimentações do mês, declaradas no prazo |
| `CAGEDFORAAAAMM` | declarações FORA do prazo, entregues neste mês, de meses anteriores |
| `CAGEDEXCAAAAMM` | exclusões entregues neste mês: desfazem uma linha já declarada |

## O número oficial é reproduzível, e a regra é esta

Medido em 29/09/2026 contra o sumário executivo do MTE de julho/2026:

- **o saldo do mês é só o `CAGEDMOV`** (+58.568, e as 27 UFs batem);
- **o saldo "com ajustes" de uma competência M** é o `MOV(M)`, mais as linhas
  de todo `CAGEDFOR` com `competênciamov = M`, menos as linhas de todo
  `CAGEDEXC` com `competênciamov = M` — a exclusão desfaz a linha: tira da
  admissão ou do desligamento que ela era. Com os 21 arquivos de jan–jul/2026
  o acumulado deu +972.203 e 16.257.880 admissões, exatamente o oficial.

## O que o Caged NÃO é

Só vínculo celetista, contado no município do **estabelecimento**: servidor
estatutário e trabalho por conta própria não entram. E só fluxo: o arquivo não
traz quantos empregados o município tem, então não há "variação percentual".

**Município sem linha no mês tem saldo ZERO**, não "sem dado": em julho/2026
foram 69. O código é o do IBGE sem o dígito verificador (6 dígitos), e
`999999` é o "não identificado", que entra no total do país e em nenhum
município.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import shutil
import sqlite3
import subprocess
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Callable, Iterable, Iterator

FTP = "ftp://ftp.mtps.gov.br/pdet/microdados/NOVO%20CAGED"
FTP_PUBLICO = "ftp://ftp.mtps.gov.br/pdet/microdados/NOVO CAGED/"
#: A pasta de cada mês no gov.br, onde está o sumário executivo. Verificado em
#: 29/09/2026 para maio, junho e julho/2026. O link do PDF é LIDO da pasta, e
#: não montado: o gov.br já mostrou dois caminhos para a mesma pasta.
GOV = ("https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/"
       "acoes-e-programas/programas-projetos-acoes-obras-e-atividades/"
       "estatisticas-trabalho/novo-caged")

TIPOS = ("MOV", "FOR", "EXC")
NAO_IDENTIFICADO = 999999
#: A janela que o site mostra. É também a do "últimos 12 meses" do sumário, e
#: por isso ela se confere inteira contra o número oficial.
JANELA = 12
#: Como o gov.br escreve o mês na URL (sem cedilha: "marco").
MESES = ("janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho",
         "agosto", "setembro", "outubro", "novembro", "dezembro")

COLUNA_COMPETENCIA = "competênciamov"
COLUNA_MUNICIPIO = "município"
COLUNA_SALDO = "saldomovimentação"


class ErroCaged(RuntimeError):
    """Falha que tem de parar a coleta ou a publicação, com o motivo."""


# ------------------------------------------------------------------ meses

def mes_anterior(m: str, n: int = 1) -> str:
    """`"202601"` menos 1 é `"202512"`."""
    ano, mes = int(m[:4]), int(m[4:])
    total = ano * 12 + (mes - 1) - n
    return f"{total // 12}{total % 12 + 1:02d}"


def janela_ate(ultima: str, n: int = JANELA) -> list[str]:
    """As `n` competências que terminam em `ultima`, da mais velha à mais nova."""
    return [mes_anterior(ultima, k) for k in range(n - 1, -1, -1)]


def nome_arquivo(tipo: str, mes: str) -> str:
    return f"CAGED{tipo}{mes}"


def url_arquivo(tipo: str, mes: str) -> str:
    return f"{FTP}/{mes[:4]}/{mes}/{nome_arquivo(tipo, mes)}.7z"


# ------------------------------------------------------------------ FTP

def _itens_da_listagem(texto: str) -> list[tuple[str, bool]]:
    """`(nome, é_pasta)` de uma listagem de FTP no formato do servidor do MTE:
    `08-28-26  02:31PM       <DIR>          202607`."""
    itens = []
    for linha in texto.splitlines():
        partes = linha.split(None, 3)
        if len(partes) == 4:
            itens.append((partes[3].strip(), partes[2] == "<DIR>"))
    return itens


def ultima_no_ftp(listar: Callable[[str], str]) -> str:
    """O mês mais recente com os TRÊS arquivos publicados.

    Mês com pasta e sem os três arquivos é mês pela metade (o MTE sobe os
    arquivos um a um): ele é ignorado, e fica para a próxima execução.
    """
    anos = sorted(n for n, pasta in _itens_da_listagem(listar(f"{FTP}/"))
                  if pasta and re.fullmatch(r"\d{4}", n))
    for ano in reversed(anos):
        meses = sorted(n for n, pasta in _itens_da_listagem(listar(f"{FTP}/{ano}/"))
                       if pasta and re.fullmatch(rf"{ano}\d\d", n))
        for mes in reversed(meses):
            arquivos = {n for n, pasta in _itens_da_listagem(
                listar(f"{FTP}/{ano}/{mes}/")) if not pasta}
            if all(f"{nome_arquivo(t, mes)}.7z" in arquivos for t in TIPOS):
                return mes
    raise ErroCaged(f"nenhum mês com os três arquivos em {FTP_PUBLICO}")


# ------------------------------------------------------------------ leitura

def linhas_do_7z(caminho: str | Path) -> Iterator[str]:
    """As linhas do único `.txt` dentro do `.7z`, sem gravá-lo inteiro.

    Com o `7z` de linha de comando (o do GitHub Actions), a leitura é em
    fluxo. Sem ele, o `py7zr`, se estiver instalado, extrai para uma pasta
    temporária. Os dois faltando é erro dito, e não silêncio.
    """
    binario = shutil.which("7z") or shutil.which("7za")
    if binario:
        proc = subprocess.Popen(
            [binario, "e", "-so", str(caminho)], stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        assert proc.stdout is not None
        try:
            for bruto in proc.stdout:
                yield bruto.decode("utf-8")
        finally:
            proc.stdout.close()
            erro = proc.stderr.read().decode("utf-8", "replace") if proc.stderr else ""
            if proc.wait() != 0:
                raise ErroCaged(f"7z falhou em {caminho}: {erro[:300]}")
        return
    try:
        import py7zr  # type: ignore[import-not-found]
    except ImportError as e:
        raise ErroCaged(
            "sem `7z` no PATH e sem `py7zr`: não há como abrir o .7z do Caged. "
            "No GitHub Actions o `p7zip-full` resolve; aqui, um venv com py7zr."
        ) from e
    with tempfile.TemporaryDirectory() as tmp:
        with py7zr.SevenZipFile(str(caminho)) as z:
            nomes = z.getnames()
            if len(nomes) != 1:
                raise ErroCaged(f"{caminho}: esperava um arquivo, vieram {nomes}")
            z.extractall(tmp)
        with open(Path(tmp) / nomes[0], encoding="utf-8") as fh:
            yield from fh


def agregar(linhas: Iterable[str],
            onde: str = "") -> tuple[dict[tuple[str, int], list[int]], int]:
    """`{(competência, município): [admissões, desligamentos]}` e o número de
    linhas lidas.

    O cabeçalho é conferido pelo NOME das colunas, e não pela posição: o MTE
    já mudou o layout uma vez (há um "Layout Não-identificado" no FTP). E um
    saldo que não seja 1 ou −1 para a leitura, em vez de virar zero calado.
    """
    it = iter(linhas)
    try:
        cabecalho = next(it).rstrip("\r\n").lstrip("﻿").split(";")
    except StopIteration:
        raise ErroCaged(f"{onde}: arquivo vazio") from None
    try:
        ic = cabecalho.index(COLUNA_COMPETENCIA)
        im = cabecalho.index(COLUNA_MUNICIPIO)
        is_ = cabecalho.index(COLUNA_SALDO)
    except ValueError as e:
        raise ErroCaged(f"{onde}: coluna ausente no cabeçalho ({e}); "
                        f"veio {cabecalho[:8]}") from e
    agregado: dict[tuple[str, int], list[int]] = defaultdict(lambda: [0, 0])
    n = 0
    for n, linha in enumerate(it, 1):
        c = linha.split(";")
        saldo = c[is_].strip()
        if saldo == "1":
            agregado[(c[ic], int(c[im]))][0] += 1
        elif saldo == "-1":
            agregado[(c[ic], int(c[im]))][1] += 1
        else:
            raise ErroCaged(f"{onde}, linha {n + 1}: saldo {saldo!r} não é 1 nem -1")
    return dict(agregado), n


# ------------------------------------------------------------------ banco

ESQUEMA = """
-- Uma linha por (arquivo, competência, município), JÁ agregada: o arquivo
-- mensal tem 4,5 milhões de linhas, e o site precisa de duas contagens.
-- O arquivo é a FATIA: reler um arquivo apaga o que ele tinha gravado antes
-- de gravar de novo (o MTE republica meses antigos: em 16/06/2026 ele
-- regravou 2025 inteiro). Ver `stack.md`, "Releitura substitui a fatia".
CREATE TABLE IF NOT EXISTS movimento (
    arquivo TEXT NOT NULL, tipo TEXT NOT NULL, declarado TEXT NOT NULL,
    competencia TEXT NOT NULL, municipio INTEGER NOT NULL,
    admissoes INTEGER NOT NULL, desligamentos INTEGER NOT NULL,
    PRIMARY KEY (arquivo, competencia, municipio));
CREATE INDEX IF NOT EXISTS idx_movimento_comp ON movimento (competencia);

CREATE TABLE IF NOT EXISTS arquivo (
    arquivo TEXT PRIMARY KEY, tipo TEXT NOT NULL, declarado TEXT NOT NULL,
    linhas INTEGER NOT NULL, bytes INTEGER NOT NULL, origem TEXT NOT NULL,
    gravado_em TEXT NOT NULL);
"""


def agora() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


class ArmazemCaged:
    def __init__(self, caminho: str | Path) -> None:
        self.con = sqlite3.connect(str(caminho))
        self.con.row_factory = sqlite3.Row
        self.con.executescript(ESQUEMA)

    def __enter__(self) -> "ArmazemCaged":
        return self

    def __exit__(self, *_) -> None:
        self.con.close()

    def gravar(self, tipo: str, declarado: str,
               agregado: dict[tuple[str, int], list[int]], linhas: int,
               bytes_: int, origem: str) -> None:
        """Substitui a fatia do arquivo, numa transação só."""
        arquivo = nome_arquivo(tipo, declarado)
        with self.con:
            self.con.execute("DELETE FROM movimento WHERE arquivo = ?", (arquivo,))
            self.con.executemany(
                "INSERT INTO movimento VALUES (?, ?, ?, ?, ?, ?, ?)",
                [(arquivo, tipo, declarado, comp, mun, a, d)
                 for (comp, mun), (a, d) in agregado.items()])
            self.con.execute(
                "INSERT OR REPLACE INTO arquivo VALUES (?, ?, ?, ?, ?, ?, ?)",
                (arquivo, tipo, declarado, linhas, bytes_, origem, agora()))

    def gravado(self, tipo: str, declarado: str) -> sqlite3.Row | None:
        return self.con.execute("SELECT * FROM arquivo WHERE arquivo = ?",
                                (nome_arquivo(tipo, declarado),)).fetchone()

    def ultima(self) -> str | None:
        l = self.con.execute(
            "SELECT MAX(declarado) FROM arquivo WHERE tipo = 'MOV'").fetchone()
        return l[0]

    def faltando(self, ultima: str, n: int = JANELA) -> list[str]:
        """Os arquivos da janela que NÃO estão no banco. Vazio é pré-condição
        de exportar: janela com um mês de exclusões faltando dá um número
        bem formado e errado."""
        return [nome_arquivo(t, m) for m in janela_ate(ultima, n) for t in TIPOS
                if self.gravado(t, m) is None]

    def com_ajuste(self, competencias: list[str],
                   ate: str) -> dict[tuple[str, int], list[int]]:
        """`{(competência, município): [admissões, desligamentos]}` com os
        ajustes declarados até `ate`: MOV + FOR − EXC, a regra do módulo."""
        marcas = ",".join("?" * len(competencias))
        saida: dict[tuple[str, int], list[int]] = {}
        for l in self.con.execute(
                "SELECT competencia, municipio,"
                " SUM(CASE tipo WHEN 'EXC' THEN -admissoes ELSE admissoes END) a,"
                " SUM(CASE tipo WHEN 'EXC' THEN -desligamentos ELSE desligamentos END) d"
                f" FROM movimento WHERE competencia IN ({marcas}) AND declarado <= ?"
                " GROUP BY competencia, municipio", (*competencias, ate)):
            saida[(l["competencia"], l["municipio"])] = [l["a"], l["d"]]
        return saida

    def sem_ajuste(self, mes: str) -> tuple[int, int]:
        """Admissões e desligamentos do MOV do mês: o número do sumário."""
        l = self.con.execute(
            "SELECT SUM(admissoes), SUM(desligamentos) FROM movimento"
            " WHERE arquivo = ? AND competencia = ?",
            (nome_arquivo("MOV", mes), mes)).fetchone()
        return (l[0] or 0, l[1] or 0)


# ------------------------------------------------------------------ o oficial

def _numero(texto: str) -> int:
    limpo = texto.replace(".", "").replace("−", "-").replace(" ", "")
    return int(limpo)


def pasta_do_mes(mes: str) -> str:
    return f"{GOV}/{mes[:4]}/{MESES[int(mes[4:]) - 1]}"


def link_do_sumario(html: str, mes: str) -> str:
    """O PDF do sumário executivo, LIDO da pasta do mês."""
    padrao = re.compile(
        r'href="([^"]*/' + re.escape(mes[:4]) + "/" + MESES[int(mes[4:]) - 1]
        + r'/sumario-executivo[^"]*?\.pdf)(?:/view)?"', re.I)
    achados = sorted(set(padrao.findall(html)))
    if len(achados) != 1:
        raise ErroCaged(f"pasta de {mes} no gov.br: esperava um sumário "
                        f"executivo, achei {achados or 'nenhum'}")
    return achados[0]


#: O nome do mês como o sumário o escreve no título ("Principais Resultados
#: de JULHO de 2026", "de Janeiro de 2026": a caixa varia, e é ignorada).
MESES_NOME = ("janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
              "agosto", "setembro", "outubro", "novembro", "dezembro")


def numeros_do_sumario(texto: str,
                       mes: str | None = None) -> dict[str, dict[str, int] | str | None]:
    """Os três blocos do parágrafo de abertura do sumário: o mês, o ano e os
    12 meses. Texto do `pdftotext`, com quebras de linha em qualquer lugar.

    Cada bloco confere a si mesmo (admissões − desligamentos = saldo) antes de
    ser usado: um número mal lido do PDF não pode virar "divergência" da nossa
    conta, nem "concordância" por acaso.

    ## O que três sumários reais ensinaram (29/09/2026)

    - **Julho**: os três blocos, como aqui.
    - **Janeiro**: o PDF hifeniza no fim da linha ("decor- reu"), e **não há
      bloco do ano** — o ano é o próprio mês. O bloco `ano` sai `None`.
    - **Dezembro é outra edição**, anual: o título é "Janeiro a Dezembro", o
      parágrafo fala do ano inteiro, o mês só aparece num gráfico, e os números
      do ano **não fecham** (26.599.698 − 25.320.179 = 1.279.519, o texto diz
      +1.279.498). Não há o que conferir com segurança: é erro dito, e a
      exportação de dezembro se confere à mão (ver a regra do Caged).
    """
    t = re.sub(r"\s+", " ", texto)
    # A hifenização do fim de linha, só entre minúsculas: "-56.800" e
    # "2025-2026" não são tocados.
    t = re.sub(r"(?<=[a-zà-ÿ])- (?=[a-zà-ÿ])", "", t)
    titulo = re.search(r"Principais Resultados de (.+?) de (\d{4})", t)
    if titulo and "dezembro" in titulo.group(1).lower() and " a " in titulo.group(1):
        raise ErroCaged(
            "sumário ANUAL (edição de dezembro): o parágrafo fala do ano, o mês "
            "só está num gráfico, e os números do ano não fecham. Conferir o "
            "mês à mão e exportar com --sumario (ver a regra do Caged).")
    if mes is not None:
        esperado = f"{MESES_NOME[int(mes[4:]) - 1]} {mes[:4]}"
        achado = (f"{titulo.group(1).lower()} {titulo.group(2)}" if titulo else None)
        if achado != esperado:
            raise ErroCaged(f"sumário: esperava o de {esperado}, o título diz {achado}")
    num = r"([+\-−]?\s?[\d.]+)"
    blocos = {
        "mes": re.search(
            rf"saldo de {num} postos de trabalho\. Esse resultado decorreu de "
            rf"([\d.]+) admissões e de ([\d.]+) desligamentos", t),
        "ano": re.search(
            rf"No acumulado do ano \(([^)]*)\), o saldo foi de {num} empregos?, "
            rf"resultado de ([\d.]+) admissões e ([\d.]+) desligamentos", t),
        "doze": re.search(
            rf"Nos últimos 12 meses \(([^)]*)\), o saldo foi de {num} empregos?, "
            rf"resultado de ([\d.]+) admissões e ([\d.]+) desligamentos", t),
    }
    saida: dict[str, dict[str, int] | str | None] = {}
    for nome, m in blocos.items():
        if m is None and nome == "ano":
            saida["ano"] = saida["ano_periodo"] = None      # janeiro: é o mês
            continue
        if m is None:
            raise ErroCaged(f"sumário: não achei o bloco '{nome}' no texto")
        g = m.groups()
        if nome != "mes":
            saida[f"{nome}_periodo"] = g[0]
            g = g[1:]
        saldo, adm, des = _numero(g[0]), _numero(g[1]), _numero(g[2])
        if adm - des != saldo:
            raise ErroCaged(f"sumário, bloco '{nome}': {adm} − {des} ≠ {saldo}; "
                            "leitura do PDF suspeita")
        saida[nome] = {"saldo": saldo, "admissoes": adm, "desligamentos": des}
    return saida


def nossos_numeros(db: ArmazemCaged, ultima: str) -> dict[str, dict[str, int]]:
    """Os mesmos três blocos, calculados do banco. Brasil inteiro, com o
    "não identificado" dentro, como o MTE conta."""
    def somar(competencias: list[str]) -> dict[str, int]:
        a = d = 0
        for (_, _), (x, y) in db.com_ajuste(competencias, ultima).items():
            a += x
            d += y
        return {"saldo": a - d, "admissoes": a, "desligamentos": d}

    a, d = db.sem_ajuste(ultima)
    ano = [m for m in janela_ate(ultima, int(ultima[4:])) if m[:4] == ultima[:4]]
    return {"mes": {"saldo": a - d, "admissoes": a, "desligamentos": d},
            "ano": somar(ano),
            "doze": somar(janela_ate(ultima))}


def conferir(nossos: dict, oficiais: dict) -> list[str]:
    """As divergências, por bloco e campo. Vazio é o único "confere"."""
    erros = []
    for bloco in ("mes", "ano", "doze"):
        if oficiais.get(bloco) is None:
            continue            # janeiro não tem bloco do ano: ele é o mês
        for campo in ("saldo", "admissoes", "desligamentos"):
            n, o = nossos[bloco][campo], oficiais[bloco][campo]
            if n != o:
                erros.append(f"{bloco}.{campo}: nosso {n}, oficial {o}")
    return erros


# ------------------------------------------------------------------ retrato

def retrato(db: ArmazemCaged, ultima: str, codigos_ibge: Iterable[int],
            conferencia: dict) -> dict:
    """O `caged.json` que o painel lê.

    Um município por linha, **todos os do IBGE**, com zero onde o Caged não
    tem linha: `[código, [admissões × 12], [desligamentos × 12]]`, da
    competência mais velha à mais nova. O código de 6 dígitos do Caged é
    ligado ao de 7 do IBGE pelo prefixo; código do Caged sem par no IBGE para
    a exportação (o `999999` é o único esperado).
    """
    faltam = db.faltando(ultima)
    if faltam:
        raise ErroCaged(f"a janela até {ultima} está incompleta: faltam "
                        f"{', '.join(faltam[:6])}{'…' if len(faltam) > 6 else ''}")
    janela = janela_ate(ultima)
    por7 = {int(str(c)[:6]): int(c) for c in codigos_ibge}
    if len(por7) < 5000:
        raise ErroCaged(f"só {len(por7)} municípios do IBGE: lista suspeita")
    valores = db.com_ajuste(janela, ultima)
    sem_par = sorted({m for (_, m) in valores
                      if m != NAO_IDENTIFICADO and m not in por7})
    if sem_par:
        raise ErroCaged(f"códigos do Caged sem município do IBGE: {sem_par[:10]}")
    idx = {c: i for i, c in enumerate(janela)}
    linhas = {c7: [[0] * len(janela), [0] * len(janela)] for c7 in por7.values()}
    nao_id = [[0] * len(janela), [0] * len(janela)]
    for (comp, m6), (a, d) in valores.items():
        alvo = nao_id if m6 == NAO_IDENTIFICADO else linhas[por7[m6]]
        alvo[0][idx[comp]] = a
        alvo[1][idx[comp]] = d
    coletado = db.con.execute("SELECT MAX(gravado_em) FROM arquivo").fetchone()[0]
    return {
        "fonte": "Ministério do Trabalho e Emprego — Novo Caged, microdados",
        "origem": FTP_PUBLICO,
        "competencia": ultima,
        "competencias": janela,
        "coletadoEm": coletado,
        "conferencia": conferencia,
        "naoIdentificado": nao_id,
        "municipios": [[c7, a, d] for c7, (a, d) in sorted(linhas.items())],
    }


def gravar_retrato(r: dict, saida: str | Path,
                   permitir_encolher: bool = False) -> str:
    """Escreve o retrato, comparando com o que vai sobrescrever.

    Recusa **competência mais velha** que a publicada e **menos municípios**:
    cobertura não diminui sozinha (`stack.md`, lição 3). E não reescreve o
    arquivo quando só o carimbo de coleta mudou (a trava do carimbo do
    `exportar` do IBGE): o commit sairia vazio de dado e republicaria o site.
    Devolve `"gravado"` ou `"inalterado"`.
    """
    saida = Path(saida)
    if saida.exists():
        velho = json.loads(saida.read_text(encoding="utf-8"))
        if not permitir_encolher:
            erros = []
            if r["competencia"] < velho.get("competencia", ""):
                erros.append(f"competência {velho['competencia']} → {r['competencia']}")
            if len(r["municipios"]) < len(velho.get("municipios", [])):
                erros.append(f"municípios {len(velho['municipios'])} → "
                             f"{len(r['municipios'])}")
            if erros:
                raise ErroCaged("RECUSADO: o retrato do Caged encolheu — "
                                + "; ".join(erros) + ". Se é a intenção, repita "
                                "com --permitir-encolher. Nada gravado.")
        sem_carimbo = lambda x: {k: v for k, v in x.items() if k != "coletadoEm"}
        if sem_carimbo(velho) == sem_carimbo(r):
            return "inalterado"
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n",
                     encoding="utf-8")
    return "gravado"
