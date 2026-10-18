// Translation providers, tried in order. Both are free and need no API key.
// For the real trip, swap in an official API (see README) for guaranteed availability.
const Translator = (() => {
  const cache = new Map();

  async function fetchJson(url, ms = 7000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  const providers = [
    {
      name: 'google',
      async run(text, from, to) {
        const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t'
          + `&sl=${from}&tl=${to}&q=${encodeURIComponent(text)}`;
        const data = await fetchJson(url);
        const out = (data[0] || []).map(seg => seg[0]).join('').trim();
        if (!out) throw new Error('empty');
        return out;
      },
    },
    {
      name: 'mymemory',
      async run(text, from, to) {
        const url = `https://api.mymemory.translated.net/get?langpair=${from}|${to}&q=${encodeURIComponent(text)}`;
        const data = await fetchJson(url);
        const out = data?.responseData?.translatedText?.trim();
        if (!out || data.responseStatus !== 200) throw new Error(data?.responseDetails || 'empty');
        return out;
      },
    },
  ];

  async function translate(text, from, to) {
    const key = `${from}|${to}|${text}`;
    if (cache.has(key)) return cache.get(key);
    let lastErr;
    for (const p of providers) {
      try {
        const out = await p.run(text, from, to);
        cache.set(key, out);
        return out;
      } catch (e) {
        lastErr = e;
        console.warn(`[translate] ${p.name} failed:`, e);
      }
    }
    throw lastErr || new Error('translation failed');
  }

  return { translate };
})();
