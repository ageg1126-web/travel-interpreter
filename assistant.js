// AI helper used when interpretation is stopped. It only listens to Korean and
// only ever answers in Korean, knowing the trip schedule and current time.
const Assistant = (() => {
  const RULES = [
    '당신은 캐나다를 여행 중인 한국인 부모님을 돕는 음성 비서입니다.',
    '규칙:',
    '1. 반드시 한국어로만 답합니다. 영어 단어는 꼭 필요한 고유명사(지명, 메뉴 이름 등)만 괄호로 덧붙입니다.',
    '2. 소리로 읽어 드리므로 짧고 쉬운 존댓말로 1~3문장으로 답합니다. 목록, 표, 기호, 이모지는 쓰지 않습니다.',
    '3. 아래 여행 일정, 현재 시각, 환율 정보를 우선 근거로 답합니다. 환율을 물으면 아래 환율 숫자로 바로 계산해서 답합니다.',
    '4. 일정에 없는 일반적인 질문(팁 문화, 세금, 날씨 경향, 음식, 교통, 쇼핑, 캐나다 생활 상식 등)은 아는 지식으로 친절하게 답합니다. 정말 알 수 없는 실시간 정보(오늘 정확한 운행 상황, 특정 가게 영업 여부 등)만 확실하지 않다고 짧게 말하고, 대신 도움이 되는 방법을 알려 드립니다.',
    '5. 캐나다 팁은 세금 전 금액의 15~20%(보통 18%)이고, 세금은 밴쿠버(BC주) 식당 5%, 쇼핑 12%, 앨버타주(로키, 캘거리)는 5%입니다. 계산을 물으면 이 기준으로 계산해서 답합니다.',
    '6. 위급 상황(아픔, 길 잃음, 분실)에는 911 또는 동행 가이드에게 바로 연락하도록 먼저 안내합니다.',
  ].join('\n');

  async function context() {
    let trip = null;
    try { trip = JSON.parse(localStorage.getItem('trip.schedule') || 'null'); } catch {}
    trip = trip || window.__sharedTrip || null;
    const now = new Date();
    const fmt = tz => now.toLocaleString('ko-KR', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' });
    const lines = [`현재 시각: 밴쿠버 ${fmt('America/Vancouver')}, 캘거리·밴프 ${fmt('America/Edmonton')}, 한국 ${fmt('Asia/Seoul')}`];
    try {
      const fx = await window.FX?.get();
      if (fx?.rate) {
        const when = fx.manual ? '직접 입력한 환율' : fx.updated ? new Date(fx.updated).toLocaleDateString('ko-KR') + ' 기준' : '최근 기준';
        lines.push(`환율(${when}): 캐나다 1달러 = ${Math.round(fx.rate).toLocaleString('ko-KR')}원, 1만원 = ${(10000 / fx.rate).toFixed(2)} 캐나다 달러.`
          + (fx.usd ? ` 미국 1달러 = ${Math.round(fx.usd).toLocaleString('ko-KR')}원. 그냥 "달러"라고 하면 캐나다 달러로 답하고, 미국 달러도 짧게 덧붙입니다.` : ''));
      } else lines.push('환율: 지금 불러오지 못했습니다. 여행 도구의 환율 계산기를 확인하도록 안내합니다.');
    } catch {}
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

  const call = (messages, key) => AI.chat(messages, key);

  // turns: [{q, a}] recent conversation, oldest first.
  async function ask(question, key, turns = []) {
    const messages = [{ role: 'system', content: RULES + '\n\n' + await context() }];
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
