/*
 * Conversa com os serviços de mapa.
 *
 * Existem dois "motores" com as mesmas funções:
 *   - google  → Google Places (endereço COM número) + Google Routes (distância)
 *   - gratis  → Photon/OpenStreetMap (endereço) + OpenRouteService (distância)
 *
 * Qual usar fica em config.js → mapas.provedor.
 * Se a chave do Google não estiver no chave.js, usa o gratuito sozinho.
 *
 * Cada motor tem:
 *   buscar(texto, sinal, sessao)  → sugestões enquanto a pessoa digita
 *   detalhar(item, sessao)        → completa a sugestão escolhida (coordenadas, número, bairro…)
 *   rota(origem, destino)         → { km, minutos } de carro
 */
(function (global) {
  "use strict";

  // ============================================================
  //  Utilidades
  // ============================================================

  function normalizar(texto) {
    return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  }

  function mesmaCidade(cidade, nomeCidade) {
    return normalizar(cidade) === normalizar(nomeCidade);
  }

  // Quantas das palavras digitadas (3+ letras) aparecem no título
  function notaParecido(texto, titulo) {
    var t = normalizar(titulo);
    return normalizar(texto).split(/\s+/).filter(function (p) {
      return p.length >= 3 && t.indexOf(p) >= 0;
    }).length;
  }

  // Lê a resposta e transforma erro do serviço em mensagem legível
  function lerJson(r, nome) {
    return r.json().catch(function () { return null; }).then(function (dados) {
      if (!r.ok) {
        var e = dados && dados.error;
        var msg = e && (e.message || (typeof e === "string" ? e : ""));
        throw new Error(nome + " " + r.status + (msg ? ": " + msg : ""));
      }
      return dados;
    });
  }

  // Identificador de "sessão" do Google: junta as buscas de UM endereço
  // com o detalhe escolhido, para o Google cobrar como um pacote só.
  function novaSessao() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return "s-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  // ============================================================
  //  Motor GOOGLE
  // ============================================================

  function motorGoogle(cfg, chave) {
    var g = cfg.google;

    function cabecalhos(campos) {
      var h = { "Content-Type": "application/json", "X-Goog-Api-Key": chave };
      if (campos) h["X-Goog-FieldMask"] = campos;
      return h;
    }

    function buscar(texto, sinal, sessao) {
      return fetch(g.autocompleteUrl, {
        method: "POST",
        signal: sinal,
        headers: cabecalhos(),
        body: JSON.stringify({
          input: texto,
          languageCode: "pt-BR",
          regionCode: "br",
          includedRegionCodes: ["br"],
          locationBias: { circle: {
            center: { latitude: cfg.centro.lat, longitude: cfg.centro.lon },
            radius: g.raioBuscaMetros,
          } },
          sessionToken: sessao,
        }),
      })
        .then(function (r) { return lerJson(r, "busca Google"); })
        .then(function (dados) {
          return (dados.suggestions || [])
            .filter(function (s) { return s.placePrediction; })
            .slice(0, 5)
            .map(function (s) {
              var p = s.placePrediction;
              var fmt = p.structuredFormat || {};
              var tipos = p.types || [];
              return {
                placeId: p.placeId,
                titulo: (fmt.mainText && fmt.mainText.text) || (p.text && p.text.text) || "",
                subtitulo: ((fmt.secondaryText && fmt.secondaryText.text) || "").replace(/, Brasil$|, Brazil$/, ""),
                ehEstabelecimento: tipos.indexOf("establishment") >= 0,
              };
            });
        });
    }

    // Pega um pedaço do endereço pelo tipo (ex.: "route" = rua)
    function parte(componentes, tipo, curto) {
      for (var i = 0; i < componentes.length; i++) {
        if ((componentes[i].types || []).indexOf(tipo) >= 0) {
          return curto ? componentes[i].shortText : componentes[i].longText;
        }
      }
      return "";
    }

    function detalhar(item, sessao) {
      var url = g.detalhesUrl + encodeURIComponent(item.placeId) +
        "?languageCode=pt-BR&regionCode=br&sessionToken=" + encodeURIComponent(sessao);
      // Só os campos do pacote básico ("Essentials"), que é o mais barato
      return fetch(url, { headers: cabecalhos("location,addressComponents,formattedAddress") })
        .then(function (r) { return lerJson(r, "detalhe Google"); })
        .then(function (d) {
          var c = d.addressComponents || [];
          return Object.assign({}, item, {
            lat: d.location.latitude,
            lon: d.location.longitude,
            rua: parte(c, "route"),
            numero: parte(c, "street_number"),
            bairro: parte(c, "sublocality_level_1") || parte(c, "sublocality") || parte(c, "neighborhood"),
            cidade: parte(c, "locality") || parte(c, "administrative_area_level_2"),
            nomeLocal: item.ehEstabelecimento ? item.titulo : "",
            enderecoGoogle: d.formattedAddress || "",
          });
        });
    }

    function rota(origem, destino) {
      function ponto(e) { return { location: { latLng: { latitude: e.lat, longitude: e.lon } } }; }
      return fetch(g.rotasUrl, {
        method: "POST",
        headers: cabecalhos("routes.distanceMeters,routes.duration"),
        body: JSON.stringify({
          origin: ponto(origem),
          destination: ponto(destino),
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_UNAWARE",   // pacote básico, sem trânsito em tempo real
        }),
      })
        .then(function (r) { return lerJson(r, "rota Google"); })
        .then(function (d) {
          if (!d.routes || !d.routes.length) throw new Error("rota Google: nenhuma rota encontrada");
          var segundos = parseFloat(String(d.routes[0].duration || "0").replace("s", ""));
          return { km: d.routes[0].distanceMeters / 1000, minutos: segundos / 60 };
        });
    }

    return { nome: "google", buscar: buscar, detalhar: detalhar, rota: rota };
  }

  // ============================================================
  //  Motor GRATUITO (Photon + OpenRouteService)
  // ============================================================

  function motorGratis(cfg, chaveOrs) {
    var gr = cfg.gratis;

    function titulo(p) {
      if (p.type === "street") return p.name;
      if (p.type === "house" && p.street) {
        return p.name && p.name !== p.street
          ? p.name + " – " + p.street + (p.housenumber ? ", " + p.housenumber : "")
          : p.street + (p.housenumber ? ", " + p.housenumber : "");
      }
      return p.name || p.street || "";
    }

    function subtitulo(p) {
      var partes = [];
      if (p.type !== "street" && p.type !== "house" && p.street) {
        partes.push(p.street + (p.housenumber ? ", " + p.housenumber : ""));
      }
      if (p.district && p.district !== p.name) partes.push(p.district);
      if (p.city && p.city !== p.name) partes.push(p.city);
      else if (p.county && p.county !== p.name) partes.push(p.county);
      return partes.join(" · ");
    }

    function buscar(texto, sinal) {
      var url = new URL(gr.buscaUrl);
      url.searchParams.set("q", texto);
      url.searchParams.set("lat", cfg.centro.lat);
      url.searchParams.set("lon", cfg.centro.lon);
      url.searchParams.set("bbox", gr.regiao.join(","));
      url.searchParams.set("limit", 8);
      url.searchParams.set("lang", "default");

      return fetch(url, { signal: sinal })
        .then(function (r) { return lerJson(r, "busca"); })
        .then(function (dados) {
          var vistos = {};
          return dados.features
            .map(function (f) {
              var p = f.properties;
              var ehLocal = p.type !== "street" && p.type !== "house";   // loja, escola, praça…
              return {
                titulo: titulo(p),
                subtitulo: subtitulo(p),
                rua: p.type === "street" ? p.name : (p.street || ""),
                numero: p.housenumber || "",
                nomeLocal: ehLocal || (p.type === "house" && p.name && p.name !== p.street) ? (p.name || "") : "",
                bairro: p.district || "",
                cidade: p.city || (p.type === "city" ? p.name : "") || p.county || "",
                lat: f.geometry.coordinates[1],
                lon: f.geometry.coordinates[0],
              };
            })
            .filter(function (s) {             // tira sugestões repetidas
              var k = s.titulo + "|" + s.subtitulo;
              if (!s.titulo || vistos[k]) return false;
              vistos[k] = true;
              return true;
            })
            // quem tem no nome as palavras digitadas sobe para o topo
            .map(function (s, i) { return { s: s, i: i, nota: notaParecido(texto, s.titulo) }; })
            .sort(function (a, b) { return b.nota - a.nota || a.i - b.i; })
            .map(function (x) { return x.s; })
            .slice(0, 5);
        });
    }

    // A sugestão do Photon já vem completa
    function detalhar(item) { return Promise.resolve(item); }

    function rota(origem, destino) {
      if (!chaveOrs) return Promise.reject(new Error("sem chave de rotas (arquivo chave.js)"));
      var url = new URL(gr.rotaUrl);
      url.searchParams.set("api_key", chaveOrs);
      url.searchParams.set("start", origem.lon + "," + origem.lat);
      url.searchParams.set("end", destino.lon + "," + destino.lat);
      return fetch(url)
        .then(function (r) { return lerJson(r, "rota"); })
        .then(function (d) {
          var resumo = d.features[0].properties.summary;
          return { km: resumo.distance / 1000, minutos: resumo.duration / 60 };
        });
    }

    return { nome: "gratis", buscar: buscar, detalhar: detalhar, rota: rota };
  }

  // ============================================================
  //  Escolha do motor
  // ============================================================

  function chavePreenchida(chave) {
    return typeof chave === "string" && chave.length > 20 && chave.indexOf("COLE_") !== 0;
  }

  function criar(cfg, chaves) {
    if (cfg.provedor === "google") {
      if (chavePreenchida(chaves.google)) return motorGoogle(cfg, chaves.google);
      console.warn("Chave do Google não encontrada no chave.js – usando o mapa gratuito.");
    }
    return motorGratis(cfg, chaves.ors);
  }

  global.LFM = global.LFM || {};
  global.LFM.mapas = { criar: criar, mesmaCidade: mesmaCidade, novaSessao: novaSessao };
})(typeof window !== "undefined" ? window : globalThis);
