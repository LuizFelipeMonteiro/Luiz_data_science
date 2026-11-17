"""Triagem opcional com Claude: lê cada licitação filtrada e dá uma nota de aderência
ao perfil da empresa, com resumo e pontos de atenção.

Requer a variável de ambiente ANTHROPIC_API_KEY (ou `ant auth login`).
"""
from __future__ import annotations

import logging
from typing import Literal

from pydantic import BaseModel, Field

from .pncp import Licitacao, formatar_data, formatar_valor

log = logging.getLogger(__name__)


class Avaliacao(BaseModel):
    nota: int = Field(description="Aderência ao perfil da empresa, de 0 (nada a ver) a 10 (encaixe perfeito)")
    recomendacao: Literal["participar", "analisar", "descartar"]
    resumo: str = Field(description="O que está sendo contratado, em 1 ou 2 frases simples")
    justificativa: str = Field(description="Por que a nota foi essa, citando o perfil da empresa")
    pontos_de_atencao: list[str] = Field(
        description="Riscos ou exigências a checar no edital (prazos curtos, atestados, garantia, etc.)")


INSTRUCOES = """Você faz a triagem de licitações públicas brasileiras (dados do PNCP) para uma empresa.
Para cada licitação recebida, avalie se vale a empresa abaixo investir tempo lendo o edital.
Baseie-se apenas nos dados fornecidos; quando faltar informação, diga isso na justificativa em vez de supor.
Notas: 8-10 encaixe claro no que a empresa faz; 5-7 encaixe parcial ou incerto; 0-4 fora do escopo.
Escreva em português do Brasil, de forma direta.

Perfil da empresa:
{perfil}"""


class AvaliadorIA:
    def __init__(self, perfil_empresa: str, modelo: str = "claude-opus-5-5", esforco: str = "low"):
        import anthropic  # importado só quando a IA está habilitada

        self.anthropic = anthropic
        self.cliente = anthropic.Anthropic()
        self.modelo = modelo
        self.esforco = esforco
        self.sistema = INSTRUCOES.format(perfil=perfil_empresa.strip())

    def avaliar(self, lic: Licitacao, palavras: list[str]) -> dict | None:
        conteudo = (
            f"Objeto: {lic.objeto}\n"
            f"Informação complementar: {lic.informacao_complementar or '—'}\n"
            f"Órgão: {lic.orgao} ({lic.municipio}/{lic.uf})\n"
            f"Modalidade: {lic.modalidade}\n"
            f"Valor estimado: {formatar_valor(lic.valor_estimado)}\n"
            f"Propostas: de {formatar_data(lic.abertura_propostas)} até {formatar_data(lic.encerramento_propostas)}\n"
            f"Palavras-chave que casaram: {', '.join(palavras)}"
        )
        try:
            resp = self.cliente.beta.messages.parse(
                model=self.modelo,
                max_tokens=4000,
                # O perfil da empresa é igual em todas as chamadas: fica em cache.
                system=[{"type": "text", "text": self.sistema, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": conteudo}],
                output_format=Avaliacao,
                output_config={"effort": self.esforco},
                # Se o modelo recusar por política de segurança, a API tenta outro modelo automaticamente.
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except self.anthropic.RateLimitError as e:
            log.warning("Limite de requisições da API Claude atingido; seguindo sem nota para %s: %s", lic.id, e)
            return None
        except self.anthropic.APIStatusError as e:
            log.warning("Erro da API Claude (%s) ao avaliar %s: %s", e.status_code, lic.id, e.message)
            return None
        except self.anthropic.APIConnectionError as e:
            log.warning("Sem conexão com a API Claude ao avaliar %s: %s", lic.id, e)
            return None

        if resp.stop_reason == "refusal" or resp.parsed_output is None:
            log.warning("Claude não avaliou %s (stop_reason=%s)", lic.id, resp.stop_reason)
            return None
        return resp.parsed_output.model_dump()
