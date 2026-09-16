  // ---- Weather code -> description + glyph ----
  function describeCode(code) {
    if (code === 0) return { text: 'Clear sky', kind: 'sun' };
    if ([1, 2].includes(code)) return { text: 'Partly cloudy', kind: 'cloud-sun' };
    if (code === 3) return { text: 'Overcast', kind: 'cloud' };
    if ([45, 48].includes(code)) return { text: 'Foggy', kind: 'fog' };
    if ([51, 53, 55, 56, 57].includes(code)) return { text: 'Drizzle', kind: 'rain' };
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { text: 'Rain', kind: 'rain' };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { text: 'Snow', kind: 'snow' };
    if ([95, 96, 99].includes(code)) return { text: 'Thunderstorm', kind: 'storm' };
    return { text: 'Unknown', kind: 'cloud' };
  }

  function glyphFor(kind, color) {
    const c = color || 'currentColor';
    switch (kind) {
      case 'sun': return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke-linecap="round"/></svg>`;
      case 'cloud-sun': return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6"><circle cx="8" cy="9" r="3.2"/><path d="M8 2.5v2M13.5 4.5l-1.4 1.4M2.5 9h2" stroke-linecap="round"/><path d="M6 20h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.7A3.8 3.8 0 0 0 6 20Z"/></svg>`;
      case 'cloud': return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6"><path d="M6 18h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.7A3.8 3.8 0 0 0 6 18Z"/></svg>`;
      case 'rain': return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6"><path d="M6 14h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.7A3.8 3.8 0 0 0 6 14Z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" stroke-linecap="round"/></svg>`;
      case 'snow': return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6"><path d="M6 13h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.7A3.8 3.8 0 0 0 6 13Z"/><path d="M9 18v4M9 19l-1.5 1M9 19l1.5 1M15 18v4M15 19l-1.5 1M15 19l1.5 1" stroke-linecap="round"/></svg>`;
      case 'storm': return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6"><path d="M6 12h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.7A3.8 3.8 0 0 0 6 12Z"/><path d="M13 15l-3 5h3l-2 4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      case 'fog': return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6"><path d="M4 9h13M4 13h16M4 17h11" stroke-linecap="round"/></svg>`;
      default: return '';
    }
  }

  function sunGlyph(color) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6"><circle cx="12" cy="14" r="4.5"/><path d="M12 2v2.5M4 14H2M22 14h-2M5.6 6.6l1.6 1.6M18.4 6.6l-1.6 1.6M4 20h16" stroke-linecap="round"/></svg>`;
  }

  function moonPhaseGlyph(phase, color, shadow, size) {
    const r = (size || 30) / 2 - 2, c = (size || 30) / 2;
    const angle = phase * 2 * Math.PI;
    const rx = Math.abs(Math.cos(angle)) * r;
    const waxing = phase < 0.5;
    const sweep1 = waxing ? 1 : 0;
    const sweep2 = waxing ? 0 : 1;
    return `<svg viewBox="0 0 ${size || 30} ${size || 30}">
      <circle cx="${c}" cy="${c}" r="${r}" fill="${shadow}"/>
      <path d="M ${c} ${c - r} A ${rx} ${r} 0 0 ${sweep1} ${c} ${c + r} A ${r} ${r} 0 0 ${sweep2} ${c} ${c - r} Z" fill="${color}"/>
    </svg>`;
  }

  function moonPhaseName(phase) {
    if (phase < 0.03 || phase > 0.97) return 'New Moon';
    if (phase < 0.22) return 'Waxing Crescent';
    if (phase < 0.28) return 'First Quarter';
    if (phase < 0.47) return 'Waxing Gibbous';
    if (phase < 0.53) return 'Full Moon';
    if (phase < 0.72) return 'Waning Gibbous';
    if (phase < 0.78) return 'Last Quarter';
    return 'Waning Crescent';
  }

  function heroColorsFor(kind) {
    if (kind === 'sun' || kind === 'cloud-sun') return { bg: '#3A3054', accent: '#E3A857' };
    if (kind === 'rain' || kind === 'storm') return { bg: '#1C2541', accent: '#4C9F94' };
    if (kind === 'snow') return { bg: '#2B3A55', accent: '#F5F3EE' };
    return { bg: '#1C2541', accent: '#6B7A99' };
  }

  function fmtTemp(c) {
    if (c === null || c === undefined || isNaN(c)) return '--';
    const v = unit === 'celsius' ? c : (c * 9 / 5 + 32);
    return Math.round(v) + '°';
  }

  // Underlying data always arrives in hPa/km/h/metres (Open-Meteo's defaults) — these only
  // affect how it's displayed, never the trend classification or bite-effectiveness math,
  // which stay in native units regardless of what the user has chosen to see.
  function fmtPressure(hpa) {
    if (hpa === null || hpa === undefined || isNaN(hpa)) return '--';
    return pressureUnit === 'inhg' ? (hpa * 0.0295299831).toFixed(2) : Math.round(hpa).toString();
  }
  function pressureUnitLabel() { return pressureUnit === 'inhg' ? 'inHg' : 'hPa'; }

  function fmtWind(kmh) {
    if (kmh === null || kmh === undefined || isNaN(kmh)) return '--';
    const v = windUnit === 'mph' ? kmh * 0.6213712 : windUnit === 'kn' ? kmh * 0.5399568 : kmh;
    return Math.round(v).toString();
  }
  function windUnitLabel() { return windUnit === 'mph' ? 'mph' : windUnit === 'kn' ? 'kt' : 'km/h'; }

  function fmtWave(m) {
    if (m === null || m === undefined || isNaN(m)) return '--';
    const v = waveUnit === 'ft' ? m * 3.2808399 : m;
    return v.toFixed(1);
  }
  function waveUnitLabel() { return waveUnit === 'ft' ? 'ft' : 'm'; }

  function clockLabel(d) {
    if (!d) return '--';
    let h = d.getHours(), m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
  }

  // Compact clock format with am/pm spelled out (e.g. "9:15am") — used anywhere space is tight
  // (chart axis labels, the compare table) but "9:15a" would read ambiguously.
  function shortClockWords(d) {
    if (!d) return '--';
    let h = d.getHours(), m = d.getMinutes();
    const ap = h >= 12 ? 'pm' : 'am';
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${m.toString().padStart(2, '0')}${ap}`;
  }

  function minutesOfDay(d) { return d.getHours() * 60 + d.getMinutes(); }

  function fmtDateStr(d) {
    const y = d.getFullYear(), m = (d.getMonth() + 1).toString().padStart(2, '0'), day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function chipLabel(dateStr, todayS) {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date(todayS + 'T00:00:00');
    const diffDays = Math.round((d - today) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
  }

  // Chart SVGs are generated as raw hex strings in JS, so they can't pick up CSS variables —
  // these are the handful of colors that genuinely need to flip in dark mode (navy text/lines
  // have poor contrast on a dark panel; white dot outlines need a dark one instead). Saturated
  // data colors (gold/teal/slate-blue accents) read fine unchanged in both themes. Lives here
  // rather than in either chart file since both charts (and render.js, radar.js) call it.
  function chartTheme() {
    return darkMode
      ? { text: '#E9ECF5', divider: '#333F5C', faintDivider: '#2A3350', dotStroke: '#1B2136', horizon: '#4A5878' }
      : { text: '#1C2541', divider: '#DDD8CC', faintDivider: '#EEEAE0', dotStroke: '#fff', horizon: '#C9C2AE' };
  }

