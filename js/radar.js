  // ---- Radar/wind map (prototype) ----
  // Rain radar: RainViewer's free public tile API — real, live, no key required.
  // Wind: no free live *gridded* wind API is reachable from the browser, so this builds a coarse
  // grid itself from Open-Meteo's multi-point forecast endpoint (one request, ~11x11 points
  // around the map center) and animates it with the classic "wind map" particle-advection
  // technique. A real product would replace this with a backend that decodes a proper model
  // (e.g. GFS) into a finer grid — this is just enough to judge whether the visual technique is
  // worth building on. Both layers can step/play back through recent frames to show a trend.
  let radarMap = null;
  let radarLayerMode = 'rain';
  let windGrid = null; // the CURRENTLY DISPLAYED grid: { nx, ny, la1, la2, lo1, lo2, u, v, timeMs }
  let windGridBounds = null; // { center:{lat,lon}, span } the last-fetched grid's coverage
  let windGridFetchInFlight = false;
  let windGridLastFetchAt = 0;
  let windParticles = [];
  let windAnimRAF = null;
  const WIND_PARTICLE_COUNT = 1200;
  const WIND_GRID_SIZE = 11;

  let rainHost = '';
  let rainFrames = []; // [{ timeMs, path }] oldest -> newest, ~last 90 minutes
  let windFrames = []; // [{ ...grid fields, timeMs }] oldest -> newest: 2h ago, 1h ago, now
  let radarFrameIndex = 0;
  let radarFramePlaying = true;
  let radarFrameTimer = null;

  let inspectorMarker = null;
  let inspectorPopup = null; // shared by both the tap-inspector and favorite-pin popups — only one open at a time
  let favoriteMarkers = []; // [{ marker, el, fav, data }]

  // Free-tier key, currently unsecured (fine for local testing per MapTiler's own guidance —
  // see docs.maptiler.com/guides/.../how-to-protect-your-map-key). Add this domain to the key's
  // "Allowed HTTP origins" in the MapTiler dashboard once this is actually deployed somewhere.
  const MAPTILER_KEY = 'orzmpfAPTl3zFLKzlriw';

  function initRadarMap() {
    if (radarMap) { radarMap.resize(); return; }
    if (typeof maplibregl === 'undefined') {
      document.getElementById('radarStatus').textContent = 'Map library failed to load.';
      return;
    }
    const start = currentRadarCenter();
    // "backdrop-dark" — MapTiler's minimal data-overlay basemap. Compared side-by-side against
    // dataviz-dark/streets-v2-dark/basic-v2-dark, this one recedes into the background best,
    // which is what a radar/wind overlay actually needs (the busier street-map styles compete
    // with the overlay colors instead of setting them off).
    radarMap = new maplibregl.Map({
      container: 'radarMap',
      style: `https://api.maptiler.com/maps/backdrop-dark/style.json?key=${MAPTILER_KEY}`,
      center: [start.lon, start.lat],
      zoom: 7,
    });
    radarMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    radarMap.on('load', () => {
      loadRainRadar();
      loadWindGrid(start, spanForZoom(radarMap.getZoom()));
      renderFavoriteMapPins();
      positionWindCanvas();
      setRadarLayerMode(radarLayerMode);
    });
    radarMap.on('resize', positionWindCanvas);
    radarMap.on('movestart', clearWindCanvas);
    radarMap.on('moveend', handleRadarMapMoveEnd);
    radarMap.on('click', (e) => showInspectorAt(e.lngLat.lat, e.lngLat.lng));
  }

  function currentRadarCenter() {
    if (radarMap) { const c = radarMap.getCenter(); return { lat: c.lat, lon: c.lng }; }
    return lastCoords || { lat: -33.8688, lon: 151.2093 };
  }

  // Keeps the wind grid a bit larger than whatever's on screen at any zoom level, coarser the
  // further out the user is — a rough stand-in for a real "detail scales with zoom" policy.
  function spanForZoom(zoom) {
    if (zoom >= 9) return 1.2;
    if (zoom >= 7) return 3;
    if (zoom >= 5) return 7;
    return 15;
  }

  // Refetches the wind grid when the map has panned/zoomed far enough that the cached grid no
  // longer comfortably covers the view. Rain doesn't need this — RainViewer's tiles are served
  // per-tile from a single global composite, so panning just requests more tiles as normal.
  function handleRadarMapMoveEnd() {
    if (windGridFetchInFlight || Date.now() - windGridLastFetchAt < 4000) return;
    const center = currentRadarCenter();
    const span = spanForZoom(radarMap.getZoom());
    const prev = windGridBounds;
    const movedFar = !prev || Math.hypot(prev.center.lat - center.lat, prev.center.lon - center.lon) > prev.span * 0.6;
    const spanChanged = !prev || Math.abs(prev.span - span) > 0.5;
    if (movedFar || spanChanged) loadWindGrid(center, span);
  }

  function currentFrameList() { return radarLayerMode === 'rain' ? rainFrames : windFrames; }

  function setupFrameSlider() {
    const slider = document.getElementById('radarFrameSlider');
    if (!slider) return;
    const frames = currentFrameList();
    slider.max = String(Math.max(0, frames.length - 1));
  }

  // Shared by both layers: moves to frame `idx` in whichever list is active, updating either the
  // rain tile source or the live wind grid the particle animation reads from.
  function applyRadarFrame(idx) {
    const frames = currentFrameList();
    if (!frames.length) return;
    radarFrameIndex = Math.max(0, Math.min(frames.length - 1, idx));
    const frame = frames[radarFrameIndex];
    if (radarLayerMode === 'rain') {
      const tileUrl = `${rainHost}${frame.path}/512/{z}/{x}/{y}/2/1_1.png`;
      if (radarMap.getSource('rain')) {
        radarMap.getSource('rain').setTiles([tileUrl]);
      } else {
        // maxzoom caps requests at RainViewer's real ceiling (z7) — past that, MapLibre smoothly
        // over-scales the last tile instead of requesting an invalid zoom (which RainViewer answers
        // with a "Zoom Level Not Supported" placeholder image baked right into the tile).
        radarMap.addSource('rain', { type: 'raster', tiles: [tileUrl], tileSize: 512, maxzoom: 7 });
        radarMap.addLayer({ id: 'rain-layer', type: 'raster', source: 'rain', paint: { 'raster-opacity': 0.9 } });
      }
    } else {
      windGrid = frame;
    }
    const slider = document.getElementById('radarFrameSlider');
    if (slider) slider.value = String(radarFrameIndex);
    updateFrameLabel();
  }

  function updateFrameLabel() {
    const label = document.getElementById('radarFrameLabel');
    if (!label) return;
    const frames = currentFrameList();
    const frame = frames[radarFrameIndex];
    if (!frame) { label.textContent = ''; return; }
    if (radarFrameIndex === frames.length - 1) { label.textContent = 'Now'; return; }
    const minsAgo = Math.round((Date.now() - frame.timeMs) / 60000);
    label.textContent = minsAgo < 60 ? `${minsAgo} min ago` : `${Math.round(minsAgo / 60)}h ago`;
  }

  function startRadarPlayback() {
    radarFramePlaying = true;
    updatePlayButton();
    if (radarFrameTimer) clearInterval(radarFrameTimer);
    radarFrameTimer = setInterval(() => {
      const frames = currentFrameList();
      if (!frames.length) return;
      applyRadarFrame(radarFrameIndex + 1 >= frames.length ? 0 : radarFrameIndex + 1);
    }, 700);
  }

  function pauseRadarPlayback() {
    radarFramePlaying = false;
    if (radarFrameTimer) { clearInterval(radarFrameTimer); radarFrameTimer = null; }
    updatePlayButton();
  }

  function updatePlayButton() {
    const btn = document.getElementById('radarPlayBtn');
    if (!btn) return;
    btn.textContent = radarFramePlaying ? '⏸' : '▶';
    btn.setAttribute('aria-label', radarFramePlaying ? 'Pause' : 'Play');
  }

  document.getElementById('radarPlayBtn').addEventListener('click', () => {
    if (radarFramePlaying) pauseRadarPlayback(); else startRadarPlayback();
  });
  document.getElementById('radarFrameSlider').addEventListener('input', (e) => {
    pauseRadarPlayback();
    applyRadarFrame(parseInt(e.target.value, 10));
  });

  async function loadRainRadar() {
    try {
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      const data = await res.json();
      const allPast = (data.radar && data.radar.past) || [];
      if (!allPast.length) throw new Error('no radar frames');
      rainHost = data.host;
      // RainViewer frames land roughly every 10 minutes — keep about the last 90 of them.
      rainFrames = allPast.slice(-9).map(f => ({ timeMs: f.time * 1000, path: f.path }));
      if (radarLayerMode === 'rain') {
        setupFrameSlider();
        applyRadarFrame(rainFrames.length - 1);
      }
    } catch (e) {
      rainFrames = [];
    }
    updateRadarStatus();
  }

  function utcDateStr(d) { return d.toISOString().slice(0, 10); }
  function utcHourStr(d) { return String(d.getUTCHours()).padStart(2, '0') + ':00'; }

  async function loadWindGrid(center, span) {
    if (windGridFetchInFlight) return;
    windGridFetchInFlight = true;
    windGridLastFetchAt = Date.now();
    const n = WIND_GRID_SIZE;
    const lats = [], lons = [];
    for (let i = 0; i < n; i++) {
      const la = center.lat + span - (i * (2 * span) / (n - 1));
      for (let j = 0; j < n; j++) {
        lats.push(la.toFixed(3));
        lons.push((center.lon - span + (j * (2 * span) / (n - 1))).toFixed(3));
      }
    }
    // No timezone param (defaults to UTC/GMT) so the hourly timestamps below can be matched
    // against plain UTC math, regardless of which timezone the map happens to be centered over.
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}` +
      `&current=wind_speed_10m,wind_direction_10m&hourly=wind_speed_10m,wind_direction_10m` +
      `&past_days=1&forecast_days=1&wind_speed_unit=ms`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [data];
      if (list.length !== n * n) throw new Error('unexpected grid response shape');
      const now = new Date();
      const frames = [2, 1, 0].map(hoursAgo => { // oldest -> newest
        const frameTime = new Date(now.getTime() - hoursAgo * 3600000);
        const wantedTime = hoursAgo === 0 ? null : `${utcDateStr(frameTime)}T${utcHourStr(frameTime)}`;
        const u = new Float32Array(n * n), v = new Float32Array(n * n);
        list.forEach((pt, idx) => {
          let speed, dirDeg;
          if (hoursAgo === 0) {
            speed = pt.current.wind_speed_10m;
            dirDeg = pt.current.wind_direction_10m;
          } else {
            const hIdx = pt.hourly.time.indexOf(wantedTime);
            speed = hIdx !== -1 ? pt.hourly.wind_speed_10m[hIdx] : pt.current.wind_speed_10m;
            dirDeg = hIdx !== -1 ? pt.hourly.wind_direction_10m[hIdx] : pt.current.wind_direction_10m;
          }
          const rad = dirDeg * Math.PI / 180;
          // Meteorological direction is "from", so the velocity vector points the opposite way.
          u[idx] = -speed * Math.sin(rad);
          v[idx] = -speed * Math.cos(rad);
        });
        return {
          nx: n, ny: n,
          la1: center.lat + span, la2: center.lat - span, lo1: center.lon - span, lo2: center.lon + span,
          u, v, timeMs: frameTime.getTime(),
        };
      });
      const hadNoParticlesYet = windParticles.length === 0;
      windFrames = frames;
      windGridBounds = { center, span };
      if (radarLayerMode === 'wind') {
        setupFrameSlider();
        applyRadarFrame(windFrames.length - 1);
      } else {
        windGrid = windFrames[windFrames.length - 1];
      }
      if (hadNoParticlesYet) resetWindParticles();
      if (radarLayerMode === 'wind' && !windAnimRAF) windAnimRAF = requestAnimationFrame(windAnimStep);
    } catch (e) {
      if (!windFrames.length) windGrid = null;
    }
    windGridFetchInFlight = false;
    updateRadarStatus();
  }

  function windGridSample(lat, lon) {
    if (!windGrid) return null;
    const { nx, ny, la1, la2, lo1, lo2, u, v } = windGrid;
    if (lat > la1 || lat < la2 || lon < lo1 || lon > lo2) return null;
    const x = (lon - lo1) / (lo2 - lo1) * (nx - 1);
    const y = (la1 - lat) / (la1 - la2) * (ny - 1);
    const x0 = Math.floor(x), x1 = Math.min(nx - 1, x0 + 1);
    const y0 = Math.floor(y), y1 = Math.min(ny - 1, y0 + 1);
    const fx = x - x0, fy = y - y0;
    const idx = (xx, yy) => yy * nx + xx;
    const lerp = (a, b, t) => a + (b - a) * t;
    const uTop = lerp(u[idx(x0, y0)], u[idx(x1, y0)], fx), uBot = lerp(u[idx(x0, y1)], u[idx(x1, y1)], fx);
    const vTop = lerp(v[idx(x0, y0)], v[idx(x1, y0)], fx), vBot = lerp(v[idx(x0, y1)], v[idx(x1, y1)], fx);
    return { u: lerp(uTop, uBot, fy), v: lerp(vTop, vBot, fy) };
  }

  function spawnParticle() {
    if (!windGrid) return { lng: 0, lat: 0, age: 0 };
    return {
      lng: windGrid.lo1 + Math.random() * (windGrid.lo2 - windGrid.lo1),
      lat: windGrid.la2 + Math.random() * (windGrid.la1 - windGrid.la2),
      age: Math.random() * 60,
    };
  }

  function resetWindParticles() {
    windParticles = Array.from({ length: WIND_PARTICLE_COUNT }, spawnParticle);
  }

  function positionWindCanvas() {
    const canvas = document.getElementById('windCanvas');
    const mapDiv = document.getElementById('radarMap');
    if (!canvas || !mapDiv) return;
    const rect = mapDiv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clearWindCanvas() {
    const canvas = document.getElementById('windCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  const WIND_STEP_SECONDS = 25; // exaggerated for visual clarity, not real-time physical accuracy
  const WIND_MAX_AGE = 400; // frames a particle lives before respawning — needs to be long enough
                             // to build a visible streak even in light wind

  function windAnimStep() {
    const canvas = document.getElementById('windCanvas');
    if (!canvas || !radarMap || radarLayerMode !== 'wind' || !windGrid) { windAnimRAF = null; return; }
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.width / dpr, cssH = canvas.height / dpr;

    // Fade existing trails instead of clearing, by scaling down their alpha — the standard
    // "wind map" look, cheap to do since the canvas has a transparent background.
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = 'rgba(0,0,0,0.90)';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.globalCompositeOperation = 'source-over';

    const metersPerDegLat = 111320;
    const segments = [];
    windParticles.forEach(p => {
      const sample = windGridSample(p.lat, p.lng);
      p.age++;
      if (!sample || p.age > WIND_MAX_AGE) {
        Object.assign(p, spawnParticle());
        return;
      }
      const prevPt = radarMap.project([p.lng, p.lat]);
      const metersPerDegLon = metersPerDegLat * Math.cos(p.lat * Math.PI / 180);
      p.lng += (sample.u * WIND_STEP_SECONDS) / metersPerDegLon;
      p.lat += (sample.v * WIND_STEP_SECONDS) / metersPerDegLat;
      const newPt = radarMap.project([p.lng, p.lat]);
      segments.push([prevPt.x, prevPt.y, newPt.x, newPt.y]);
    });

    // Two passes — a wider dark halo, then the thin bright stroke — so the streaks stay legible
    // over both light and dark patches of a real, colorful basemap.
    [{ color: 'rgba(8,12,26,0.55)', width: 3.6 }, { color: '#22D3EE', width: 1.5 }].forEach(({ color, width }) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      segments.forEach(([x1, y1, x2, y2]) => { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); });
      ctx.stroke();
    });

    windAnimRAF = requestAnimationFrame(windAnimStep);
  }

  // Driven by setActiveTab (the Rainfall/Wind tab selection) now, rather than a toggle of its own.
  function setRadarLayerMode(mode) {
    radarLayerMode = mode;
    const canvas = document.getElementById('windCanvas');
    if (canvas) canvas.style.display = mode === 'wind' ? 'block' : 'none';
    if (radarMap && radarMap.getLayer('rain-layer')) {
      radarMap.setLayoutProperty('rain-layer', 'visibility', mode === 'rain' ? 'visible' : 'none');
    }
    const frames = currentFrameList();
    setupFrameSlider();
    if (frames.length) applyRadarFrame(frames.length - 1);
    if (mode === 'wind' && windGrid && !windAnimRAF) windAnimRAF = requestAnimationFrame(windAnimStep);
    if (radarFramePlaying) startRadarPlayback(); // restart the ticking loop against the new mode's frame list
    updateRadarStatus();
    updateRadarLegend();
  }

  function updateRadarStatus() {
    const statusEl = document.getElementById('radarStatus');
    if (!statusEl) return;
    statusEl.textContent = radarLayerMode === 'rain'
      ? (rainFrames.length ? 'Live radar · RainViewer' : 'Loading radar…')
      : (windFrames.length ? 'Live wind · Open-Meteo (coarse grid)' : 'Loading wind data…');
  }

  function updateRadarLegend() {
    const legendEl = document.getElementById('radarLegend');
    if (!legendEl) return;
    legendEl.innerHTML = radarLayerMode === 'rain'
      ? `<span class="legend-item"><span class="legend-dot" style="background:#4C9F94;"></span>Light rain</span>
         <span class="legend-item"><span class="legend-dot" style="background:#E3A857;"></span>Moderate</span>
         <span class="legend-item"><span class="legend-dot" style="background:#C4633F;"></span>Heavy</span>`
      : `<span class="legend-item"><span class="legend-dot" style="background:${chartTheme().text};"></span>Wind flow (streaks show speed &amp; direction)</span>`;
  }

  // ---- Tap-to-inspect + favorite pins on the radar map ----
  // Both reuse the same plain Open-Meteo point forecast the rest of the app already runs on —
  // no new data source, and this doesn't touch the MapTiler session/request quota at all.
  function compassDir(deg) {
    if (deg === null || deg === undefined || isNaN(deg)) return '';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  }

  // "Now" expressed in a location's own local calendar day — needed for the daily rainfall
  // total, which Open-Meteo aggregates per local day (via timezone=auto), not per UTC day.
  function localNowParts(utcOffsetSeconds) {
    const shifted = new Date(Date.now() + (utcOffsetSeconds || 0) * 1000);
    return { dateStr: shifted.toISOString().slice(0, 10), hourStr: String(shifted.getUTCHours()).padStart(2, '0') + ':00' };
  }

  // Open-Meteo's hourly array (forecast_days=1, timezone=auto, no past_days) always starts at
  // that location's local midnight for today — confirmed empirically — so "rain fallen so far"
  // is just the running total from index 0 through the current hour, not the whole-day forecast
  // total (which is what daily.precipitation_sum would give, future hours included).
  function sumRainfallSoFar(hourlyPrecip, hIdx) {
    if (!hourlyPrecip || hIdx < 0) return null;
    let sum = 0;
    for (let i = 0; i <= hIdx; i++) sum += hourlyPrecip[i] || 0;
    return sum;
  }

  async function fetchSpotConditions(lat, lon) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
        `&current=precipitation,wind_speed_10m,wind_direction_10m&hourly=precipitation,precipitation_probability` +
        `&forecast_days=1&timezone=auto`;
      const res = await fetch(url);
      const data = await res.json();
      const { dateStr, hourStr } = localNowParts(data.utc_offset_seconds);
      const hIdx = data.hourly ? data.hourly.time.indexOf(`${dateStr}T${hourStr}`) : -1;
      return {
        precipNow: data.current.precipitation,
        windSpeedKmh: data.current.wind_speed_10m,
        windDirDeg: data.current.wind_direction_10m,
        precipProbability: hIdx !== -1 ? data.hourly.precipitation_probability[hIdx] : null,
        rainSoFar: sumRainfallSoFar(data.hourly && data.hourly.precipitation, hIdx),
      };
    } catch (e) {
      return null;
    }
  }

  function spotPopupHtml(name, data) {
    if (!data) return `<div class="cursor-time">${name}</div><div class="cursor-row">Loading…</div>`;
    const rainText = (data.precipProbability !== null && data.precipProbability !== undefined)
      ? `${Math.round(data.precipProbability)}% chance` + (data.precipNow > 0 ? ` · ${data.precipNow.toFixed(1)}mm now` : '')
      : '--';
    const soFarText = data.rainSoFar != null ? `${data.rainSoFar.toFixed(1)}mm so far` : '--';
    const windText = `${fmtWind(data.windSpeedKmh)}${windUnitLabel()} ${compassDir(data.windDirDeg)}`;
    return `
      <div class="cursor-time">${name}</div>
      <div class="cursor-row"><strong>Rain</strong>&nbsp;${rainText}</div>
      <div class="cursor-row"><strong>Today</strong>&nbsp;${soFarText}</div>
      <div class="cursor-row"><strong>Wind</strong>&nbsp;${windText}</div>
    `;
  }

  function favoriteMarkerHtml(name, data) {
    const stats = data
      ? `${data.precipProbability != null ? Math.round(data.precipProbability) + '%' : '--'} · ${fmtWind(data.windSpeedKmh)}${windUnitLabel()} ${compassDir(data.windDirDeg)}`
      : 'Loading…';
    const soFarLine = data && data.rainSoFar != null ? `<div class="pin-stats">${data.rainSoFar.toFixed(1)}mm so far today</div>` : '';
    return `<div class="pin-label"><div class="pin-name">${name}</div><div class="pin-stats">${stats}</div>${soFarLine}</div><div class="pin-dot"></div>`;
  }

  // Only one popup open at a time, whether it came from a raw tap or a favorite pin.
  function openSpotPopup(lat, lon, name, data, isInspector) {
    if (inspectorPopup) inspectorPopup.remove();
    inspectorPopup = new maplibregl.Popup({ closeButton: true, offset: 16, className: 'spot-popup' })
      .setLngLat([lon, lat])
      .setHTML(spotPopupHtml(name, data))
      .addTo(radarMap);
    if (isInspector) {
      inspectorPopup.on('close', () => { if (inspectorMarker) inspectorMarker.remove(); });
    }
  }

  async function showInspectorAt(lat, lon) {
    if (!radarMap) return;
    if (!inspectorMarker) {
      const el = document.createElement('div');
      el.className = 'spot-marker spot-marker-inspector';
      inspectorMarker = new maplibregl.Marker({ element: el });
    }
    inspectorMarker.setLngLat([lon, lat]).addTo(radarMap);
    openSpotPopup(lat, lon, 'Dropped pin', null, true);
    const data = await fetchSpotConditions(lat, lon);
    if (inspectorPopup) inspectorPopup.setHTML(spotPopupHtml('Dropped pin', data));
  }

  function clearFavoriteMarkers() {
    favoriteMarkers.forEach(entry => entry.marker.remove());
    favoriteMarkers = [];
  }

  // Shows every favorite with showOnMap !== false as its own pin+label, batching all of them
  // into a single Open-Meteo request (same multi-location trick the wind grid already uses)
  // rather than one request per favorite.
  async function renderFavoriteMapPins() {
    if (!radarMap) return;
    clearFavoriteMarkers();
    const shown = favorites.filter(f => f.showOnMap !== false);
    if (!shown.length) return;

    shown.forEach(f => {
      const el = document.createElement('div');
      el.className = 'spot-marker spot-marker-favorite';
      el.innerHTML = favoriteMarkerHtml(f.name, null);
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([f.lon, f.lat]).addTo(radarMap);
      const entry = { marker, el, fav: f, data: null };
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        openSpotPopup(f.lat, f.lon, f.name, entry.data);
      });
      favoriteMarkers.push(entry);
    });

    const lats = shown.map(f => f.lat.toFixed(4)).join(',');
    const lons = shown.map(f => f.lon.toFixed(4)).join(',');
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
        `&current=precipitation,wind_speed_10m,wind_direction_10m&hourly=precipitation,precipitation_probability` +
        `&forecast_days=1&timezone=auto`;
      const res = await fetch(url);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [data];
      list.forEach((pt, i) => {
        const entry = favoriteMarkers[i];
        if (!entry || !pt || !pt.current) return;
        const { dateStr, hourStr } = localNowParts(pt.utc_offset_seconds);
        const hIdx = pt.hourly ? pt.hourly.time.indexOf(`${dateStr}T${hourStr}`) : -1;
        entry.data = {
          precipNow: pt.current.precipitation,
          windSpeedKmh: pt.current.wind_speed_10m,
          windDirDeg: pt.current.wind_direction_10m,
          precipProbability: hIdx !== -1 ? pt.hourly.precipitation_probability[hIdx] : null,
          rainSoFar: sumRainfallSoFar(pt.hourly && pt.hourly.precipitation, hIdx),
        };
        entry.el.innerHTML = favoriteMarkerHtml(entry.fav.name, entry.data);
      });
    } catch (e) {
      // markers keep their "Loading…" placeholder — acceptable, and rare given this reuses the
      // same free endpoint the rest of the app already depends on
    }
  }

