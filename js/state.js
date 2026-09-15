  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  const cityInput = document.getElementById('cityInput');
  const searchBtn = document.getElementById('searchBtn');
  const locateBtn = document.getElementById('locateBtn');
  const forgetBtn = document.getElementById('forgetBtn');
  const resultsEl = document.getElementById('results');
  const contentEl = document.getElementById('content');
  const dayPickerWrap = document.getElementById('dayPickerWrap');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPopup = document.getElementById('settingsPopup');
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');
  const darkModeSwitch = document.getElementById('darkModeSwitch');
  const locationBtn = document.getElementById('locationBtn');
  const locationBtnLabel = document.getElementById('locationBtnLabel');
  const locationPopup = document.getElementById('locationPopup');
  const locationCloseBtn = document.getElementById('locationCloseBtn');
  const favToggleBtn = document.getElementById('favToggleBtn');
  const favoritesListEl = document.getElementById('favoritesList');
  const tabBar = document.getElementById('tabBar');
  const datedContentWrap = document.getElementById('datedContentWrap');
  const mapSection = document.getElementById('mapSection');

  const SAVED_LOCATION_KEY = 'tideAndTime.savedLocation';

  function getSavedLocation() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVED_LOCATION_KEY));
      if (parsed && typeof parsed.lat === 'number' && typeof parsed.lon === 'number') return parsed;
    } catch (e) {}
    return null;
  }

  function saveLocation(loc) {
    try { localStorage.setItem(SAVED_LOCATION_KEY, JSON.stringify(loc)); } catch (e) {}
    updateForgetBtn();
  }

  function clearSavedLocation() {
    try { localStorage.removeItem(SAVED_LOCATION_KEY); } catch (e) {}
    updateForgetBtn();
  }

  function updateForgetBtn() {
    forgetBtn.style.display = getSavedLocation() ? '' : 'none';
  }

  function updateLocationBtnLabel() {
    locationBtnLabel.textContent = (lastCoords && lastCoords.name) ? lastCoords.name : 'Search location';
  }


  // Generic "was an explicit choice saved?" reader for enum-style unit preferences.
  function getSavedPref(key, validValues, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (validValues.includes(raw)) return raw;
    } catch (e) {}
    return fallback;
  }

  const TEMP_UNIT_KEY = 'tideAndTime.tempUnit';
  const PRESSURE_UNIT_KEY = 'tideAndTime.pressureUnit';
  const WIND_UNIT_KEY = 'tideAndTime.windUnit';
  const WAVE_UNIT_KEY = 'tideAndTime.waveUnit';

  let unit = getSavedPref(TEMP_UNIT_KEY, ['celsius', 'fahrenheit'], 'celsius');
  let pressureUnit = getSavedPref(PRESSURE_UNIT_KEY, ['hpa', 'inhg'], 'hpa');
  let windUnit = getSavedPref(WIND_UNIT_KEY, ['kmh', 'mph', 'kn'], 'kmh');
  let waveUnit = getSavedPref(WAVE_UNIT_KEY, ['m', 'ft'], 'm');
  let lastCoords = null;
  let weatherData = null;
  let marineData = null;
  let todayStr = null;
  let selectedDateStr = null;
  let trendRange = '1'; // '1' | '3' | '7'
  let outlookView = 'daily'; // 'daily' | 'weekly' — toggles the combined hourly/daily-list section
  let sunMoonRange = '1'; // '1' | '3' | '7'
  let sunMoonCursorTime = null; // Date the user clicked/dragged on the sun/moon chart, or null to track "now"
  let sunMoonChartMeta = null; // { wStartMs, wEndMs, pph } from the most recent chart build, for pointer -> time math
  let draggingSunMoonCursor = false;
  let sunMoonLastClientX = 0;
  let sunMoonAutoScrollDir = 0; // -1 (left), 0 (none), 1 (right)
  let sunMoonAutoScrollSpeed = 0;
  let sunMoonAutoScrollRAF = null;
  let trendCursorTime = null; // Date the user clicked/dragged on the temperature chart, or null to track "now"
  let trendChartMeta = null; // { wStartMs, wEndMs, pph, minV, maxV, plotTop, plotH, pts } from the most recent chart build
  let draggingTrendCursor = false;
  let trendLastClientX = 0;
  let trendAutoScrollDir = 0;
  let trendAutoScrollSpeed = 0;
  let trendAutoScrollRAF = null;
