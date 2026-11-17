"""Exporta tudo o que já foi encontrado para CSV (Excel) e um HTML navegável."""
from __future__ import annotations

import csv
import html
import json
from datetime import datetime
from pathlib import Path

from .pncp import formatar_data, formatar_valor
from .storage import Banco

COLUNAS = ["primeiro_visto", "nota_ia", "objeto", "orgao", "municipio", "uf", "modalidade",
           "valor_estimado", "encerramento_propostas", "palavras", "resumo_ia", "link_pncp", "id"]


def exportar_csv(banco: Banco, caminho: str | Path) -> None:
    Path(caminho).parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig: Excel abre com acentos
        w = csv.writer(f, delimiter=";")
        w.writerow(COLUNAS)
        for r in banco.todas():
            w.writerow([r[c] if r[c] is not None else "" for c in COLUNAS])


def exportar_html(banco: Banco, caminho: str | Path) -> None:
    Path(caminho).parent.mkdir(parents=True, exist_ok=True)
    linhas = []
    for r in banco.todas():
        av = json.loads(r["avaliacao_ia"]) if r["avaliacao_ia"] else None
        nota = f"<span class='nota n{min(r['nota_ia'] // 4, 2)}'>{r['nota_ia']}</span>" if av else "—"
        detalhe = ""
        if av:
            pontos = "".join(f"<li>{html.escape(p)}</li>" for p in av.get("pontos_de_atencao", []))
            detalhe = (f"<div class='ia'><b>{html.escape(av['recomendacao'])}</b>: "
                       f"{html.escape(av['justificativa'])}<ul>{pontos}</ul></div>")
        linhas.append(
            f"<tr><td>{nota}</td><td><a href='{html.escape(r['link_pncp'])}' target='_blank'>"
            f"{html.escape(r['objeto'] or '')}</a>{detalhe}</td>"
            f"<td>{html.escape(r['orgao'] or '')}<br><small>{html.escape(r['municipio'] or '')}/{r['uf']}</small></td>"
            f"<td>{html.escape(r['modalidade'] or '')}</td>"
            f"<td class='num'>{formatar_valor(r['valor_estimado'])}</td>"
            f"<td>{formatar_data(r['encerramento_propostas'])}</td>"
            f"<td><small>{html.escape(r['palavras'] or '')}</small></td></tr>")
    gerado = datetime.now().strftime("%d/%m/%Y %H:%M")
    Path(caminho).write_text(f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Licitações monitoradas</title><style>
body{{font-family:system-ui,sans-serif;margin:16px;background:#fafafa;color:#1a1a1a}}
table{{border-collapse:collapse;width:100%;background:#fff}}th,td{{padding:8px;border-bottom:1px solid #e5e5e5;vertical-align:top;text-align:left}}
th{{position:sticky;top:0;background:#f0f0f0}}.num{{text-align:right;white-space:nowrap}}
.nota{{display:inline-block;min-width:24px;text-align:center;border-radius:4px;padding:2px 4px;font-weight:600}}
.n0{{background:#fde2e1}}.n1{{background:#fff3c4}}.n2{{background:#d9f2dd}}
.ia{{margin-top:6px;font-size:.9em;color:#444}}input{{padding:8px;width:100%;max-width:420px;margin:8px 0}}
</style></head><body><h1>Licitações monitoradas</h1><p>Gerado em {gerado} · {len(linhas)} registro(s)</p>
<input id="q" placeholder="Filtrar…" oninput="for(const tr of document.querySelectorAll('tbody tr'))tr.hidden=!tr.innerText.toLowerCase().includes(this.value.toLowerCase())">
<div style="overflow-x:auto"><table><thead><tr><th>Nota IA</th><th>Objeto</th><th>Órgão</th><th>Modalidade</th>
<th>Valor estimado</th><th>Propostas até</th><th>Palavras</th></tr></thead><tbody>
{''.join(linhas)}</tbody></table></div></body></html>""", encoding="utf-8")
