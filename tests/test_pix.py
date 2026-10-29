"""Emenda Pix: as oito armadilhas da espec (§4 de
`especs/numeros-publicos-emendas-pix.md` da raiz), a ligação ao município
pelo CNPJ e a conferência contra o pago da CGU.

Sem rede: a API do Transferegov entra por um `abrir` falso que pagina como a
real (1.000 linhas no máximo, `Content-Range` só com `Prefer: count=exact`).
"""

from __future__ import annotations

import io
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from numeros_publicos import pix
from numeros_publicos.emendas import ArmazemEmendas
from numeros_publicos.pix import (
    ArmazemPix, ErroPix, baixar_tabela, centavos, conferir_com_cgu, ingerir,
    ligar_municipios, linhas_para_gravar, texto,
)

SNAPSHOT = {"municipios": [
    [2927408, "Salvador", "BA"],
    [2209559, "Pau D'Arco do Piauí", "PI"],
    [1721000, "Palmas", "TO"],
]}

CNPJ_SALVADOR = "13927801000149"
TRANSF_ESPECIAIS = "Emenda Individual - Transferências Especiais"


class Resposta:
    def __init__(self, corpo, cabecalhos):
        self._corpo = json.dumps(corpo).encode("utf-8")
        self.headers = cabecalhos

    def read(self):
        return self._corpo

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def api_falsa(tabelas: dict[str, list[dict]], declarar: dict[str, int] | None = None,
              teto: int = pix.PAGINA):
    """`abrir` que serve `tabelas` como a API: corta em `teto` sem aviso e só
    declara o total quando pedem `Prefer: count=exact`. `declarar` mente o
    total de uma tabela."""
    pedidos: list[str] = []

    def abrir(req):
        pedidos.append(req.full_url)
        u = urlparse(req.full_url)
        nome = u.path.rsplit("/", 1)[-1]
        q = parse_qs(u.query)
        ini = int(q["offset"][0])
        fim = ini + min(int(q["limit"][0]), teto)
        linhas = tabelas[nome][ini:fim]
        cab = {}
        if req.get_header("Prefer") == "count=exact":
            total = (declarar or {}).get(nome, len(tabelas[nome]))
            cab["Content-Range"] = f"{ini}-{ini + len(linhas) - 1}/{total}"
        return Resposta(linhas, cab)

    abrir.pedidos = pedidos
    return abrir


def plano(id_, cnpj=CNPJ_SALVADOR, nome="MUNICIPIO DE SALVADOR", uf="BA",
          situacao="CIENTE", ano_emenda="2024", custeio=0.0, investimento=100.0):
    return {"id_plano_acao": id_, "codigo_plano_acao": f"0903-{id_:06d}",
            "ano_plano_acao": int(ano_emenda), "situacao_plano_acao": situacao,
            "cnpj_beneficiario_plano_acao": cnpj,
            "nome_beneficiario_plano_acao": nome, "uf_beneficiario_plano_acao": uf,
            "numero_emenda_parlamentar_plano_acao": f"{ano_emenda}27070006",
            "ano_emenda_parlamentar_plano_acao": ano_emenda,
            "valor_custeio_plano_acao": custeio,
            "valor_investimento_plano_acao": investimento}


def executor(id_, id_plano, cnpj=CNPJ_SALVADOR, nome="MUNICIPIO DE SALVADOR",
             objeto="PAVIMENTAÇÃO DE RUAS ", custeio=0.0, investimento=100.0):
    return {"id_executor": id_, "id_plano_acao": id_plano, "cnpj_executor": cnpj,
            "nome_executor": nome, "objeto_executor": objeto,
            "vl_custeio_executor": custeio, "vl_investimento_executor": investimento}


def area(id_executor, cd=451, nome="Infraestrutura Urbana ", cd_funcao=15,
         funcao="Urbanismo"):
    return {"id_executor": id_executor, "cd_area_politica_publica_tipo_pt": cd_funcao,
            "area_politica_publica_tipo_pt": funcao, "cd_area_politica_publica_pt": cd,
            "area_politica_publica_pt": nome}


def relatorio(id_, id_plano, tipo="Final", executado=100.0):
    return {"id_relatorio_gestao_novo": id_, "id_plano_acao": id_plano,
            "tipo_relatorio_gestao_novo": tipo,
            "data_e_hora_relatorio_gestao_novo": "2024-12-23T10:47:09.829654",
            "valor_executado_relatorio_gestao_novo": executado,
            "valor_pendente_relatorio_gestao_novo": 0.0,
            "situacao_relatorio_gestao_novo": "DISPONIBILIZADO"}


def fonte(planos=None, executores=None, areas=None, relatorios=None):
    return {"plano_acao_especial": planos if planos is not None else [plano(1)],
            "executor_especial": executores if executores is not None else [executor(10, 1)],
            "finalidade_especial": areas if areas is not None else [area(10)],
            "relatorio_gestao_novo_especial": relatorios if relatorios is not None else []}


class Banco(unittest.TestCase):
    """Um `emendas.db` temporário com o pagamento da CGU a Salvador."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.banco = Path(self._tmp.name) / "emendas.db"
        with ArmazemEmendas(self.banco):
            pass
        con = sqlite3.connect(self.banco)
        con.execute("INSERT INTO pagamento VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    ("202427070006", TRANSF_ESPECIAIS, "2707", "FULANA", "0006",
                     "202406", 2927408, "Município", CNPJ_SALVADOR,
                     "MUNICIPIO DE SALVADOR", 10000))
        con.commit()
        con.close()
        # A tabela real de apelidos se confere contra os 5.571; aqui, vazia.
        self.apelidos = Path(self._tmp.name) / "apelidos.csv"
        self.apelidos.write_text("uf;nome_na_fonte;ibge;nome_ibge;prova\n",
                                 encoding="utf-8")

    def tearDown(self):
        self._tmp.cleanup()

    def ingerir(self, tabelas, **kw):
        return ingerir(SNAPSHOT, self.banco, abrir=api_falsa(tabelas),
                       base="https://api.test/", tabela_apelidos=self.apelidos, **kw)

    def linhas(self, sql):
        con = sqlite3.connect(self.banco)
        try:
            return con.execute(sql).fetchall()
        finally:
            con.close()


class TestValores(unittest.TestCase):
    def test_centavos_sem_erro_de_ponto_flutuante(self):
        self.assertEqual(centavos(4350000.0), 435000000)
        self.assertEqual(centavos(325098.88), 32509888)
        self.assertEqual(centavos(0.1 + 0.2), 30)
        self.assertEqual(centavos(None), 0)


class TestArmadilha1AreaSemValor(Banco):
    def test_area_grava_sem_quantia_e_o_valor_fica_no_executor(self):
        self.ingerir(fonte(areas=[area(10, 451), area(10, 122, "Administração Geral", 4,
                                                      "Administração")]))
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pix_area"), [(2,)])
        colunas = [c[1] for c in self.linhas("PRAGMA table_info(pix_area)")]
        self.assertFalse({"custeio", "investimento", "valor", "centavos"} & set(colunas))
        # O valor do plano conta uma vez, não uma por área.
        self.assertEqual(self.linhas("SELECT SUM(custeio + investimento) FROM pix_plano"),
                         [(10000,)])


class TestArmadilha2ExecutorNaoEBeneficiario(Banco):
    def test_plano_com_dois_executores_guarda_os_dois_e_o_beneficiario(self):
        self.ingerir(fonte(executores=[
            executor(10, 1, investimento=60.0),
            executor(11, 1, cnpj="11111111000111", nome="FUNDO MUNICIPAL DE SAUDE",
                     investimento=40.0)]))
        self.assertEqual(self.linhas("SELECT cnpj, municipio FROM pix_plano"),
                         [(CNPJ_SALVADOR, 2927408)])
        self.assertEqual(self.linhas(
            "SELECT id_executor, cnpj FROM pix_executor ORDER BY 1"),
            [(10, CNPJ_SALVADOR), (11, "11111111000111")])


class TestArmadilha3AreaOrfa(Banco):
    def test_area_de_executor_inexistente_fica_de_fora_e_contada(self):
        r = self.ingerir(fonte(areas=[area(10), area(99), area(98)]))
        self.assertEqual(self.linhas("SELECT id_executor FROM pix_area"), [(10,)])
        self.assertEqual(r["orfas"], 2)

    def test_area_repetida_nao_conta_como_orfa(self):
        r = self.ingerir(fonte(areas=[area(10), area(10)]))
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pix_area"), [(1,)])
        self.assertEqual(r["orfas"], 0)


class TestArmadilha4Relatorio(Banco):
    def test_plano_sem_relatorio_continua_gravado(self):
        self.ingerir(fonte(planos=[plano(1), plano(2)],
                           executores=[executor(10, 1), executor(20, 2)],
                           relatorios=[relatorio(500, 1, executado=12.34)]))
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pix_plano"), [(2,)])
        self.assertEqual(self.linhas(
            "SELECT id_plano, tipo, executado FROM pix_relatorio"), [(1, "Final", 1234)])


class TestArmadilha5Texto(unittest.TestCase):
    def test_normaliza_espaco_e_preserva_palavra_e_caixa(self):
        self.assertEqual(texto("Infraestrutura Urbana "), "Infraestrutura Urbana")
        self.assertEqual(texto("  PAVIMENTAÇÃO   DE RUAS "), "PAVIMENTAÇÃO DE RUAS")
        self.assertEqual(texto(None), "")

    def test_gravacao_usa_o_texto_normalizado(self):
        linhas = linhas_para_gravar(fonte(), {1: 2927408})
        self.assertEqual(linhas["pix_area"][0][4], "Infraestrutura Urbana")
        self.assertEqual(linhas["pix_executor"][0][4], "PAVIMENTAÇÃO DE RUAS")


class TestArmadilha6Paginacao(unittest.TestCase):
    def test_pagina_ate_a_ultima_curta_e_confere_o_total(self):
        linhas = [plano(i) for i in range(2500)]
        abrir = api_falsa({"plano_acao_especial": linhas})
        lidas = baixar_tabela("plano_acao_especial", abrir, "https://api.test/")
        self.assertEqual([p["id_plano_acao"] for p in lidas], list(range(2500)))
        self.assertEqual(len(abrir.pedidos), 3)
        self.assertTrue(all("order=id_plano_acao" in u for u in abrir.pedidos))

    def test_multiplo_exato_de_1000_pede_a_pagina_vazia(self):
        abrir = api_falsa({"plano_acao_especial": [plano(i) for i in range(2000)]})
        self.assertEqual(len(baixar_tabela("plano_acao_especial", abrir, "https://api.test/")),
                         2000)
        self.assertEqual(len(abrir.pedidos), 3)

    def test_total_diferente_do_declarado_e_erro(self):
        abrir = api_falsa({"plano_acao_especial": [plano(i) for i in range(1500)]},
                          declarar={"plano_acao_especial": 1600})
        with self.assertRaisesRegex(ErroPix, "lidas 1500 linhas, a API declara 1600"):
            baixar_tabela("plano_acao_especial", abrir, "https://api.test/")

    def test_teto_menor_que_o_esperado_e_erro(self):
        # A API passa a cortar em 500: a 1ª página curta para o laço e a
        # contagem pega a falta.
        abrir = api_falsa({"plano_acao_especial": [plano(i) for i in range(1500)]}, teto=500)
        with self.assertRaisesRegex(ErroPix, "lidas 500 linhas"):
            baixar_tabela("plano_acao_especial", abrir, "https://api.test/")

    def test_sem_content_range_e_erro(self):
        def abrir(req):
            return Resposta([plano(1)], {})
        with self.assertRaisesRegex(ErroPix, "não declarou o total"):
            baixar_tabela("plano_acao_especial", abrir, "https://api.test/")


class TestArmadilha7Releitura(Banco):
    def test_releitura_substitui_a_tabela_inteira(self):
        self.ingerir(fonte(planos=[plano(1), plano(2)],
                           executores=[executor(10, 1), executor(20, 2)]))
        self.ingerir(fonte(planos=[plano(1, investimento=7.0), plano(3)],
                           executores=[executor(10, 1), executor(30, 3)]),
                     permitir_encolher=False)
        self.assertEqual(self.linhas("SELECT id_plano, investimento FROM pix_plano ORDER BY 1"),
                         [(1, 700), (3, 10000)])
        self.assertEqual(self.linhas("SELECT tabela, linhas FROM pix_coleta ORDER BY 1"),
                         [("pix_area", 1), ("pix_executor", 2), ("pix_plano", 2),
                          ("pix_relatorio", 0)])

    def test_recusa_encolher_e_nao_toca_no_que_havia(self):
        self.ingerir(fonte(planos=[plano(1), plano(2)],
                           executores=[executor(10, 1), executor(20, 2)]))
        with self.assertRaisesRegex(ErroPix, "encolheu"):
            self.ingerir(fonte())
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pix_plano"), [(2,)])
        self.ingerir(fonte(), permitir_encolher=True)
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pix_plano"), [(1,)])

    def test_falha_no_meio_desfaz_tudo(self):
        self.ingerir(fonte())
        with ArmazemPix(self.banco) as db:
            # Executor repetido viola a chave depois do plano já apagado.
            linhas = linhas_para_gravar(fonte(planos=[plano(1), plano(2)]),
                                        {1: 2927408, 2: 2927408})
            linhas["pix_executor"] = linhas["pix_executor"] * 2
            with self.assertRaises(sqlite3.IntegrityError):
                db.gravar(linhas, origem="teste")
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pix_plano"), [(1,)])

    def test_a_tabela_da_cgu_sobrevive(self):
        self.ingerir(fonte())
        self.ingerir(fonte(), permitir_encolher=True)
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pagamento"), [(1,)])


class TestArmadilha8ExecutorRepetido(Banco):
    """A API repete o executor com outro nome de agência (8 em 29/10/2026)."""

    def test_repeticao_igual_fica_uma_linha(self):
        a = dict(executor(10, 1), nome_agencia_executor="AGENCIA A")
        b = dict(executor(10, 1), nome_agencia_executor="AGENCIA B")
        self.ingerir(fonte(executores=[a, b]))
        self.assertEqual(self.linhas("SELECT id_executor FROM pix_executor"), [(10,)])
        self.assertEqual(self.linhas("SELECT tabela, linhas FROM pix_coleta "
                                     "WHERE tabela = 'pix_executor'"), [("pix_executor", 1)])

    def test_repeticao_com_dado_diferente_e_erro_e_nada_grava(self):
        a = dict(executor(10, 1), nome_agencia_executor="AGENCIA A")
        b = dict(executor(10, 1, investimento=5.0), nome_agencia_executor="AGENCIA B")
        with self.assertRaisesRegex(ErroPix, "executor 10 repetido com dados diferentes"):
            self.ingerir(fonte(executores=[a, b]))
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pix_plano"), [(0,)])

    def test_paginacao_do_executor_desempata_pela_agencia(self):
        abrir = api_falsa({"executor_especial": [executor(10, 1)]})
        baixar_tabela("executor_especial", abrir, "https://api.test/")
        self.assertTrue(all("order=id_executor,nome_agencia_executor" in u
                            for u in abrir.pedidos))


class TestLigacao(Banco):
    def test_cnpj_da_cgu_liga_sem_olhar_o_nome(self):
        self.ingerir(fonte(planos=[plano(1, nome="NOME QUALQUER")]))
        self.assertEqual(self.linhas("SELECT municipio FROM pix_plano"), [(2927408,)])

    def test_cnpj_de_fundo_na_cgu_nao_liga(self):
        con = sqlite3.connect(self.banco)
        con.execute("INSERT INTO pagamento SELECT emenda, tipo, autor_codigo, autor, numero,"
                    " ano_mes, 1721000, 'Fundo Público da Administração Direta Municipal',"
                    " '22222222000122', favorecido, centavos FROM pagamento")
        con.commit()
        con.close()
        with self.assertRaisesRegex(ErroPix, "1 planos de município sem casar"):
            self.ingerir(fonte(planos=[plano(1, cnpj="22222222000122",
                                             nome="FUNDO X", uf="TO")]))

    def test_cnpj_desconhecido_cai_para_o_nome_com_dois_pontos(self):
        # A fonte escreve o apóstrofo como ":" ("PAU D:ARCO DO PIAUI").
        p = plano(1, cnpj="04218211000156", nome="MUNICIPIO DE PAU D:ARCO DO PIAUI", uf="PI")
        self.ingerir(fonte(planos=[p]))
        self.assertEqual(self.linhas("SELECT municipio FROM pix_plano"), [(2209559,)])

    def test_estado_fica_sem_municipio(self):
        ligacao, sem = ligar_municipios(
            [plano(1, cnpj="00000000000100", nome="ESTADO DA BAHIA"),
             plano(2, cnpj="00000000000200", nome="DISTRITO FEDERAL", uf="DF")],
            {}, {}, {})
        self.assertEqual((ligacao, sem), ({1: None, 2: None}, []))

    def test_municipio_que_nao_casa_e_erro_e_nada_se_grava(self):
        with self.assertRaisesRegex(ErroPix, "MUNICIPIO DE ATLANTIDA"):
            self.ingerir(fonte(planos=[plano(1, cnpj="99999999000199",
                                             nome="MUNICIPIO DE ATLANTIDA")]))
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pix_plano"), [(0,)])

    def test_cnpj_em_dois_municipios_e_erro(self):
        con = sqlite3.connect(self.banco)
        con.execute("INSERT INTO pagamento SELECT emenda, tipo, autor_codigo, autor, numero,"
                    " ano_mes, 1721000, natureza, cnpj, favorecido, centavos FROM pagamento")
        con.commit()
        con.close()
        with self.assertRaisesRegex(ErroPix, "em dois municípios"):
            self.ingerir(fonte())


class TestConferenciaComCgu(Banco):
    def test_so_o_plano_ciente_conta_e_compara_por_municipio_e_ano(self):
        self.ingerir(fonte(planos=[plano(1), plano(2, situacao="IMPEDIDO", investimento=999.0),
                                   plano(3, ano_emenda="2023", investimento=5.0)],
                           executores=[executor(10, 1)]))
        self.assertEqual(conferir_com_cgu(self.banco),
                         [("2023", 500, 0, 0, 1), ("2024", 10000, 10000, 1, 1)])


class TestComando(Banco):
    def test_pix_ingerir_grava_e_imprime_a_conferencia(self):
        import argparse
        import contextlib
        from numeros_publicos.cli import pix_ingerir
        snapshot = Path(__file__).resolve().parents[1] / "painel" / "dados" / "snapshot.json"
        args = argparse.Namespace(snapshot=str(snapshot), banco_emendas=str(self.banco),
                                  permitir_encolher=False)
        saida = io.StringIO()
        with contextlib.redirect_stdout(saida):
            codigo = pix_ingerir(args, abrir=api_falsa(fonte()))
        self.assertEqual(codigo, 0)
        self.assertIn("1 planos, 1 executores, 1 áreas", saida.getvalue())
        self.assertIn("2024            100,00          100,00   1 de 1", saida.getvalue())

    def test_pix_ingerir_sai_1_quando_a_coleta_nao_fecha(self):
        import argparse
        import contextlib
        from numeros_publicos.cli import pix_ingerir
        snapshot = Path(__file__).resolve().parents[1] / "painel" / "dados" / "snapshot.json"
        args = argparse.Namespace(snapshot=str(snapshot), banco_emendas=str(self.banco),
                                  permitir_encolher=False)
        erro = io.StringIO()
        with contextlib.redirect_stderr(erro):
            codigo = pix_ingerir(args, abrir=api_falsa(
                fonte(), declarar={"plano_acao_especial": 2}))
        self.assertEqual(codigo, 1)
        self.assertIn("a API declara 2", erro.getvalue())
        # A coleta falha antes de abrir o banco: nem a tabela nasce.
        self.assertEqual(self.linhas(
            "SELECT name FROM sqlite_master WHERE name LIKE 'pix%'"), [])


if __name__ == "__main__":
    unittest.main()
