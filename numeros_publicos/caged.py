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


#: O primeiro mês do Novo Caged. Antes dele é o Caged antigo, de outra
#: metodologia, e nada dele se soma ao daqui.
PRIMEIRO_MES = "202001"
#: O começo da série não tem os três arquivos (FTP, medido em 16/10/2026):
#: jan/2020 só tem o MOV; fev e mar/2020, o MOV e o FOR; o EXC começa em
#: abr/2020. Fora daqui, mês sem um dos três é mês pela metade.
TIPOS_DO_COMECO = {"202001": ("MOV",), "202002": ("MOV", "FOR"),
                   "202003": ("MOV", "FOR")}


def tipos_do_mes(mes: str) -> tuple[str, ...]:
    return TIPOS_DO_COMECO.get(mes, TIPOS)


def meses_desde(primeiro: str, ultima: str) -> list[str]:
    """De `primeiro` a `ultima`, os dois inclusive, do mais velho ao mais novo."""
    meses, m = [], ultima
    while m >= primeiro:
        meses.append(m)
        m = mes_anterior(m)
    return meses[::-1]


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

def _bsdtar() -> str | None:
    """O `tar` do Windows 10/11 é o bsdtar (libarchive), que lê `.7z` em
    fluxo (medido em 16/10/2026). O tar do GNU (o do Git Bash, o do Linux)
    não lê: quem decide é o `--version`, e não o nome."""
    import os
    raiz = os.environ.get("SystemRoot")
    candidatos = [shutil.which("bsdtar")]
    if raiz:
        candidatos.append(os.path.join(raiz, "System32", "tar.exe"))
    for c in candidatos:
        if not c or not Path(c).exists():
            continue
        try:
            versao = subprocess.run(
                [c, "--version"], capture_output=True, timeout=10,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
        except (OSError, subprocess.SubprocessError):
            continue
        if b"bsdtar" in versao:
            return c
    return None


def linhas_do_7z(caminho: str | Path) -> Iterator[str]:
    """As linhas do único `.txt` dentro do `.7z`, sem gravá-lo inteiro.

    Com o `7z` de linha de comando (o do GitHub Actions) ou o bsdtar (o
    `tar` do Windows), a leitura é em fluxo. Sem os dois, o `py7zr`, se
    estiver instalado, extrai para uma pasta temporária. Os três faltando é
    erro dito, e não silêncio.
    """
    binario = shutil.which("7z") or shutil.which("7za")
    comando = [binario, "e", "-so", str(caminho)] if binario else None
    if comando is None and (tar := _bsdtar()):
        comando = [tar, "-xOf", str(caminho)]
    if comando:
        proc = subprocess.Popen(
            comando, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        assert proc.stdout is not None
        try:
            for bruto in proc.stdout:
                yield bruto.decode("utf-8")
        finally:
            proc.stdout.close()
            erro = proc.stderr.read().decode("utf-8", "replace") if proc.stderr else ""
            if proc.wait() != 0:
                raise ErroCaged(f"{Path(comando[0]).name} falhou em {caminho}: "
                                f"{erro[:300]}")
        return
    try:
        import py7zr  # type: ignore[import-not-found]
    except ImportError as e:
        raise ErroCaged(
            "sem `7z` no PATH, sem bsdtar e sem `py7zr`: não há como abrir o "
            ".7z do Caged. No GitHub Actions o `p7zip-full` resolve; no "
            "Windows, o `tar` do sistema; senão, um venv com py7zr."
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


# ------------------------------------------------------------------ anos fechados
#
# Espec `especs/numeros-publicos-caged-serie.md` (16/10/2026). Um ano fechado
# é o saldo de janeiro a dezembro com os ajustes declarados ATÉ DEZEMBRO DO
# PRÓPRIO ANO: o número que o MTE publicou no fechamento. Ele se confere por
# UF e por mês contra a tabela da apresentação de dezembro, e não muda depois.

#: As UFs como a apresentação as escreve. A região é o 1º dígito do código.
UFS = {11: "Rondônia", 12: "Acre", 13: "Amazonas", 14: "Roraima", 15: "Pará",
       16: "Amapá", 17: "Tocantins", 21: "Maranhão", 22: "Piauí", 23: "Ceará",
       24: "Rio Grande do Norte", 25: "Paraíba", 26: "Pernambuco",
       27: "Alagoas", 28: "Sergipe", 29: "Bahia", 31: "Minas Gerais",
       32: "Espírito Santo", 33: "Rio de Janeiro", 35: "São Paulo",
       41: "Paraná", 42: "Santa Catarina", 43: "Rio Grande do Sul",
       50: "Mato Grosso do Sul", 51: "Mato Grosso", 52: "Goiás",
       53: "Distrito Federal"}
REGIOES = {1: "Norte", 2: "Nordeste", 3: "Sudeste", 4: "Sul", 5: "Centro-Oeste"}
_MES_ABREV = ("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set",
              "out", "nov", "dez")
_NUM = re.compile(r"-?\d{1,3}(?:\.\d{3})*")


def meses_do_ano(ano: int) -> list[str]:
    return [f"{ano}{m:02d}" for m in range(1, 13)]


def ultimo_ano_fechado(db: ArmazemCaged) -> int | None:
    """O ano antes do da competência mais recente do `MOV`: vem do dado, e
    não do código (um "2025" escrito à mão envelhece em janeiro)."""
    ultima = db.ultima()
    if ultima is None or int(ultima[:4]) - 1 < int(PRIMEIRO_MES[:4]):
        return None
    return int(ultima[:4]) - 1


def anos_fechados(db: ArmazemCaged) -> list[int]:
    ultimo = ultimo_ano_fechado(db)
    return [] if ultimo is None else list(range(int(PRIMEIRO_MES[:4]), ultimo + 1))


def faltando_ate(db: ArmazemCaged, ate: str) -> list[str]:
    """Os arquivos de jan/2020 a `ate` que NÃO estão no banco. Um ano fechado
    pede o `MOV` dos 12 meses e todo `FOR` e `EXC` declarado até dezembro,
    desde o primeiro (um `EXC` de 2023 ainda mexe em 2020)."""
    return [nome_arquivo(t, m) for m in meses_desde(PRIMEIRO_MES, ate)
            for t in tipos_do_mes(m) if db.gravado(t, m) is None]


def saldo_por_uf(db: ArmazemCaged, competencias: list[str],
                 ate: str) -> dict[str, dict[str, int]]:
    """`{chave: {competência: saldo}}` com os ajustes declarados até `ate`. A
    chave é o código da UF (`"28"`), `"NI"` (o não identificado) ou `"BR"`,
    as mesmas de `tabela_por_uf`. UF sem linha tem saldo zero."""
    chaves = [str(u) for u in UFS] + ["NI", "BR"]
    saida = {k: dict.fromkeys(competencias, 0) for k in chaves}
    for (comp, mun), (a, d) in db.com_ajuste(competencias, ate).items():
        chave = "NI" if mun == NAO_IDENTIFICADO else str(mun // 10000)
        saida.setdefault(chave, dict.fromkeys(competencias, 0))[comp] += a - d
        saida["BR"][comp] += a - d
    return saida


def _chave_nome(s: str) -> str:
    import unicodedata
    s = "".join(c for c in unicodedata.normalize("NFD", s)
                if unicodedata.category(c) != "Mn")
    return " ".join(s.lower().split())


def _competencia_do_rotulo(rotulo: str) -> str | None:
    """`2023/01` (de 2023 em diante) ou `jan/20` (a apresentação de 2020)."""
    m = re.fullmatch(r"(\d{4})/(\d{2})", rotulo)
    if m:
        return m[1] + m[2]
    m = re.fullmatch(r"([a-z]{3})/(\d{2})", rotulo.lower())
    if m and m[1] in _MES_ABREV:
        return f"20{m[2]}{_MES_ABREV.index(m[1]) + 1:02d}"
    return None


def tabela_por_uf(texto: str, ano: int) -> dict[str, dict[str, int]]:
    """A tabela "Saldo por grandes regiões e unidades da federação" da
    apresentação de dezembro de `ano`, no texto de `pdftotext -raw` (o
    `-layout` desloca as linhas dela: medido em 16/10/2026, 0 de 135 contra
    135 de 135). Devolve as chaves de `saldo_por_uf`.

    Antes de devolver, confere o que a tabela promete: o cabeçalho cobre o
    ano (o gov.br já serviu, no endereço de dez/2021, a apresentação de
    jan–mar/2020), as 27 UFs, as 5 regiões e o Brasil estão lá, e cada região
    é a soma das suas UFs, e o Brasil a das regiões mais o não identificado.
    Assim um erro de leitura não chega à conferência como "divergência".
    """
    linhas = [l.strip() for l in texto.replace("−", "-").splitlines()]
    nomes = {_chave_nome(n): str(u) for u, n in UFS.items()}
    nomes.update({_chave_nome(n): f"R{r}" for r, n in REGIOES.items()})
    nomes.update({"brasil": "BR", "nao identificado": "NI"})
    for i, l in enumerate(linhas):
        if not l.startswith("Região e UF"):
            continue
        titulo = _chave_nome(" ".join(linhas[max(0, i - 10):i]))
        comps = [_competencia_do_rotulo(r) for r in l[len("Região e UF"):].split()]
        if ("saldo por grandes" in titulo and "sem ajustes" not in titulo
                and comps and None not in comps):
            break
    else:
        raise ErroCaged(f"apresentação de dez/{ano}: sem a tabela de saldo por UF")
    if comps[-12:] != meses_do_ano(ano) or len(comps) > 13:
        raise ErroCaged(f"apresentação de dez/{ano}: a tabela vai de {comps[0]} "
                        f"a {comps[-1]}, e não cobre {ano}: é outro documento")
    saida: dict[str, dict[str, int]] = {}
    pendente = ""
    for l in linhas[i + 1:]:
        partes = l.split()
        k = len(partes)
        while k and _NUM.fullmatch(partes[k - 1]):
            k -= 1
        nome, nums = " ".join(partes[:k]), partes[k:]
        if not nums:            # "Rio Grande do" / "Norte": o nome quebra
            pendente = f"{pendente} {nome}".strip()
            if len(pendente) > 40:
                break
            continue
        chave = nomes.get(_chave_nome(f"{pendente} {nome}"))
        pendente = ""
        if chave is None or len(nums) != len(comps):
            break
        saida[chave] = dict(zip(comps, (_numero(n) for n in nums)))
        if chave == "NI":
            break
    faltam = sorted(set(nomes.values()) - saida.keys())
    if faltam:
        raise ErroCaged(f"apresentação de dez/{ano}: a tabela por UF não tem "
                        f"as linhas {faltam}: leitura suspeita")
    for c in comps:
        for r in REGIOES:
            soma = sum(saida[str(u)][c] for u in UFS if u // 10 == r)
            if soma != saida[f"R{r}"][c]:
                raise ErroCaged(f"apresentação de dez/{ano}, {c}: as UFs do "
                                f"{REGIOES[r]} somam {soma}, a linha diz "
                                f"{saida[f'R{r}'][c]}: leitura suspeita")
        soma = sum(saida[f"R{r}"][c] for r in REGIOES) + saida["NI"][c]
        if soma != saida["BR"][c]:
            raise ErroCaged(f"apresentação de dez/{ano}, {c}: as regiões e o "
                            f"não identificado somam {soma}, o Brasil "
                            f"{saida['BR'][c]}: leitura suspeita")
    return {k: v for k, v in saida.items() if not k.startswith("R")}


def serie_anual_do_pais(texto: str, ano: int) -> dict[int, int]:
    """O gráfico "Saldo de empregos formais - Brasil, acumulado de janeiro a
    dezembro, 2002 a `ano`" da apresentação de dezembro, com os ajustes
    declarados até dezembro de `ano` para TODOS os anos. No texto raw, os
    rótulos das barras do Novo Caged vêm logo antes da linha dos anos.
    É a segunda conferência, só no país: ela alcança os anos cuja tabela
    por UF não se acha."""
    linhas = [l.strip() for l in texto.replace("−", "-").splitlines()]
    anos = list(range(int(PRIMEIRO_MES[:4]), ano + 1))
    for i, l in enumerate(linhas):
        partes = l.split()
        if (len(partes) <= len(anos) or not partes[0].isdigit()
                or partes != [str(a) for a in range(int(partes[0]), ano + 1)]):
            continue
        titulo = _chave_nome(" ".join(linhas[i + 1:i + 3]))
        if "acumulado de janeiro a dezembro" not in titulo or "com ajustes" not in titulo:
            continue
        valores = []
        j = i - 1
        while j >= 0 and _NUM.fullmatch(linhas[j]):
            valores.insert(0, _numero(linhas[j]))
            j -= 1
        if len(valores) < len(anos):
            raise ErroCaged(f"apresentação de dez/{ano}: o gráfico anual tem "
                            f"{len(valores)} rótulos, e o Novo Caged {len(anos)} anos")
        return dict(zip(anos, valores[-len(anos):]))
    raise ErroCaged(f"apresentação de dez/{ano}: sem o gráfico do saldo anual do país")


def conferir_uf(nossos: dict, oficiais: dict) -> list[str]:
    """As divergências, por chave e competência, nos DOIS sentidos: o que só
    um dos lados tem também é divergência. Vazio é o único "confere"."""
    erros = []
    for chave in sorted(set(nossos) | set(oficiais)):
        n_, o_ = nossos.get(chave, {}), oficiais.get(chave, {})
        for comp in sorted(set(n_) | set(o_)):
            if n_.get(comp) != o_.get(comp):
                erros.append(f"{chave} {comp}: nosso {n_.get(comp)}, "
                             f"oficial {o_.get(comp)}")
    return erros


def pastas_de_dezembro(ano: int) -> list[str]:
    """Onde a apresentação de dezembro pode estar. O caminho mudou de ano
    para ano (medido em 16/10/2026): `novo-caged-AAAA/novo-caged-dezembro-AAAA`
    em 2020 a 2022, `novo-caged-AAAA/dezembro` em 2023 e 2024, `AAAA/dezembro`
    em 2025. Tenta-se do mais novo ao mais velho."""
    return [f"{GOV}/{ano}/dezembro", f"{GOV}/novo-caged-{ano}/dezembro",
            f"{GOV}/novo-caged-{ano}/novo-caged-dezembro-{ano}"]


def links_da_apresentacao(html: str, pasta: str) -> list[str]:
    """Os PDFs de apresentação LIDOS da pasta, em endereço absoluto. O
    conteúdo decide qual é o certo (`tabela_por_uf` confere os meses): em
    2021 e 2022 o link da pasta está morto, e montar o endereço faz o gov.br
    servir outro PDF com o nome pedido. Em 2020 o link da pasta também está
    morto (`/images/...`, 404), mas o nome dentro da pasta é o PDF certo:
    vai como segunda tentativa, e o conteúdo decide."""
    from urllib.parse import urljoin
    achados = re.findall(r'href="([^"]*apresenta[^"]*?\.pdf)(?:/view)?"', html, re.I)
    links = []
    for a in sorted(set(achados)):
        for link in (urljoin(pasta + "/", a), f"{pasta}/{a.rsplit('/', 1)[-1]}"):
            if link not in links:
                links.append(link)
    return links


def retrato_anos(db: ArmazemCaged, anos: list[int], codigos_ibge: Iterable[int],
                 conferencia: dict) -> dict:
    """O `caged-anos.json`: `[código, [saldo × anos]]`, todos os municípios do
    IBGE, zero onde o Caged não tem linha, todos os anos com os ajustes
    declarados até o dezembro do último. A soma dos municípios com o não
    identificado tem de dar o Brasil que a conferência aprovou
    (`conferencia[ano]["saldo"]`)."""
    ate = f"{anos[-1]}12"
    faltam = faltando_ate(db, f"{anos[-1]}12")
    if faltam:
        raise ErroCaged(f"faltam arquivos até dez/{anos[-1]}: "
                        f"{', '.join(faltam[:6])}{'…' if len(faltam) > 6 else ''}")
    por7 = {int(str(c)[:6]): int(c) for c in codigos_ibge}
    if len(por7) < 5000:
        raise ErroCaged(f"só {len(por7)} municípios do IBGE: lista suspeita")
    saldos = {c7: [0] * len(anos) for c7 in por7.values()}
    nao_id = [0] * len(anos)
    sem_par: set[int] = set()
    for i, ano in enumerate(anos):
        for (_, m6), (a, d) in db.com_ajuste(meses_do_ano(ano), ate).items():
            if m6 == NAO_IDENTIFICADO:
                nao_id[i] += a - d
            elif m6 in por7:
                saldos[por7[m6]][i] += a - d
            else:
                sem_par.add(m6)
        total = sum(s[i] for s in saldos.values()) + nao_id[i]
        if total != conferencia[str(ano)]["saldo"]:
            raise ErroCaged(f"{ano}: os municípios somam {total}, a conferência "
                            f"aprovou {conferencia[str(ano)]['saldo']}")
    if sem_par:
        raise ErroCaged(f"códigos do Caged sem município do IBGE: {sorted(sem_par)[:10]}")
    coletado = db.con.execute("SELECT MAX(gravado_em) FROM arquivo WHERE declarado <= ?",
                              (f"{anos[-1]}12",)).fetchone()[0]
    return {
        "fonte": "Ministério do Trabalho e Emprego — Novo Caged, microdados",
        "origem": FTP_PUBLICO,
        "anos": anos,
        "ajustesAte": ate,
        "coletadoEm": coletado,
        "conferencia": conferencia,
        "naoIdentificado": nao_id,
        "municipios": [[c7, s] for c7, s in sorted(saldos.items())],
    }


def gravar_anos(r: dict, saida: str | Path, permitir_encolher: bool = False) -> str:
    """Escreve o `caged-anos.json`. Recusa **menos anos**, **último ano mais
    velho** e **menos municípios** que o publicado, e não reescreve quando só
    o carimbo mudou (as travas de `gravar_retrato`)."""
    saida = Path(saida)
    if saida.exists():
        velho = json.loads(saida.read_text(encoding="utf-8"))
        if not permitir_encolher:
            erros = []
            va, na = velho.get("anos", []), r["anos"]
            if len(na) < len(va) or (va and na[-1] < va[-1]):
                erros.append(f"anos {va[0]}–{va[-1]} → {na[0]}–{na[-1]}")
            if len(r["municipios"]) < len(velho.get("municipios", [])):
                erros.append(f"municípios {len(velho['municipios'])} → "
                             f"{len(r['municipios'])}")
            if erros:
                raise ErroCaged("RECUSADO: o caged-anos encolheu — " + "; ".join(erros)
                                + ". Se é a intenção, repita com --permitir-encolher. "
                                "Nada gravado.")
        sem_carimbo = lambda x: {k: v for k, v in x.items() if k != "coletadoEm"}
        if sem_carimbo(velho) == sem_carimbo(r):
            return "inalterado"
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n",
                     encoding="utf-8")
    return "gravado"
