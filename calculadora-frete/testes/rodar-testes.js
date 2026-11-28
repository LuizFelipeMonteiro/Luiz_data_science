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
      var r;
      if (c.grupo) {
        // Pedido com uma ou várias entregas: o "valor" é o total
        var p = precos.calcularPedido({
          entregas: c.grupo.map(function (g) { return { distanciaKm: g.km, dentroDaCidade: g.dentro }; }),
          cargaEspecial: !!c.especial,
        }, cfg);
        r = { valor: p.total, regra: p.itens.map(function (i) { return i.regra; }).join(" + ") };
      } else {
        r = precos.calcularFrete(
          { distanciaKm: c.km, dentroDaCidade: c.dentro, modalidade: c.modalidade, cargaEspecial: !!c.especial },
          cfg
        );
      }
      return { caso: c, resultado: r, ok: Math.abs(r.valor - c.esperado) < 0.005 };
    });
  }

  // Textos para mostrar cada caso (usados no testes.html e no terminal)
  function descrever(c) {
    if (c.grupo) {
      var dentro = c.grupo.every(function (g) { return g.dentro; });
      var fora = c.grupo.every(function (g) { return !g.dentro; });
      return {
        distancia: c.grupo.map(function (g) { return String(g.km).replace(".", ","); }).join(" + ") + " km",
        onde: dentro ? "Ponta Grossa" : fora ? "Fora de PG" : "PG + fora",
        tipo: c.grupo.length === 1 ? "1 entrega" : c.grupo.length + " entregas",
      };
    }
    return {
      distancia: String(c.km).replace(".", ",") + " km",
      onde: c.dentro ? "Ponta Grossa" : "Fora de PG",
      tipo: c.modalidade,
    };
  }

  global.LFM = global.LFM || {};
  global.LFM.rodarTestes = rodarTestes;
  global.LFM.descreverCaso = descrever;

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
      var d = descrever(t.caso);
      console.log((t.ok ? "OK   " : "FALHA") + "  " + d.distancia + " " + d.onde + " " + d.tipo +
        (t.caso.parceiro ? " [" + t.caso.parceiro + "]" : "") +
        (t.caso.especial ? " +especial(" + t.caso.especial.tipo + ")" : "") +
        "  esperado " + precos.formatarReais(t.caso.esperado) +
        "  obtido " + precos.formatarReais(t.resultado.valor));
    });
    console.log("\n" + (res.length - falhas) + "/" + res.length + " passaram" +
      (avisos.length ? " | " + avisos.length + " aviso(s) no config" : " | config sem avisos"));
    process.exit(falhas || avisos.length ? 1 : 0);
  }
})(typeof window !== "undefined" ? window : globalThis);
