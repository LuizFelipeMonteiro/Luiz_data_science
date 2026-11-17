"""Canais de aviso: console, Telegram, e-mail (SMTP) e webhook genérico (Slack/Discord/Teams)."""
from __future__ import annotations

import html
import logging
import os
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Any, Protocol

import requests

from .pncp import Licitacao, formatar_data, formatar_valor

log = logging.getLogger(__name__)


@dataclass
class Achado:
    licitacao: Licitacao
    palavras: list[str]
    avaliacao: dict[str, Any] | None = None


class Notificador(Protocol):
    nome: str

    def enviar(self, achados: list[Achado]) -> None: ...


def _texto(a: Achado) -> str:
    l = a.licitacao
    linhas = [
        f"📌 {l.objeto[:400]}",
        f"🏛️ {l.orgao} — {l.municipio}/{l.uf}",
        f"📋 {l.modalidade} | 💰 {formatar_valor(l.valor_estimado)}",
        f"⏰ Propostas até {formatar_data(l.encerramento_propostas)}",
        f"🔎 Palavras: {', '.join(a.palavras)}",
    ]
    if a.avaliacao:
        av = a.avaliacao
        linhas.append(f"🤖 Nota IA: {av['nota']}/10 ({av['recomendacao']}) — {av['resumo']}")
    linhas.append(f"🔗 {l.link_pncp}")
    return "\n".join(linhas)


class Console:
    nome = "console"

    def enviar(self, achados: list[Achado]) -> None:
        print(f"\n===== {len(achados)} nova(s) licitação(ões) =====")
        for a in achados:
            print("\n" + _texto(a))
        print()


class Telegram:
    nome = "telegram"

    def __init__(self, token: str, chat_id: str):
        self.url = f"https://api.telegram.org/bot{token}/sendMessage"
        self.chat_id = chat_id

    def _post(self, texto: str) -> None:
        r = requests.post(self.url, json={"chat_id": self.chat_id, "text": texto[:4096],
                                          "disable_web_page_preview": True}, timeout=30)
        r.raise_for_status()

    def enviar(self, achados: list[Achado]) -> None:
        self._post(f"🔔 {len(achados)} nova(s) licitação(ões) encontrada(s)")
        for a in achados:
            self._post(_texto(a))


class Email:
    nome = "email"

    def __init__(self, host: str, porta: int, usuario: str, senha: str, remetente: str,
                 destinatarios: list[str], tls: bool = True):
        self.host, self.porta, self.usuario, self.senha = host, porta, usuario, senha
        self.remetente, self.destinatarios, self.tls = remetente, destinatarios, tls

    def enviar(self, achados: list[Achado]) -> None:
        msg = EmailMessage()
        msg["Subject"] = f"[Licitações] {len(achados)} nova(s) oportunidade(s)"
        msg["From"] = self.remetente
        msg["To"] = ", ".join(self.destinatarios)
        msg.set_content("\n\n".join(_texto(a) for a in achados))
        partes = []
        for a in achados:
            l = a.licitacao
            ia = ""
            if a.avaliacao:
                ia = (f"<br><b>Nota IA:</b> {a.avaliacao['nota']}/10 ({html.escape(a.avaliacao['recomendacao'])}) — "
                      f"{html.escape(a.avaliacao['resumo'])}")
            partes.append(
                f"<p><b>{html.escape(l.objeto[:400])}</b><br>{html.escape(l.orgao)} — "
                f"{html.escape(l.municipio)}/{l.uf}<br>{html.escape(l.modalidade)} | "
                f"{formatar_valor(l.valor_estimado)} | propostas até {formatar_data(l.encerramento_propostas)}"
                f"{ia}<br><a href='{html.escape(l.link_pncp)}'>Ver no PNCP</a></p>")
        msg.add_alternative("<html><body>" + "<hr>".join(partes) + "</body></html>", subtype="html")
        with smtplib.SMTP(self.host, self.porta, timeout=30) as s:
            if self.tls:
                s.starttls()
            if self.usuario:
                s.login(self.usuario, self.senha)
            s.send_message(msg)


class Webhook:
    """Envia {"text": ...} — formato aceito por Slack, Mattermost, Google Chat e (como 'content') Discord."""

    nome = "webhook"

    def __init__(self, url: str):
        self.url = url

    def enviar(self, achados: list[Achado]) -> None:
        texto = f"🔔 {len(achados)} nova(s) licitação(ões)\n\n" + "\n\n".join(_texto(a) for a in achados)
        r = requests.post(self.url, json={"text": texto[:39000], "content": texto[:1900]}, timeout=30)
        r.raise_for_status()


def montar_notificadores(cfg: dict[str, Any]) -> list[Notificador]:
    """Credenciais vêm sempre de variáveis de ambiente, nunca do arquivo de configuração."""
    saida: list[Notificador] = []
    if cfg.get("console", True):
        saida.append(Console())

    tg = cfg.get("telegram") or {}
    if tg.get("habilitado"):
        token, chat = os.getenv("TELEGRAM_BOT_TOKEN"), os.getenv("TELEGRAM_CHAT_ID")
        if token and chat:
            saida.append(Telegram(token, chat))
        else:
            log.warning("Telegram habilitado, mas TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID não definidos.")

    em = cfg.get("email") or {}
    if em.get("habilitado"):
        host = os.getenv("SMTP_HOST")
        dest = em.get("destinatarios") or [d for d in os.getenv("EMAIL_DESTINATARIOS", "").split(",") if d]
        if host and dest:
            saida.append(Email(
                host=host, porta=int(os.getenv("SMTP_PORT", "587")),
                usuario=os.getenv("SMTP_USER", ""), senha=os.getenv("SMTP_PASSWORD", ""),
                remetente=os.getenv("SMTP_FROM") or os.getenv("SMTP_USER", ""),
                destinatarios=dest, tls=em.get("tls", True)))
        else:
            log.warning("E-mail habilitado, mas SMTP_HOST ou destinatários não definidos.")

    wh = cfg.get("webhook") or {}
    if wh.get("habilitado"):
        url = os.getenv("WEBHOOK_URL")
        if url:
            saida.append(Webhook(url))
        else:
            log.warning("Webhook habilitado, mas WEBHOOK_URL não definido.")
    return saida
