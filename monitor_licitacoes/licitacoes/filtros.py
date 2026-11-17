"""Filtros por palavra-chave, exclusões, valor e localidade."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from .pncp import Licitacao


def normalizar(texto: str) -> str:
    """Minúsculas e sem acentos: 'Ciência de Dados' -> 'ciencia de dados'."""
    sem_acento = unicodedata.normalize("NFKD", texto or "")
    sem_acento = "".join(c for c in sem_acento if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", sem_acento.lower()).strip()


def _padrao(termo: str) -> re.Pattern[str]:
    """Casa o termo como palavra/frase inteira. '*' no fim vira prefixo: 'softwar*'."""
    t = normalizar(termo)
    prefixo = t.endswith("*")
    t = re.escape(t.rstrip("*")).replace(r"\ ", r"\s+")
    return re.compile(rf"(?<![a-z0-9]){t}" + ("" if prefixo else r"(?![a-z0-9])"))


@dataclass
class Filtro:
    palavras_chave: list[str] = field(default_factory=list)
    palavras_excluidas: list[str] = field(default_factory=list)
    valor_minimo: float | None = None
    valor_maximo: float | None = None
    ufs: list[str] = field(default_factory=list)
    municipios: list[str] = field(default_factory=list)
    aceitar_sem_valor: bool = True

    def __post_init__(self) -> None:
        self._inclusao = [(p, _padrao(p)) for p in self.palavras_chave if p.strip()]
        self._exclusao = [(p, _padrao(p)) for p in self.palavras_excluidas if p.strip()]
        self._ufs = {u.upper() for u in self.ufs}
        self._municipios = {normalizar(m) for m in self.municipios}

    def avaliar(self, lic: Licitacao) -> list[str] | None:
        """Retorna as palavras-chave encontradas, ou None se a licitação não passa no filtro."""
        if self._ufs and lic.uf.upper() not in self._ufs:
            return None
        if self._municipios and normalizar(lic.municipio) not in self._municipios:
            return None
        v = lic.valor_estimado
        if v is None or v == 0:
            if not self.aceitar_sem_valor:
                return None
        else:
            if self.valor_minimo is not None and v < self.valor_minimo:
                return None
            if self.valor_maximo is not None and v > self.valor_maximo:
                return None

        texto = normalizar(lic.texto_busca())
        if any(p.search(texto) for _, p in self._exclusao):
            return None
        if not self._inclusao:
            return ["(sem filtro de palavras)"]
        achadas = [termo for termo, p in self._inclusao if p.search(texto)]
        return achadas or None
