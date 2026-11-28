/*
 * Conversa com os serviços de mapa.
 *
 *  - buscarEnderecos(texto) → lista de sugestões (Photon / OpenStreetMap)
 *  - calcularRota(origem, destino) → distância de carro (OpenRouteService)
 *
 * Se um dia trocarmos de provedor (ex.: Google Maps), só este
 * arquivo muda. O resto da calculadora continua igual.
 */
(function (global) {
  "use strict";

  // ---------- Busca de endereços (Photon) ----------

  function montarTitulo(p) {
    if (p.type === "street") return p.name;
    if (p.type === "house" && p.street) {
      return p.name && p.name !== p.street
        ? p.name + " – " + p.street + (p.housenumber ? ", " + p.housenumber : "")
        : p.street + (p.housenumber ? ", " + p.housenumber : "");
    }
    return p.name || p.street || "";
  }

  function montarSubtitulo(p) {
    var partes = [];
    if (p.type !== "street" && p.type !== "house" && p.street) {
      partes.push(p.street + (p.housenumber ? ", " + p.housenumber : ""));
    }
    if (p.district && p.district !== p.name) partes.push(p.district);
    if (p.city && p.city !== p.name) partes.push(p.city);
    else if (p.county && p.county !== p.name) partes.push(p.county);
    return partes.join(" · ");
  }

  /**
   * @returns {Promise<Array<{titulo, subtitulo, cidade, lat, lon}>>}
   */
  function buscarEnderecos(texto, cfgMapas, sinal) {
    var url = new URL(cfgMapas.buscaUrl);
    url.searchParams.set("q", texto);
    url.searchParams.set("lat", cfgMapas.centro.lat);
    url.searchParams.set("lon", cfgMapas.centro.lon);
    url.searchParams.set("bbox", cfgMapas.regiao.join(","));
    url.searchParams.set("limit", 8);
    url.searchParams.set("lang", "default");

    return fetch(url, { signal: sinal })
      .then(function (r) {
        if (!r.ok) throw new Error("busca " + r.status);
        return r.json();
      })
      .then(function (dados) {
        var vistos = {};
        return dados.features
          .map(function (f) {
            var p = f.properties;
            var ehLocal = p.type !== "street" && p.type !== "house";   // loja, escola, praça…
            return {
              titulo: montarTitulo(p),
              subtitulo: montarSubtitulo(p),
              // partes separadas, para montar o endereço completo na mensagem
              rua: p.type === "street" ? p.name : (p.street || ""),
              nomeLocal: ehLocal || (p.type === "house" && p.name && p.name !== p.street) ? (p.name || "") : "",
              bairro: p.district || "",
              cidade: p.city || (p.type === "city" ? p.name : "") || p.county || "",
              lat: f.geometry.coordinates[1],
              lon: f.geometry.coordinates[0],
            };
          })
          .filter(function (s) {           // tira sugestões repetidas
            var chave = s.titulo + "|" + s.subtitulo;
            if (!s.titulo || vistos[chave]) return false;
            vistos[chave] = true;
            return true;
          })
          // Quem tem no nome as palavras digitadas sobe para o topo
          .map(function (s, i) { return { s: s, i: i, nota: notaParecido(texto, s.titulo) }; })
          .sort(function (a, b) { return b.nota - a.nota || a.i - b.i; })
          .map(function (x) { return x.s; })
          .slice(0, 5);
      });
  }

  // Quantas das palavras digitadas (3+ letras) aparecem no título
  function notaParecido(texto, titulo) {
    var t = normalizar(titulo);
    return normalizar(texto).split(/\s+/).filter(function (p) {
      return p.length >= 3 && t.indexOf(p) >= 0;
    }).length;
  }

  // ---------- Rota de carro (OpenRouteService) ----------

  /**
   * @returns {Promise<{km:number, minutos:number}>}
   */
  function calcularRota(origem, destino, cfgMapas, chave) {
    if (!chave) return Promise.reject(new Error("sem chave de rotas (arquivo chave.js)"));
    var url = new URL(cfgMapas.rotaUrl);
    url.searchParams.set("api_key", chave);
    url.searchParams.set("start", origem.lon + "," + origem.lat);
    url.searchParams.set("end", destino.lon + "," + destino.lat);

    return fetch(url)
      .then(function (r) {
        return r.json().then(function (dados) {
          if (!r.ok) {
            var msg = dados && dados.error && (dados.error.message || dados.error);
            throw new Error("rota " + r.status + (msg ? ": " + msg : ""));
          }
          return dados;
        });
      })
      .then(function (dados) {
        var resumo = dados.features[0].properties.summary;
        return { km: resumo.distance / 1000, minutos: resumo.duration / 60 };
      });
  }

  // ---------- Dentro ou fora da cidade ----------

  function normalizar(texto) {
    return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  }

  function mesmaCidade(cidade, nomeCidade) {
    return normalizar(cidade) === normalizar(nomeCidade);
  }

  global.LFM = global.LFM || {};
  global.LFM.mapas = {
    buscarEnderecos: buscarEnderecos,
    calcularRota: calcularRota,
    mesmaCidade: mesmaCidade,
  };
})(typeof window !== "undefined" ? window : globalThis);
