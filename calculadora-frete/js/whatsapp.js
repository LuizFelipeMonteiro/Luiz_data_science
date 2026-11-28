/*
 * Monta a mensagem pronta e o link do WhatsApp.
 *
 * Só monta texto: não envia nada sozinho. Quem envia é a pessoa,
 * apertando "enviar" no WhatsApp. Nenhum dado fica guardado.
 *
 * Reaproveitável depois no agendamento.
 */
(function (global) {
  "use strict";

  // "Rua Balduíno Taques, 500 – Centro, Ponta Grossa"
  function enderecoCompleto(e) {
    var rua = e.rua || e.titulo;
    var linha = rua + (e.numero ? ", " + e.numero : "");
    if (e.nomeLocal && e.nomeLocal !== rua) linha = e.nomeLocal + " – " + linha;
    var lugar = [e.bairro, e.cidade].filter(Boolean).join(", ");
    return lugar ? linha + " – " + lugar : linha;
  }

  // Link que abre o endereço no Google Maps / GPS do celular
  function linkMapa(e) {
    var rua = e.rua || e.titulo;
    var busca = [rua + (e.numero ? ", " + e.numero : ""), e.bairro, e.cidade, "PR"].filter(Boolean).join(", ");
    var link = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(busca);
    // Endereço vindo do Google: manda também o código do local, para o GPS abrir no ponto exato.
    // Só se a pessoa não trocou o número que o Google encontrou.
    if (e.placeId && (!e.numeroGoogle || e.numero === e.numeroGoogle)) {
      link += "&query_place_id=" + encodeURIComponent(e.placeId);
    }
    return link;
  }

  function formatarData(iso) {           // "2026-12-05" → "05/12/2026"
    if (!iso) return "";
    var p = iso.split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso;
  }

  function blocoEndereco(rotulo, e) {
    var linhas = ["*" + rotulo + ":* " + enderecoCompleto(e)];
    if (e.complemento) linhas.push("Complemento: " + e.complemento);
    linhas.push("Mapa: " + linkMapa(e));
    return linhas.join("\n");
  }

  /**
   * @param {Object} d
   *   retirada, entrega: { titulo, rua, bairro, cidade, nomeLocal, numero, complemento }
   *   km, valorTexto, modalidadeRotulo, cargaEspecial (bool), parceiro (texto ou null)
   *   data ("AAAA-MM-DD"), horario ("HH:MM"), oQue (texto)
   */
  function montarMensagem(d, config) {
    var aCombinar = "(a combinar)";
    var partes = [
      "*Pedido de entrega – " + config.empresa.nome + "*" + (d.parceiro ? "\nCliente: " + d.parceiro : ""),
      blocoEndereco("Retirada", d.retirada),
      blocoEndereco("Entrega", d.entrega),
      "Distância: " + String(d.km).replace(".", ",") + " km\n" +
        "Valor: " + d.valorTexto + (d.modalidadeRotulo ? " (" + d.modalidadeRotulo.toLowerCase() + ")" : "") +
        (d.cargaEspecial ? "\nCarga especial: sim" : ""),
      "Data: " + (formatarData(d.data) || aCombinar) + "\n" +
        "Horário: " + (d.horario || aCombinar) + "\n" +
        "O que vai ser entregue: " + (d.oQue || aCombinar),
    ];
    return partes.join("\n\n");
  }

  function linkWhatsApp(numero, texto) {
    return "https://wa.me/" + String(numero).replace(/\D/g, "") + "?text=" + encodeURIComponent(texto);
  }

  var api = { montarMensagem: montarMensagem, linkWhatsApp: linkWhatsApp, enderecoCompleto: enderecoCompleto, linkMapa: linkMapa };
  global.LFM = global.LFM || {};
  global.LFM.whatsapp = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
