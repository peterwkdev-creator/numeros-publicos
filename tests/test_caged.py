"""Novo Caged: a agregação, a regra dos ajustes, a janela e a conferência.

O critério de aceite é o do módulo: com os arquivos reais de ago/2025 a
jul/2026, os três blocos do sumário executivo do MTE de julho/2026 batem
exatamente (+58.568 no mês, +972.203 no ano, +880.717 em 12 meses). Estes
testes cobram as peças disso sem rede e sem os 680 MB.
"""

from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from observatorio import caged
from observatorio.caged import (
    ArmazemCaged, ErroCaged, agregar, conferir, gravar_retrato, janela_ate,
    link_do_sumario, mes_anterior, nossos_numeros, numeros_do_sumario, retrato,
    ultima_no_ftp,
)
from observatorio.cli import caged_novo, construir_parser

FIXTURES = Path(__file__).parent / "fixtures"
SUMARIO = (FIXTURES / "caged_sumario_202607.txt").read_text(encoding="utf-8")

#: O cabeçalho real do CAGEDMOV202607 (as 28 colunas, na ordem do arquivo).
CABECALHO = (
    "competênciamov;região;uf;município;seção;subclasse;saldomovimentação;"
    "cbo2002ocupação;categoria;graudeinstrução;idade;horascontratuais;raçacor;"
    "sexo;tipoempregador;tipoestabelecimento;tipomovimentação;tipodedeficiência;"
    "indtrabintermitente;indtrabparcial;salário;tamestabjan;indicadoraprendiz;"
    "origemdainformação;competênciadec;indicadordeforadoprazo;"
    "unidadesaláriocódigo;valorsaláriofixo\n")

ARACAJU6, ESTANCIA6 = 280030, 280210        # os códigos do IBGE sem o dígito
ARACAJU7, ESTANCIA7 = 2800308, 2802106


def linha(comp: str, municipio: int, saldo: int) -> str:
    """Uma linha do arquivo, com os campos que o código lê no lugar certo."""
    return (f"{comp};3;28;{municipio};G;4711302;{saldo};521110;101;7;30;44,00;"
            f"3;1;0;1;97;0;0;0;1600,00;3;0;1;{comp};0;5;1600,00\n")


def arquivo(*linhas: str) -> list[str]:
    return [CABECALHO, *linhas]


class TestMeses(unittest.TestCase):
    def test_a_janela_atravessa_o_ano(self):
        self.assertEqual(mes_anterior("202601"), "202512")
        j = janela_ate("202607")
        self.assertEqual((j[0], j[-1], len(j)), ("202508", "202607", 12))


class TestAgregar(unittest.TestCase):
    def test_conta_admissoes_e_desligamentos_por_competencia_e_municipio(self):
        ag, n = agregar(arquivo(linha("202607", ARACAJU6, 1),
                                linha("202607", ARACAJU6, 1),
                                linha("202607", ARACAJU6, -1),
                                linha("202606", ESTANCIA6, -1)))
        self.assertEqual(n, 4)
        self.assertEqual(ag[("202607", ARACAJU6)], [2, 1])
        self.assertEqual(ag[("202606", ESTANCIA6)], [0, 1])

    def test_le_pelo_NOME_da_coluna_e_nao_pela_posicao(self):
        # O MTE já mudou o layout uma vez. Trocar duas colunas de lugar não
        # pode mudar o que se lê.
        cab = CABECALHO.rstrip("\n").split(";")
        cab[3], cab[6] = cab[6], cab[3]
        linhas = []
        for l in (linha("202607", ARACAJU6, -1),):
            c = l.rstrip("\n").split(";")
            c[3], c[6] = c[6], c[3]
            linhas.append(";".join(c) + "\n")
        ag, _ = agregar([";".join(cab) + "\n", *linhas])
        self.assertEqual(ag[("202607", ARACAJU6)], [0, 1])

    def test_saldo_que_nao_e_um_nem_menos_um_para_a_leitura(self):
        with self.assertRaises(ErroCaged) as c:
            agregar(arquivo(linha("202607", ARACAJU6, 0)), "CAGEDMOV202607")
        self.assertIn("linha 2", str(c.exception))

    def test_coluna_ausente_para_a_leitura(self):
        with self.assertRaises(ErroCaged):
            agregar(["competênciamov;uf\n", "202607;28\n"])


class _ComBanco(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = ArmazemCaged(Path(self.tmp.name) / "c.db")

    def tearDown(self) -> None:
        self.db.con.close()
        self.tmp.cleanup()

    def gravar(self, tipo: str, declarado: str, *linhas: str) -> None:
        ag, n = agregar(arquivo(*linhas))
        self.db.gravar(tipo, declarado, ag, n, 1, "teste")


class TestAjustes(_ComBanco):
    def test_mov_mais_fora_do_prazo_menos_exclusao(self):
        # Junho: 3 admissões no prazo; em julho chega 1 desligamento de junho
        # fora do prazo, e 1 admissão de junho é excluída.
        self.gravar("MOV", "202606", *[linha("202606", ARACAJU6, 1)] * 3)
        self.gravar("FOR", "202607", linha("202606", ARACAJU6, -1))
        self.gravar("EXC", "202607", linha("202606", ARACAJU6, 1))
        v = self.db.com_ajuste(["202606"], "202607")
        # Sem inverter a exclusão, sairiam 4 admissões em vez de 2.
        self.assertEqual(v[("202606", ARACAJU6)], [2, 1])

    def test_ajuste_declarado_DEPOIS_do_corte_nao_entra(self):
        self.gravar("MOV", "202606", linha("202606", ARACAJU6, 1))
        self.gravar("FOR", "202608", linha("202606", ARACAJU6, 1))
        self.assertEqual(self.db.com_ajuste(["202606"], "202607")
                         [("202606", ARACAJU6)], [1, 0])

    def test_reler_o_arquivo_SUBSTITUI_a_fatia(self):
        # O MTE republica meses: reler não pode somar por cima.
        self.gravar("MOV", "202607", *[linha("202607", ARACAJU6, 1)] * 5)
        self.gravar("MOV", "202607", linha("202607", ARACAJU6, 1))
        self.assertEqual(self.db.sem_ajuste("202607"), (1, 0))

    def test_o_mes_do_sumario_e_so_o_MOV(self):
        self.gravar("MOV", "202607", linha("202607", ARACAJU6, 1))
        self.gravar("FOR", "202607", linha("202606", ARACAJU6, 1))
        self.assertEqual(self.db.sem_ajuste("202607"), (1, 0))


class TestRetrato(_ComBanco):
    def encher(self) -> None:
        for m in janela_ate("202607"):
            for t in caged.TIPOS:
                linhas = [linha(m, ARACAJU6, 1)] if t == "MOV" else []
                self.gravar(t, m, *linhas)
        self.gravar("MOV", "202607", linha("202607", ARACAJU6, 1),
                    linha("202607", caged.NAO_IDENTIFICADO, -1))

    def codigos(self) -> list[int]:
        # 5.000 códigos inventados de outra UF, mais os dois de Sergipe: a
        # guarda de "lista suspeita" exige uma lista do tamanho do país.
        # De 10 em 10: o prefixo de 6 dígitos tem de ser distinto em cada um.
        return [ARACAJU7, ESTANCIA7, *range(1100000, 1150000, 10)]

    def test_janela_incompleta_nao_exporta(self):
        self.gravar("MOV", "202607", linha("202607", ARACAJU6, 1))
        with self.assertRaises(ErroCaged) as c:
            retrato(self.db, "202607", self.codigos(), {})
        self.assertIn("incompleta", str(c.exception))

    def test_municipio_sem_linha_e_ZERO_e_o_nao_identificado_fica_a_parte(self):
        self.encher()
        r = retrato(self.db, "202607", self.codigos(), {})
        por = {l[0]: l for l in r["municipios"]}
        self.assertEqual(por[ESTANCIA7][1], [0] * 12)       # zero, não ausente
        self.assertEqual(por[ARACAJU7][1][-1], 1)
        self.assertEqual(r["naoIdentificado"][1][-1], 1)
        self.assertEqual(r["competencias"][-1], "202607")

    def test_codigo_do_caged_sem_municipio_do_ibge_para(self):
        self.encher()
        self.gravar("MOV", "202607", linha("202607", 999998, 1))
        with self.assertRaises(ErroCaged) as c:
            retrato(self.db, "202607", self.codigos(), {})
        self.assertIn("999998", str(c.exception))


class TestTrava(unittest.TestCase):
    def base(self, **troca) -> dict:
        r = {"competencia": "202607", "coletadoEm": "a",
             "municipios": [[1, [0], [0]], [2, [0], [0]]]}
        r.update(troca)
        return r

    def test_competencia_que_RECUA_e_recusada(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "c.json"
            gravar_retrato(self.base(), p)
            with self.assertRaises(ErroCaged):
                gravar_retrato(self.base(competencia="202606"), p)

    def test_menos_municipios_e_recusado(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "c.json"
            gravar_retrato(self.base(), p)
            with self.assertRaises(ErroCaged):
                gravar_retrato(self.base(municipios=[[1, [0], [0]]]), p)

    def test_so_o_carimbo_mudou_nao_reescreve(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "c.json"
            self.assertEqual(gravar_retrato(self.base(), p), "gravado")
            self.assertEqual(gravar_retrato(self.base(coletadoEm="b"), p),
                             "inalterado")
            self.assertEqual(json.loads(p.read_text())["coletadoEm"], "a")


class TestSumario(unittest.TestCase):
    def test_le_os_tres_blocos_do_sumario_real_de_julho(self):
        n = numeros_do_sumario(SUMARIO)
        self.assertEqual(n["mes"], {"saldo": 58568, "admissoes": 2262888,
                                    "desligamentos": 2204320})
        self.assertEqual(n["ano"]["saldo"], 972203)
        self.assertEqual(n["doze"], {"saldo": 880717, "admissoes": 26658253,
                                     "desligamentos": 25777536})
        self.assertEqual(n["doze_periodo"], "agosto/2025 a julho/2026")

    def test_janeiro_real_hifeniza_e_nao_tem_bloco_do_ano(self):
        texto = (FIXTURES / "caged_sumario_202601.txt").read_text(encoding="utf-8")
        self.assertIn("decor-\nreu", texto)          # o PDF quebra a palavra
        n = numeros_do_sumario(texto, "202601")
        self.assertEqual(n["mes"]["saldo"], 112334)
        self.assertIsNone(n["ano"])
        self.assertEqual(n["doze"]["saldo"], 1228483)

    def test_dezembro_e_edicao_ANUAL_e_nao_se_confere_sozinho(self):
        # O parágrafo fala do ano e os números dele não fecham (1.279.519
        # contra +1.279.498). Adivinhar aqui publicaria o mês errado.
        texto = (FIXTURES / "caged_sumario_202512.txt").read_text(encoding="utf-8")
        with self.assertRaises(ErroCaged) as c:
            numeros_do_sumario(texto, "202512")
        self.assertIn("ANUAL", str(c.exception))

    def test_sumario_de_outro_mes_e_recusado(self):
        with self.assertRaises(ErroCaged) as c:
            numeros_do_sumario(SUMARIO, "202606")
        self.assertIn("junho 2026", str(c.exception))

    def test_leitura_que_nao_fecha_a_conta_e_recusada(self):
        # Um dígito comido pelo PDF não pode virar "divergência da nossa conta".
        with self.assertRaises(ErroCaged):
            numeros_do_sumario(SUMARIO.replace("2.262.888", "2.262.88"))

    def test_texto_sem_o_bloco_e_erro_dito(self):
        with self.assertRaises(ErroCaged):
            numeros_do_sumario("Principais Resultados, e nada mais")

    def test_conferir_acusa_cada_campo(self):
        oficial = numeros_do_sumario(SUMARIO)
        nosso = json.loads(json.dumps({k: oficial[k] for k in ("mes", "ano", "doze")}))
        self.assertEqual(conferir(nosso, oficial), [])
        nosso["doze"]["admissoes"] += 1
        self.assertEqual(conferir(nosso, oficial),
                         ["doze.admissoes: nosso 26658254, oficial 26658253"])

    def test_o_link_do_sumario_e_LIDO_da_pasta(self):
        pasta = ('<a href="https://www.gov.br/x/novo-caged/2026/julho/'
                 'sumario-executivo_julho-de-2026.pdf/view">s</a>'
                 '<a href="https://www.gov.br/x/novo-caged/2026/julho/'
                 'apresentacao-julho-de-2026.pdf/view">a</a>')
        self.assertTrue(link_do_sumario(pasta, "202607").endswith(
            "sumario-executivo_julho-de-2026.pdf"))
        with self.assertRaises(ErroCaged):
            link_do_sumario(pasta, "202606")


class TestNossosNumeros(_ComBanco):
    def test_ano_e_doze_meses_com_ajuste_e_mes_sem(self):
        for m in janela_ate("202607"):
            for t in caged.TIPOS:
                self.gravar(t, m, *([linha(m, ARACAJU6, 1)] if t == "MOV" else []))
        # Um desligamento de janeiro, fora do prazo, declarado em julho.
        self.gravar("FOR", "202607", linha("202601", ARACAJU6, -1))
        n = nossos_numeros(self.db, "202607")
        self.assertEqual(n["mes"]["saldo"], 1)
        self.assertEqual(n["ano"], {"saldo": 6, "admissoes": 7, "desligamentos": 1})
        self.assertEqual(n["doze"]["saldo"], 11)


class TestFtp(unittest.TestCase):
    LISTAS = {
        f"{caged.FTP}/": "08-28-26  02:30PM       <DIR>          2026\n"
                         "08-08-25  09:52AM       <DIR>          2025\n",
        f"{caged.FTP}/2026/": "07-29-26  02:33PM       <DIR>          202606\n"
                              "08-28-26  02:31PM       <DIR>          202607\n",
        # Julho pela metade: só o MOV subiu. O mais recente COMPLETO é junho.
        f"{caged.FTP}/2026/202607/": "08-28-26  02:31PM 55197862 CAGEDMOV202607.7z\n",
        f"{caged.FTP}/2026/202606/": "".join(
            f"07-29-26  02:33PM 1 CAGED{t}202606.7z\n" for t in caged.TIPOS),
    }

    def test_mes_pela_metade_e_ignorado(self):
        self.assertEqual(ultima_no_ftp(self.LISTAS.__getitem__), "202606")

    def test_caged_novo_espera_o_sumario(self):
        args = construir_parser().parse_args(
            ["caged-novo", "--publicado", "nao-existe.json"])
        saida = io.StringIO()
        with redirect_stdout(saida), redirect_stderr(io.StringIO()):
            codigo = caged_novo(args, listar=self.LISTAS.__getitem__,
                                pagina=lambda url: "<html>sem sumário</html>")
        self.assertEqual(codigo, 0)
        self.assertIn("nada: 202606", saida.getvalue())


if __name__ == "__main__":
    unittest.main()
