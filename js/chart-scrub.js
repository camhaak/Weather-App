  // ---- Shared "infinitely scrollable, click/drag-scrubbable" chart cursor mechanics ----
  // Used by both the temperature-trend chart (chart-temp.js) and the sun/moon/bite chart
  // (chart-sunmoon.js), which independently reimplemented the same interaction logic. Each
  // chart's own SVG content, cursor-info text, and (for the sun/moon chart) event-snapping stay
  // in that chart's own file — this only covers the parts that were duplicated between the two.
  //
  // cfg:
  //   state          - the chart's own state object (trendState / sunMoonState from state.js)
  //   wrapId         - id of the horizontally-scrolling chart container
  //   handleId       - id of the invisible drag-handle rect/element
  //   infoId         - id of the cursor-info panel to refresh on every cursor move
  //   pph(range)     - pixels-per-hour for a given zoom range
  //   infoHtml(time) - returns the HTML to show in the info panel for a given cursor time
  //   resolveClickTime(clientX) - optional; default resolves the raw pixel position to a Date.
  //                    The sun/moon chart passes its own snap-to-nearby-event wrapper here.
  //   snapCursorTime(time, meta) - optional; applied on every updateCursor call. Only the trend
  //                    chart supplies this (re-snaps onto the nearest hourly sample).
  //   computeY(time, meta) - optional; only the trend chart supplies this, since its dot sits on
  //                    the plotted temperature line. Without it the cursor has no y-position.
  //   paintCursor(x, y, time) - required; sets whatever SVG attributes this chart's cursor needs.
  //                    The shared code never touches the DOM beyond computing x/y and the info
  //                    panel, since the two charts' cursors don't share the same visual shape.
  function createScrubbableChart(cfg) {
    const EDGE_ZONE = 50;
    const MAX_SCROLL_SPEED = 14;

    function timeFromClientX(clientX) {
      const wrap = document.getElementById(cfg.wrapId);
      const svgEl = wrap && wrap.querySelector('svg');
      if (!svgEl || !cfg.state.chartMeta) return null;
      const rect = svgEl.getBoundingClientRect();
      const scale = svgEl.viewBox.baseVal.width / rect.width;
      const dataX = (clientX - rect.left) * scale;
      const ms = cfg.state.chartMeta.wStartMs + (dataX / cfg.state.chartMeta.pph) * 3600000;
      return new Date(ms);
    }

    const resolveTime = cfg.resolveClickTime || timeFromClientX;

    function updateCursor(time) {
      const meta = cfg.state.chartMeta;
      if (meta) {
        const clampedMs = Math.min(meta.wEndMs, Math.max(meta.wStartMs, time.getTime()));
        time = new Date(clampedMs);
        if (cfg.snapCursorTime) time = cfg.snapCursorTime(time, meta);
        const x = ((time.getTime() - meta.wStartMs) / 3600000) * meta.pph;
        const y = cfg.computeY ? cfg.computeY(time, meta) : null;
        cfg.paintCursor(x, y, time);
      }
      cfg.state.cursorTime = time;
      const infoEl = document.getElementById(cfg.infoId);
      if (infoEl) infoEl.innerHTML = cfg.infoHtml(time);
    }

    function scrollToFocus(smooth) {
      const wrap = document.getElementById(cfg.wrapId);
      if (!wrap) return;
      const days = weatherData.daily.time;
      const wStart = new Date(days[0] + 'T00:00:00');
      const wEnd = new Date(days[days.length - 1] + 'T23:59:59');
      const pph = cfg.pph(cfg.state.range);
      const cursor = cfg.state.cursorTime || new Date(weatherData.current.time);
      const focusTime = (cursor >= wStart && cursor <= wEnd) ? cursor : new Date(selectedDateStr + 'T12:00:00');
      const x = ((focusTime - wStart) / 3600000) * pph;
      const left = Math.max(0, x - wrap.clientWidth / 2);
      if (smooth) wrap.scrollTo({ left, behavior: 'smooth' });
      else wrap.scrollLeft = left;
    }

    function jumpToToday() {
      if (!weatherData) return;
      updateCursor(new Date(weatherData.current.time));
      scrollToFocus(true);
    }

    function handleChartClick(e) {
      if (e.target.id === cfg.handleId) return;
      const time = resolveTime(e.clientX);
      if (time) updateCursor(time);
    }

    function autoScrollStep() {
      const wrap = document.getElementById(cfg.wrapId);
      if (!wrap || !cfg.state.draggingCursor || cfg.state.autoScrollDir === 0) { cfg.state.autoScrollRAF = null; return; }
      const maxScroll = wrap.scrollWidth - wrap.clientWidth;
      wrap.scrollLeft = Math.max(0, Math.min(maxScroll, wrap.scrollLeft + cfg.state.autoScrollDir * cfg.state.autoScrollSpeed));
      const time = resolveTime(cfg.state.lastClientX);
      if (time) updateCursor(time);
      cfg.state.autoScrollRAF = requestAnimationFrame(autoScrollStep);
    }

    function updateAutoScroll(clientX) {
      const wrap = document.getElementById(cfg.wrapId);
      if (!wrap) { cfg.state.autoScrollDir = 0; return; }
      const rect = wrap.getBoundingClientRect();
      const leftDist = clientX - rect.left;
      const rightDist = rect.right - clientX;
      if (leftDist < EDGE_ZONE) {
        cfg.state.autoScrollDir = -1;
        cfg.state.autoScrollSpeed = MAX_SCROLL_SPEED * (1 - Math.max(0, leftDist) / EDGE_ZONE);
      } else if (rightDist < EDGE_ZONE) {
        cfg.state.autoScrollDir = 1;
        cfg.state.autoScrollSpeed = MAX_SCROLL_SPEED * (1 - Math.max(0, rightDist) / EDGE_ZONE);
      } else {
        cfg.state.autoScrollDir = 0;
      }
      if (cfg.state.autoScrollDir !== 0 && !cfg.state.autoScrollRAF) {
        cfg.state.autoScrollRAF = requestAnimationFrame(autoScrollStep);
      }
    }

    function stopAutoScroll() {
      cfg.state.autoScrollDir = 0;
      if (cfg.state.autoScrollRAF) { cancelAnimationFrame(cfg.state.autoScrollRAF); cfg.state.autoScrollRAF = null; }
    }

    function handlePointerDown(e) {
      if (e.target.id !== cfg.handleId) return;
      cfg.state.draggingCursor = true;
      cfg.state.lastClientX = e.clientX;
      try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
      e.target.style.cursor = 'grabbing';
      const time = resolveTime(e.clientX);
      if (time) updateCursor(time);
      e.preventDefault();
    }

    function handlePointerMove(e) {
      if (!cfg.state.draggingCursor) return;
      cfg.state.lastClientX = e.clientX;
      const time = resolveTime(e.clientX);
      if (time) updateCursor(time);
      updateAutoScroll(e.clientX);
    }

    function handlePointerUp(e) {
      if (!cfg.state.draggingCursor) return;
      cfg.state.draggingCursor = false;
      stopAutoScroll();
      if (e.target.id === cfg.handleId) e.target.style.cursor = 'grab';
    }

    return {
      updateCursor, scrollToFocus, jumpToToday, timeFromClientX,
      handleChartClick, handlePointerDown, handlePointerMove, handlePointerUp,
    };
  }
