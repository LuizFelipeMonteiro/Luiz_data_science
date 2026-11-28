/*
 * ============================================================
 *  CONFIGURAÇÃO DA CALCULADORA — LFM Transportes
 * ============================================================
 *  Aqui ficam os preços, o WhatsApp, o nome e o logo.
 *  Condições de cada cliente: parceiros.js. Chaves: chave.js.
 *
 *  Regras para editar sem quebrar nada:
 *   - Use PONTO para centavos: 2.50 (e não 2,50).
 *   - Não apague vírgulas no fim das linhas.
 *   - Textos ficam entre aspas: "assim".
 *   - Depois de salvar, abra o arquivo testes.html para conferir
 *     (ele também avisa se algo foi digitado errado).
 * ============================================================
 */
window.LFM_CONFIG = {

  // ---------- Identidade ----------
  empresa: {
    nome: "LFM Transportes",
    cidade: "Ponta Grossa-PR",
    logo: "assets/logo.png",          // troque o arquivo nessa pasta pelo seu logo
    whatsapp: "5542999498859",        // só números: 55 + DDD + número
  },

  // ---------- Entregas DENTRO de Ponta Grossa ----------
  // Vale quando a retirada E a entrega são em Ponta Grossa.
  dentroDaCidade: {
    nomeCidade: "Ponta Grossa",

    // Cada faixa: "ate" = até quantos km (inclusive) e "valor" = preço em R$.
    // Ex.: 3,0 km cai na primeira faixa; 3,1 km já cai na segunda.
    modalidades: {
      avulsa: {
        rotulo: "Entrega avulsa",
        faixas: [
          { ate: 3, valor: 15.00 },
          { ate: 5, valor: 18.00 },
          { ate: 7, valor: 22.00 },
        ],
      },
      agrupada: {
        rotulo: "Entregas agrupadas (várias no mesmo trajeto)",
        faixas: [
          { ate: 3, valor: 12.00 },
          { ate: 5, valor: 14.00 },
          { ate: 7, valor: 17.00 },
        ],
      },
    },

    // Acima da última faixa (7 km): cobra R$ por km do trajeto INTEIRO.
    // Ex.: 8 km = 8 × 4,00 = R$ 32,00  |  10 km = R$ 40,00  |  15 km = R$ 60,00
    acimaDaUltimaFaixa: {
      avulsa:   { porKm: 4.00 },
      agrupada: { porKm: 4.00 },   // hoje igual à avulsa; mude se quiser desconto
    },
  },

  // ---------- Entregas FORA de Ponta Grossa ----------
  foraDaCidade: {
    porKm: 2.50,          // R$ por km rodado
    idaEVolta: true,      // true = cobra a distância 2 vezes (ida + volta)
    valorMinimo: 0,       // ex.: 30.00 para nunca cobrar menos que R$ 30
  },

  // ---------- Valor mínimo de qualquer entrega ----------
  // 0 = sem mínimo. Clientes parceiros podem ter um mínimo próprio (veja parceiros.js).
  valorMinimoEntrega: 0,

  // ---------- Carga especial (bolo, item frágil, horário exato) ----------
  cargaEspecial: {
    ativo: false,                     // mude para true para mostrar a opção na página
    rotulo: "Carga especial (bolo, item frágil ou horário exato)",
    tipo: "fixo",                     // "fixo" = soma R$  |  "percentual" = soma %
    valor: 5.00,                      // R$ 5,00 se "fixo"; ou 20 = 20% se "percentual"
  },

  // ---------- Mapas (normalmente não precisa mexer) ----------
  // As chaves ficam no arquivo chave.js.
  mapas: {
    // "google" = endereço com número da casa (precisa da chave do Google no chave.js)
    // "gratis" = OpenStreetMap, sem número da casa
    // Se escolher "google" e a chave não estiver lá, usa o gratuito automaticamente.
    provedor: "google",

    centro: { lat: -25.0945, lon: -50.1633 },   // centro de Ponta Grossa: sugestões próximas aparecem primeiro
    lembrarRetirada: true,                      // o celular de quem usa lembra o último endereço de retirada

    google: {
      autocompleteUrl: "https://places.googleapis.com/v1/places:autocomplete",
      detalhesUrl:     "https://places.googleapis.com/v1/places/",
      rotasUrl:        "https://routes.googleapis.com/directions/v2:computeRoutes",
      raioBuscaMetros: 40000,                   // prioriza endereços até 40 km do centro de PG
    },

    gratis: {
      buscaUrl: "https://photon.komoot.io/api/",                                     // sugestões de endereço
      rotaUrl:  "https://api.heigit.org/openrouteservice/v2/directions/driving-car", // distância de carro
      regiao: [-51.2, -25.8, -49.4, -24.3],     // só busca nos Campos Gerais (oeste, sul, leste, norte)
    },
  },

  // ---------- Arredondamento ----------
  arredondamento: {
    casasDecimaisKm: 1,               // distância usada no cálculo: 1 casa (ex.: 7,4 km)
  },
};
