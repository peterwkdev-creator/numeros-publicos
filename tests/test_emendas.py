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


if __name__ == "__main__":
    unittest.main()
