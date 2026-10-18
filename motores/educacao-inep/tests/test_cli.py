"""A CLI de ponta a ponta, num banco temporário e sem tocar a rede.

O transporte é injetado e a planilha vem da fixture, então estes testes
exercitam o caminho inteiro — baixar, conferir MD5, ler, gravar, resumir e
exportar — sem depender do INEP estar de pé.
"""

import io
import json
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from educacao import armazem
from educacao.cli import _mediana, principal
from tests import fixtures


class MedianaEhDeliberada(unittest.TestCase):
    """Mediana e não média: o IDEB é limitado entre 0 e 10, e um punhado de
    municípios pequenos com nota extrema desloca a média sem descrever o
    conjunto."""

    def test_impar_devolve_o_do_meio(self):
        self.assertEqual(_mediana([1.0, 9.0, 5.0]), 5.0)

    def test_par_devolve_a_media_dos_dois_centrais(self):
        self.assertEqual(_mediana([1.0, 4.0, 6.0, 9.0]), 5.0)

    def test_lista_vazia_e_none_e_nunca_zero(self):
        """Média de nada não é zero — e zero num índice de 0 a 10 seria a pior
        nota possível, não a ausência de nota."""
        self.assertIsNone(_mediana([]))

    def test_a_mediana_resiste_ao_extremo_que_a_media_nao_resiste(self):
        valores = [5.0, 5.0, 5.0, 5.0, 10.0]
        self.assertEqual(_mediana(valores), 5.0)
        self.assertGreater(sum(valores) / len(valores), 5.0)


class DePontaAPonta(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.TemporaryDirectory()
        cls.banco = str(Path(cls.dir.name) / "e.db")
        cls.zip = fixtures.zip_bytes()

    @classmethod
    def tearDownClass(cls):
        cls.dir.cleanup()

    def transporte(self, url, cabecalhos):
        return self.zip

    def rodar(self, *argv) -> str:
        saida = io.StringIO()
        with redirect_stdout(saida):
            codigo = principal(["--banco", self.banco, *argv], self.transporte)
        self.assertEqual(codigo, 0, saida.getvalue())
        return saida.getvalue()

    def _contar(self) -> int:
        con = sqlite3.connect(self.banco)
        try:
            return con.execute("SELECT COUNT(*) FROM ideb").fetchone()[0]
        finally:
            con.close()

    def test_1_ingere_so_a_rede_municipal_e_so_a_regiao_pedida(self):
        texto = self.rodar("ingerir", "--regiao", "NE")
        self.assertIn("Municipal", texto)
        # `with sqlite3.connect()` gerencia TRANSAÇÃO, não fecha a conexão --
        # e no Windows o arquivo fica travado, quebrando a limpeza do
        # diretório temporário com `WinError 32`.
        con = sqlite3.connect(self.banco)
        try:
            redes = {r[0] for r in con.execute("SELECT DISTINCT rede FROM ideb")}
            ufs = {r[0] for r in con.execute("SELECT DISTINCT uf FROM ideb")}
        finally:
            con.close()
        self.assertEqual(redes, {"Municipal"})
        self.assertEqual(ufs, {"MA"}, "vazou UF de fora do recorte")

    def test_2_ingerir_de_novo_nao_duplica(self):
        antes = self._contar()
        self.rodar("ingerir", "--regiao", "NE")
        depois = self._contar()
        self.assertEqual(antes, depois, "a ingestão não é idempotente")

    def test_3_regiao_diz_sem_meta_em_vez_de_zero_por_cento(self):
        """`0%` seria uma afirmação sobre um alvo que não existe."""
        texto = self.rodar("regiao")
        self.assertIn("sem meta", texto)

    def test_4_regiao_mostra_a_cobertura_em_toda_linha(self):
        """Mediana subindo com cobertura caindo não é melhora do conjunto: é
        mudança de quem está sendo medido, e sem a coluna isso é invisível."""
        texto = self.rodar("regiao")
        self.assertIn("municípios", texto)

    def test_5_exporta_um_snapshot_coerente(self):
        saida = Path(self.dir.name) / "ideb.json"
        self.rodar("exportar", "--saida", str(saida))
        s = json.loads(saida.read_text(encoding="utf-8"))
        self.assertEqual(s["rede"], "Municipal")
        self.assertEqual(s["edicoes"], list(fixtures.EDICOES))
        # A fixture reproduz o real: a última edição não tem meta nenhuma.
        self.assertEqual(s["edicoesSemMeta"], [fixtures.EDICOES[-1]])
        self.assertIn("2111300", s["serie"], "São Luís sumiu da série")
        # A legenda viaja junto, para a página poder dizer o que a marca
        # significa em vez de escondê-la.
        self.assertIn("**", s["legenda"])

    def test_6_a_coleta_fica_registrada(self):
        con = sqlite3.connect(self.banco)
        con.row_factory = sqlite3.Row
        try:
            linhas = con.execute("SELECT * FROM coleta ORDER BY rowid").fetchall()
        finally:
            con.close()
        self.assertTrue(linhas)
        self.assertTrue(all(l["terminada_em"] for l in linhas))
        self.assertTrue(all(l["falhou_com"] is None for l in linhas))


class FalhaFicaRegistrada(unittest.TestCase):
    def test_transporte_que_falha_marca_a_coleta_e_devolve_erro(self):
        """O erro engolido reaparece horas depois, irreconhecível. A coleta
        guarda o que estava sendo feito e com que falha."""
        with tempfile.TemporaryDirectory() as d:
            banco = str(Path(d) / "f.db")

            def quebrado(url, cabecalhos):
                raise ConnectionResetError("caiu")

            saida = io.StringIO()
            with redirect_stdout(saida):
                # Relógio de mentira: a retentativa dobra a espera, e sem isto
                # este único teste custaria 14 s à suíte inteira.
                codigo = principal(["--banco", banco, "ingerir"], quebrado,
                                   dormir=lambda s: None)
            self.assertEqual(codigo, 1)
            with armazem.abrir(banco) as con:
                l = con.execute("SELECT * FROM coleta").fetchone()
            self.assertIsNotNone(l["falhou_com"])
            self.assertIn("caiu", l["falhou_com"])


if __name__ == "__main__":
    unittest.main()
