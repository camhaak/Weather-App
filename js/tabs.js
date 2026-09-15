  // ---- Tabs (prototype: Conditions vs. Radar map) ----
  let activeTab = 'weather';

  tabBar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    setActiveTab(btn.dataset.tab);
  });

  // "weather" and "solunar" share the dated content area (#content, rebuilt by renderForDate)
  // via inner #weatherContent/#sunMoonContent wrappers; "wind" also uses it for its current-
  // conditions card (#windContent) but otherwise shows the map, same as "rainfall". The map
  // itself is one shared MapLibre instance (see initRadarMap) — switching between the rainfall
  // and wind tabs just changes which layer it shows, rather than creating a second map.
  function setActiveTab(tab) {
    activeTab = tab;
    tabBar.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    datedContentWrap.hidden = tab === 'rainfall';
    mapSection.hidden = !(tab === 'rainfall' || tab === 'wind');
    const weatherContent = document.getElementById('weatherContent');
    const windContent = document.getElementById('windContent');
    const sunMoonContent = document.getElementById('sunMoonContent');
    if (weatherContent) weatherContent.hidden = tab !== 'weather';
    if (windContent) windContent.hidden = tab !== 'wind';
    if (sunMoonContent) sunMoonContent.hidden = tab !== 'solunar';
    if (tab === 'rainfall' || tab === 'wind') {
      setRadarLayerMode(tab === 'rainfall' ? 'rain' : 'wind');
      initRadarMap();
    }
    // A chart's scroll-to-focus math needs real layout, which a hidden (display:none) element
    // doesn't have — recentering here catches charts that scrolled themselves while their tab
    // was still hidden (e.g. changing date while on the Wind tab redraws all three at once).
    if (tab === 'weather' && weatherData) scrollTrendToFocus(false);
    if (tab === 'solunar' && weatherData) scrollSunMoonToFocus(false);
  }

