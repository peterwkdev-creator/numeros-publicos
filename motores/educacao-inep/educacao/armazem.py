"""Persistência em SQLite. Nenhuma regra de leitura da planilha mora aqui.

Mesmo desenho do `sys-painel-fiscal`: esquema criado na abertura, gravação em
lote com `ON CONFLICT DO UPDATE`, e uma tabela de coleta que registra o que
aconteceu — inclusive quando deu errado.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Iterable

from .inep import LinhaIdeb

FONTE = "INEP/MEC — IDEB, resultados por município"

ESQUEMA = """
-- Uma linha por (municipio, rede, etapa, edicao). As QUATRO juntas sao a
-- chave: nenhuma combinacao menor identifica uma observacao. `REDE` fora da
-- chave colapsaria as quatro redes de um municipio numa linha so, e `etapa`
-- fora dela misturaria anos iniciais com finais, que tem escalas diferentes.
CREATE TABLE IF NOT EXISTS ideb (
    codigo_ibge          INTEGER NOT NULL,
    uf                   TEXT    NOT NULL,
    nome                 TEXT    NOT NULL,
    rede                 TEXT    NOT NULL,
    etapa                TEXT    NOT NULL,
    edicao               INTEGER NOT NULL,
    observado            REAL,
    projecao             REAL,
    nota_portugues       REAL,
    nota_matematica      REAL,
    indicador_rendimento REAL,
    -- As ressalvas que a fonte colou no numero (`206,95**`). Guardadas ao lado
    -- do valor, nunca no lugar dele: o numero e real e o aviso tambem.
    marca_portugues      TEXT,
    marca_matematica     TEXT,
    fonte                TEXT    NOT NULL,
    coletado_em          TEXT    NOT NULL,
    PRIMARY KEY (codigo_ibge, rede, etapa, edicao)
);

CREATE INDEX IF NOT EXISTS ideb_uf ON ideb (uf, edicao);

CREATE TABLE IF NOT EXISTS coleta (
    iniciada_em  TEXT NOT NULL,
    terminada_em TEXT,
    etapa        TEXT NOT NULL,
    ufs          TEXT NOT NULL,
    linhas       INTEGER NOT NULL DEFAULT 0,
    municipios   INTEGER NOT NULL DEFAULT 0,
    falhou_com   TEXT
);
"""


def agora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Conexao:
    def __init__(self, caminho: str):
        self.caminho = caminho

    def __enter__(self) -> sqlite3.Connection:
        self.con = sqlite3.connect(self.caminho)
        self.con.row_factory = sqlite3.Row
        self.con.executescript(ESQUEMA)
        return self.con

    def __exit__(self, *e):
        if e[0] is None:
            self.con.commit()
        self.con.close()
        return False


def abrir(caminho: str) -> Conexao:
    return Conexao(caminho)


def gravar(con: sqlite3.Connection, linhas: Iterable[LinhaIdeb]) -> int:
    """Grava em lote. Idempotente: rodar duas vezes não duplica nem muda nada.

    Devolve quantas linhas foram gravadas.
    """
    agora_ = agora()
    dados = [
        (l.codigo_ibge, l.uf, l.nome, l.rede, l.etapa, l.edicao,
         l.observado, l.projecao, l.nota_portugues, l.nota_matematica,
         l.indicador_rendimento, l.marca_portugues, l.marca_matematica,
         FONTE, agora_)
        for l in linhas
    ]
    con.executemany(
        "INSERT INTO ideb (codigo_ibge, uf, nome, rede, etapa, edicao,"
        " observado, projecao, nota_portugues, nota_matematica,"
        " indicador_rendimento, marca_portugues, marca_matematica,"
        " fonte, coletado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
        " ON CONFLICT(codigo_ibge, rede, etapa, edicao) DO UPDATE SET"
        "   uf=excluded.uf, nome=excluded.nome,"
        "   observado=excluded.observado, projecao=excluded.projecao,"
        "   nota_portugues=excluded.nota_portugues,"
        "   nota_matematica=excluded.nota_matematica,"
        "   indicador_rendimento=excluded.indicador_rendimento,"
        "   marca_portugues=excluded.marca_portugues,"
        "   marca_matematica=excluded.marca_matematica,"
        "   fonte=excluded.fonte, coletado_em=excluded.coletado_em",
        dados,
    )
    return len(dados)


def abrir_coleta(con: sqlite3.Connection, etapa: str, ufs: str) -> int:
    cur = con.execute(
        "INSERT INTO coleta (iniciada_em, etapa, ufs) VALUES (?,?,?)",
        (agora(), etapa, ufs))
    return cur.lastrowid


def fechar_coleta(con: sqlite3.Connection, id_: int, linhas: int,
                  municipios: int, falha: str | None) -> None:
    con.execute(
        "UPDATE coleta SET terminada_em=?, linhas=?, municipios=?, falhou_com=?"
        " WHERE rowid=?", (agora(), linhas, municipios, falha, id_))
