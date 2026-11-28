/*
 * Testes técnicos (para quem mexe no código).
 * Rodar no terminal:  node calculadora-frete/testes/tecnicos.js
 *
 * Os testes de PREÇO ficam no testes.html / rodar-testes.js.
 * Aqui ficam: mensagem do WhatsApp, parceiros, plano B dos mapas
 * e a verificação do config.
 */
"use strict";
global.window = global;
require("../config.js");
require("../parceiros.js");
var parceiro = require("../js/parceiro.js");
var precos = require("../js/precos.js");
var whatsapp = require("../js/whatsapp.js");
var mapas = require("../js/mapas.js");
var verificarConfig = require("./verificar-config.js");

var falhas = 0, total = 0;
function ok(condicao, nome) {
  total++;
  if (!condicao) falhas++;
  console.log((condicao ? "OK    " : "FALHA ") + nome);
}
function copia(x) { return JSON.parse(JSON.stringify(x)); }
var CFG = global.LFM_CONFIG;

// ---------------- WhatsApp ----------------
(function () {
  var ret = { rua: "Rua Balduíno Taques", numero: "500", bairro: "Centro", cidade: "Ponta Grossa", complemento: "casa amarela" };
  var ent = { rua: "Avenida General Carlos Cavalcanti", numero: "4748", bairro: "Uvaranas", cidade: "Ponta Grossa",
              nomeLocal: "Floricultura X", placeId: "ChIJ123", numeroGoogle: "4748" };
  var msg = whatsapp.montarMensagem({ retirada: ret, entrega: ent, km: 7.3, valorTexto: "R$ 29,20",
    tipo: "entrega avulsa", parceiro: "Cliente A", data: "2026-12-05", horario: "14:30", oQue: "" }, CFG);
  ok(msg.indexOf("*Retirada:* Rua Balduíno Taques, 500 – Centro, Ponta Grossa") >= 0, "mensagem: endereço de retirada completo");
  ok(msg.indexOf("*Entrega:* Floricultura X – Avenida General Carlos Cavalcanti, 4748 – Uvaranas, Ponta Grossa") >= 0, "mensagem: nome da loja na entrega");
  ok(msg.indexOf("Complemento: casa amarela") >= 0, "mensagem: complemento");
  ok(msg.indexOf("Valor: R$ 29,20 (entrega avulsa)") >= 0, "mensagem: valor e tipo");
  ok(msg.indexOf("Cliente: Cliente A") >= 0, "mensagem: nome do parceiro");
  ok(msg.indexOf("Data: 05/12/2026") >= 0 && msg.indexOf("O que vai ser entregue: (a combinar)") >= 0, "mensagem: data formatada e campo vazio 'a combinar'");

  ok(whatsapp.linkMapa(ent).indexOf("query_place_id=ChIJ123") > 0, "mapa: usa o código do local do Google");
  ok(whatsapp.linkMapa(Object.assign({}, ent, { numero: "100" })).indexOf("query_place_id") < 0, "mapa: número trocado à mão → não usa o código do local");
  ok(whatsapp.linkWhatsApp("+55 (42) 99949-8859", "oi").indexOf("https://wa.me/5542999498859?text=oi") === 0, "link do WhatsApp só com números");
})();

// ---------------- Parceiros ----------------
(function () {
  var antes = JSON.stringify(CFG);
  var c = parceiro.montarConfig(CFG, global.LFM_PARCEIROS, "cliente-a");
  ok(c.valorMinimoEntrega === 20 && c.parceiroNome === "Cliente A", "parceiro: aplica mínimo e nome");
  ok(c.dentroDaCidade.modalidades.avulsa.faixas[0].valor === 15, "parceiro: mantém o resto da tabela padrão");
  ok(JSON.stringify(CFG) === antes, "parceiro: não altera a tabela padrão");
  ok(!parceiro.montarConfig(CFG, global.LFM_PARCEIROS, "nao-existe").parceiroAtivo, "parceiro: código desconhecido → tabela padrão");
  ok(!parceiro.montarConfig(CFG, global.LFM_PARCEIROS, "__proto__").parceiroAtivo &&
     !parceiro.montarConfig(CFG, global.LFM_PARCEIROS, "constructor").parceiroAtivo, "parceiro: códigos esquisitos no link são ignorados");
})();

// ---------------- Preço: entradas inválidas ----------------
(function () {
  var erro = 0;
  [-1, NaN, "abc"].forEach(function (km) {
    try { precos.calcularFrete({ distanciaKm: km, dentroDaCidade: true, modalidade: "avulsa" }, CFG); } catch (e) { erro++; }
  });
  ok(erro === 3, "preço: recusa distância inválida");
  ok(mapas.mesmaCidade("PONTA GROSSA ", "Ponta Grossa") && mapas.mesmaCidade("Carambei", "Carambeí"), "cidade: ignora acento, maiúscula e espaço");
})();

// ---------------- Verificação do config ----------------
(function () {
  ok(verificarConfig(CFG, global.LFM_PARCEIROS).length === 0, "config atual: sem avisos");
  var ruim = copia(CFG);
  ruim.empresa.whatsapp = "(42) 99949-8859";
  ruim.dentroDaCidade.modalidades.avulsa.faixas[1].ate = 2;
  var avisos = verificarConfig(ruim, {
    "Cliente B": { ajustes: { valorMinimoEntraga: 20, modalidadesPermitidas: ["Avulsa"] } },
  });
  var texto = avisos.join("\n");
  ok(/whatsapp/.test(texto), "verificação: pega WhatsApp com pontuação");
  ok(/ordem crescente/.test(texto), "verificação: pega faixas fora de ordem");
  ok(/valorMinimoEntraga/.test(texto), "verificação: pega erro de digitação no parceiro");
  ok(/"Avulsa" não existe/.test(texto), "verificação: pega modalidade com nome errado");
  ok(/letras minúsculas/.test(texto), "verificação: pega código de parceiro com espaço/maiúscula");
})();

// ---------------- Plano B dos mapas (com motores de mentira) ----------------
function motorFalso(nome, falhar) {
  var chamadas = [];
  function f(tipo, valor) {
    return function () {
      chamadas.push(tipo);
      if (falhar && falhar[tipo]) return Promise.reject(falhar[tipo]);
      return Promise.resolve(valor);
    };
  }
  return { nome: nome, chamadas: chamadas,
    buscar: f("buscar", [{ titulo: nome }]),
    detalhar: f("detalhar", { lat: 1, lon: 2 }),
    rota: f("rota", { km: nome === "google" ? 7 : 7.5, minutos: 10 }) };
}
function erroHttp() { return new Error("403"); }
function erroAbort() { var e = new Error("abort"); e.name = "AbortError"; return e; }

async function testesPlanoB() {
  console.warn = function () {};   // o aviso "usando o mapa gratuito" é esperado aqui
  var g = motorFalso("google"), r = motorFalso("gratis");
  var m = mapas._comReserva(g, r);
  await m.buscar("x");
  ok(m.nome === "google" && r.chamadas.length === 0, "plano B: Google funcionando → não usa o gratuito");

  g = motorFalso("google", { buscar: erroHttp() }); r = motorFalso("gratis");
  m = mapas._comReserva(g, r);
  var res = await m.buscar("x");
  ok(res[0].titulo === "gratis" && m.nome === "gratis", "plano B: busca do Google falha → usa o gratuito na hora");
  await m.rota({}, {});
  ok(g.chamadas.indexOf("rota") < 0, "plano B: depois de trocar, nem tenta mais o Google");

  g = motorFalso("google", { rota: erroHttp() }); r = motorFalso("gratis");
  m = mapas._comReserva(g, r);
  var rota = await m.rota({}, {});
  ok(rota.km === 7.5, "plano B: rota do Google falha → rota pelo gratuito");

  g = motorFalso("google", { buscar: erroAbort() }); r = motorFalso("gratis");
  m = mapas._comReserva(g, r);
  await m.buscar("x").catch(function () {});
  ok(m.nome === "google" && r.chamadas.length === 0, "plano B: busca cancelada (pessoa ainda digitando) não troca de motor");

  var navOriginal = Object.getOwnPropertyDescriptor(global, "navigator");
  Object.defineProperty(global, "navigator", { value: { onLine: false }, configurable: true });
  g = motorFalso("google", { buscar: erroHttp() }); r = motorFalso("gratis");
  m = mapas._comReserva(g, r);
  await m.buscar("x").catch(function () {});
  ok(m.nome === "google", "plano B: celular sem internet não troca de motor");
  if (navOriginal) Object.defineProperty(global, "navigator", navOriginal); else delete global.navigator;

  g = motorFalso("google", { detalhar: erroHttp() }); r = motorFalso("gratis");
  m = mapas._comReserva(g, r);
  var e = await m.detalhar({ placeId: "x" }).catch(function (x) { return x; });
  ok(e && e.digitarDeNovo && m.nome === "gratis", "plano B: detalhe do Google falha → pede para digitar de novo (já no gratuito)");
}

testesPlanoB().then(function () {
  console.log("\n" + (total - falhas) + "/" + total + " testes técnicos passaram");
  process.exit(falhas ? 1 : 0);
});
