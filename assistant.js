// AI helper used when interpretation is stopped. It only listens to Korean and
// only ever answers in Korean, knowing the trip schedule and current time.
const Assistant = (() => {
  const RULES = [
    '당신은 캐나다를 여행 중인 한국인 부모님을 돕는 음성 비서입니다.',
    '규칙:',
    '1. 반드시 한국어로만 답합니다. 영어 단어는 꼭 필요한 고유명사(지명, 메뉴 이름 등)만 괄호로 덧붙입니다.',
    '2. 소리로 읽어 드리므로 짧고 쉬운 존댓말로 1~3문장으로 답합니다. 목록, 표, 기호, 이모지는 쓰지 않습니다.',
    '3. 아래 여행 일정과 현재 시각을 근거로 답합니다. 모르는 것이나 확실하지 않은 것은 지어내지 말고 "확실하지 않아요"라고 말한 뒤 가이드나 여행사에 확인하도록 안내합니다.',
    '4. 위급 상황(아픔, 길 잃음, 분실)에는 911 또는 동행 가이드에게 바로 연락하도록 먼저 안내합니다.',
  ].join('\n');

  function context() {
    let trip = null;
    try { trip = JSON.parse(localStorage.getItem('trip.schedule') || 'null'); } catch {}
    trip = trip || window.__sharedTrip || null;
    const now = new Date();
    const fmt = tz => now.toLocaleString('ko-KR', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' });
    const lines = [`현재 시각: 밴쿠버 ${fmt('America/Vancouver')}, 캘거리·밴프 ${fmt('America/Edmonton')}, 한국 ${fmt('Asia/Seoul')}`];
    if (trip?.items?.length) {
      lines.push(`여행: ${trip.title || ''}. ${trip.notes || ''}`, '일정:');
      for (const it of [...trip.items].sort((a, b) => a.date.localeCompare(b.date))) {
        lines.push(`- ${it.date} ${it.time || ''} ${it.title}${it.place ? ' (' + it.place + ')' : ''}${it.memo ? ' / ' + it.memo.replace(/\n/g, ' ') : ''}`);
      }
    }
    return lines.join('\n');
  }

  const isKorean = t => {
    const hangul = (t.match(/[가-힣]/g) || []).length;
    const latin = (t.match(/[A-Za-z]/g) || []).length;
    return hangul > 0 && hangul * 2 >= latin;
  };

  async function call(messages, key) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.3, max_tokens: 300, messages }),
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data?.error?.message || 'HTTP ' + res.status), { status: res.status });
    return (data.choices?.[0]?.message?.content || '').trim();
  }

  // turns: [{q, a}] recent conversation, oldest first.
  async function ask(question, key, turns = []) {
    const messages = [{ role: 'system', content: RULES + '\n\n' + context() }];
    for (const t of turns.slice(-6)) messages.push({ role: 'user', content: t.q }, { role: 'assistant', content: t.a });
    messages.push({ role: 'user', content: question });
    let answer = await call(messages, key);
    // Korean only, strictly: retry once, then give a safe Korean fallback.
    if (!isKorean(answer)) {
      messages.push({ role: 'assistant', content: answer }, { role: 'user', content: '방금 답을 한국어로만 다시 말해 주세요.' });
      answer = await call(messages, key);
    }
    if (!isKorean(answer)) answer = '죄송해요, 다시 한 번 말씀해 주시겠어요?';
    return answer;
  }

  return { ask, isKorean };
})();
