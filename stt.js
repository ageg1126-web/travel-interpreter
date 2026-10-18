// Speech-to-text with automatic language detection (OpenAI).
// The transcript comes back in the script of the spoken language,
// so Hangul means Korean and Latin letters mean English.
const STT = (() => {
  const MODELS = ['gpt-4o-mini-transcribe', 'whisper-1'];
  const PROMPT = '한국어 또는 English 대화입니다. The speaker uses Korean or English.';

  async function transcribe(blob, apiKey) {
    let lastErr;
    for (const model of MODELS) {
      const form = new FormData();
      form.append('file', blob, 'speech.wav');
      form.append('model', model);
      form.append('prompt', PROMPT);
      form.append('response_format', 'json');
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: 'Bearer ' + apiKey }, body: form,
      });
      if (res.ok) return ((await res.json()).text || '').trim();
      const body = await res.json().catch(() => ({}));
      lastErr = Object.assign(new Error(body?.error?.message || 'HTTP ' + res.status), { status: res.status });
      // Only fall back to the next model when this one is unavailable to the account.
      if (res.status !== 404 && res.status !== 400 && res.status !== 403) break;
    }
    throw lastErr;
  }

  return { transcribe };
})();
