import json
from datetime import date

import pytest

from licitacoes.filtros import Filtro, normalizar
from licitacoes.monitor import Monitor
from licitacoes.pncp import ClientePNCP, Licitacao, formatar_valor


def item(seq, objeto, valor=50000.0, uf="SP", cnpj="12345678000199"):
    return {
        "numeroControlePNCP": f"{cnpj}-1-{seq:06d}/2026",
        "objetoCompra": objeto,
        "valorTotalEstimado": valor,
        "anoCompra": 2026,
        "sequencialCompra": seq,
        "modalidadeId": 6,
        "modalidadeNome": "Pregão - Eletrônico",
        "dataEncerramentoProposta": "2026-12-01T10:00:00",
        "orgaoEntidade": {"cnpj": cnpj, "razaoSocial": "PREFEITURA DE TESTE"},
        "unidadeOrgao": {"ufSigla": uf, "municipioNome": "Campinas"},
        "situacaoCompraNome": "Divulgada no PNCP",
    }


class ClienteFalso(ClientePNCP):
    def __init__(self, paginas):
        super().__init__(pausa_entre_paginas=0)
        self.paginas = paginas
        self.chamadas = []

    def _get(self, caminho, params):
        self.chamadas.append((caminho, params))
        p = params["pagina"]
        if p > len(self.paginas):
            return None
        return {"data": self.paginas[p - 1], "totalPaginas": len(self.paginas),
                "paginasRestantes": len(self.paginas) - p}


class Coletor:
    nome = "teste"

    def __init__(self, falhar=False):
        self.recebidos = []
        self.falhar = falhar

    def enviar(self, achados):
        if self.falhar:
            raise RuntimeError("canal fora do ar")
        self.recebidos.append([a.licitacao.id for a in achados])


def cfg(tmp_path, **filtros):
    return {
        "busca": {"modo": "proposta", "modalidades": [6], "ufs": []},
        "filtros": {"palavras_chave": ["ciência de dados", "power bi", "dashboard*"],
                    "palavras_excluidas": ["merenda"], **filtros},
        "saida": {"banco": str(tmp_path / "db.sqlite"), "csv": str(tmp_path / "x.csv"),
                  "html": str(tmp_path / "x.html")},
    }


def test_normalizar():
    assert normalizar("  Ciência   de DADOS ") == "ciencia de dados"


def test_filtro_palavras_e_exclusoes():
    f = Filtro(palavras_chave=["power bi", "dashboard*", "ia"], palavras_excluidas=["merenda"])
    lic = lambda o: Licitacao.de_json(item(1, o))
    assert f.avaliar(lic("Contratação de licenças POWER BI")) == ["power bi"]
    assert f.avaliar(lic("Desenvolvimento de dashboards gerenciais")) == ["dashboard*"]
    assert f.avaliar(lic("Painel de merenda com power bi")) is None
    # "ia" não pode casar dentro de "materiais"
    assert f.avaliar(lic("Aquisição de materiais diversos")) is None


def test_filtro_valor_e_uf():
    f = Filtro(palavras_chave=["software"], valor_minimo=10000, ufs=["RJ"])
    assert f.avaliar(Licitacao.de_json(item(1, "software", uf="SP"))) is None
    assert f.avaliar(Licitacao.de_json(item(1, "software", valor=500, uf="RJ"))) is None
    assert f.avaliar(Licitacao.de_json(item(1, "software", uf="RJ"))) == ["software"]
    assert f.avaliar(Licitacao.de_json(item(1, "software", valor=None, uf="RJ"))) == ["software"]


def test_link_e_formatacao():
    l = Licitacao.de_json(item(42, "x"))
    assert l.link_pncp == "https://pncp.gov.br/app/editais/12345678000199/2026/42"
    assert formatar_valor(1234567.8) == "R$ 1.234.567,80"


def test_ciclo_completo_so_avisa_novidades(tmp_path):
    paginas = [[item(1, "Solução de ciência de dados"), item(2, "Merenda escolar")],
               [item(3, "Dashboards em Power BI")]]
    cliente, canal = ClienteFalso(paginas), Coletor()
    m = Monitor(cfg(tmp_path), cliente=cliente, notificadores=[canal], hoje=date(2026, 11, 17))
    achados = m.executar()
    assert sorted(a.licitacao.id for a in achados) == [
        "12345678000199-1-000001/2026", "12345678000199-1-000003/2026"]
    assert cliente.chamadas[0][0] == "contratacoes/proposta"
    assert cliente.chamadas[0][1]["dataFinal"] == "20270116"  # hoje + 60 dias
    assert (tmp_path / "x.html").read_text(encoding="utf-8").count("<tr>") == 3  # cabeçalho + 2

    # Segunda rodada com os mesmos dados: nada novo.
    m2 = Monitor(cfg(tmp_path), cliente=ClienteFalso(paginas), notificadores=[canal])
    assert m2.executar() == []
    assert len(canal.recebidos) == 1


def test_falha_de_notificacao_reenvia_depois(tmp_path):
    paginas = [[item(1, "Plataforma de ciência de dados")]]
    Monitor(cfg(tmp_path), cliente=ClienteFalso(paginas), notificadores=[Coletor(falhar=True)]).executar()
    ok = Coletor()
    Monitor(cfg(tmp_path), cliente=ClienteFalso(paginas), notificadores=[ok]).executar()
    assert ok.recebidos == [["12345678000199-1-000001/2026"]]


def test_sem_notificar_marca_como_visto(tmp_path):
    paginas = [[item(1, "Plataforma de ciência de dados")]]
    canal = Coletor()
    Monitor(cfg(tmp_path), cliente=ClienteFalso(paginas), notificadores=[canal]).executar(notificar=False)
    Monitor(cfg(tmp_path), cliente=ClienteFalso(paginas), notificadores=[canal]).executar()
    assert canal.recebidos == []


class AvaliadorFalso:
    def avaliar(self, lic, palavras):
        nota = 9 if "power bi" in palavras else 3
        return {"nota": nota, "recomendacao": "participar" if nota > 5 else "descartar",
                "resumo": "r", "justificativa": "j", "pontos_de_atencao": []}


def test_nota_minima_da_ia(tmp_path):
    c = cfg(tmp_path)
    c["ia"] = {"nota_minima": 6}
    paginas = [[item(1, "Ciência de dados"), item(2, "Licenças Power BI")]]
    canal = Coletor()
    Monitor(c, cliente=ClienteFalso(paginas), notificadores=[canal], avaliador=AvaliadorFalso()).executar()
    assert canal.recebidos == [["12345678000199-1-000002/2026"]]


def test_avaliador_ia_monta_pedido_correto(monkeypatch):
    """Confere o corpo enviado à API Claude sem fazer chamada real."""
    anthropic = pytest.importorskip("anthropic")
    httpx = pytest.importorskip("httpx2")  # cliente HTTP usado pelo SDK anthropic 2.x
    from licitacoes.ia import AvaliadorIA

    enviado = {}

    def responder(req):
        enviado["corpo"] = json.loads(req.content)
        enviado["beta"] = req.headers.get("anthropic-beta")
        saida = {"nota": 8, "recomendacao": "participar", "resumo": "BI", "justificativa": "ok",
                 "pontos_de_atencao": ["atestado"]}
        return httpx.Response(200, json={
            "id": "msg_1", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
            "content": [{"type": "text", "text": json.dumps(saida)}],
            "stop_reason": "end_turn", "stop_sequence": None,
            "usage": {"input_tokens": 10, "output_tokens": 10}})

    monkeypatch.setenv("ANTHROPIC_API_KEY", "teste")
    av = AvaliadorIA("Empresa de BI")
    av.cliente = anthropic.Anthropic(http_client=httpx.Client(transport=httpx.MockTransport(responder)))
    r = av.avaliar(Licitacao.de_json(item(1, "Power BI")), ["power bi"])
    assert r["nota"] == 8 and r["pontos_de_atencao"] == ["atestado"]
    c = enviado["corpo"]
    assert c["model"] == "claude-opus-5-5"
    assert c["fallbacks"] == "default"
    assert c["output_config"]["effort"] == "low"
    assert c["output_config"]["format"]["type"] == "json_schema"
    assert "server-side-fallback-2026-07-01" in enviado["beta"]
