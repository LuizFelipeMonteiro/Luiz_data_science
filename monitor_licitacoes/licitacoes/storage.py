"""Persistência em SQLite: lembra o que já foi visto para só avisar novidades."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from .pncp import Licitacao

ESQUEMA = """
CREATE TABLE IF NOT EXISTS licitacoes (
    id TEXT PRIMARY KEY,
    objeto TEXT,
    orgao TEXT,
    uf TEXT,
    municipio TEXT,
    modalidade TEXT,
    valor_estimado REAL,
    encerramento_propostas TEXT,
    link_pncp TEXT,
    palavras TEXT,
    nota_ia INTEGER,
    resumo_ia TEXT,
    avaliacao_ia TEXT,
    primeiro_visto TEXT,
    notificado_em TEXT,
    bruto TEXT
);
"""


class Banco:
    def __init__(self, caminho: str | Path):
        Path(caminho).parent.mkdir(parents=True, exist_ok=True)
        self.con = sqlite3.connect(str(caminho))
        self.con.row_factory = sqlite3.Row
        self.con.executescript(ESQUEMA)

    def ja_visto(self, id_: str) -> bool:
        return self.con.execute("SELECT 1 FROM licitacoes WHERE id = ?", (id_,)).fetchone() is not None

    def salvar(self, lic: Licitacao, palavras: list[str], avaliacao: dict[str, Any] | None) -> None:
        self.con.execute(
            """INSERT OR IGNORE INTO licitacoes
               (id, objeto, orgao, uf, municipio, modalidade, valor_estimado,
                encerramento_propostas, link_pncp, palavras, nota_ia, resumo_ia,
                avaliacao_ia, primeiro_visto, bruto)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                lic.id, lic.objeto, lic.orgao, lic.uf, lic.municipio, lic.modalidade,
                lic.valor_estimado, lic.encerramento_propostas, lic.link_pncp,
                ", ".join(palavras),
                avaliacao.get("nota") if avaliacao else None,
                avaliacao.get("resumo") if avaliacao else None,
                json.dumps(avaliacao, ensure_ascii=False) if avaliacao else None,
                datetime.now().isoformat(timespec="seconds"),
                json.dumps(lic.bruto, ensure_ascii=False),
            ),
        )
        self.con.commit()

    def marcar_notificado(self, ids: list[str]) -> None:
        agora = datetime.now().isoformat(timespec="seconds")
        self.con.executemany("UPDATE licitacoes SET notificado_em = ? WHERE id = ?",
                             [(agora, i) for i in ids])
        self.con.commit()

    def pendentes_de_notificacao(self) -> list[str]:
        return [r["id"] for r in self.con.execute(
            "SELECT id FROM licitacoes WHERE notificado_em IS NULL")]

    def todas(self) -> list[sqlite3.Row]:
        return list(self.con.execute(
            "SELECT * FROM licitacoes ORDER BY primeiro_visto DESC, encerramento_propostas"))
