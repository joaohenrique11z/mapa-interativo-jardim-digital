/* ============================================================
   MAPA INTERATIVO DO BAIRRO — JARDIM DIGITAL 2026
   Lógica principal do painel
   IFPE Campus Belo Jardim
   ============================================================ */

// ==========================================
// ===  CONFIGURAÇÕES (fáceis de trocar)  ===
// ==========================================

/** URL do CSV publicado pelo Google Sheets */
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSEFmJhNmxAvajxjA0uRLNLO-YnoYyStroig76FcQLg2RDHgKiJKkU75cfmfZ8TB3ls57toHCFqiYzI/pub?gid=2027028220&single=true&output=csv';

/** Caminho do JSON de contingência (fallback offline) */
const FALLBACK_JSON = 'dados_teste.json';

/** Intervalo de atualização automática, em milissegundos (30 segundos) */
const REFRESH_INTERVAL_MS = 30000;

/**
 * Coordenadas e bounds da Cohab — Belo Jardim, PE
 * Ajuste esses valores se a área do mapa precisar ser maior/menor.
 */
const MAP_CONFIG = {
  center: [-8.3435, -36.4150],   // Centro aproximado da Cohab I
  zoom: 15,                       // Zoom inicial
  minZoom: 14,                    // Zoom mínimo (mais distante)
  maxZoom: 18,                    // Zoom máximo (mais perto)
  // maxBounds trava o pan para essa área retangular [sudoeste, nordeste]
  // Inclui Cohab I/II/III e arredores imediatos
  maxBounds: [
    [-8.360, -36.435],  // Canto sudoeste
    [-8.325, -36.395]   // Canto nordeste
  ]
};

/**
 * Mapeamento de nomes de colunas do CSV para nomes internos.
 * Se o Google Forms mudar algum título de coluna, basta atualizar aqui.
 * Os nomes serão comparados com .trim() automaticamente.
 */
const COLUMN_MAP = {
  timestamp:   'Carimbo de data/hora',
  tipo:        'Qual o tipo de ocorrência?',
  descricao:   'Descreva a ocorrência (Se for necessário)',
  cep:         'Qual o CEP da rua',
  referencia:  'Ponto de referência',
  gravidade:   'Quão grave você considera isso?',
  latitude:    'Latitude',
  longitude:   'Longitude',
  aproximado:  'Aproximado'
};

/**
 * Cores por tipo de ocorrência (para marcadores e gráficos).
 * Chaves são normalizadas (minúsculas, sem acentos).
 */
const CATEGORY_COLORS = {
  'buraco na via':                '#e74c3c',
  'iluminacao publica':           '#f1c40f',
  'iluminação pública':           '#f1c40f',
  'lixo acumulado':               '#e67e22',
  'esgoto a ceu aberto':          '#8e44ad',
  'esgoto a céu aberto':         '#8e44ad',
  'calcada danificada':           '#3498db',
  'calçada danificada':           '#3498db',
  'falta de sinalizacao':         '#1abc9c',
  'falta de sinalização':         '#1abc9c',
  'alagamento':                   '#2980b9',
  'mato alto':                    '#27ae60',
  'poluicao sonora':              '#e91e63',
  'poluição sonora':              '#e91e63',
  'abandono de imovel':           '#ff9800',
  'abandono de imóvel':           '#ff9800',
};
const DEFAULT_COLOR = '#95a5a6';

/** Mapeamento de emoji por tipo de ocorrência */
const CATEGORY_ICONS = {
  'buraco na via':          '🕳️',
  'iluminacao publica':     '💡',
  'iluminação pública':     '💡',
  'lixo acumulado':         '🗑️',
  'esgoto a ceu aberto':    '🚰',
  'esgoto a céu aberto':   '🚰',
  'calcada danificada':     '🧱',
  'calçada danificada':     '🧱',
  'falta de sinalizacao':   '🚦',
  'falta de sinalização':   '🚦',
  'alagamento':             '🌊',
  'mato alto':              '🌿',
  'poluicao sonora':        '🔊',
  'poluição sonora':        '🔊',
  'abandono de imovel':     '🏚️',
  'abandono de imóvel':     '🏚️',
};
const DEFAULT_ICON = '📍';


// ==========================================
// ===        ESTADO GLOBAL               ===
// ==========================================

let map = null;
let markersLayer = null;
let chartTipo = null;
let chartDia = null;
let isOffline = false;

/** Dados filtrados atualmente exibidos */
let currentData = [];


// ==========================================
// ===         INICIALIZAÇÃO              ===
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initCharts();
  fetchAndRender();   // Primeiro carregamento
  setInterval(fetchAndRender, REFRESH_INTERVAL_MS);
});


// ==========================================
// ===          MAPA LEAFLET              ===
// ==========================================

/**
 * Inicializa o mapa Leaflet com centro, bounds e tiles.
 */
function initMap() {
  map = L.map('map', {
    center: MAP_CONFIG.center,
    zoom: MAP_CONFIG.zoom,
    minZoom: MAP_CONFIG.minZoom,
    maxZoom: MAP_CONFIG.maxZoom,
    maxBounds: L.latLngBounds(MAP_CONFIG.maxBounds[0], MAP_CONFIG.maxBounds[1]),
    maxBoundsViscosity: 1.0,  // Impede arrastar para fora dos bounds
    zoomControl: true,
    attributionControl: false
  });

  // Tiles OpenStreetMap — gratuito e sem watermark
  // O efeito dark é aplicado via filtro CSS no container do mapa (veja style.css)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: MAP_CONFIG.maxZoom
  }).addTo(map);

  // LayerGroup para gerenciar marcadores (facilita limpar e redesenhar)
  markersLayer = L.layerGroup().addTo(map);
}

/**
 * Cria um ícone de marcador personalizado com cor baseada no tipo.
 */
function createMarkerIcon(tipo) {
  const tipoLower = tipo.toLowerCase().trim();
  const color = CATEGORY_COLORS[tipoLower] || DEFAULT_COLOR;
  const emoji = CATEGORY_ICONS[tipoLower] || DEFAULT_ICON;

  return L.divIcon({
    className: '',  // Sem classe padrão do Leaflet
    html: `
      <div class="custom-marker" style="background:${color}">
        <span class="custom-marker__inner">${emoji}</span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],    // Ponta do marcador
    popupAnchor: [0, -34]    // Popup acima do marcador
  });
}

/**
 * Constrói o HTML do popup de um marcador.
 */
function buildPopupContent(item) {
  const gravidade = item.gravidade
    ? `<div class="popup-content__gravity">Gravidade: ${'★'.repeat(Number(item.gravidade) || 0)}${'☆'.repeat(Math.max(0, 5 - (Number(item.gravidade) || 0)))}</div>`
    : '';

  const descricao = item.descricao
    ? `<div class="popup-content__row">
         <span class="popup-content__label">Descrição:</span>
         <span class="popup-content__value">${escapeHtml(item.descricao)}</span>
       </div>`
    : '';

  const referencia = item.referencia
    ? `<div class="popup-content__row">
         <span class="popup-content__label">Ref.:</span>
         <span class="popup-content__value">${escapeHtml(item.referencia)}</span>
       </div>`
    : '';

  return `
    <div class="popup-content">
      <div class="popup-content__title">
        ${CATEGORY_ICONS[item.tipo.toLowerCase().trim()] || DEFAULT_ICON}
        ${escapeHtml(item.tipo)}
      </div>
      ${descricao}
      ${referencia}
      <div class="popup-content__row">
        <span class="popup-content__label">Data:</span>
        <span class="popup-content__value">${escapeHtml(item.timestamp)}</span>
      </div>
      ${gravidade}
    </div>
  `;
}

/**
 * Atualiza os marcadores no mapa com os dados filtrados.
 */
function updateMarkers(data) {
  markersLayer.clearLayers();

  data.forEach(item => {
    const lat = parseFloat(item.latitude);
    const lng = parseFloat(item.longitude);

    if (isNaN(lat) || isNaN(lng)) return;

    const marker = L.marker([lat, lng], {
      icon: createMarkerIcon(item.tipo)
    });

    marker.bindPopup(buildPopupContent(item), {
      maxWidth: 280,
      className: ''
    });

    markersLayer.addLayer(marker);
  });
}


// ==========================================
// ===        GRÁFICOS CHART.JS           ===
// ==========================================

/**
 * Inicializa os dois gráficos (barras por tipo + linha por dia).
 * Os dados são preenchidos depois, via updateCharts().
 */
function initCharts() {
  // --- Configuração global do Chart.js para tema escuro ---
  Chart.defaults.color = '#8896ab';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.plugins.legend.display = false;

  // --- Gráfico 1: Barras horizontais (contagem por tipo) ---
  const ctxTipo = document.getElementById('chart-tipo').getContext('2d');
  chartTipo = new Chart(ctxTipo, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: [],
        borderColor: [],
        borderWidth: 1,
        borderRadius: 6,
        barThickness: 22
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      plugins: {
        tooltip: {
          backgroundColor: '#111927',
          borderColor: 'rgba(255,255,255,0.06)',
          borderWidth: 1,
          cornerRadius: 8,
          titleFont: { weight: 600 },
          padding: 10
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { stepSize: 1, precision: 0 },
          beginAtZero: true
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 11, weight: 500 } }
        }
      }
    }
  });

  // --- Gráfico 2: Linha (ocorrências por dia) ---
  const ctxDia = document.getElementById('chart-dia').getContext('2d');
  chartDia = new Chart(ctxDia, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Ocorrências',
        data: [],
        borderColor: '#00d4aa',
        backgroundColor: 'rgba(0, 212, 170, 0.10)',
        borderWidth: 2,
        pointBackgroundColor: '#00d4aa',
        pointBorderColor: '#0a0f18',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      plugins: {
        tooltip: {
          backgroundColor: '#111927',
          borderColor: 'rgba(255,255,255,0.06)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 10
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { maxRotation: 45, font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { stepSize: 1, precision: 0 },
          beginAtZero: true
        }
      }
    }
  });
}

/**
 * Atualiza os gráficos com os dados filtrados (sem recriar os canvas).
 */
function updateCharts(data) {
  // --- Agregar por tipo de ocorrência ---
  const countByTipo = {};
  data.forEach(item => {
    const tipo = item.tipo || 'Outros';
    countByTipo[tipo] = (countByTipo[tipo] || 0) + 1;
  });

  // Ordenar por contagem (maior → menor)
  const tiposSorted = Object.entries(countByTipo)
    .sort((a, b) => b[1] - a[1]);

  const tipoLabels = tiposSorted.map(([t]) => t);
  const tipoValues = tiposSorted.map(([, v]) => v);
  const tipoColors = tipoLabels.map(t =>
    CATEGORY_COLORS[t.toLowerCase().trim()] || DEFAULT_COLOR
  );

  chartTipo.data.labels = tipoLabels;
  chartTipo.data.datasets[0].data = tipoValues;
  chartTipo.data.datasets[0].backgroundColor = tipoColors.map(c => c + 'cc');
  chartTipo.data.datasets[0].borderColor = tipoColors;
  chartTipo.update('none'); // 'none' evita animação a cada refresh

  // --- Agregar por dia ---
  const countByDia = {};
  data.forEach(item => {
    // Timestamp vem no formato "DD/MM/YYYY HH:MM:SS"
    const dia = extractDate(item.timestamp);
    if (dia) {
      countByDia[dia] = (countByDia[dia] || 0) + 1;
    }
  });

  // Ordenar por data cronológica
  const diasSorted = Object.keys(countByDia).sort((a, b) => {
    return parseDateBR(a) - parseDateBR(b);
  });

  chartDia.data.labels = diasSorted;
  chartDia.data.datasets[0].data = diasSorted.map(d => countByDia[d]);
  chartDia.update('none');

  // --- Atualizar legenda de categorias ---
  updateLegend(tipoLabels, tipoColors);
}

/**
 * Atualiza a legenda visual de categorias na sidebar.
 */
function updateLegend(labels, colors) {
  const container = document.getElementById('legend-container');
  if (!container) return;

  container.innerHTML = labels.map((label, i) => `
    <div class="legend__item">
      <span class="legend__dot" style="background:${colors[i]}"></span>
      ${escapeHtml(label)}
    </div>
  `).join('');
}


// ==========================================
// ===       FETCH & PARSE DO CSV         ===
// ==========================================

/**
 * Ciclo principal: busca CSV, parseia, valida, atualiza mapa e gráficos.
 */
async function fetchAndRender() {
  try {
    const csvText = await fetchCSV();
    const rawData = parseCSV(csvText);
    const filtered = await filterValidRecords(rawData);

    currentData = filtered;
    isOffline = false;

    updateUI(filtered);
    setOnlineStatus(true);

  } catch (error) {
    console.warn('[Jardim Digital] Erro ao buscar CSV, tentando fallback...', error);

    try {
      const fallbackData = await fetchFallbackJSON();
      currentData = fallbackData;
      isOffline = true;

      updateUI(fallbackData);
      setOnlineStatus(false);

    } catch (fallbackError) {
      console.error('[Jardim Digital] Fallback também falhou:', fallbackError);
      setOnlineStatus(false);
    }
  }
}

/**
 * Busca o CSV do Google Sheets.
 * Cache-busting via &t= (a URL já contém "?", então usamos "&").
 * cache: 'no-store' impede o navegador de reutilizar respostas em cache.
 */
async function fetchCSV() {
  // Cache-busting: como CSV_URL já tem "?gid=...&...", concatenamos com "&"
  const urlComTimestamp = `${CSV_URL}&t=${Date.now()}`;

  console.log('[Jardim Digital] Fetching CSV:', urlComTimestamp);

  const response = await fetch(urlComTimestamp, {
    cache: 'no-store',       // Impede qualquer cache do navegador
    redirect: 'follow'       // Segue redirecionamentos (Google Sheets faz redirect)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const text = await response.text();

  // Log de debug: mostra as primeiras 300 chars para verificar se o dado é atual
  console.log('[Jardim Digital] CSV recebido (primeiros 300 chars):', text.substring(0, 300));
  console.log('[Jardim Digital] Total de linhas no CSV:', text.trim().split('\n').length);

  return text;
}

/**
 * Busca o JSON de fallback local.
 */
async function fetchFallbackJSON() {
  const response = await fetch(FALLBACK_JSON);
  if (!response.ok) {
    throw new Error(`Fallback JSON: HTTP ${response.status}`);
  }
  return await response.json();
}

/**
 * Parseia o CSV em array de objetos, usando a primeira linha como cabeçalho.
 * Faz .trim() nos nomes das colunas para evitar problemas com espaços.
 */
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  // Parsear cabeçalho (primeira linha)
  const headers = parseCSVLine(lines[0]).map(h => h.trim());

  // Criar mapeamento reverso: nome interno → índice da coluna
  const colIndex = {};
  for (const [key, csvName] of Object.entries(COLUMN_MAP)) {
    const idx = headers.findIndex(h =>
      h.toLowerCase() === csvName.toLowerCase()
    );
    colIndex[key] = idx;
  }

  // Parsear cada linha de dados
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const item = {};

    for (const [key, idx] of Object.entries(colIndex)) {
      item[key] = idx >= 0 && idx < values.length
        ? values[idx].trim()
        : '';
    }

    result.push(item);
  }

  return result;
}

/**
 * Parseia uma linha CSV respeitando aspas (campos com vírgula dentro de aspas).
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // pular a segunda aspas
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else if (ch === '\r') {
        // ignorar retorno de carro
      } else {
        current += ch;
      }
    }
  }

  result.push(current);
  return result;
}


// ==========================================
// ===  VALIDAÇÃO E GEOCODIFICAÇÃO        ===
// ==========================================

/**
 * Cache de consultas CEP: Map<cep, { isCohab, bairro, lat, lng } | null>
 * Evita chamadas repetidas ao mesmo CEP.
 */
const cepInfoCache = new Map();

/**
 * Filtra registros válidos e preenche coordenadas faltantes:
 * 1. Valida CEP (deve ser bairro Cohab)
 * 2. Se lat/lng estão vazios, usa coordenadas da BrasilAPI
 * 3. Descarta registros sem CEP válido ou fora da Cohab
 */
async function filterValidRecords(records) {
  const valid = [];

  console.log(`[Jardim Digital] Filtrando ${records.length} registros...`);

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const label = `Registro #${i + 1} (${record.tipo || '?'}, CEP: ${record.cep || '?'})`;

    // 1. Normalizar CEP
    const cep = normalizeCep(record.cep);
    if (!cep) {
      console.log(`[Filtro] ${label} → DESCARTADO: CEP ausente ou inválido`);
      continue;
    }

    // 2. Consultar CEP (BrasilAPI ou ViaCEP) — retorna bairro + coordenadas
    const cepInfo = await lookupCep(cep);
    if (!cepInfo || !cepInfo.isCohab) {
      const bairro = cepInfo ? cepInfo.bairro : '(não encontrado)';
      console.log(`[Filtro] ${label} → DESCARTADO: bairro "${bairro}" não contém "cohab"`);
      continue;
    }

    // 3. Usar coordenadas do CSV se disponíveis, senão da API
    let lat = parseFloat(record.latitude);
    let lng = parseFloat(record.longitude);

    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
      if (cepInfo.lat && cepInfo.lng) {
        lat = cepInfo.lat;
        lng = cepInfo.lng;
        record.latitude = String(lat);
        record.longitude = String(lng);
        console.log(`[Filtro] ${label} → Coordenadas preenchidas pela API: ${lat}, ${lng}`);
      } else {
        console.log(`[Filtro] ${label} → DESCARTADO: sem coordenadas no CSV nem na API`);
        continue;
      }
    }

    console.log(`[Filtro] ${label} → ACEITO ✓ (${lat}, ${lng})`);
    valid.push(record);
  }

  console.log(`[Jardim Digital] ${valid.length} de ${records.length} registros aceitos`);
  return valid;
}

/**
 * Normaliza o CEP removendo caracteres não numéricos.
 * Retorna string de 8 dígitos ou null se inválido.
 */
function normalizeCep(cep) {
  if (!cep) return null;
  const digits = cep.replace(/\D/g, '');
  return digits.length === 8 ? digits : null;
}

/**
 * Consulta informações do CEP: bairro (para validar Cohab) e coordenadas.
 * Tenta BrasilAPI v2 primeiro (retorna lat/lng), cai pra ViaCEP (sem lat/lng).
 * Retorna: { isCohab, bairro, lat, lng } ou null.
 */
async function lookupCep(cep) {
  // Verificar cache
  if (cepInfoCache.has(cep)) {
    return cepInfoCache.get(cep);
  }

  // Tentar BrasilAPI v2 (retorna bairro + coordenadas)
  let result = await tryBrasilApi(cep);

  // Fallback: ViaCEP (só bairro, sem coordenadas)
  if (!result) {
    result = await tryViaCep(cep);
  }

  cepInfoCache.set(cep, result);
  return result;
}

/**
 * Consulta BrasilAPI v2 — retorna bairro + coordenadas.
 * https://brasilapi.com.br/api/cep/v2/{cep}
 */
async function tryBrasilApi(cep) {
  try {
    const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
    if (!response.ok) return null;

    const data = await response.json();

    const bairroNorm = removeAccents((data.neighborhood || '').toLowerCase());
    const isCohab = bairroNorm.includes('cohab');

    // Extrair coordenadas (podem estar em location.coordinates)
    let lat = null, lng = null;
    if (data.location && data.location.coordinates) {
      lat = parseFloat(data.location.coordinates.latitude);
      lng = parseFloat(data.location.coordinates.longitude);
      if (isNaN(lat) || isNaN(lng)) { lat = null; lng = null; }
    }

    console.log(`[BrasilAPI] CEP ${cep}: bairro="${data.neighborhood}", cohab=${isCohab}, coords=${lat},${lng}`);

    return {
      isCohab,
      bairro: data.neighborhood || '',
      lat,
      lng
    };

  } catch (error) {
    console.warn(`[BrasilAPI] Erro ao consultar CEP ${cep}:`, error);
    return null;
  }
}

/**
 * Consulta ViaCEP — retorna só bairro (sem coordenadas).
 * Fallback quando BrasilAPI falha.
 */
async function tryViaCep(cep) {
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.erro) return null;

    const bairroNorm = removeAccents((data.bairro || '').toLowerCase());
    const isCohab = bairroNorm.includes('cohab');

    console.log(`[ViaCEP] CEP ${cep}: bairro="${data.bairro}", cohab=${isCohab}`);

    return {
      isCohab,
      bairro: data.bairro || '',
      lat: null,
      lng: null
    };

  } catch (error) {
    console.warn(`[ViaCEP] Erro ao consultar CEP ${cep}:`, error);
    return null;
  }
}


// ==========================================
// ===      ATUALIZAÇÃO DA UI             ===
// ==========================================

/**
 * Atualiza todos os elementos da UI com os dados filtrados.
 */
function updateUI(data) {
  updateMarkers(data);
  updateCharts(data);
  updateStats(data);
  updateLastRefresh();
}

/**
 * Atualiza o contador de ocorrências no header.
 */
function updateStats(data) {
  const countEl = document.getElementById('stat-count');
  if (countEl) {
    countEl.textContent = data.length;
  }

  // Contar tipos distintos
  const tipos = new Set(data.map(d => d.tipo).filter(Boolean));
  const tiposEl = document.getElementById('stat-tipos');
  if (tiposEl) {
    tiposEl.textContent = tipos.size;
  }
}

/**
 * Atualiza o horário da última atualização no footer.
 */
function updateLastRefresh() {
  const el = document.getElementById('last-update');
  if (el) {
    const now = new Date();
    el.textContent = `Atualizado: ${now.toLocaleTimeString('pt-BR')}`;
  }
}

/**
 * Define o status visual (online/offline).
 */
function setOnlineStatus(online) {
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const offlineBanner = document.getElementById('offline-banner');

  if (statusIndicator) {
    statusIndicator.classList.toggle('status-indicator--offline', !online);
  }

  if (statusText) {
    statusText.textContent = online ? 'Ao vivo' : 'Offline';
  }

  if (offlineBanner) {
    offlineBanner.classList.toggle('offline-banner--visible', !online);
  }
}


// ==========================================
// ===         UTILITÁRIOS                ===
// ==========================================

/**
 * Remove acentos de uma string (normalização Unicode NFD + remoção de diacríticos).
 */
function removeAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Escapa HTML para prevenir XSS em popups.
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Extrai a parte da data (DD/MM/YYYY) de um timestamp "DD/MM/YYYY HH:MM:SS".
 */
function extractDate(timestamp) {
  if (!timestamp) return null;
  const parts = timestamp.split(' ');
  return parts[0] || null;
}

/**
 * Converte uma data no formato "DD/MM/YYYY" para um objeto Date.
 */
function parseDateBR(dateStr) {
  const [d, m, y] = dateStr.split('/').map(Number);
  return new Date(y, m - 1, d);
}
