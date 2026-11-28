/*
 * Roda os casos de teste. Funciona no navegador (testes.html)
 * e no terminal: node calculadora-frete/testes/rodar-testes.js
 */
(function (global) {
  function rodarTestes(config, precos, casos) {
    return casos.map(function (c) {
      // Copia o config para poder ligar a carga especial só no teste.
      var cfg = c.parceiro
        ? global.LFM.parceiro.montarConfig(config, global.LFM_PARCEIROS, c.parceiro)
        : JSON.parse(JSON.stringify(config));
      if (c.especial) {
        cfg.cargaEspecial = Object.assign({}, cfg.cargaEspecial, c.especial, { ativo: true });
      }
      var r = precos.calcularFrete(
        { distanciaKm: c.km, dentroDaCidade: c.dentro, modalidade: c.modalidade, cargaEspecial: !!c.especial },
        cfg
      );
      return { caso: c, resultado: r, ok: Math.abs(r.valor - c.esperado) < 0.005 };
    });
  }

  global.LFM = global.LFM || {};
  global.LFM.rodarTestes = rodarTestes;

  // Execução pelo terminal
  if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
    global.window = global; // o config.js escreve em "window", que no terminal não existe
    require("../config.js");
    require("../parceiros.js");
    require("../js/parceiro.js");
    var precos = require("../js/precos.js");
    var casos = require("./casos.js");
    var avisos = require("./verificar-config.js")(global.LFM_CONFIG, global.LFM_PARCEIROS);
    avisos.forEach(function (a) { console.log("AVISO  " + a); });
    var res = rodarTestes(global.LFM_CONFIG, precos, casos);
    var falhas = 0;
    res.forEach(function (t) {
      if (!t.ok) falhas++;
      console.log((t.ok ? "OK   " : "FALHA") + "  " + t.caso.km + " km " +
        (t.caso.dentro ? "PG " : "fora ") + t.caso.modalidade +
        (t.caso.especial ? " +especial(" + t.caso.especial.tipo + ")" : "") +
        "  esperado " + precos.formatarReais(t.caso.esperado) +
        "  obtido " + precos.formatarReais(t.resultado.valor));
    });
    console.log("\n" + (res.length - falhas) + "/" + res.length + " passaram" +
      (avisos.length ? " | " + avisos.length + " aviso(s) no config" : " | config sem avisos"));
    process.exit(falhas || avisos.length ? 1 : 0);
  }
})(typeof window !== "undefined" ? window : globalThis);
