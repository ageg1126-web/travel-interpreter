// Translation providers, tried in order. With an OpenAI key the translation is
// done by a chat model (more natural); otherwise free keyless endpoints are used.
const Translator = (() => {
  const cache = new Map();
  const NAMES = { ko: 'Korean', en: 'English' };

  async function fetchJson(url, opts = {}, ms = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  const providers = [
    {
      name: 'openai',
      enabled: key => !!key,
      async run(text, from, to, key) {
        const data = await fetchJson('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0.2,
            messages: [
              { role: 'system', content: `You are a live interpreter for a Korean traveler in Canada. Translate the user's ${NAMES[from]} speech into natural, polite spoken ${NAMES[to]}. Output only the translation.` },
              { role: 'user', content: text },
            ],
          }),
        });
        const out = data?.choices?.[0]?.message?.content?.trim();
        if (!out) throw new Error('empty');
        return out;
      },
    },
    {
      name: 'google',
      enabled: () => true,
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
      enabled: () => true,
      async run(text, from, to) {
        const url = `https://api.mymemory.translated.net/get?langpair=${from}|${to}&q=${encodeURIComponent(text)}`;
        const data = await fetchJson(url);
        const out = data?.responseData?.translatedText?.trim();
        if (!out || data.responseStatus !== 200) throw new Error(data?.responseDetails || 'empty');
        return out;
      },
    },
  ];

  async function translate(text, from, to, key) {
    const cacheKey = `${from}|${to}|${text}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    let lastErr;
    for (const p of providers) {
      if (!p.enabled(key)) continue;
      try {
        const out = await p.run(text, from, to, key);
        cache.set(cacheKey, out);
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
