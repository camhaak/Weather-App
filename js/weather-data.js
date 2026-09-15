  // ---- Geocoding search ----
  async function searchCity(query) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
    const res = await fetch(url);
    const data = await res.json();
    return data.results || [];
  }

  searchBtn.addEventListener('click', doSearch);
  cityInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  async function doSearch() {
    const q = cityInput.value.trim();
    if (!q) return;
    resultsEl.innerHTML = '<button disabled>Searching…</button>';
    resultsEl.classList.add('show');
    try {
      const matches = await searchCity(q);
      if (matches.length === 0) { resultsEl.innerHTML = '<button disabled>No matches found</button>'; return; }
      resultsEl.innerHTML = '';
      matches.forEach(m => {
        const label = [m.name, m.admin1, m.country].filter(Boolean).join(', ');
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.addEventListener('click', () => {
          resultsEl.classList.remove('show');
          cityInput.value = m.name;
          locationPopup.hidden = true;
          loadLocation(m.latitude, m.longitude, m.name);
        });
        resultsEl.appendChild(btn);
      });
    } catch (err) {
      resultsEl.innerHTML = '<button disabled>Something went wrong. Try again.</button>';
    }
  }

  locateBtn.addEventListener('click', () => {
    if (!navigator.geolocation) { showStatus("Your browser doesn't support location. Try searching instead."); return; }
    showStatus('Finding your location…');
    locationPopup.hidden = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => loadLocation(pos.coords.latitude, pos.coords.longitude, 'Your location'),
      () => showStatus("Couldn't get your location. Try searching for a spot instead.")
    );
  });

  function showStatus(msg) {
    dayPickerWrap.innerHTML = '';
    dayPickerWrap.style.boxShadow = 'none';
    contentEl.innerHTML = `<div class="status">${msg}</div>`;
  }

  function computeSolunar(lat, lon, dayStart) {
    const samples = [];
    for (let m = -360; m <= 24 * 60 + 360; m += 5) {
      const t = new Date(dayStart.getTime() + m * 60000);
      const pos = SunCalc.getMoonPosition(t, lat, lon);
      samples.push({ t, alt: pos.altitude });
    }
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
    const majors = [];
    for (let i = 1; i < samples.length - 1; i++) {
      const { t, alt } = samples[i];
      if (t < dayStart || t > dayEnd) continue;
      const isMax = alt > samples[i - 1].alt && alt > samples[i + 1].alt;
      const isMin = alt < samples[i - 1].alt && alt < samples[i + 1].alt;
      if (isMax || isMin) majors.push({ center: t });
    }
    const moonTimes = SunCalc.getMoonTimes(dayStart, lat, lon);
    const minors = [];
    if (moonTimes.rise) minors.push({ center: moonTimes.rise, label: 'moonrise' });
    if (moonTimes.set) minors.push({ center: moonTimes.set, label: 'moonset' });
    return { majors, minors };
  }

  async function loadLocation(lat, lon, name) {
    lastCoords = { lat, lon, name };
    updateLocationBtnLabel();
    showStatus('Loading conditions…');

    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure` +
      `&hourly=temperature_2m,weather_code,surface_pressure,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
      `&past_days=7&forecast_days=16&temperature_unit=celsius&timezone=auto`;

    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
      `&hourly=wave_height,sea_surface_temperature&past_days=5&forecast_days=8&timezone=auto`;

    try {
      const [forecastRes, marineRes] = await Promise.all([fetch(forecastUrl), fetch(marineUrl).catch(() => null)]);
      if (!forecastRes.ok) throw new Error('forecast failed');
      weatherData = await forecastRes.json();
      marineData = null;
      if (marineRes && marineRes.ok) { try { marineData = await marineRes.json(); } catch (e) { marineData = null; } }
      todayStr = weatherData.current.time.split('T')[0];
      selectedDateStr = todayStr;
      sunMoonCursorTime = new Date(weatherData.current.time); // reset to "now" for whatever spot just loaded
      trendCursorTime = new Date(weatherData.current.time);
      saveLocation({ lat, lon, name });
      buildDayPicker();
      renderForDate(selectedDateStr);
    } catch (err) {
      showStatus("Couldn't load conditions. Check your connection and try again.");
    }
  }

  function buildDayPicker() {
    const dates = weatherData.daily.time;
    const chips = dates.map(d => {
      const isToday = d === todayStr;
      return `<button class="day-chip ${d === selectedDateStr ? 'selected' : ''} ${isToday ? 'is-today' : ''}" data-date="${d}">${chipLabel(d, todayStr)}</button>`;
    }).join('');
    dayPickerWrap.innerHTML = `<div class="day-picker" id="dayPicker">${chips}</div>`;
    document.querySelectorAll('.day-chip').forEach(btn => {
      btn.addEventListener('click', () => selectDate(btn.dataset.date, true));
    });
    // buildDayPicker only runs once per location load, so the strip otherwise sits scrolled to
    // its start (the furthest-back past day) instead of showing today. Align today to the left
    // edge (rather than centering) so the visible chips lead with today and run into the future.
    const picker = document.getElementById('dayPicker');
    const todayChip = document.querySelector(`.day-chip[data-date="${todayStr}"]`);
    if (picker && todayChip) {
      const pickerPadLeft = parseFloat(getComputedStyle(picker).paddingLeft) || 0;
      picker.scrollLeft = Math.max(0, todayChip.offsetLeft - pickerPadLeft);
    }
  }

  // Keeps a cursor's time-of-day but moves its date, so jumping to a new date via the picker
  // lands the chart cursors on "the same time on the new day" instead of an arbitrary moment.
  function withDate(baseTime, dateStr) {
    const hh = String(baseTime.getHours()).padStart(2, '0');
    const mi = String(baseTime.getMinutes()).padStart(2, '0');
    const ss = String(baseTime.getSeconds()).padStart(2, '0');
    return new Date(`${dateStr}T${hh}:${mi}:${ss}`);
  }

  function selectDate(dateStr, scrollChipIntoView) {
    selectedDateStr = dateStr;
    // Move both charts' cursors to the newly selected date, keeping their time-of-day, so they
    // follow the date picker instead of staying parked on whatever day they were on before.
    sunMoonCursorTime = withDate(sunMoonCursorTime || new Date(weatherData.current.time), dateStr);
    trendCursorTime = withDate(trendCursorTime || new Date(weatherData.current.time), dateStr);
    document.querySelectorAll('.day-chip').forEach(b => b.classList.toggle('selected', b.dataset.date === dateStr));
    renderForDate(dateStr, true);
    if (scrollChipIntoView) {
      const chip = document.querySelector(`.day-chip[data-date="${dateStr}"]`);
      centerHorizontally(document.getElementById('dayPicker'), chip, true);
    }
  }

  function shiftDate(delta) {
    const cur = new Date(selectedDateStr + 'T00:00:00');
    cur.setDate(cur.getDate() + delta);
    const newStr = fmtDateStr(cur);
    if (weatherData.daily.time.includes(newStr)) selectDate(newStr, true);
  }

  function findIndexForDateHour(times, dateStr, hh) {
    const exact = `${dateStr}T${hh}`;
    let idx = times.indexOf(exact);
    if (idx !== -1) return idx;
    let best = -1, bestDiff = Infinity;
    const target = new Date(exact);
    times.forEach((t, i) => {
      if (!t.startsWith(dateStr)) return;
      const diff = Math.abs(new Date(t) - target);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    });
    return best;
  }

  // ---- Compute a compact metrics summary for any date (shared by hero panels + compare table) ----
  function computeDayMetrics(dateStr) {
    const isToday = dateStr === todayStr;
    const hourlyTimes = weatherData.hourly.time;

    let repIdx;
    if (isToday) {
      repIdx = hourlyTimes.findIndex(t => t >= weatherData.current.time);
      if (repIdx === -1) repIdx = hourlyTimes.length - 1;
    } else {
      repIdx = findIndexForDateHour(hourlyTimes, dateStr, '12:00');
    }
    if (repIdx === -1) return null;

    const repCode = weatherData.hourly.weather_code[repIdx];
    const repTemp = isToday ? weatherData.current.temperature_2m : weatherData.hourly.temperature_2m[repIdx];
    const desc = describeCode(repCode);

    const pressureNow = isToday ? weatherData.current.surface_pressure : weatherData.hourly.surface_pressure[repIdx];
    const prevDayIdx = repIdx - 24;
    const pressurePrev = prevDayIdx >= 0 ? weatherData.hourly.surface_pressure[prevDayIdx] : null;
    let trend = { label: 'No prior data', cls: 'trend-steady', arrow: '—' };
    if (pressurePrev !== null && pressurePrev !== undefined && pressureNow !== null && pressureNow !== undefined) {
      const diff = pressureNow - pressurePrev;
      if (diff <= -1.5) trend = { label: 'Falling (24h)', cls: 'trend-falling', arrow: '↓' };
      else if (diff >= 1.5) trend = { label: 'Rising (24h)', cls: 'trend-rising', arrow: '↑' };
      else trend = { label: 'Steady (24h)', cls: 'trend-steady', arrow: '→' };
    }

    const windAt = isToday ? weatherData.current.wind_speed_10m : (weatherData.hourly.wind_speed_10m ? weatherData.hourly.wind_speed_10m[repIdx] : null);

    let waterTemp = null, waveHeight = null, marineAvailable = false;
    if (marineData && marineData.hourly) {
      const mTimes = marineData.hourly.time;
      const targetHH = isToday ? (mTimes.find(t => t >= weatherData.current.time) || `${dateStr}T12:00`).split('T')[1] : '12:00';
      const mIdx = findIndexForDateHour(mTimes, dateStr, targetHH);
      if (mIdx !== -1) {
        marineAvailable = true;
        waterTemp = marineData.hourly.sea_surface_temperature ? marineData.hourly.sea_surface_temperature[mIdx] : null;
        waveHeight = marineData.hourly.wave_height ? marineData.hourly.wave_height[mIdx] : null;
      }
    }

    const dailyIdx = weatherData.daily.time.indexOf(dateStr);
    const sunrise = dailyIdx !== -1 ? new Date(weatherData.daily.sunrise[dailyIdx]) : null;
    const sunset = dailyIdx !== -1 ? new Date(weatherData.daily.sunset[dailyIdx]) : null;
    const hi = dailyIdx !== -1 ? weatherData.daily.temperature_2m_max[dailyIdx] : null;
    const lo = dailyIdx !== -1 ? weatherData.daily.temperature_2m_min[dailyIdx] : null;

    const illum = SunCalc.getMoonIllumination(new Date(dateStr + 'T12:00:00'));
    const moonTimesToday = SunCalc.getMoonTimes(new Date(dateStr + 'T00:00:00'), lastCoords.lat, lastCoords.lon);
    const dayStart = new Date(dateStr + 'T00:00:00');
    const solunar = computeSolunar(lastCoords.lat, lastCoords.lon, dayStart);

    return { isToday, repIdx, repTemp, desc, pressureNow, trend, windAt, waterTemp, waveHeight, marineAvailable, sunrise, sunset, hi, lo, illum, moonTimesToday, solunar, dayStart, dailyIdx };
  }

