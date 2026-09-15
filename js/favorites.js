  // ---- Favorites: multiple saved spots, quick-switchable, reorderable ----
  const FAVORITES_KEY = 'tideAndTime.favorites';

  function getFavorites() {
    try {
      const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY));
      if (Array.isArray(parsed)) {
        return parsed.filter(f => f && typeof f.lat === 'number' && typeof f.lon === 'number' && typeof f.name === 'string');
      }
    } catch (e) {}
    return [];
  }

  let favorites = getFavorites();

  function saveFavoritesList() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch (e) {}
    // radarMap is declared later in the file, but this only ever runs from click handlers that
    // fire well after the whole script has executed once, so it's always initialized by then.
    if (radarMap) renderFavoriteMapPins();
  }

  function sameSpot(a, b) {
    return !!a && !!b && Math.abs(a.lat - b.lat) < 0.001 && Math.abs(a.lon - b.lon) < 0.001;
  }

  function isFavorited(loc) {
    return favorites.some(f => sameSpot(f, loc));
  }

  function toggleFavoriteCurrent() {
    if (!lastCoords) return;
    if (isFavorited(lastCoords)) {
      favorites = favorites.filter(f => !sameSpot(f, lastCoords));
    } else {
      favorites.push({ lat: lastCoords.lat, lon: lastCoords.lon, name: lastCoords.name });
    }
    saveFavoritesList();
    renderFavoritesUI();
  }

  function moveFavorite(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= favorites.length) return;
    [favorites[index], favorites[target]] = [favorites[target], favorites[index]];
    saveFavoritesList();
    renderFavoritesUI();
  }

  function deleteFavorite(index) {
    favorites.splice(index, 1);
    saveFavoritesList();
    renderFavoritesUI();
  }

  // Absent/true means "shown" (opt-out model) so favorites created before this feature existed
  // don't need a migration step — they're just treated as shown until toggled off.
  function toggleFavoriteShowOnMap(index) {
    const f = favorites[index];
    if (!f) return;
    f.showOnMap = f.showOnMap === false;
    saveFavoritesList();
    renderFavoritesUI();
  }

  function selectFavorite(index) {
    const f = favorites[index];
    if (!f) return;
    cityInput.value = f.name;
    locationPopup.hidden = true;
    loadLocation(f.lat, f.lon, f.name);
  }

  function renderFavoritesUI() {
    if (lastCoords) {
      favToggleBtn.style.display = '';
      const saved = isFavorited(lastCoords);
      favToggleBtn.textContent = saved ? '★ Saved' : '☆ Save this spot';
      favToggleBtn.classList.toggle('saved', saved);
    } else {
      favToggleBtn.style.display = 'none';
    }

    if (favorites.length === 0) {
      favoritesListEl.innerHTML = '<p class="favorites-empty">No favorites yet — search a spot, then tap "Save this spot".</p>';
      return;
    }
    favoritesListEl.innerHTML = favorites.map((f, i) => {
      const isCurrent = sameSpot(f, lastCoords);
      const shownOnMap = f.showOnMap !== false;
      return `
        <div class="favorite-row">
          <div class="favorite-row-main">
            <button type="button" class="favorite-select ${isCurrent ? 'current' : ''}" data-index="${i}">${f.name}</button>
            <div class="favorite-actions">
              <button type="button" class="fav-reorder-btn" data-dir="-1" data-index="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>&uarr;</button>
              <button type="button" class="fav-reorder-btn" data-dir="1" data-index="${i}" aria-label="Move down" ${i === favorites.length - 1 ? 'disabled' : ''}>&darr;</button>
              <button type="button" class="fav-delete-btn" data-index="${i}" aria-label="Remove">&times;</button>
            </div>
          </div>
          <label class="favorite-map-toggle">
            <span>Show on radar map</span>
            <button type="button" class="switch switch-sm fav-map-switch ${shownOnMap ? 'on' : ''}" data-index="${i}" role="switch" aria-checked="${shownOnMap}" aria-label="Show ${f.name} on radar map"><span class="switch-knob"></span></button>
          </label>
        </div>
      `;
    }).join('');
  }

  favoritesListEl.addEventListener('click', (e) => {
    const selectBtn = e.target.closest('.favorite-select');
    if (selectBtn) { selectFavorite(parseInt(selectBtn.dataset.index, 10)); return; }
    const mapSwitch = e.target.closest('.fav-map-switch');
    if (mapSwitch) { toggleFavoriteShowOnMap(parseInt(mapSwitch.dataset.index, 10)); return; }
    const reorderBtn = e.target.closest('.fav-reorder-btn');
    if (reorderBtn && !reorderBtn.disabled) { moveFavorite(parseInt(reorderBtn.dataset.index, 10), parseInt(reorderBtn.dataset.dir, 10)); return; }
    const deleteBtn = e.target.closest('.fav-delete-btn');
    if (deleteBtn) { deleteFavorite(parseInt(deleteBtn.dataset.index, 10)); return; }
  });

  favToggleBtn.addEventListener('click', toggleFavoriteCurrent);

  function closeAllHeaderPopups() {
    settingsPopup.hidden = true;
    locationPopup.hidden = true;
  }

  locationBtn.addEventListener('click', () => {
    const wasHidden = locationPopup.hidden;
    closeAllHeaderPopups();
    if (wasHidden) {
      renderFavoritesUI();
      locationPopup.hidden = false;
    }
  });
  locationCloseBtn.addEventListener('click', () => { locationPopup.hidden = true; });

