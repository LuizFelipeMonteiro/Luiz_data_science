"""Uso:
    python -m licitacoes                       # roda um ciclo com config.yaml
    python -m licitacoes --loop 120            # roda a cada 120 minutos
    python -m licitacoes --sem-notificar       # carga inicial silenciosa
"""
from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

import yaml

from .monitor import Monitor


def carregar_config(caminho: str) -> dict:
    p = Path(caminho)
    if not p.exists():
        exemplo = p.with_name("config.example.yaml")
        if exemplo.exists():
            logging.warning("%s não encontrado; usando %s", p, exemplo)
            p = exemplo
        else:
            sys.exit(f"Arquivo de configuração não encontrado: {caminho}")
    return yaml.safe_load(p.read_text(encoding="utf-8")) or {}


def main() -> None:
    ap = argparse.ArgumentParser(prog="licitacoes", description="Monitor de licitações do PNCP")
    ap.add_argument("--config", default="config.yaml")
    ap.add_argument("--loop", type=int, metavar="MINUTOS", help="repete a cada N minutos")
    ap.add_argument("--sem-notificar", action="store_true",
                    help="registra o que encontrar sem enviar avisos (útil na 1ª execução)")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    cfg = carregar_config(args.config)
    while True:
        Monitor(cfg).executar(notificar=not args.sem_notificar)
        if not args.loop:
            break
        logging.info("Próximo ciclo em %s minuto(s).", args.loop)
        time.sleep(args.loop * 60)


if __name__ == "__main__":
    main()
