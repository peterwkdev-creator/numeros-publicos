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
import urllib.error
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from numeros_publicos import caged
from numeros_publicos.caged import (
    ArmazemCaged, ErroCaged, agregar, conferir, gravar_retrato, janela_ate,
    link_do_sumario, mes_anterior, nossos_numeros, numeros_do_sumario, retrato,
    ultima_no_ftp,
)
from numeros_publicos.cli import (
    _com_tentativas, caged_anos_exportar, caged_ingerir, caged_novo,
    construir_parser,
)

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


class TestRede(unittest.TestCase):
    """Em 22/10/2026 o FTP do MTE deu timeout uma vez e o job caiu na
    primeira. A rede se repete em falha transitória e para na resposta
    definitiva da fonte."""

    def _rodar(self, falhas):
        self.chamadas, self.esperas = 0, []

        def fazer():
            self.chamadas += 1
            if falhas:
                raise falhas.pop(0)
            return "ok"
        with redirect_stderr(io.StringIO()):
            return _com_tentativas(fazer, "ftp://x", dormir=self.esperas.append)

    def test_timeout_se_repete_com_espera_dobrando(self):
        self.assertEqual(self._rodar([TimeoutError("timed out")] * 2), "ok")
        self.assertEqual((self.chamadas, self.esperas), (3, [5.0, 10.0]))

    def test_5xx_se_repete(self):
        erro = urllib.error.HTTPError("u", 503, "Service Unavailable", None, None)
        self.assertEqual(self._rodar([erro]), "ok")
        self.assertEqual(self.chamadas, 2)

    def test_desiste_na_quarta(self):
        with self.assertRaises(TimeoutError):
            self._rodar([TimeoutError("timed out")] * 4)
        self.assertEqual((self.chamadas, self.esperas), (4, [5.0, 10.0, 20.0]))

    def test_404_sobe_na_hora(self):
        erro = urllib.error.HTTPError("u", 404, "Not Found", None, None)
        with self.assertRaises(urllib.error.HTTPError):
            self._rodar([erro])
        self.assertEqual((self.chamadas, self.esperas), (1, []))

    def test_ingerir_sai_1_sem_traceback_quando_a_rede_cai(self):
        def baixar(url, destino):
            raise TimeoutError("timed out")
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            args = construir_parser().parse_args(
                ["caged-ingerir", "--ate", "202606",
                 "--banco-caged", str(Path(tmp) / "caged.db")])
            erro = io.StringIO()
            with redirect_stdout(io.StringIO()), redirect_stderr(erro):
                codigo = caged_ingerir(args, baixar=baixar)
        self.assertEqual(codigo, 1)
        self.assertIn("timed out", erro.getvalue())


#: Trechos reais do `pdftotext -raw` das apresentações de dezembro do MTE
#: (16/10/2026): a tabela por UF de 2020 (12 colunas, "jan/20") e a de 2023
#: (13 colunas, "2022/12", com "Rio Grande do" / "Norte" em duas linhas), e o
#: gráfico do saldo anual do país da de 2025.
UF_2020 = (FIXTURES / "caged_apresentacao_202012_uf.txt").read_text(encoding="utf-8")
UF_2023 = (FIXTURES / "caged_apresentacao_202312_uf.txt").read_text(encoding="utf-8")
SERIE_2025 = (FIXTURES / "caged_apresentacao_202512_serie.txt").read_text(encoding="utf-8")


class TestApresentacao(unittest.TestCase):
    def test_le_a_tabela_real_de_2023_com_o_nome_quebrado(self):
        t = caged.tabela_por_uf(UF_2023, 2023)
        self.assertEqual(set(t), {str(u) for u in caged.UFS} | {"NI", "BR"})
        self.assertEqual(t["24"]["202212"], -3702)      # Rio Grande do Norte
        self.assertEqual(t["50"]["202312"], -8401)      # Mato Grosso do Sul
        self.assertEqual(t["BR"]["202312"], -430159)
        # O ano publicado no fechamento: +1.483.598 (o sumário de dez/2023).
        self.assertEqual(sum(t["BR"][m] for m in caged.meses_do_ano(2023)), 1483598)

    def test_2020_tem_12_colunas_no_outro_formato(self):
        t = caged.tabela_por_uf(UF_2020, 2020)
        self.assertEqual(sorted(t["BR"]), caged.meses_do_ano(2020))
        self.assertEqual(t["BR"]["202001"], 117245)
        self.assertEqual(t["NI"]["202012"], -562)

    def test_documento_de_outro_ano_e_recusado(self):
        # O gov.br serviu, no endereço de dez/2021, um PDF de 2020.
        with self.assertRaisesRegex(ErroCaged, "não cobre 2024"):
            caged.tabela_por_uf(UF_2023, 2024)

    def test_numero_mal_lido_e_recusado_pela_soma(self):
        with self.assertRaisesRegex(ErroCaged, "Norte.*leitura suspeita"):
            caged.tabela_por_uf(UF_2023.replace("Acre -845", "Acre -846"), 2023)

    def test_linha_que_falta_e_recusada(self):
        sem = "\n".join(l for l in UF_2023.splitlines() if not l.startswith("Sergipe"))
        with self.assertRaisesRegex(ErroCaged, "'28'"):
            caged.tabela_por_uf(sem, 2023)

    def test_a_tabela_SEM_ajustes_e_pulada(self):
        falsa = ("SALDO POR GRANDES REGIÕES (DADOS SEM AJUSTES)\n"
                 "Região e UF " + " ".join(f"2023/{m:02d}" for m in range(1, 13))
                 + "\nBrasil " + " ".join(["1"] * 12) + "\n" + "x\n" * 12)
        t = caged.tabela_por_uf(falsa + UF_2023, 2023)
        self.assertEqual(t["BR"]["202312"], -430159)

    def test_serie_anual_real_do_pais(self):
        self.assertEqual(caged.serie_anual_do_pais(SERIE_2025, 2025),
                         {2020: -189393, 2021: 2782295, 2022: 2014894,
                          2023: 1455279, 2024: 1677575, 2025: 1279498})

    def test_conferir_uf_acusa_o_que_so_um_lado_tem(self):
        erros = caged.conferir_uf({"28": {"202301": 1}},
                                  {"28": {"202301": 1, "202302": 0}})
        self.assertEqual(erros, ["28 202302: nosso None, oficial 0"])

    def test_o_link_da_apresentacao_e_LIDO_da_pasta(self):
        pasta = f"{caged.GOV}/2025/dezembro"
        html = (f'<a href="{pasta}/apresentacao-dezembro-de-2025-1.pdf/view">'
                f'<a href="{pasta}/sumario-executivo.pdf">')
        self.assertEqual(caged.links_da_apresentacao(html, pasta),
                         [f"{pasta}/apresentacao-dezembro-de-2025-1.pdf"])

    def test_link_morto_da_raiz_tenta_o_nome_dentro_da_pasta(self):
        # Dez/2020 (16/10/2026): o href "/images/..." dá 404 no gov.br, e o
        # mesmo nome dentro da pasta é a apresentação certa.
        pasta = caged.pastas_de_dezembro(2020)[2]
        html = '<a href="/images/Novo_CAGED/Dez2020/2-apresentacao202012.pdf">'
        self.assertEqual(caged.links_da_apresentacao(html, pasta),
                         ["https://www.gov.br/images/Novo_CAGED/Dez2020/2-apresentacao202012.pdf",
                          f"{pasta}/2-apresentacao202012.pdf"])


class TestAnosFechados(_ComBanco):
    def encher_2020(self) -> None:
        """Todos os arquivos de 2020 (o começo sem FOR e EXC), e o MOV de
        jan/2021, que fecha 2020."""
        for m in caged.meses_do_ano(2020):
            for t in caged.tipos_do_mes(m):
                self.gravar(t, m)
        self.gravar("MOV", "202101")

    def test_o_ultimo_ano_fechado_vem_do_dado(self):
        self.assertEqual(caged.anos_fechados(self.db), [])
        self.gravar("MOV", "202603")
        self.assertEqual(caged.anos_fechados(self.db), list(range(2020, 2026)))

    def test_o_comeco_da_serie_nao_tem_FOR_nem_EXC(self):
        self.assertEqual(caged.faltando_ate(self.db, "202004"),
                         ["CAGEDMOV202001", "CAGEDMOV202002", "CAGEDFOR202002",
                          "CAGEDMOV202003", "CAGEDFOR202003", "CAGEDMOV202004",
                          "CAGEDFOR202004", "CAGEDEXC202004"])

    def test_o_ano_fechado_so_leva_os_ajustes_ate_o_dezembro_dele(self):
        self.gravar("MOV", "202312", linha("202312", ARACAJU6, 1))
        self.gravar("FOR", "202401", linha("202312", ARACAJU6, -1))
        self.assertEqual(caged.saldo_por_uf(self.db, ["202312"], "202312")
                         ["28"]["202312"], 1)
        self.assertEqual(caged.saldo_por_uf(self.db, ["202312"], "202401")
                         ["BR"]["202312"], 0)

    def test_o_retrato_soma_o_brasil_que_a_conferencia_aprovou(self):
        self.encher_2020()
        self.gravar("MOV", "202005", linha("202005", ARACAJU6, 1),
                    linha("202005", ARACAJU6, 1),
                    linha("202005", caged.NAO_IDENTIFICADO, -1))
        codigos = [ARACAJU7, ESTANCIA7, *range(1100000, 1150000, 10)]
        r = caged.retrato_anos(self.db, [2020], codigos, {"2020": {"saldo": 1}})
        por = dict(map(tuple, r["municipios"]))
        self.assertEqual((por[ARACAJU7], por[ESTANCIA7]), ([2], [0]))
        self.assertEqual(r["naoIdentificado"], [-1])
        with self.assertRaisesRegex(ErroCaged, "aprovou 2"):
            caged.retrato_anos(self.db, [2020], codigos, {"2020": {"saldo": 2}})

    def test_todo_ano_leva_os_ajustes_ate_o_dezembro_do_ultimo(self):
        # Decisão de 16/10/2026: o FOR de 2021 que declara maio/2020 entra
        # em 2020, como na série do país da apresentação mais recente.
        self.encher_2020()
        for m in caged.meses_do_ano(2021):
            for t in caged.tipos_do_mes(m):
                if (t, m) != ("MOV", "202101"):
                    self.gravar(t, m, *([linha("202005", ARACAJU6, 1)]
                                        if (t, m) == ("FOR", "202106") else []))
        self.gravar("MOV", "202201")
        codigos = [ARACAJU7, *range(1100000, 1150000, 10)]
        r = caged.retrato_anos(self.db, [2020, 2021], codigos,
                               {"2020": {"saldo": 1}, "2021": {"saldo": 0}})
        self.assertEqual(dict(map(tuple, r["municipios"]))[ARACAJU7], [1, 0])
        self.assertEqual(r["ajustesAte"], "202112")

    def test_ano_sem_apresentacao_que_confira_nao_exporta(self):
        self.encher_2020()
        pasta = caged.pastas_de_dezembro(2020)[0]
        args = construir_parser().parse_args(
            ["caged-anos-exportar", "--banco-caged", str(Path(self.tmp.name) / "c.db"),
             "--saida", str(Path(self.tmp.name) / "a.json")])
        erro = io.StringIO()
        with redirect_stdout(io.StringIO()), redirect_stderr(erro):
            codigo = caged_anos_exportar(
                args, pagina=lambda url: f'<a href="{pasta}/apresentacao.pdf">',
                baixar=lambda url, destino: None,
                texto_do_pdf=lambda p: UF_2023)     # o PDF é de outro ano
        self.assertEqual(codigo, 1)
        self.assertIn("--apresentacao 2020=URL", erro.getvalue())
        self.assertFalse((Path(self.tmp.name) / "a.json").exists())

    def test_ano_que_diverge_da_apresentacao_nao_exporta(self):
        self.encher_2020()          # banco de zeros contra a tabela real de 2020
        args = construir_parser().parse_args(
            ["caged-anos-exportar", "--banco-caged", str(Path(self.tmp.name) / "c.db"),
             "--saida", str(Path(self.tmp.name) / "a.json"),
             "--apresentacao", "2020=https://exemplo/apresentacao.pdf"])
        erro = io.StringIO()
        with redirect_stdout(io.StringIO()), redirect_stderr(erro):
            codigo = caged_anos_exportar(args, baixar=lambda url, destino: None,
                                         texto_do_pdf=lambda p: UF_2020)
        self.assertEqual(codigo, 1)
        self.assertIn("2020 DIVERGE", erro.getvalue())


class TestTravaAnos(unittest.TestCase):
    def base(self, **troca) -> dict:
        r = {"anos": [2020, 2021], "coletadoEm": "a",
             "municipios": [[1, [0, 0]], [2, [0, 0]]]}
        r.update(troca)
        return r

    def test_menos_anos_e_recusado(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "a.json"
            caged.gravar_anos(self.base(), p)
            with self.assertRaises(ErroCaged):
                caged.gravar_anos(self.base(anos=[2021]), p)

    def test_so_o_carimbo_mudou_nao_reescreve(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "a.json"
            self.assertEqual(caged.gravar_anos(self.base(), p), "gravado")
            self.assertEqual(caged.gravar_anos(self.base(coletadoEm="b"), p),
                             "inalterado")


if __name__ == "__main__":
    unittest.main()
