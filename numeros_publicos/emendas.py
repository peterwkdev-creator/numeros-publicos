"""Emendas parlamentares pagas a prefeituras: quanto cada município recebeu.

Fonte: o download de dados do Portal da Transparência (CGU),
`portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares/UNICO`,
um zip com três CSV em latin-1, separados por `;`, com vírgula decimal. Este
módulo lê só um deles, `EmendasParlamentares_PorFavorecido.csv`: uma linha por
pagamento, com o favorecido, a natureza jurídica dele e o mês.

## A base é o FAVORECIDO, não a localidade

Medido em 02/10/2026: o arquivo por localidade dá código IBGE a 40% das
emendas, mas elas levam R$ 25,8 bi de cerca de R$ 287 bi pagos (9%): o resto
é "Múltiplo" ou "Sem informação". O arquivo por favorecido diz quem RECEBEU,
e a prefeitura (ou um fundo municipal) chega a quase todos os municípios. O
porquê e as contas estão na espec do projeto, não aqui.

## O que entra

Só as naturezas jurídicas de `NATUREZAS`, a prefeitura e o fundo municipal.
É uma lista do que é PERMITIDO, nunca do que é proibido: na fonte, "Pessoa
Fisica" vem sem acento, e um filtro que excluísse "Pessoa Física" não
excluiria ninguém. O que fica fora (pessoa física, empresa, o Banco do
Brasil com R$ 94 bi sem destino final, autarquia e fundação municipal) não
entra no banco: o que não está no banco não vaza para a página.

## Nome não é chave

O casamento é por (UF, nome sem acento), contra os 5.571 municípios do
snapshot do site, com a tabela versionada `emendas_apelidos.csv` para os
nomes antigos que a fonte ainda usa (Embu, Açu, Augusto Severo...). Nome que
não casa é ERRO, com a lista: nunca descarte em silêncio.

## O total confere ao centavo

Antes de gravar, a soma do banco é comparada com uma segunda leitura do CSV,
feita por outro caminho (`Decimal` sobre o texto cru, sem casar nome). A
diferença aceita é zero; se não bater, nada é gravado.
"""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import io
import re
import sqlite3
import unicodedata
import zipfile
from decimal import Decimal
from pathlib import Path
from typing import Iterable, Iterator

URL = ("https://portaldatransparencia.gov.br/download-de-dados/"
       "emendas-parlamentares/UNICO")
ARQUIVO = "EmendasParlamentares_PorFavorecido.csv"
APELIDOS = Path(__file__).with_name("emendas_apelidos.csv")

#: As naturezas jurídicas que entram. Lista do que é permitido: ver o topo.
NATUREZAS = frozenset({
    "Município",
    "Fundo Público da Administração Direta Municipal",
})

COLUNAS = (
    "Código da Emenda", "Código do Autor da Emenda", "Nome do Autor da Emenda",
    "Número da emenda", "Tipo de Emenda", "Ano/Mês", "Código do Favorecido",
    "Favorecido", "Natureza Jurídica", "Tipo Favorecido", "UF Favorecido",
    "Município Favorecido", "Valor Recebido",
)

#: Favorecido de natureza municipal é CNPJ, 14 dígitos sem pontuação. Um
#: código de outro formato (CPF tem 11) é erro de leitura ou de filtro.
CNPJ = re.compile(r"\d{14}")
VALOR = re.compile(r"-?\d+(,\d{1,2})?")
ANO_MES = re.compile(r"(19|20)\d\d(0[1-9]|1[0-2])")


class ErroEmendas(RuntimeError):
    """A fonte mudou de forma, ou um nome não casou, ou o total não bate."""


# ------------------------------------------------------------------ leitura

def chave(uf: str, nome: str) -> tuple[str, str]:
    """(UF, nome em maiúsculas, sem acento, hífen e apóstrofo)."""
    n = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode().upper()
    n = n.replace("-", " ").replace("'", "").replace("`", "")
    return uf.upper().strip(), " ".join(n.split())


def centavos(texto: str) -> int:
    """`245850,00` -> 24585000. Recusa o que não for o formato da fonte, que
    não usa separador de milhar: `1.234,56` é erro, e não 1.234,56."""
    t = texto.strip()
    if not VALOR.fullmatch(t):
        raise ErroEmendas(f"valor fora do formato da fonte: {texto!r}")
    inteiro, _, frac = t.partition(",")
    sinal = -1 if inteiro.startswith("-") else 1
    return sinal * (abs(int(inteiro)) * 100 + int((frac + "00")[:2]))


def linhas_do_zip(caminho: str | Path) -> Iterator[dict[str, str]]:
    """As linhas do CSV por favorecido, como dicionário, direto do zip."""
    csv.field_size_limit(10**8)
    with zipfile.ZipFile(caminho) as z:
        if ARQUIVO not in z.namelist():
            raise ErroEmendas(f"{ARQUIVO} não está no zip: {z.namelist()}")
        with z.open(ARQUIVO) as bruto:
            texto = io.TextIOWrapper(bruto, encoding="latin-1", newline="")
            leitor = csv.reader(texto, delimiter=";")
            cabecalho = tuple(next(leitor))
            if cabecalho != COLUNAS:
                raise ErroEmendas(f"cabeçalho mudou: {cabecalho}")
            for n, linha in enumerate(leitor, start=2):
                if len(linha) != len(COLUNAS):
                    raise ErroEmendas(f"linha {n}: {len(linha)} colunas")
                yield dict(zip(COLUNAS, linha))


def data_do_arquivo(caminho: str | Path) -> str:
    """A data do CSV dentro do zip: é a da extração da CGU, não a do download."""
    with zipfile.ZipFile(caminho) as z:
        return dt.datetime(*z.getinfo(ARQUIVO).date_time).isoformat()


def sha256(caminho: str | Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as fh:
        for bloco in iter(lambda: fh.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def municipios_do_snapshot(snapshot: dict) -> dict[tuple[str, str], int]:
    """`{chave(uf, nome): código IBGE}` dos municípios do site."""
    saida = {}
    for linha in snapshot["municipios"]:
        codigo, nome, uf = linha[0], linha[1], linha[2]
        saida[chave(uf, nome)] = int(codigo)
    return saida


def carregar_apelidos(municipios: dict[tuple[str, str], int],
                      caminho: str | Path = APELIDOS) -> dict[tuple[str, str], int]:
    """A tabela de nomes antigos. Cada linha é conferida contra o snapshot:
    o código tem de existir com o nome escrito ao lado, e o nome da fonte não
    pode casar sozinho (apelido que sobra esconde mudança na fonte)."""
    por_codigo = {c: k for k, c in municipios.items()}
    saida = {}
    with open(caminho, encoding="utf-8", newline="") as fh:
        for l in csv.DictReader(fh, delimiter=";"):
            k = chave(l["uf"], l["nome_na_fonte"])
            codigo = int(l["ibge"])
            if por_codigo.get(codigo) != chave(l["uf"], l["nome_ibge"]):
                raise ErroEmendas(f"apelido {k}: o código {codigo} não é "
                                  f"{l['nome_ibge']}-{l['uf']} no snapshot")
            if k in municipios:
                raise ErroEmendas(f"apelido {k}: o nome já casa sem a tabela")
            saida[k] = codigo
    return saida


def pagamentos(linhas: Iterable[dict[str, str]],
               municipios: dict[tuple[str, str], int],
               apelidos: dict[tuple[str, str], int]) -> tuple[list[tuple], int]:
    """Os pagamentos de natureza municipal, casados com o IBGE, e quantas
    linhas foram lidas. Nome sem casar é erro, com todos os nomes de uma vez."""
    saida, lidas, sem_casar = [], 0, {}
    for l in linhas:
        lidas += 1
        if l["Natureza Jurídica"] not in NATUREZAS:
            continue
        k = chave(l["UF Favorecido"], l["Município Favorecido"])
        codigo = municipios.get(k) or apelidos.get(k)
        if codigo is None:
            sem_casar[k] = sem_casar.get(k, 0) + 1
            continue
        cnpj, ano_mes = l["Código do Favorecido"].strip(), l["Ano/Mês"].strip()
        if not CNPJ.fullmatch(cnpj):
            raise ErroEmendas(f"favorecido municipal sem CNPJ de 14 dígitos: "
                              f"{l['Favorecido'][:40]!r} ({len(cnpj)} caracteres)")
        if not ANO_MES.fullmatch(ano_mes):
            raise ErroEmendas(f"Ano/Mês fora do formato: {ano_mes!r}")
        saida.append((
            l["Código da Emenda"].strip(), l["Tipo de Emenda"].strip(),
            l["Código do Autor da Emenda"].strip(), l["Nome do Autor da Emenda"].strip(),
            l["Número da emenda"].strip(), ano_mes, codigo,
            l["Natureza Jurídica"], cnpj, l["Favorecido"].strip(),
            centavos(l["Valor Recebido"]),
        ))
    if sem_casar:
        lista = ", ".join(f"{uf}/{n} ({q})" for (uf, n), q in sorted(sem_casar.items()))
        raise ErroEmendas(f"{len(sem_casar)} nome(s) de município sem casar; "
                          f"acrescentar a {APELIDOS.name} com a prova: {lista}")
    return saida, lidas


def total_da_fonte(linhas: Iterable[dict[str, str]]) -> tuple[int, int]:
    """(linhas, centavos) do filtro de natureza sobre o CSV, por outro caminho:
    `Decimal` sobre o texto cru, sem casar nome. É a régua do total."""
    n, soma = 0, Decimal(0)
    for l in linhas:
        if l["Natureza Jurídica"] in NATUREZAS:
            n += 1
            soma += Decimal(l["Valor Recebido"].strip().replace(",", "."))
    return n, int(soma * 100)


# ------------------------------------------------------------------ banco

ESQUEMA = """
-- Uma linha por pagamento à prefeitura ou a um fundo municipal. O arquivo da
-- CGU é o retrato inteiro, refeito a cada extração: reler SUBSTITUI tudo.
CREATE TABLE IF NOT EXISTS pagamento (
    emenda TEXT NOT NULL, tipo TEXT NOT NULL,
    autor_codigo TEXT NOT NULL, autor TEXT NOT NULL, numero TEXT NOT NULL,
    ano_mes TEXT NOT NULL, municipio INTEGER NOT NULL,
    natureza TEXT NOT NULL, cnpj TEXT NOT NULL, favorecido TEXT NOT NULL,
    centavos INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pagamento_mun ON pagamento (municipio, ano_mes);

CREATE TABLE IF NOT EXISTS arquivo (
    sha256 TEXT PRIMARY KEY, bytes INTEGER NOT NULL, data_arquivo TEXT NOT NULL,
    origem TEXT NOT NULL, linhas_lidas INTEGER NOT NULL,
    linhas_gravadas INTEGER NOT NULL, centavos INTEGER NOT NULL,
    ultimo_mes TEXT NOT NULL, gravado_em TEXT NOT NULL);
"""


def agora() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


class ArmazemEmendas:
    def __init__(self, caminho: str | Path) -> None:
        # Sem transação implícita: `gravar` abre e fecha a dela à mão, para a
        # conferência do total rodar ANTES do commit.
        self.con = sqlite3.connect(str(caminho), isolation_level=None)
        self.con.row_factory = sqlite3.Row
        self.con.executescript(ESQUEMA)

    def __enter__(self) -> "ArmazemEmendas":
        return self

    def __exit__(self, *_) -> None:
        self.con.close()

    def gravar(self, linhas: list[tuple], fonte: tuple[int, int], *, sha: str,
               bytes_: int, data_arquivo: str, origem: str, lidas: int) -> None:
        """Substitui o retrato numa transação, e só confirma se o banco bater
        com `fonte` (linhas, centavos) ao centavo. Se não bater, desfaz."""
        if not linhas:
            raise ErroEmendas("nenhum pagamento municipal no arquivo")
        try:
            self.con.execute("BEGIN")
            self.con.execute("DELETE FROM pagamento")
            self.con.execute("DELETE FROM arquivo")
            self.con.executemany(
                "INSERT INTO pagamento VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", linhas)
            n, soma = self.con.execute(
                "SELECT COUNT(*), SUM(centavos) FROM pagamento").fetchone()
            if (n, soma) != tuple(fonte):
                raise ErroEmendas(
                    f"o banco não bate com a fonte: {n} linhas e {soma} centavos "
                    f"contra {fonte[0]} e {fonte[1]}; nada foi gravado")
            ultimo = self.con.execute("SELECT MAX(ano_mes) FROM pagamento").fetchone()[0]
            self.con.execute(
                "INSERT INTO arquivo VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (sha, bytes_, data_arquivo, origem, lidas, n, soma, ultimo, agora()))
            self.con.execute("COMMIT")
        except BaseException:
            self.con.execute("ROLLBACK")
            raise

    def arquivo(self) -> sqlite3.Row | None:
        return self.con.execute("SELECT * FROM arquivo").fetchone()

    def por_ano(self, municipio: int) -> dict[str, int]:
        """`{ano do pagamento: centavos}` de um município."""
        return {l[0]: l[1] for l in self.con.execute(
            "SELECT substr(ano_mes, 1, 4), SUM(centavos) FROM pagamento"
            " WHERE municipio = ? GROUP BY 1 ORDER BY 1", (municipio,))}


def ingerir(zip_: str | Path, snapshot: dict, banco: str | Path,
            origem: str = URL, tabela_apelidos: str | Path = APELIDOS) -> dict:
    """Lê o zip, casa com o IBGE, confere o total e grava. Devolve o resumo."""
    municipios = municipios_do_snapshot(snapshot)
    apelidos = carregar_apelidos(municipios, tabela_apelidos)
    linhas, lidas = pagamentos(linhas_do_zip(zip_), municipios, apelidos)
    fonte = total_da_fonte(linhas_do_zip(zip_))
    with ArmazemEmendas(banco) as db:
        db.gravar(linhas, fonte, sha=sha256(zip_), bytes_=Path(zip_).stat().st_size,
                  data_arquivo=data_do_arquivo(zip_), origem=origem, lidas=lidas)
        a = db.arquivo()
        cobertos = db.con.execute(
            "SELECT COUNT(DISTINCT municipio) FROM pagamento").fetchone()[0]
    return {"lidas": lidas, "gravadas": a["linhas_gravadas"],
            "centavos": a["centavos"], "municipios": cobertos,
            "ultimo_mes": a["ultimo_mes"], "data_arquivo": a["data_arquivo"],
            "apelidos": len(apelidos)}


# ------------------------------------------------------------------ retrato

#: O primeiro ano da série exportada. 2014 fica fora: o arquivo só começa em
#: 07/2014. De 2015 a 2021 a conferência contra o Portal foi feita em
#: 09/10/2026 (a espec, §6).
PRIMEIRO_ANO = 2015

#: Os tipos de emenda, na ordem da página. Tipo novo na fonte é ERRO: a
#: divisão por tipo que não somasse o ano inteiro mentiria em silêncio.
TIPOS = (
    "Emenda Individual - Transferências Especiais",
    "Emenda Individual - Transferências com Finalidade Definida",
    "Emenda de Bancada",
    "Emenda de Comissão",
    "Emenda de Relator",
)


def retrato(db: ArmazemEmendas, codigos_ibge: Iterable[int]) -> dict:
    """O `emendas.json` que o painel lê.

    Um município por linha, **todos os do IBGE**:
    `[código, [centavos por ano, de PRIMEIRO_ANO ao ano do último mês],
    [centavos por tipo no último ano cheio]]`. Ano (ou tipo) sem nenhum
    pagamento é `None`, nunca 0: zero é a soma de pagamentos que se anulam,
    e "nenhum pagamento" é outra coisa (a espec, §5). Saldo negativo
    (estorno maior que o pagamento do ano) passa com o sinal.

    Fecha a conta antes de devolver: a soma exportada mais a de antes de
    PRIMEIRO_ANO tem de ser o total do banco, ao centavo.
    """
    a = db.arquivo()
    if a is None:
        raise ErroEmendas("banco de emendas vazio: rode emendas-ingerir")
    ultimo = a["ultimo_mes"]
    ano_final = int(ultimo[:4])
    anos = list(range(PRIMEIRO_ANO, ano_final + 1))
    ano_tipos = ano_final if ultimo.endswith("12") else ano_final - 1
    codigos = sorted({int(c) for c in codigos_ibge})
    if len(codigos) < 5000:
        raise ErroEmendas(f"só {len(codigos)} municípios do IBGE: lista suspeita")
    linhas = {c: [[None] * len(anos), [None] * len(TIPOS)] for c in codigos}
    fora = sorted({m for (m,) in db.con.execute(
        "SELECT DISTINCT municipio FROM pagamento")} - set(codigos))
    if fora:
        raise ErroEmendas(f"municípios do banco fora do snapshot: {fora[:10]}")
    novos = sorted({t for (t,) in db.con.execute(
        "SELECT DISTINCT tipo FROM pagamento")} - set(TIPOS))
    if novos:
        raise ErroEmendas(f"tipo de emenda novo na fonte: {novos}")
    for m, ano, s in db.con.execute(
            "SELECT municipio, CAST(substr(ano_mes, 1, 4) AS INTEGER), SUM(centavos)"
            " FROM pagamento WHERE ano_mes >= ? GROUP BY 1, 2", (f"{PRIMEIRO_ANO}",)):
        linhas[m][0][ano - PRIMEIRO_ANO] = s
    for m, tipo, s in db.con.execute(
            "SELECT municipio, tipo, SUM(centavos) FROM pagamento"
            " WHERE substr(ano_mes, 1, 4) = ? GROUP BY 1, 2", (f"{ano_tipos}",)):
        linhas[m][1][TIPOS.index(tipo)] = s
    antes = db.con.execute(
        "SELECT COALESCE(SUM(centavos), 0) FROM pagamento WHERE ano_mes < ?",
        (f"{PRIMEIRO_ANO}",)).fetchone()[0]
    exportado = sum(v for p, _ in linhas.values() for v in p if v is not None)
    if exportado + antes != a["centavos"]:
        raise ErroEmendas(f"a soma exportada ({exportado} + {antes} antes de "
                          f"{PRIMEIRO_ANO}) não fecha com o banco ({a['centavos']})")
    no_ano = sum(v for _, t in linhas.values() for v in t if v is not None)
    if no_ano != sum(p[ano_tipos - PRIMEIRO_ANO] or 0 for p, _ in linhas.values()):
        raise ErroEmendas(f"os tipos de {ano_tipos} não somam o ano")
    return {
        "fonte": ("Controladoria-Geral da União — Portal da Transparência, "
                  "emendas parlamentares por favorecido"),
        "origem": URL,
        "dataArquivo": a["data_arquivo"],
        "sha256": a["sha256"],
        "ultimoMes": ultimo,
        "coletadoEm": a["gravado_em"],
        "anos": anos,
        "anoTipos": ano_tipos,
        "tipos": list(TIPOS),
        "municipios": [[c, p, t] for c, (p, t) in sorted(linhas.items())],
    }


def gravar_retrato(r: dict, saida: str | Path,
                   permitir_encolher: bool = False) -> str:
    """Escreve o retrato, comparando com o que vai sobrescrever (a mesma
    trava do Caged): recusa último mês mais velho e menos municípios, e não
    reescreve quando só o carimbo de coleta mudou. Devolve `"gravado"` ou
    `"inalterado"`."""
    import json
    saida = Path(saida)
    if saida.exists():
        velho = json.loads(saida.read_text(encoding="utf-8"))
        if not permitir_encolher:
            erros = []
            if r["ultimoMes"] < velho.get("ultimoMes", ""):
                erros.append(f"último mês {velho['ultimoMes']} → {r['ultimoMes']}")
            if len(r["municipios"]) < len(velho.get("municipios", [])):
                erros.append(f"municípios {len(velho['municipios'])} → "
                             f"{len(r['municipios'])}")
            if erros:
                raise ErroEmendas("RECUSADO: o retrato das emendas encolheu — "
                                  + "; ".join(erros) + ". Se é a intenção, repita "
                                  "com --permitir-encolher. Nada gravado.")
        sem_carimbo = lambda x: {k: v for k, v in x.items() if k != "coletadoEm"}
        if sem_carimbo(velho) == sem_carimbo(r):
            return "inalterado"
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n",
                     encoding="utf-8")
    return "gravado"
