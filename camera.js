// Photo translation: point the camera, press the shutter, and the text in the
// picture is read and explained in Korean by an OpenAI vision model.
(() => {
  const $ = id => document.getElementById(id);
  const video = $('camVideo'), shot = $('camShot'), result = $('camResult');
  const shutter = $('camShutter'), retake = $('camRetake'), notice = $('camNotice'), hint = $('camHint');
  let stream = null;

  const key = () => { try { return localStorage.getItem('interp.openaiKey') || ''; } catch { return ''; } };

  function showNotice(html) { notice.innerHTML = html; notice.hidden = !html; }

  async function startCamera() {
    if (stream || !shot.hidden) return;
    if (!key()) {
      showNotice('사진 번역은 OpenAI 키가 필요해요. 설정 탭에서 키를 넣어 주세요.');
    } else showNotice('');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false,
      });
      video.srcObject = stream;
      await video.play().catch(() => {});
      video.hidden = false;
    } catch (e) {
      console.warn('[camera]', e);
      video.hidden = true;
      hint.textContent = '카메라를 켤 수 없어요. 위의 "앨범에서 고르기"로 사진을 골라 주세요.';
    }
  }
  function stopCamera() {
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
    video.srcObject = null;
  }

  // Downscale so uploads stay small; 1600px is plenty for reading menus.
  function toJpeg(source, w, h) {
    const scale = Math.min(1, 1600 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }

  async function translateImage(dataUrl) {
    shot.src = dataUrl; shot.hidden = false; video.hidden = true;
    stopCamera();
    shutter.hidden = true; retake.hidden = false; hint.hidden = true;
    result.hidden = false;
    result.innerHTML = '<div class="cam-loading">사진 속 글자를 읽고 번역하는 중…</div>';
    if (!key()) {
      result.innerHTML = '<div class="cam-loading">OpenAI 키가 없어서 번역할 수 없어요. 설정 탭에서 키를 넣어 주세요.</div>';
      return;
    }
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key() },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You help a Korean woman in her 60s traveling in Canada read text around her. '
              + 'Read all text in the photo (English or French) and translate it into natural Korean. '
              + 'Return JSON: {"summary": one or two Korean sentences saying what this is and what matters most, '
              + '"items": [{"original": text as written, "korean": Korean translation, "note": short Korean explanation or empty}]}. '
              + 'For menus, put each dish as an item with price in "original" and explain the dish in "note". '
              + 'For signs or notices, explain what she should do. If there is no readable text, say so in summary and return no items.' },
            { role: 'user', content: [
              { type: 'text', text: '이 사진의 글자를 한국어로 번역해 주세요.' },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            ] },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data?.error?.message || 'HTTP ' + res.status), { status: res.status });
      render(JSON.parse(data.choices[0].message.content));
    } catch (e) {
      console.warn('[camera] translate', e);
      result.innerHTML = '';
      const p = document.createElement('div');
      p.className = 'cam-loading';
      p.textContent = e.status === 401 ? 'API 키가 맞지 않아요. 설정을 확인해 주세요.' : '번역하지 못했어요. 인터넷 연결을 확인하고 다시 찍어 주세요.';
      result.appendChild(p);
    }
  }

  function render(out) {
    result.innerHTML = '';
    const s = document.createElement('p');
    s.className = 'cam-summary';
    s.textContent = out.summary || '';
    result.appendChild(s);
    for (const it of out.items || []) {
      const d = document.createElement('div');
      d.className = 'cam-item';
      for (const [cls, text] of [['orig', it.original], ['ko', it.korean], ['note', it.note]]) {
        if (!text) continue;
        const e = document.createElement('div');
        e.className = cls; e.textContent = text;
        d.appendChild(e);
      }
      result.appendChild(d);
    }
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  shutter.onclick = () => {
    if (!video.videoWidth) return;
    translateImage(toJpeg(video, video.videoWidth, video.videoHeight));
  };
  retake.onclick = () => {
    shot.hidden = true; shot.removeAttribute('src');
    shutter.hidden = false; retake.hidden = true; hint.hidden = false;
    result.hidden = true; result.innerHTML = '';
    startCamera();
  };
  $('camFile').onchange = e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const img = new Image();
    img.onload = () => { translateImage(toJpeg(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(img.src); };
    img.src = URL.createObjectURL(file);
  };

  document.addEventListener('tabchange', e => (e.detail === 'camera' ? startCamera() : stopCamera()));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
    else if (!$('tab-camera').hidden) startCamera();
  });
  if (!$('tab-camera').hidden) startCamera();
})();
