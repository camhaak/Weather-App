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
  let outlookView = 'daily'; // 'daily' | 'weekly' — toggles the combined hourly/daily-list section

  // Per-chart cursor/scroll/zoom state for the temperature-trend and sun/moon/bite charts. Grouped
  // into one object per chart (rather than ~8 loose globals each) so a shared chart-interaction
  // module can close over "this chart's state" as a single value instead of a pile of getters.
  //   range: '1' | '3' | '7' (days)
  //   cursorTime: Date the user clicked/dragged the cursor to, or null to track "now"
  //   chartMeta: geometry from the most recent chart build, for pointer -> time math
  //   draggingCursor / lastClientX / autoScrollDir / autoScrollSpeed / autoScrollRAF: drag state
  let trendState = {
    range: '1', cursorTime: null, chartMeta: null, draggingCursor: false,
    lastClientX: 0, autoScrollDir: 0, autoScrollSpeed: 0, autoScrollRAF: null,
  };
  let sunMoonState = {
    range: '1', cursorTime: null, chartMeta: null, draggingCursor: false,
    lastClientX: 0, autoScrollDir: 0, autoScrollSpeed: 0, autoScrollRAF: null,
  };
