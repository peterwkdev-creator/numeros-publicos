"""Cliente do IBGE, contra a resposta real de Sergipe (75 municípios).

Nenhum teste toca a rede e nenhum espera de verdade: transporte e relógio são
injetados. É o que mantém a suíte em milissegundos e torna a política de
backoff **verificável**, em vez de "confie que dorme".
"""

from __future__ import annotations

import gzip
import io
import json
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from numeros_publicos.ibge import (
    ErroIBGE,
    FALHA_DE_REDE,
    Municipio,
    Resposta,
    buscar_json,
    municipios,
    regioes_imediatas,
    so_bloqueio_ibge,
    transporte_http,
    url_municipios_da_uf,
)

FIXTURES = Path(__file__).parent / "fixtures"
SERGIPE = (FIXTURES / "municipios_se.json").read_text(encoding="utf-8")


class RelogioFalso:
    def __init__(self) -> None:
        self.esperas: list[float] = []

    def __call__(self, segundos: float) -> None:
        self.esperas.append(segundos)


class TransporteRoteirizado:
    def __init__(self, *respostas: Resposta) -> None:
        self.respostas = list(respostas)
        self.urls: list[str] = []

    def __call__(self, url: str) -> Resposta:
        self.urls.append(url)
        if not self.respostas:
            raise AssertionError(f"requisição inesperada: {url}")
        return self.respostas.pop(0)


class TestTransporteNaoLevantaPorRede(unittest.TestCase):
    """O transporte devolve status; nunca interrompe. Sem isso, a política de
    repetição não chega a ser consultada."""

    def _resposta(self, excecao):
        with patch("urllib.request.urlopen", side_effect=excecao):
            return transporte_http(timeout=1)("https://exemplo/x")

    def test_timeout_de_socket_vira_status(self):
        # `TimeoutError` é OSError, não URLError — o buraco clássico.
        r = self._resposta(TimeoutError("read timed out"))
        self.assertEqual(r.status, FALHA_DE_REDE)
        self.assertIn("TimeoutError", r.corpo)

    def test_dns_ou_conexao_recusada_tambem(self):
        r = self._resposta(urllib.error.URLError("nome não resolve"))
        self.assertEqual(r.status, FALHA_DE_REDE)

    def test_erro_http_preserva_o_codigo(self):
        erro = urllib.error.HTTPError("https://exemplo/x", 500, "Server Error",
                                      {}, io.BytesIO(b"boom"))
        r = self._resposta(erro)
        self.assertEqual(r.status, 500)
        self.assertEqual(r.corpo, "boom")


class TestRespostaGzip(unittest.TestCase):
    """A armadilha do IBGE: a malha volta comprimida, e um cliente que não
    descomprime estoura com `UnicodeDecodeError` no byte 0x8b — erro que não
    fala de gzip e manda investigar o lado errado."""

    def test_corpo_gzip_e_descomprimido(self):
        conteudo = json.dumps({"type": "FeatureCollection"}).encode()
        comprimido = gzip.compress(conteudo)

        class RespostaFalsa:
            status = 200
            headers = {"Content-Encoding": "gzip"}
            def read(self):
                return comprimido
            def __enter__(self):
                return self
            def __exit__(self, *_):
                return False

        with patch("urllib.request.urlopen", return_value=RespostaFalsa()):
            r = transporte_http()("https://exemplo/malha")
        self.assertEqual(r.status, 200)
        self.assertEqual(json.loads(r.corpo)["type"], "FeatureCollection")

    def test_corpo_sem_gzip_continua_funcionando(self):
        class RespostaFalsa:
            status = 200
            headers = {}
            def read(self):
                return b'{"ok": true}'
            def __enter__(self):
                return self
            def __exit__(self, *_):
                return False

        with patch("urllib.request.urlopen", return_value=RespostaFalsa()):
            r = transporte_http()("https://exemplo/x")
        self.assertEqual(json.loads(r.corpo), {"ok": True})


class TestBackoff(unittest.TestCase):
    def test_repete_com_espera_dobrando_e_vence(self):
        relogio = RelogioFalso()
        t = TransporteRoteirizado(
            Resposta(FALHA_DE_REDE, "TimeoutError"),
            Resposta(503, "indisponivel"),
            Resposta(200, SERGIPE),
        )
        dados = buscar_json(t, "https://exemplo/x", dormir=relogio)
        self.assertEqual(len(dados), 75)
        self.assertEqual(relogio.esperas, [2.0, 4.0])

    def test_desiste_e_a_mensagem_aponta_a_causa_provavel(self):
        # O IBGE devolve 500 para agregado/variável inexistente. A mensagem
        # tem de mandar suspeitar disso antes de suspeitar da rede.
        t = TransporteRoteirizado(*[Resposta(500, "")] * 4)
        with self.assertRaises(ErroIBGE) as ctx:
            buscar_json(t, "https://exemplo/x", dormir=RelogioFalso())
        self.assertIn("agregado/variável inexistente", str(ctx.exception))

    def test_corpo_que_nao_e_json_sai_na_mensagem(self):
        html = "<html>\n  <title>Muitas   requisições</title>" + "x" * 500
        t = TransporteRoteirizado(Resposta(200, html))
        with self.assertRaises(ErroIBGE) as ctx:
            buscar_json(t, "https://exemplo/x", dormir=RelogioFalso())
        msg = str(ctx.exception)
        self.assertIn("'<html> <title>Muitas requisições</title>xxx", msg)
        self.assertNotIn("x" * 200, msg)  # só o começo, não o corpo inteiro
        self.assertEqual(len(t.urls), 1)

    def test_404_nao_e_repetido(self):
        t = TransporteRoteirizado(Resposta(404, "nao existe"))
        with self.assertRaises(ErroIBGE):
            buscar_json(t, "https://exemplo/x", dormir=RelogioFalso())
        self.assertEqual(len(t.urls), 1)


class TestMunicipioDeJson(unittest.TestCase):
    def test_achata_a_estrutura_aninhada_do_ibge(self):
        bruto = json.loads(SERGIPE)[0]
        m = Municipio.de_json(bruto)
        self.assertEqual(m.codigo, 2800100)
        self.assertEqual(m.nome, "Amparo do São Francisco")
        self.assertEqual(m.uf_sigla, "SE")
        self.assertEqual(m.regiao, "Nordeste")

    def test_estrutura_inesperada_falha_dizendo_qual_registro(self):
        # Gravar município sem UF e descobrir no painel é pior que falhar aqui.
        with self.assertRaises(ErroIBGE) as ctx:
            Municipio.de_json({"id": 1, "nome": "Sem UF"})
        self.assertIn("Sem UF", str(ctx.exception))


class TestMunicipios(unittest.TestCase):
    def test_uma_requisicao_por_uf(self):
        relogio = RelogioFalso()
        t = TransporteRoteirizado(Resposta(200, SERGIPE), Resposta(200, "[]"))
        lista = list(municipios(t, ufs=[28, 21], pausa=1.0, dormir=relogio))

        self.assertEqual(len(lista), 75)
        self.assertEqual(len(t.urls), 2)
        self.assertEqual(t.urls[0], url_municipios_da_uf(28))
        self.assertEqual(relogio.esperas, [1.0])   # pausa entre as duas

    def test_sem_ufs_faz_uma_chamada_para_a_regiao(self):
        t = TransporteRoteirizado(Resposta(200, SERGIPE))
        list(municipios(t, dormir=RelogioFalso()))
        self.assertEqual(len(t.urls), 1)
        self.assertIn("/regioes/2/municipios", t.urls[0])

    def test_todos_os_75_de_sergipe_sao_do_nordeste(self):
        t = TransporteRoteirizado(Resposta(200, SERGIPE))
        lista = list(municipios(t, ufs=[28], dormir=RelogioFalso()))
        self.assertTrue(all(m.uf_sigla == "SE" for m in lista))
        self.assertTrue(all(m.regiao == "Nordeste" for m in lista))
        self.assertEqual(len({m.codigo for m in lista}), 75)   # sem duplicata


class TesteRegioesImediatas(unittest.TestCase):
    """Contra a resposta real de Sergipe: 75 municípios em 6 regiões."""

    def test_agrupa_todos_os_municipios_sem_perder_nenhum(self):
        bruto = json.loads(SERGIPE)
        r = regioes_imediatas(bruto)
        self.assertEqual(len(r), 6)
        self.assertEqual(sum(len(x["municipios"]) for x in r), 75)
        self.assertEqual({x["uf"] for x in r}, {"SE"})
        self.assertEqual(sorted(c for x in r for c in x["municipios"]),
                         sorted(int(m["id"]) for m in bruto))
        self.assertEqual([x["codigo"] for x in r], sorted(x["codigo"] for x in r))

    def test_municipio_sem_regiao_levanta_em_vez_de_sumir(self):
        bruto = json.loads(SERGIPE)
        bruto[3]["regiao-imediata"] = None
        with self.assertRaises(ErroIBGE):
            regioes_imediatas(bruto)

    def test_regiao_em_duas_ufs_levanta(self):
        bruto = json.loads(SERGIPE)
        uf = dict(bruto[1]["regiao-imediata"]["regiao-intermediaria"]["UF"],
                  sigla="AL")
        bruto[1]["regiao-imediata"] = dict(
            bruto[0]["regiao-imediata"],
            **{"regiao-intermediaria": {"UF": uf}})
        with self.assertRaises(ErroIBGE):
            regioes_imediatas(bruto)


# As linhas reais dos dois vermelhos do bloqueio (runs 41508398932, de
# 02/11/2026, e 41895982538, de 04/11/2026), com o andamento em volta.
_SUFIXO = (". Se for 500 constante, suspeitar de agregado/variável "
           "inexistente antes de suspeitar da rede.")
_URL_PIB = ("https://servicodados.ibge.gov.br/api/v3/agregados/5932/periodos/"
            "all/variaveis/6562?localidades=N1[all]&classificacao=11255[90707]")
LOG_MUNICIPIOS = (
    "[!] interrompido: ErroIBGE: 599 depois de 4 tentativas em "
    "https://servicodados.ibge.gov.br/api/v1/localidades/estados/11/municipios"
    f" (URLError: timed out){_SUFIXO}\n"
    "Ingerindo municípios de 27 UF(s) [BR], pausa 2.0s.\n"
    "0 lidos · 0 novos · 0 já conhecidos\n")
LOG_BRASIL = (
    "selic: 1,2 s\n"
    f"[falha] pib: 599 depois de 4 tentativas em {_URL_PIB} "
    f"(URLError: timed out){_SUFIXO}; fica o dado anterior\n"
    + "".join(f"[falha] {s}: não coletada, a fonte IBGE não respondeu em pib; "
              "fica o dado anterior\n"
              for s in ("desocupacao", "rendimento", "extrema-pobreza",
                        "ipca", "ipca-indice")))


class TesteBloqueioIbge(unittest.TestCase):
    def test_os_dois_vermelhos_reais_sao_bloqueio(self):
        self.assertTrue(so_bloqueio_ibge(LOG_MUNICIPIOS))
        self.assertTrue(so_bloqueio_ibge(LOG_BRASIL))

    def test_sem_linha_de_falha_nao_e_bloqueio(self):
        # Saída diferente de zero sem a linha (traceback, conferência que
        # não bate) não vira amarelo.
        self.assertFalse(so_bloqueio_ibge(""))
        self.assertFalse(so_bloqueio_ibge("Traceback (most recent call last):\n"))

    def test_qualquer_outra_falha_segue_vermelha(self):
        outras = {
            "HTTP 500 no IBGE": LOG_BRASIL.replace(
                "599 depois", "500 depois").replace("URLError: timed out",
                                                    "Internal Server Error"),
            "conexão recusada": LOG_MUNICIPIOS.replace(
                "URLError: timed out", "URLError: [Errno 111] Connection refused"),
            "timeout em outra fonte": LOG_MUNICIPIOS.replace(
                "servicodados.ibge.gov.br", "api.bcb.gov.br"),
            "a mesma falha no BCB": LOG_BRASIL
            + "[falha] selic: não coletada, a fonte BCB não respondeu em "
              "juros; fica o dado anterior\n",
            "prazo da coleta": LOG_BRASIL
            + "[falha] selic: não coletada, a coleta passou do prazo de 15 "
              "min; fica o dado anterior\n",
            "HTTP de verdade": LOG_MUNICIPIOS
            + "[!] interrompido: ErroIBGE: HTTP 404 em https://"
              "servicodados.ibge.gov.br/x: nada\n",
        }
        for nome, log in outras.items():
            with self.subTest(nome):
                self.assertFalse(so_bloqueio_ibge(log))


if __name__ == "__main__":
    unittest.main()
