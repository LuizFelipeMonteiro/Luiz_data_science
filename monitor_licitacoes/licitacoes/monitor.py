"""Orquestra um ciclo: busca no PNCP → filtra → (IA) → salva → notifica → relatórios."""
from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from typing import Any

from .filtros import Filtro
from .notificadores import Achado, Notificador, montar_notificadores
from .pncp import ClientePNCP, Licitacao
from .relatorio import exportar_csv, exportar_html
from .storage import Banco

log = logging.getLogger(__name__)


class Monitor:
    def __init__(self, cfg: dict[str, Any], cliente: ClientePNCP | None = None,
                 notificadores: list[Notificador] | None = None, avaliador: Any = None,
                 hoje: date | None = None):
        self.cfg = cfg
        self.busca = cfg.get("busca", {})
        self.cliente = cliente or ClientePNCP()
        f = cfg.get("filtros", {})
        self.filtro = Filtro(
            palavras_chave=f.get("palavras_chave", []),
            palavras_excluidas=f.get("palavras_excluidas", []),
            valor_minimo=f.get("valor_minimo"),
            valor_maximo=f.get("valor_maximo"),
            ufs=self.busca.get("ufs", []),
            municipios=f.get("municipios", []),
            aceitar_sem_valor=f.get("aceitar_sem_valor", True),
        )
        saida = cfg.get("saida", {})
        self.banco = Banco(saida.get("banco", "dados/licitacoes.db"))
        self.notificadores = notificadores if notificadores is not None else \
            montar_notificadores(cfg.get("notificacoes", {}))
        ia = cfg.get("ia", {})
        self.nota_minima = ia.get("nota_minima", 0)
        self.avaliador = avaliador
        if self.avaliador is None and ia.get("habilitado"):
            from .ia import AvaliadorIA
            self.avaliador = AvaliadorIA(ia.get("perfil_empresa", ""), ia.get("modelo", "claude-opus-5-5"),
                                         ia.get("esforco", "low"))
        self.hoje = hoje or date.today()

    # ---------------------------------------------------------------- busca
    def _coletar(self) -> dict[str, Licitacao]:
        modo = self.busca.get("modo", "proposta")
        modalidades = self.busca.get("modalidades", [6])
        # A API aceita uma UF por consulta; lista vazia = Brasil inteiro (uma consulta só).
        ufs = self.busca.get("ufs") or [None]
        max_pag = self.busca.get("max_paginas", 20)
        vistos: dict[str, Licitacao] = {}
        for mod in modalidades:
            for uf in ufs:
                try:
                    if modo == "publicacao":
                        dias = self.busca.get("dias_retroativos", 3)
                        it = self.cliente.publicadas(mod, self.hoje - timedelta(days=dias), self.hoje, uf, max_pag)
                    else:
                        dias = self.busca.get("dias_a_frente", 60)
                        it = self.cliente.com_propostas_abertas(mod, self.hoje + timedelta(days=dias), uf, max_pag)
                    n = 0
                    for lic in it:
                        vistos[lic.id] = lic
                        n += 1
                    log.info("Modalidade %s, UF %s: %s registro(s)", mod, uf or "todas", n)
                except Exception as e:  # uma consulta com erro não derruba as demais
                    log.error("Falha ao consultar modalidade %s / UF %s: %s", mod, uf or "todas", e)
        return vistos

    # ---------------------------------------------------------------- ciclo
    def executar(self, notificar: bool = True) -> list[Achado]:
        coletadas = self._coletar()
        novos = 0
        for lic in coletadas.values():
            if self.banco.ja_visto(lic.id):
                continue
            palavras = self.filtro.avaliar(lic)
            if palavras is None:
                continue
            avaliacao = self.avaliador.avaliar(lic, palavras) if self.avaliador else None
            self.banco.salvar(lic, palavras, avaliacao)
            novos += 1
        log.info("%s licitação(ões) coletada(s); %s nova(s) passaram no filtro.", len(coletadas), novos)

        achados = self._pendentes()
        relevantes = [a for a in achados if self._relevante(a)]
        if notificar and relevantes:
            algum_ok = False
            for n in self.notificadores:
                try:
                    n.enviar(relevantes)
                    algum_ok = True
                except Exception as e:
                    log.error("Falha ao notificar via %s: %s", n.nome, e)
            # Abaixo da nota mínima: sai da fila sem aviso. Relevantes: só saem se algum canal
            # funcionou; senão ficam pendentes e são reenviados no próximo ciclo.
            self.banco.marcar_notificado(
                [a.licitacao.id for a in achados if algum_ok or not self._relevante(a)])
        else:
            # Sem notificar (ex.: primeira carga): marca tudo como visto para não inundar depois.
            self.banco.marcar_notificado([a.licitacao.id for a in achados])

        saida = self.cfg.get("saida", {})
        if saida.get("csv"):
            exportar_csv(self.banco, saida["csv"])
        if saida.get("html"):
            exportar_html(self.banco, saida["html"])
        return relevantes

    def _relevante(self, a: Achado) -> bool:
        if not a.avaliacao:  # IA desligada ou falhou: não descarta nada
            return True
        return a.avaliacao.get("nota", 0) >= self.nota_minima

    def _pendentes(self) -> list[Achado]:
        saida = []
        for id_ in self.banco.pendentes_de_notificacao():
            r = self.banco.con.execute("SELECT * FROM licitacoes WHERE id = ?", (id_,)).fetchone()
            lic = Licitacao.de_json(json.loads(r["bruto"]))
            av = json.loads(r["avaliacao_ia"]) if r["avaliacao_ia"] else None
            saida.append(Achado(lic, (r["palavras"] or "").split(", "), av))
        saida.sort(key=lambda a: -(a.avaliacao or {}).get("nota", 0))
        return saida
