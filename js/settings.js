  // ---- Settings: dark mode ----
  const DARK_MODE_KEY = 'tideAndTime.darkMode';

  function getSavedDarkMode() {
    try {
      const raw = localStorage.getItem(DARK_MODE_KEY);
      if (raw === 'true') return true;
      if (raw === 'false') return false;
    } catch (e) {}
    return null; // no explicit preference saved yet
  }

  const savedDarkPref = getSavedDarkMode();
  let darkMode = savedDarkPref === null ? true : savedDarkPref; // dark by default until the user picks otherwise

  function applyDarkMode() {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    if (darkModeSwitch) {
      darkModeSwitch.classList.toggle('on', darkMode);
      darkModeSwitch.setAttribute('aria-checked', String(darkMode));
    }
  }

  function setDarkMode(value) {
    darkMode = value;
    try { localStorage.setItem(DARK_MODE_KEY, String(darkMode)); } catch (e) {}
    applyDarkMode();
    // Chart SVGs bake their text/line colors in as JS-generated hex strings (not CSS), so they
    // need a fresh render to pick up the new theme rather than just a CSS variable flip.
    if (weatherData && selectedDateStr) renderForDate(selectedDateStr);
  }

  applyDarkMode();

  settingsBtn.addEventListener('click', () => {
    const wasHidden = settingsPopup.hidden;
    closeAllHeaderPopups();
    if (wasHidden) { updateSettingsToggleUI(); settingsPopup.hidden = false; }
  });
  settingsCloseBtn.addEventListener('click', () => { settingsPopup.hidden = true; });
  darkModeSwitch.addEventListener('click', () => setDarkMode(!darkMode));

  const UNIT_SETTING_VARS = {
    tempUnit: { key: TEMP_UNIT_KEY, get: () => unit, set: v => { unit = v; } },
    pressureUnit: { key: PRESSURE_UNIT_KEY, get: () => pressureUnit, set: v => { pressureUnit = v; } },
    windUnit: { key: WIND_UNIT_KEY, get: () => windUnit, set: v => { windUnit = v; } },
    waveUnit: { key: WAVE_UNIT_KEY, get: () => waveUnit, set: v => { waveUnit = v; } },
  };

  function updateSettingsToggleUI() {
    document.querySelectorAll('.settings-toggle').forEach(group => {
      const cfg = UNIT_SETTING_VARS[group.dataset.setting];
      if (!cfg) return;
      const current = cfg.get();
      group.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.value === current));
    });
  }

  settingsPopup.addEventListener('click', (e) => {
    const btn = e.target.closest('.settings-toggle button');
    if (!btn) return;
    const group = btn.closest('.settings-toggle');
    const cfg = UNIT_SETTING_VARS[group.dataset.setting];
    if (!cfg) return;
    cfg.set(btn.dataset.value);
    try { localStorage.setItem(cfg.key, btn.dataset.value); } catch (err) {}
    updateSettingsToggleUI();
    if (weatherData) renderForDate(selectedDateStr);
  });
