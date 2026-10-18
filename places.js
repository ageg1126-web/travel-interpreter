// Google Maps Platform, kept behind one small door so the rest of the app
// (and the tests) never touch Google directly. The browser key and the
// optional Map ID live only on this phone (settings), like the OpenAI key.
// Google place content is shown, never stored: only place IDs may be kept.
window.Places = (() => {
  const $ = id => document.getElementById(id);
  const KEY = 'map.googleKey', MAPID = 'map.mapId';
  const read = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
  let loading = null, authFailed = false;

  const key = () => read(KEY).trim();
  const mapId = () => read(MAPID).trim() || 'DEMO_MAP_ID';
  const fail = (code, cause) => Object.assign(new Error(code), { code, cause });

  // Google calls this when the key is refused (wrong key, site not allowed, API off).
  window.gm_authFailure = () => { authFailed = true; document.dispatchEvent(new Event('mapsauthfail')); };

  function load() {
    if (window.google?.maps?.importLibrary) return authFailed ? Promise.reject(fail('auth')) : Promise.resolve(window.google.maps);
    if (!key()) return Promise.reject(fail('nokey'));
    if (!navigator.onLine) return Promise.reject(fail('offline'));
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const cb = '__mapsReady';
      window[cb] = () => resolve(window.google.maps);
      const s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({ key: key(), v: 'weekly', loading: 'async', language: 'ko', region: 'CA', callback: cb });
      s.async = true;
      s.onerror = () => { loading = null; s.remove(); reject(fail('load')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  const PRICE = { FREE: '무료', INEXPENSIVE: '$', MODERATE: '$$', EXPENSIVE: '$$$', VERY_EXPENSIVE: '$$$$' };

  // Nearest restaurants or cafés around a point, closest first.
  async function nearby({ lat, lng }, type, radius) {
    await load();
    const { Place, SearchNearbyRankPreference } = await google.maps.importLibrary('places');
    let res;
    try {
      res = await Place.searchNearby({
        fields: ['id', 'displayName', 'location', 'primaryType', 'businessStatus', 'googleMapsURI', 'rating', 'userRatingCount',
          'priceLevel', 'regularOpeningHours', 'utcOffsetMinutes', 'attributions'],
        locationRestriction: { center: { lat, lng }, radius },
        includedPrimaryTypes: type === 'cafe' ? ['cafe', 'coffee_shop'] : ['restaurant'],
        maxResultCount: 10,
        rankPreference: SearchNearbyRankPreference?.DISTANCE ?? 'DISTANCE',
        language: 'en',
        region: 'ca',
      });
    } catch (e) {
      const m = String(e?.message || e);
      if (/RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT|quota/i.test(m)) throw fail('quota', e);
      if (!navigator.onLine || /network|fetch/i.test(m)) throw fail('offline', e);
      throw fail('error', e);
    }
    return (res.places || []).filter(p => p.businessStatus !== 'CLOSED_PERMANENTLY').map(p => ({
      id: p.id,
      name: p.displayName || '',
      lat: typeof p.location?.lat === 'function' ? p.location.lat() : p.location?.lat,
      lng: typeof p.location?.lng === 'function' ? p.location.lng() : p.location?.lng,
      type: p.primaryType || '',
      rating: p.rating ?? null,
      reviews: p.userRatingCount ?? null,
      price: PRICE[p.priceLevel] || '',
      hours: p.regularOpeningHours || null,
      url: p.googleMapsURI || '',
      attributions: p.attributions || [],
      isOpen: () => (p.isOpen ? p.isOpen().catch(() => undefined) : Promise.resolve(undefined)),
    }));
  }

  // Settings: key and Map ID, saved on this phone only.
  function bindSettings() {
    const k = $('optMapKey'), id = $('optMapId'), state = $('mapKeyState');
    if (!k) return;
    k.value = key(); id.value = read(MAPID);
    const tail = v => (v.length > 10 ? ` (${v.slice(0, 4)}…${v.slice(-4)})` : '');
    const show = () => {
      const typed = k.value.trim();
      state.textContent = /^sk-/.test(typed) ? '이건 OpenAI 키예요(sk-로 시작). 위 "OpenAI 키" 칸에 넣어 주세요. Google 지도 키는 AIza로 시작해요.'
        : key() ? `키가 저장돼 있어요${tail(key())}. 지도 탭에서 Google 지도가 열려요.` : '키가 없어도 장소 설명과 길찾기는 쓸 수 있어요.';
      state.classList.toggle('ok', !!key() && !/^sk-/.test(typed));
    };
    const save = () => {
      const v = k.value.trim();
      try { if (!/^sk-/.test(v)) localStorage.setItem(KEY, v); localStorage.setItem(MAPID, id.value.trim()); } catch {}
      show();
      document.dispatchEvent(new Event('mapkeychange'));
    };
    k.addEventListener('input', show);
    k.addEventListener('change', save); id.addEventListener('change', save);
    show();
  }
  bindSettings();

  return { load, nearby, key, mapId, get authFailed() { return authFailed; } };
})();
