"""Emendas parlamentares: o filtro municipal, o casamento com o IBGE e a
conferência do total ao centavo.

O critério de aceite é o do módulo: com o zip real da CGU, a soma gravada
iguala a soma do CSV filtrado, ao centavo, e nada se grava se não igualar.
Estes testes cobram as peças disso sem rede e sem os 32 MB.
"""

from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
import zipfile
from pathlib import Path

from numeros_publicos import emendas
from numeros_publicos.emendas import (
    ArmazemEmendas, ErroEmendas, carregar_apelidos, centavos, ingerir,
    municipios_do_snapshot, pagamentos,
)

SITE = Path(__file__).resolve().parents[1]

SNAPSHOT = {"municipios": [
    [2927408, "Salvador", "BA"],
    [2105302, "Imperatriz", "MA"],
    [2400208, "Assú", "RN"],
    [3515004, "Embu das Artes", "SP"],
]}

MUN = "Município"
FUNDO = "Fundo Público da Administração Direta Municipal"


def linha(natureza=MUN, uf="BA", municipio="SALVADOR", valor="100,00",
          codigo="13927801000149", ano_mes="202501", favorecido="MUNICIPIO X"):
    return ["202512340001", "1234", "FULANO", "0001", "Emenda Individual",
            ano_mes, codigo, favorecido, natureza, "Pessoa Juridica", uf,
            municipio, valor]


def zip_de(pasta: Path, linhas: list[list[str]]) -> Path:
    """O zip como a CGU publica: latin-1, `;`, o cabeçalho exato."""
    texto = "\r\n".join(";".join(l) for l in [list(emendas.COLUNAS), *linhas])
    caminho = pasta / "emendas.zip"
    with zipfile.ZipFile(caminho, "w") as z:
        z.writestr(emendas.ARQUIVO, texto.encode("latin-1"))
    return caminho


def apelidos_de(pasta: Path, linhas: list[str]) -> Path:
    caminho = pasta / "apelidos.csv"
    caminho.write_text("uf;nome_na_fonte;ibge;nome_ibge;prova\n"
                       + "".join(l + "\n" for l in linhas), encoding="utf-8")
    return caminho


class TestCentavos(unittest.TestCase):
    def test_formato_da_fonte(self):
        self.assertEqual(centavos("245850,00"), 24585000)
        self.assertEqual(centavos("-0,50"), -50)
        self.assertEqual(centavos("7,5"), 750)
        self.assertEqual(centavos("12"), 1200)

    def test_recusa_separador_de_milhar(self):
        # A fonte não usa milhar: `1.234,56` seria lido como outra coisa.
        for ruim in ("1.234,56", "", "12,345", "abc"):
            with self.assertRaises(ErroEmendas, msg=ruim):
                centavos(ruim)


class TestPagamentos(unittest.TestCase):
    def setUp(self):
        self.mun = municipios_do_snapshot(SNAPSHOT)

    def test_so_naturezas_municipais_entram(self):
        linhas = [dict(zip(emendas.COLUNAS, l)) for l in (
            linha(),
            linha(natureza=FUNDO, uf="MA", municipio="IMPERATRIZ"),
            linha(natureza="Pessoa Fisica", codigo="***123456**"),
            linha(natureza="Estado ou Distrito Federal", codigo="13937032000160"),
            linha(natureza="Associação Privada", codigo="00000000000191"),
        )]
        saida, lidas = pagamentos(linhas, self.mun, {})
        self.assertEqual(lidas, 5)
        self.assertEqual([p[6] for p in saida], [2927408, 2105302])
        self.assertTrue(all(len(p[8]) == 14 for p in saida))

    def test_nome_sem_casar_e_erro_com_a_lista(self):
        linhas = [dict(zip(emendas.COLUNAS, l)) for l in (
            linha(uf="RN", municipio="AÇU"),
            linha(uf="SP", municipio="EMBU"),
            linha(uf="SP", municipio="EMBU"),
        )]
        with self.assertRaises(ErroEmendas) as e:
            pagamentos(linhas, self.mun, {})
        self.assertIn("2 nome(s)", str(e.exception))
        self.assertIn("RN/ACU (1)", str(e.exception))
        self.assertIn("SP/EMBU (2)", str(e.exception))

    def test_apelido_resolve(self):
        linhas = [dict(zip(emendas.COLUNAS, linha(uf="RN", municipio="AÇU")))]
        saida, _ = pagamentos(linhas, self.mun, {("RN", "ACU"): 2400208})
        self.assertEqual(saida[0][6], 2400208)

    def test_municipal_com_cpf_e_erro(self):
        # Favorecido municipal com código de 11 dígitos é filtro ou leitura errada.
        linhas = [dict(zip(emendas.COLUNAS, linha(codigo="12345678901")))]
        with self.assertRaises(ErroEmendas):
            pagamentos(linhas, self.mun, {})


class TestApelidos(unittest.TestCase):
    def setUp(self):
        self.mun = municipios_do_snapshot(SNAPSHOT)
        self.tmp = tempfile.TemporaryDirectory()
        self.pasta = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_codigo_tem_de_ser_o_nome_escrito(self):
        caminho = apelidos_de(self.pasta, ["RN;AÇU;2927408;Assú;localidade"])
        with self.assertRaises(ErroEmendas):
            carregar_apelidos(self.mun, caminho)

    def test_apelido_que_ja_casa_e_erro(self):
        caminho = apelidos_de(self.pasta, ["BA;SALVADOR;2927408;Salvador;grafia"])
        with self.assertRaises(ErroEmendas):
            carregar_apelidos(self.mun, caminho)

    @unittest.skipUnless((SITE / "painel/dados/snapshot.json").exists(),
                         "sem o snapshot do painel")
    def test_tabela_real_vale_contra_o_snapshot_real(self):
        snap = json.loads((SITE / "painel/dados/snapshot.json")
                          .read_text(encoding="utf-8"))
        apelidos = carregar_apelidos(municipios_do_snapshot(snap))
        self.assertEqual(len(apelidos), 25)


class TestIngerir(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.pasta = Path(self.tmp.name)
        self.apelidos = apelidos_de(self.pasta, ["RN;AÇU;2400208;Assú;localidade"])
        self.banco = self.pasta / "emendas.db"

    def tearDown(self):
        self.tmp.cleanup()

    def ingerir(self, linhas):
        return ingerir(zip_de(self.pasta, linhas), SNAPSHOT, self.banco,
                       origem="teste", tabela_apelidos=self.apelidos)

    def test_grava_e_confere_ao_centavo(self):
        r = self.ingerir([
            linha(valor="245850,00", ano_mes="202412"),
            linha(valor="-0,50", ano_mes="202501"),
            linha(natureza=FUNDO, uf="RN", municipio="AÇU", valor="10,01",
                  ano_mes="202603"),
            linha(natureza="Pessoa Fisica", codigo="***123456**", valor="999,99"),
        ])
        self.assertEqual(r["lidas"], 4)
        self.assertEqual(r["gravadas"], 3)
        self.assertEqual(r["centavos"], 24585000 - 50 + 1001)
        self.assertEqual(r["municipios"], 2)
        self.assertEqual(r["ultimo_mes"], "202603")
        with ArmazemEmendas(self.banco) as db:
            self.assertEqual(db.por_ano(2927408), {"2024": 24585000, "2025": -50})
            self.assertEqual(db.por_ano(2400208), {"2026": 1001})
            self.assertEqual(db.arquivo()["origem"], "teste")

    def test_acento_latin1_lido_certo(self):
        self.ingerir([linha(favorecido="MUNICÍPIO DE ASSÚ", uf="RN", municipio="AÇU")])
        with ArmazemEmendas(self.banco) as db:
            fav = db.con.execute("SELECT favorecido FROM pagamento").fetchone()[0]
        self.assertEqual(fav, "MUNICÍPIO DE ASSÚ")

    def test_reingerir_substitui_sem_duplicar(self):
        self.ingerir([linha(valor="1,00"), linha(valor="2,00")])
        self.ingerir([linha(valor="5,00")])
        with ArmazemEmendas(self.banco) as db:
            n, soma = db.con.execute(
                "SELECT COUNT(*), SUM(centavos) FROM pagamento").fetchone()
            arquivos = db.con.execute("SELECT COUNT(*) FROM arquivo").fetchone()[0]
        self.assertEqual((n, soma, arquivos), (1, 500, 1))

    def test_total_que_nao_bate_desfaz_tudo(self):
        self.ingerir([linha(valor="1,00")])
        with ArmazemEmendas(self.banco) as db:
            with self.assertRaises(ErroEmendas):
                db.gravar([("e", "t", "a", "A", "n", "202501", 2927408, MUN,
                            "13927801000149", "F", 700)], (1, 701), sha="x",
                          bytes_=1, data_arquivo="2026-01-01T00:00:00",
                          origem="teste", lidas=1)
        # O retrato anterior continua inteiro: nem o DELETE ficou.
        con = sqlite3.connect(self.banco)
        self.assertEqual(con.execute(
            "SELECT COUNT(*), SUM(centavos) FROM pagamento").fetchone(), (1, 100))
        self.assertEqual(con.execute("SELECT COUNT(*) FROM arquivo").fetchone()[0], 1)
        con.close()

    def test_cabecalho_mudado_e_erro(self):
        caminho = self.pasta / "outro.zip"
        with zipfile.ZipFile(caminho, "w") as z:
            z.writestr(emendas.ARQUIVO, "Código;Valor\r\n1;2".encode("latin-1"))
        with self.assertRaises(ErroEmendas):
            ingerir(caminho, SNAPSHOT, self.banco, tabela_apelidos=self.apelidos)
        self.assertFalse(self.banco.exists())


#: 5.000 códigos fictícios mais os do snapshot: o retrato recusa lista curta.
CODIGOS = [c for c, *_ in SNAPSHOT["municipios"]] + list(range(1000000, 1005000))
IND_ESP, IND_FIN, BANCADA, COMISSAO, RELATOR = emendas.TIPOS


def pagamento(municipio, ano_mes, centavos_, tipo=IND_FIN):
    return ("e", tipo, "a", "A", "n", ano_mes, municipio, MUN,
            "13927801000149", "F", centavos_)


class TestRetrato(unittest.TestCase):
    """O `emendas.json`: ausência é `None`, o sinal passa, a soma fecha."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.banco = Path(self.tmp.name) / "emendas.db"

    def tearDown(self):
        self.tmp.cleanup()

    def gravado(self, linhas):
        with ArmazemEmendas(self.banco) as db:
            db.gravar(linhas, (len(linhas), sum(l[-1] for l in linhas)), sha="x",
                      bytes_=1, data_arquivo="2026-10-01T11:23:36", origem="o",
                      lidas=len(linhas))
            return emendas.retrato(db, CODIGOS)

    def test_ano_sem_pagamento_e_none_e_zero_e_negativo_passam(self):
        r = self.gravado([
            pagamento(2927408, "201407", 500),       # antes da série
            pagamento(2927408, "201503", 1000),
            pagamento(2927408, "202204", 700),
            pagamento(2927408, "202209", -700),      # zero: não é ausência
            pagamento(2105302, "202207", -1705634),  # estorno maior (São José)
            pagamento(2105302, "202501", 300, BANCADA),
            pagamento(2105302, "202502", 200, BANCADA),
            pagamento(2105302, "202503", 50, RELATOR),
            pagamento(2105302, "202609", 9),
        ])
        self.assertEqual(r["anos"], list(range(2015, 2027)))
        self.assertEqual(r["anoTipos"], 2025)
        self.assertEqual(r["ultimoMes"], "202609")
        d = {m[0]: m for m in r["municipios"]}
        self.assertEqual(len(d), len(CODIGOS))
        salvador = d[2927408][1]
        self.assertEqual(salvador[0], 1000)
        self.assertEqual(salvador[2022 - 2015], 0)
        self.assertIsNone(salvador[2016 - 2015])
        imperatriz = d[2105302]
        self.assertEqual(imperatriz[1][2022 - 2015], -1705634)
        self.assertEqual(imperatriz[1][2025 - 2015], 550)
        self.assertEqual(imperatriz[2], [None, None, 500, None, 50])
        self.assertEqual(d[1000000][1:], [[None] * 12, [None] * 5])

    def test_ano_cheio_quando_o_ultimo_mes_e_dezembro(self):
        r = self.gravado([pagamento(2927408, "202512", 1, COMISSAO)])
        self.assertEqual((r["anos"][-1], r["anoTipos"]), (2025, 2025))
        self.assertEqual({m[0]: m for m in r["municipios"]}[2927408][2],
                         [None, None, None, 1, None])

    def test_tipo_novo_na_fonte_e_erro(self):
        with self.assertRaisesRegex(ErroEmendas, "tipo de emenda novo"):
            self.gravado([pagamento(2927408, "202501", 1, "Emenda de Plenário")])

    def test_municipio_fora_do_snapshot_e_erro(self):
        with self.assertRaisesRegex(ErroEmendas, "fora do snapshot"):
            self.gravado([pagamento(9999999, "202501", 1)])

    def test_gravar_recusa_encolher_e_ignora_so_o_carimbo(self):
        r = self.gravado([pagamento(2927408, "202609", 1)])
        saida = Path(self.tmp.name) / "emendas.json"
        self.assertEqual(emendas.gravar_retrato(r, saida), "gravado")
        self.assertEqual(emendas.gravar_retrato({**r, "coletadoEm": "outro"}, saida),
                         "inalterado")
        velho = {**r, "ultimoMes": "202608"}
        with self.assertRaisesRegex(ErroEmendas, "RECUSADO"):
            emendas.gravar_retrato(velho, saida)
        with self.assertRaisesRegex(ErroEmendas, "RECUSADO"):
            emendas.gravar_retrato({**r, "municipios": r["municipios"][1:]}, saida)
        self.assertEqual(emendas.gravar_retrato(velho, saida, permitir_encolher=True),
                         "gravado")
        self.assertEqual(json.loads(saida.read_text(encoding="utf-8"))["ultimoMes"],
                         "202608")


if __name__ == "__main__":
    unittest.main()
