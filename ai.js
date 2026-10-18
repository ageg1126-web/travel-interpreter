// One place that picks the chat model for every feature (interpreting, the
// Korean AI helper, photo translation). If the account can't use the main
// model yet, it quietly falls back to the older one so nothing breaks.
const AI = (() => {
  const MODEL = 'gpt-6.1-sol';
  const EFFORT = 'medium';
  const FALLBACK = 'gpt-4o-mini';
  let useFallback = false;

  async function post(body, key, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data?.error?.message || 'HTTP ' + res.status), { status: res.status, code: data?.error?.code });
      return (data.choices?.[0]?.message?.content || '').trim();
    } finally {
      clearTimeout(t);
    }
  }

  const modelProblem = e => e.status === 404 || e.code === 'model_not_found'
    || (e.status === 400 && /model|reasoning/i.test(e.message)) || (e.status === 403 && /model/i.test(e.message));

  // opts: { json: true } for a JSON object reply, ms: timeout.
  async function chat(messages, key, opts = {}) {
    const ms = opts.ms || 30000;
    const json = opts.json ? { response_format: { type: 'json_object' } } : {};
    if (!useFallback) {
      try {
        return await post({ model: MODEL, reasoning_effort: EFFORT, messages, ...json }, key, ms);
      } catch (e) {
        if (!modelProblem(e)) throw e;
        console.warn('[ai] falling back:', e.message);
        useFallback = true;
      }
    }
    return post({ model: FALLBACK, temperature: 0.2, messages, ...json }, key, ms);
  }

  return { chat, MODEL };
})();
