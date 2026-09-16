  // ---- Cross-cutting wiring: header-popup dismissal, chart info-popups/pointer events shared
  // between both charts, and app bootstrap. Loaded last (after every other file) since the
  // pointer listeners below bind directly to handler functions defined in chart-temp.js and
  // chart-sunmoon.js, and the bootstrap at the bottom calls into weather-data.js. ----

  // Capture phase, not bubble: favorites actions (reorder/delete) rebuild the list's innerHTML
  // synchronously, which detaches the clicked element before a bubble-phase listener would see
  // it — closest('.app-header') on a detached node returns null, wrongly reading as "outside".
  // Capture runs on the way down, before that mutation happens, so the DOM is still intact.
  document.addEventListener('click', (e) => {
    if (e.target.closest('.app-header')) return;
    if (!settingsPopup.hidden) settingsPopup.hidden = true;
    if (!locationPopup.hidden) locationPopup.hidden = true;
  }, true);

  // Center an element within its own horizontally-scrolling container without
  // touching the page's vertical scroll (unlike scrollIntoView, which can drag
  // the whole page down to bring an off-screen ancestor into view).
  function centerHorizontally(container, el, smooth) {
    if (!container || !el) return;
    const target = el.offsetLeft - (container.clientWidth - el.offsetWidth) / 2;
    const left = Math.max(0, target);
    if (smooth) container.scrollTo({ left, behavior: 'smooth' });
    else container.scrollLeft = left;
  }

  // Like centerHorizontally, but leaves `el` near the left edge with just a peek of whatever
  // comes before it, rather than dead-centered — used for the compare table so today's column
  // is always fully in view on load with a sliver of yesterday showing, hinting it scrolls both
  // ways, instead of eating into tomorrow's space to center today for no real benefit.
  function scrollNearStart(container, el, peekPx, smooth) {
    if (!container || !el) return;
    const left = Math.max(0, el.offsetLeft - peekPx);
    if (smooth) container.scrollTo({ left, behavior: 'smooth' });
    else container.scrollLeft = left;
  }

  forgetBtn.addEventListener('click', () => {
    clearSavedLocation();
    lastCoords = null;
    weatherData = null;
    marineData = null;
    cityInput.value = '';
    updateLocationBtnLabel();
    showStatus('Search a spot or use your location to see fishing conditions — past week through the next two.');
  });

  // Delegated so these keep working across every re-render of either chart, not just the first.
  const CHART_INFO_POPUPS = [
    { btn: 'sunMoonInfoBtn', popup: 'sunMoonInfoPopup', close: 'sunMoonInfoCloseBtn' },
    { btn: 'trendInfoBtn', popup: 'trendInfoPopup', close: 'trendInfoCloseBtn' },
  ];
  contentEl.addEventListener('click', (e) => {
    const opened = CHART_INFO_POPUPS.find(({ btn }) => e.target.closest('#' + btn));
    const closed = CHART_INFO_POPUPS.find(({ close }) => e.target.closest('#' + close));
    if (opened || closed) {
      // Mutually exclusive: opening one closes the other, same as the settings/location popups.
      CHART_INFO_POPUPS.forEach(({ popup }) => {
        const popupEl = document.getElementById(popup);
        if (!popupEl) return;
        popupEl.hidden = opened && opened.popup === popup ? !popupEl.hidden : true;
      });
      return;
    }
    CHART_INFO_POPUPS.forEach(({ popup }) => {
      const popupEl = document.getElementById(popup);
      if (popupEl && !popupEl.hidden && !e.target.closest('#' + popup)) popupEl.hidden = true;
    });
    if (e.target.closest('#sunMoonTodayBtn')) { jumpSunMoonToToday(); return; }
    if (e.target.closest('#sunMoonChartWrap')) { handleSunMoonChartClick(e); return; }
    if (e.target.closest('#trendTodayBtn')) { jumpTrendToToday(); return; }
    if (e.target.closest('#trendChartWrap')) handleTrendChartClick(e);
  });
  contentEl.addEventListener('pointerdown', handleSunMoonPointerDown);
  contentEl.addEventListener('pointermove', handleSunMoonPointerMove);
  contentEl.addEventListener('pointerup', handleSunMoonPointerUp);
  contentEl.addEventListener('pointercancel', handleSunMoonPointerUp);
  contentEl.addEventListener('pointerdown', handleTrendPointerDown);
  contentEl.addEventListener('pointermove', handleTrendPointerMove);
  contentEl.addEventListener('pointerup', handleTrendPointerUp);
  contentEl.addEventListener('pointercancel', handleTrendPointerUp);

  // ---- Restore a saved location on load, if any ----
  updateForgetBtn();
  const savedLocation = getSavedLocation();
  if (savedLocation) {
    cityInput.value = savedLocation.name || '';
    loadLocation(savedLocation.lat, savedLocation.lon, savedLocation.name || 'Saved location');
  }
