/*
 * Confere se o config.js e o parceiros.js estão bem preenchidos.
 * Pega os erros de digitação mais comuns, que a calculadora
 * ignoraria em silêncio (ex.: "valorMinimoEntraga" em vez de "valorMinimoEntrega").
 *
 * Devolve uma lista de avisos em português. Lista vazia = tudo certo.
 */
(function (global) {
  "use strict";

  function ehNumeroPositivo(x) { return typeof x === "number" && isFinite(x) && x > 0; }
  function ehObjeto(x) { return x && typeof x === "object" && !Array.isArray(x); }

  // Chaves que só existem no parceiros.js (não precisam estar no config.js)
  var SO_DE_PARCEIRO = ["modalidadesPermitidas"];

  // Procura, nos ajustes do parceiro, nomes que não existem no config.js
  function chavesDesconhecidas(ajustes, base, caminho, saida) {
    Object.keys(ajustes || {}).forEach(function (k) {
      var onde = caminho ? caminho + "." + k : k;
      if (!caminho && SO_DE_PARCEIRO.indexOf(k) >= 0) return;
      if (!base || !Object.prototype.hasOwnProperty.call(base, k)) { saida.push(onde); return; }
      if (ehObjeto(ajustes[k]) && ehObjeto(base[k])) chavesDesconhecidas(ajustes[k], base[k], onde, saida);
    });
    return saida;
  }

  function verificarConfig(cfg, parceiros) {
    var avisos = [];
    function aviso(t) { avisos.push(t); }

    // Identidade
    if (!/^\d{12,13}$/.test(String(cfg.empresa && cfg.empresa.whatsapp))) {
      aviso('empresa.whatsapp: use só números, com 55 + DDD + número (ex.: "5542999498859").');
    }

    // Tabela dentro da cidade
    var mods = (cfg.dentroDaCidade && cfg.dentroDaCidade.modalidades) || {};
    Object.keys(mods).forEach(function (nome) {
      var faixas = mods[nome].faixas || [];
      if (!faixas.length) aviso("Modalidade " + nome + ": não tem nenhuma faixa de preço.");
      faixas.forEach(function (f, i) {
        if (!ehNumeroPositivo(f.ate) || !ehNumeroPositivo(f.valor)) {
          aviso("Modalidade " + nome + ", faixa " + (i + 1) + ': "ate" e "valor" precisam ser números (use ponto: 2.50).');
        }
        if (i > 0 && f.ate <= faixas[i - 1].ate) {
          aviso("Modalidade " + nome + ": as faixas precisam estar em ordem crescente de km (faixa " + (i + 1) + ").");
        }
      });
      var acima = cfg.dentroDaCidade.acimaDaUltimaFaixa && cfg.dentroDaCidade.acimaDaUltimaFaixa[nome];
      if (!acima || !ehNumeroPositivo(acima.porKm)) {
        aviso("acimaDaUltimaFaixa." + nome + ".porKm: falta o valor por km acima da última faixa.");
      }
    });

    // Fora da cidade
    if (!ehNumeroPositivo(cfg.foraDaCidade && cfg.foraDaCidade.porKm)) {
      aviso("foraDaCidade.porKm: precisa ser um número (ex.: 2.50).");
    }

    // Carga especial
    var esp = cfg.cargaEspecial || {};
    if (["fixo", "percentual"].indexOf(esp.tipo) < 0) aviso('cargaEspecial.tipo: use "fixo" ou "percentual".');
    if (esp.ativo && !ehNumeroPositivo(esp.valor)) aviso("cargaEspecial.valor: precisa ser um número.");

    // Mapas
    if (["google", "gratis"].indexOf(cfg.mapas && cfg.mapas.provedor) < 0) {
      aviso('mapas.provedor: use "google" ou "gratis".');
    }

    // Parceiros
    Object.keys(parceiros || {}).forEach(function (codigo) {
      var p = parceiros[codigo] || {};
      if (!/^[a-z0-9-]+$/.test(codigo)) {
        aviso('Parceiro "' + codigo + '": use no código só letras minúsculas, números e hífen (ele vai no link).');
      }
      chavesDesconhecidas(p.ajustes, cfg, "", []).forEach(function (k) {
        aviso('Parceiro "' + codigo + '": "' + k + '" não existe no config.js (erro de digitação?).');
      });
      var perm = p.ajustes && p.ajustes.modalidadesPermitidas;
      (perm || []).forEach(function (m) {
        if (!mods[m]) aviso('Parceiro "' + codigo + '": modalidade "' + m + '" não existe (use: ' + Object.keys(mods).join(", ") + ").");
      });
    });

    return avisos;
  }

  global.LFM = global.LFM || {};
  global.LFM.verificarConfig = verificarConfig;
  if (typeof module !== "undefined" && module.exports) module.exports = verificarConfig;
})(typeof window !== "undefined" ? window : globalThis);
