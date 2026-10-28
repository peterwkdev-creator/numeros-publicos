"""MEI optantes pelo SIMEI: a leitura do formulário da Receita e as armadilhas.

As armadilhas são as da espec (`especs/numeros-publicos-mei.md`, §3), medidas
em 27/10/2026; as respostas são recortes das reais, sem rede.
"""

from __future__ import annotations

import csv
import io
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from numeros_publicos import simei
from numeros_publicos.cli import construir_parser
from numeros_publicos.simei import (
    ArmazemSimei, DataRecusada, ErroSimei, Fatia, conferir, hf_municipios,
    ler_lista, ler_tabela,
)

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(nome: str) -> str:
    return (FIXTURES / nome).read_text(encoding="utf-8")


AC_2010 = fixture("simei_ac_20101231.html")
PB_ATUAL = fixture("simei_pb_20261024.html")
LISTA_PB = fixture("simei_lista_pb.html")
RECUSA = fixture("simei_recusa.html")
ERRO_ANO = fixture("simei_erro_anoconsulta.html")
SEM_REGISTROS = fixture("simei_sem_registros.html")
DE_PARA = simei.ler_de_para()


def lista_de(uf: str) -> dict[str, str]:
    """`{nome: TOM}` de uma UF, do `simei_tom.csv` (o nome é o da Receita)."""
    with open(simei.DE_PARA, encoding="utf-8", newline="") as f:
        return {r["nome"]: r["tom"]
                for r in csv.DictReader(l for l in f if not l.startswith("#"))
                if r["uf"] == uf}


def banco_de(*ufs: str) -> dict[str, set[int]]:
    return {uf: {DE_PARA[t][0] for t in lista_de(uf).values()} for uf in ufs}


FORM = ('<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="v" />'
        '<input name="ctl00$ctl00$Conteudo$AntesTabela$txtDtIni" type="text" />'
        "<span>Posição Consolidada até 24/10/2026</span>")


class Fonte:
    """O formulário falso: devolve, por (UF, data), as respostas da fila."""

    def __init__(self, respostas: dict[tuple[str, str], list[str]],
                 listas: dict[str, str]) -> None:
        self.respostas = respostas
        self.listas = listas
        self.consultas: list[tuple[str, dict]] = []

    def __call__(self, url: str, dados: dict | None = None) -> str:
        if url == simei.URL_LISTA:
            return self.listas[dados["uf"]]
        if dados and "ctl00$ctl00$Conteudo$AntesTabela$btnExibir" in dados:
            self.consultas.append((url, dados))
            chave = (dados["ctl00$ctl00$Conteudo$AposTabela$hfUF"],
                     dados["ctl00$ctl00$Conteudo$AntesTabela$txtDtIni"])
            fila = self.respostas[chave]
            return fila.pop(0) if len(fila) > 1 else fila[0]
        return FORM


def _lista_html(lista: dict[str, str]) -> str:
    return "".join(f'<option value="{t}">{n}</option>' for n, t in lista.items())


class TestCaminhoFeliz(unittest.TestCase):
    def test_pb_na_posicao_atual_lista_completa_e_soma_igual_ao_total(self):
        linhas, total, posicao = ler_tabela(PB_ATUAL, "PB", "24/10/2026")
        lista = ler_lista(LISTA_PB)
        valores = conferir(linhas, total, lista, "PB", "24/10/2026", esperados=223)
        self.assertEqual((len(valores), total, posicao), (223, 229321, "24/10/2026"))
        self.assertEqual(sum(valores.values()), 229321)

    def test_coleta_grava_por_ibge_com_posicao_e_data_da_coleta(self):
        fonte = Fonte({("PB", "24/10/2026"): [PB_ATUAL]}, {"PB": LISTA_PB})
        with tempfile.TemporaryDirectory() as d:
            with ArmazemSimei(Path(d) / "s.db") as db:
                falhas, rep = simei.coletar(fonte, db, banco_de("PB"), DE_PARA,
                                            so_atual=True, dormir=lambda s: None,
                                            saida=lambda *a: None)
                self.assertEqual((falhas, rep), ([], 0))
                l = db.con.execute(
                    "SELECT COUNT(*), SUM(valor), MIN(posicao), MIN(coletado_em)"
                    " FROM simei WHERE data = '2026-10-24'").fetchone()
                self.assertEqual(l[:3], (223, 229321, "2026-10-24"))
                self.assertTrue(l[3])
                self.assertEqual(db.totais_por_data(),
                                 [("2026-10-24", 1, 223, 229321)])

    def test_serie_vai_de_2009_a_2025_e_a_posicao(self):
        datas = simei.datas_da_serie("24/10/2026")
        self.assertEqual((len(datas), datas[0], datas[-2], datas[-1]),
                         (18, "31/12/2009", "31/12/2025", "24/10/2026"))


class TestArmadilha1DataRecusada(unittest.TestCase):
    def test_repete_ate_vir_a_tabela(self):
        fonte = Fonte({("PB", "24/10/2026"): [RECUSA, RECUSA, PB_ATUAL]},
                      {"PB": LISTA_PB})
        with tempfile.TemporaryDirectory() as d, ArmazemSimei(Path(d) / "s.db") as db:
            falhas, rep = simei.coletar(fonte, db, banco_de("PB"), DE_PARA,
                                        so_atual=True, dormir=lambda s: None,
                                        saida=lambda *a: None)
            self.assertEqual((falhas, rep), ([], 2))
            self.assertEqual(db.con.execute(
                "SELECT tentativas FROM fatia").fetchone()[0], 3)

    def test_teto_esgotado_nao_grava_a_uf_e_termina_vermelha(self):
        fonte = Fonte({("PB", "24/10/2026"): [RECUSA]}, {"PB": LISTA_PB})
        with tempfile.TemporaryDirectory() as d, ArmazemSimei(Path(d) / "s.db") as db:
            falhas, _ = simei.coletar(fonte, db, banco_de("PB"), DE_PARA,
                                      so_atual=True, dormir=lambda s: None,
                                      saida=lambda *a: None)
            self.assertEqual(len(falhas), 1)
            self.assertIn("recusada", falhas[0])
            self.assertEqual(db.con.execute("SELECT COUNT(*) FROM simei").fetchone()[0], 0)
            self.assertEqual(len(fonte.consultas), simei.TENTATIVAS_DATA)

    def test_recusa_e_DataRecusada(self):
        with self.assertRaises(DataRecusada):
            ler_tabela(RECUSA, "PB", "24/10/2026")


class TestArmadilha2AnoConsultaVazio(unittest.TestCase):
    def test_a_url_leva_anoConsulta_vazio(self):
        self.assertTrue(simei.URL_CONSULTA.endswith("&anoConsulta="))
        fonte = Fonte({("PB", "24/10/2026"): [PB_ATUAL]}, {"PB": LISTA_PB})
        with tempfile.TemporaryDirectory() as d, ArmazemSimei(Path(d) / "s.db") as db:
            simei.coletar(fonte, db, banco_de("PB"), DE_PARA, so_atual=True,
                          dormir=lambda s: None, saida=lambda *a: None)
        self.assertEqual({u for u, _ in fonte.consultas}, {simei.URL_CONSULTA})

    def test_erro_inesperado_para_e_nao_e_recusa_de_data(self):
        with self.assertRaises(ErroSimei) as c:
            ler_tabela(ERRO_ANO, "AC", "31/12/2009")
        self.assertNotIsInstance(c.exception, DataRecusada)


class TestArmadilha3MunicipioOmitido(unittest.TestCase):
    def test_ausente_fica_sem_linha_nunca_zero(self):
        linhas, total, _ = ler_tabela(AC_2010, "AC", "31/12/2010")
        valores = conferir(linhas, total, lista_de("AC"), "AC", "31/12/2010")
        self.assertEqual((len(valores), total), (21, 3433))
        self.assertNotIn("SANTA ROSA DO PURUS", linhas)
        with tempfile.TemporaryDirectory() as d, ArmazemSimei(Path(d) / "s.db") as db:
            db.gravar(Fatia("AC", "31/12/2010", valores, total, "24/10/2026"), DE_PARA)
            ibge = DE_PARA[lista_de("AC")["SANTA ROSA DO PURUS"]][0]
            self.assertIsNone(db.con.execute(
                "SELECT valor FROM simei WHERE municipio = ?", (ibge,)).fetchone())
            self.assertEqual(db.con.execute("SELECT COUNT(*) FROM simei").fetchone()[0], 21)

    def test_na_posicao_atual_linhas_menos_que_o_banco_para(self):
        linhas, total, _ = ler_tabela(AC_2010, "AC", "31/12/2010")
        with self.assertRaisesRegex(ErroSimei, "21 linhas, o banco tem 22"):
            conferir(linhas, total, lista_de("AC"), "AC", "31/12/2010", esperados=22)

    def test_soma_diferente_do_total_para(self):
        mexida = AC_2010.replace(">3.433<", ">3.434<")
        linhas, total, _ = ler_tabela(mexida, "AC", "31/12/2010")
        with self.assertRaisesRegex(ErroSimei, "soma das linhas"):
            conferir(linhas, total, lista_de("AC"), "AC", "31/12/2010")


class TestArmadilha4ChavePeloNome(unittest.TestCase):
    def test_a_ordem_da_tabela_nao_e_a_da_lista_e_a_chave_e_o_nome(self):
        linhas, total, _ = ler_tabela(AC_2010, "AC", "31/12/2010")
        lista = lista_de("AC")
        self.assertNotEqual(list(linhas), [n for n in lista if n in linhas])
        valores = conferir(linhas, total, lista, "AC", "31/12/2010")
        self.assertEqual(valores[lista["RIO BRANCO"]], 2378)

    def test_nome_sem_par_na_lista_para(self):
        linhas, total, _ = ler_tabela(AC_2010.replace("XAPURI", "XAPURY"),
                                      "AC", "31/12/2010")
        with self.assertRaisesRegex(ErroSimei, "sem par"):
            conferir(linhas, total, lista_de("AC"), "AC", "31/12/2010")

    def test_resposta_de_outra_uf_ou_data_para(self):
        with self.assertRaisesRegex(ErroSimei, "a resposta é de AC"):
            ler_tabela(AC_2010, "AM", "31/12/2010")
        with self.assertRaisesRegex(ErroSimei, "31/12/2010"):
            ler_tabela(AC_2010, "AC", "31/12/2011")


class TestArmadilha5UFsDoBanco(unittest.TestCase):
    def test_faltar_uf_no_banco_termina_vermelho_sem_pedir_nada(self):
        with tempfile.TemporaryDirectory() as d:
            obs = Path(d) / "obs.db"
            con = sqlite3.connect(obs)
            con.execute("CREATE TABLE municipio (codigo INTEGER, uf_sigla TEXT)")
            uf_por_ibge = {i: u for i, u in DE_PARA.values()}
            con.executemany("INSERT INTO municipio VALUES (?, ?)",
                            [(i, u) for i, u in uf_por_ibge.items() if u != "RN"])
            con.commit()
            con.close()
            args = construir_parser().parse_args(
                ["--banco", str(obs), "simei-ingerir",
                 "--banco-simei", str(Path(d) / "s.db")])
            pedidos = []
            err = io.StringIO()
            with redirect_stdout(io.StringIO()), redirect_stderr(err):
                codigo = args.func(args, pedir=lambda *a: pedidos.append(a) or "")
            self.assertEqual(codigo, 1)
            self.assertIn("faltam ['RN']", err.getvalue())
            self.assertEqual(pedidos, [])

    def test_lista_tom_que_nao_e_o_banco_na_uf_para(self):
        banco = banco_de("PB")
        banco["PB"].pop()
        with self.assertRaisesRegex(ErroSimei, "a lista TOM tem 223"):
            simei.conferir_lista(ler_lista(LISTA_PB), DE_PARA, "PB", banco["PB"])


class TestArmadilha6Releitura(unittest.TestCase):
    def test_releitura_substitui_a_fatia_e_diz_o_que_mudou(self):
        lista = lista_de("AC")
        rb, xa = lista["RIO BRANCO"], lista["XAPURI"]
        with tempfile.TemporaryDirectory() as d, ArmazemSimei(Path(d) / "s.db") as db:
            m = db.gravar(Fatia("AC", "31/12/2010", {rb: 10, xa: 5}, 15, "24/10/2026"),
                          DE_PARA)
            self.assertEqual(m.resumo(), "nova")
            m = db.gravar(Fatia("AC", "31/12/2010", {rb: 11}, 11, "24/11/2026"),
                          DE_PARA)
            self.assertEqual((m.total_antes, m.total_depois, len(m.mudaram)), (15, 11, 2))
            self.assertIn("MUDOU", m.resumo())
            self.assertEqual(db.con.execute(
                "SELECT municipio, valor, posicao FROM simei").fetchall(),
                [(DE_PARA[rb][0], 11, "2026-11-24")])


class TestArmadilha8Apostrofo(unittest.TestCase):
    def test_nome_com_apostrofo_casa_a_lista_e_a_tabela(self):
        lista = ler_lista(LISTA_PB)
        self.assertEqual(lista["MAE D'AGUA"], "2075")
        linhas, total, _ = ler_tabela(PB_ATUAL, "PB", "24/10/2026")
        self.assertIn("MAE D'AGUA", linhas)
        self.assertIn("OLHO D'AGUA", linhas)
        valores = conferir(linhas, total, lista, "PB", "24/10/2026")
        self.assertEqual(valores["2075"], linhas["MAE D'AGUA"])

    def test_codigos_entre_aspas_simples_no_hfMunicipios(self):
        self.assertEqual(hf_municipios(["2075", "2109"]), "'2075','2109'")
        fonte = Fonte({("PB", "24/10/2026"): [PB_ATUAL]}, {"PB": LISTA_PB})
        with tempfile.TemporaryDirectory() as d, ArmazemSimei(Path(d) / "s.db") as db:
            simei.coletar(fonte, db, banco_de("PB"), DE_PARA, so_atual=True,
                          dormir=lambda s: None, saida=lambda *a: None)
        hf = fonte.consultas[0][1]["ctl00$ctl00$Conteudo$AposTabela$hfMunicipios"]
        self.assertEqual(len(hf.split(",")), 223)
        self.assertIn("'2075'", hf)


class TestArmadilha9UFSemOptante(unittest.TestCase):
    def _coletar(self, fila, so_atual=False):
        fonte = Fonte({("AC", "31/12/2009"): fila, ("AC", "24/10/2026"): fila},
                      {"AC": _lista_html(lista_de("AC"))})
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        db = ArmazemSimei(Path(d.name) / "s.db")
        self.addCleanup(db.con.close)
        falhas, _ = simei.coletar(fonte, db, banco_de("AC"), DE_PARA,
                                  datas=None if so_atual else ["31/12/2009"],
                                  so_atual=so_atual, dormir=lambda s: None,
                                  saida=lambda *a: None)
        return falhas, db

    def test_sem_registros_duas_vezes_grava_fatia_vazia(self):
        falhas, db = self._coletar([SEM_REGISTROS])
        self.assertEqual(falhas, [])
        self.assertEqual(db.con.execute(
            "SELECT linhas, total, tentativas FROM fatia").fetchone(), (0, 0, 2))
        self.assertEqual(db.con.execute("SELECT COUNT(*) FROM simei").fetchone()[0], 0)

    def test_sem_registros_e_depois_tabela_fica_a_tabela(self):
        falhas, db = self._coletar(
            [SEM_REGISTROS, AC_2010.replace("31/12/2010", "31/12/2009")])
        self.assertEqual(falhas, [])
        self.assertEqual(db.con.execute("SELECT total FROM fatia").fetchone()[0], 3433)

    def test_sem_registros_na_posicao_atual_termina_vermelha(self):
        falhas, db = self._coletar([SEM_REGISTROS], so_atual=True)
        self.assertEqual(len(falhas), 1)
        self.assertEqual(db.con.execute("SELECT COUNT(*) FROM fatia").fetchone()[0], 0)


class TestDePara(unittest.TestCase):
    def test_5571_municipios_um_para_um_nas_27_UFs(self):
        ibge = [i for i, _ in DE_PARA.values()]
        self.assertEqual((len(DE_PARA), len(set(ibge))), (5571, 5571))
        self.assertEqual({u for _, u in DE_PARA.values()}, simei.UFS)
        self.assertEqual(DE_PARA["1182"], (5101837, "MT"))


if __name__ == "__main__":
    unittest.main()
