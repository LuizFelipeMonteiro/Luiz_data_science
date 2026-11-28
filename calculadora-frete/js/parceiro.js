/*
 * Junta a tabela padrão (config.js) com os ajustes de um
 * cliente parceiro (parceiros.js).
 *
 * É como um dicionário em Python: começa com a tabela padrão
 * e troca só as chaves que o parceiro mudou.
 */
(function (global) {
  "use strict";

  function ehObjeto(x) { return x && typeof x === "object" && !Array.isArray(x); }

  // Copia "ajustes" por cima de "base", entrando nos níveis de dentro.
  function mesclar(base, ajustes) {
    var saida = JSON.parse(JSON.stringify(base));
    Object.keys(ajustes || {}).forEach(function (chave) {
      saida[chave] = ehObjeto(ajustes[chave]) && ehObjeto(saida[chave])
        ? mesclar(saida[chave], ajustes[chave])
        : ajustes[chave];
    });
    return saida;
  }

  /**
   * Devolve o config final para um parceiro.
   * Se o código não existir (ou estiver vazio), devolve a tabela padrão.
   */
  function montarConfig(configBase, parceiros, codigo) {
    var p = codigo && parceiros && parceiros[codigo];
    if (!p) return mesclar(configBase, {});
    var cfg = mesclar(configBase, p.ajustes);
    cfg.parceiroAtivo = codigo;
    cfg.parceiroNome = p.nome || codigo;
    return cfg;
  }

  global.LFM = global.LFM || {};
  global.LFM.parceiro = { montarConfig: montarConfig, mesclar: mesclar };
  if (typeof module !== "undefined" && module.exports) module.exports = global.LFM.parceiro;
})(typeof window !== "undefined" ? window : globalThis);
