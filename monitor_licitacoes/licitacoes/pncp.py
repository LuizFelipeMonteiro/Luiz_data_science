"""Cliente da API pública de consulta do PNCP (Portal Nacional de Contratações Públicas).

Documentação oficial: https://pncp.gov.br/api/consulta/swagger-ui/index.html
A API é aberta (não exige cadastro nem token).
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Iterator

import requests

log = logging.getLogger(__name__)

URL_BASE = "https://pncp.gov.br/api/consulta/v1"
TAMANHO_PAGINA = 50  # máximo aceito pela API

MODALIDADES = {
    1: "Leilão - Eletrônico",
    2: "Diálogo Competitivo",
    3: "Concurso",
    4: "Concorrência - Eletrônica",
    5: "Concorrência - Presencial",
    6: "Pregão - Eletrônico",
    7: "Pregão - Presencial",
    8: "Dispensa de Licitação",
    9: "Inexigibilidade",
    10: "Manifestação de Interesse",
    11: "Pré-qualificação",
    12: "Credenciamento",
    13: "Leilão - Presencial",
}


@dataclass
class Licitacao:
    """Visão normalizada de uma contratação publicada no PNCP."""

    id: str  # numeroControlePNCP — único em todo o portal
    objeto: str
    orgao: str
    cnpj_orgao: str
    uf: str
    municipio: str
    modalidade: str
    valor_estimado: float | None
    data_publicacao: str | None
    abertura_propostas: str | None
    encerramento_propostas: str | None
    situacao: str
    link_pncp: str
    link_sistema_origem: str | None
    informacao_complementar: str = ""
    bruto: dict[str, Any] = field(default_factory=dict, repr=False)

    @classmethod
    def de_json(cls, d: dict[str, Any]) -> "Licitacao":
        orgao = d.get("orgaoEntidade") or {}
        unidade = d.get("unidadeOrgao") or {}
        cnpj = orgao.get("cnpj", "")
        ano = d.get("anoCompra", "")
        seq = d.get("sequencialCompra", "")
        return cls(
            id=d.get("numeroControlePNCP") or f"{cnpj}-{ano}-{seq}",
            objeto=(d.get("objetoCompra") or "").strip(),
            orgao=orgao.get("razaoSocial", ""),
            cnpj_orgao=cnpj,
            uf=unidade.get("ufSigla", ""),
            municipio=unidade.get("municipioNome", ""),
            modalidade=d.get("modalidadeNome")
            or MODALIDADES.get(d.get("modalidadeId"), ""),
            valor_estimado=d.get("valorTotalEstimado"),
            data_publicacao=d.get("dataPublicacaoPncp"),
            abertura_propostas=d.get("dataAberturaProposta"),
            encerramento_propostas=d.get("dataEncerramentoProposta"),
            situacao=d.get("situacaoCompraNome", ""),
            link_pncp=f"https://pncp.gov.br/app/editais/{cnpj}/{ano}/{seq}",
            link_sistema_origem=d.get("linkSistemaOrigem"),
            informacao_complementar=(d.get("informacaoComplementar") or "").strip(),
            bruto=d,
        )

    def texto_busca(self) -> str:
        return f"{self.objeto}\n{self.informacao_complementar}"


class ClientePNCP:
    def __init__(self, url_base: str = URL_BASE, timeout: int = 60, tentativas: int = 4,
                 pausa_entre_paginas: float = 0.3):
        self.url_base = url_base.rstrip("/")
        self.timeout = timeout
        self.tentativas = tentativas
        self.pausa = pausa_entre_paginas
        self.sessao = requests.Session()
        self.sessao.headers["User-Agent"] = "monitor-licitacoes/1.0"
        self.sessao.headers["Accept"] = "application/json"

    def _get(self, caminho: str, params: dict[str, Any]) -> dict[str, Any] | None:
        url = f"{self.url_base}/{caminho.lstrip('/')}"
        for tentativa in range(1, self.tentativas + 1):
            try:
                r = self.sessao.get(url, params=params, timeout=self.timeout)
                if r.status_code == 204:  # sem resultados
                    return None
                if r.status_code in (429, 500, 502, 503, 504):
                    raise requests.HTTPError(f"HTTP {r.status_code}", response=r)
                r.raise_for_status()
                return r.json()
            except (requests.ConnectionError, requests.Timeout, requests.HTTPError) as e:
                status = getattr(getattr(e, "response", None), "status_code", None)
                if status and 400 <= status < 500 and status != 429:
                    log.error("PNCP recusou a consulta %s %s: %s", url, params, e.response.text[:300])
                    raise
                if tentativa == self.tentativas:
                    raise
                espera = 2 ** tentativa
                log.warning("Falha na consulta ao PNCP (%s). Nova tentativa em %ss…", e, espera)
                time.sleep(espera)
        return None

    def _paginar(self, caminho: str, params: dict[str, Any], max_paginas: int) -> Iterator[Licitacao]:
        pagina = 1
        while pagina <= max_paginas:
            dados = self._get(caminho, {**params, "pagina": pagina, "tamanhoPagina": TAMANHO_PAGINA})
            if not dados or not dados.get("data"):
                return
            for item in dados["data"]:
                yield Licitacao.de_json(item)
            restantes = dados.get("paginasRestantes")
            total = dados.get("totalPaginas")
            if restantes == 0 or (total is not None and pagina >= total):
                return
            pagina += 1
            time.sleep(self.pausa)
        log.warning("Limite de %s páginas atingido em %s %s — aumente busca.max_paginas "
                    "ou restrinja UFs/modalidades.", max_paginas, caminho, params)

    def com_propostas_abertas(self, modalidade: int, data_final: date, uf: str | None = None,
                              max_paginas: int = 20) -> Iterator[Licitacao]:
        """Contratações cujo prazo de propostas ainda está aberto (encerra até `data_final`)."""
        params: dict[str, Any] = {
            "dataFinal": data_final.strftime("%Y%m%d"),
            "codigoModalidadeContratacao": modalidade,
        }
        if uf:
            params["uf"] = uf.upper()
        yield from self._paginar("contratacoes/proposta", params, max_paginas)

    def publicadas(self, modalidade: int, data_inicial: date, data_final: date,
                   uf: str | None = None, max_paginas: int = 20) -> Iterator[Licitacao]:
        """Contratações publicadas no PNCP entre as datas informadas."""
        params: dict[str, Any] = {
            "dataInicial": data_inicial.strftime("%Y%m%d"),
            "dataFinal": data_final.strftime("%Y%m%d"),
            "codigoModalidadeContratacao": modalidade,
        }
        if uf:
            params["uf"] = uf.upper()
        yield from self._paginar("contratacoes/publicacao", params, max_paginas)


def formatar_data(valor: str | None) -> str:
    if not valor:
        return "—"
    try:
        return datetime.fromisoformat(valor.replace("Z", "")).strftime("%d/%m/%Y %H:%M")
    except ValueError:
        return valor


def formatar_valor(valor: float | None) -> str:
    if valor is None:
        return "não informado"
    s = f"{valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"
