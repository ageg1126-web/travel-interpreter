# 여행 도우미 (엄빠의 캐나다 여행)

부모님의 첫 캐나다 여행(2027년 7월 18~25일, 밴쿠버 → 로키 기차 → 재스퍼 → 밴프 → 캘거리)을 돕는 한국어 웹앱이자 갤럭시(Android) 앱이에요. 이 저장소(와 전체화면용 `ageg1126-web.github.io`)만으로 진행하는 독립 프로젝트라서, 다른 프로젝트의 코드나 저장소를 가져오거나 섞지 않아요.

## 사용자와 대화 방식
- 사용자와는 한국어로, 짧고 쉬운 말로 대화해요. 커밋 메시지는 영어로 써요.
- 화면 모양을 바꾸는 작업(원 애니메이션, 아이콘 등)은 먼저 시안 이미지를 보여 주고, 사용자가 고르면 그때 올려요. 시안은 앱 안 브라우저에서도 깨지지 않게 한 파일(HTML)로 만들고, 사용자가 보는 화면을 직접 확인해요.
- 실제 부모님이 쓰시는 앱이라 글씨는 크게, 설명은 짧게, 존댓말로 써요.

## 꼭 지킬 규칙 (사용자가 "매우 엄격하게"라고 정함)
1. **통역 시작**: AI는 대답하지 않고 한국어 ↔ 영어를 그대로 통역만 해요. 현지인처럼 자연스럽게, 오역이나 과한 해석 없이.
2. **통역 중단(✕ 통역 끝내기)**: 첫 화면(원, 마이크 버튼, 통역 시작 버튼)으로 돌아가고 마이크는 켜진 채 남아요. 이때는 한국어만 알아듣고 한국어로만 답하는 AI 비서예요.
3. 원문(대화 기록)은 오른쪽 위 "원문 보기"에서만 보이고, 그 화면에서는 마이크가 완전히 꺼져요.

## 배포
- 웹: GitHub Pages, `ageg1126-web/travel-interpreter`의 `main` 루트 → https://ageg1126-web.github.io/travel-interpreter/
- 앱: Trusted Web Activity(`android/`, bubblewrap로 생성). `android/**`가 바뀌면 GitHub Actions(`.github/workflows/android.yml`)가 APK를 빌드해서 Release `app-latest`에 올려요 → https://github.com/ageg1126-web/travel-interpreter/releases/download/app-latest/travel-helper.apk
- 웹 코드만 바꾸면 앱은 다시 설치할 필요 없어요. 아이콘, 앱 이름, 스플래시처럼 APK 안의 것을 바꿀 때만 새 APK가 필요하고, 그때는 `android/app/build.gradle`과 `android/twa-manifest.json`의 버전을 올려요.
- 주소창 없는 전체화면을 위한 Digital Asset Links는 `ageg1126-web/ageg1126-web.github.io` 저장소의 `.well-known/assetlinks.json`에 있어요.
- 서명 키(`android/release.keystore`)와 비밀번호가 공개 저장소에 들어 있어요(Actions secrets API를 쓸 수 없어서). 사용자도 알고 있어요.

## 디자인 (2026-10-18 사용자 결정)
- 화면 아래 떠 있는 메뉴 5칸: 통역 · 사진 · 일정 · 지도 · 더보기(카드, 여행 도구, 설정). 왼쪽 ☰ 사이드바는 없앴어요.
- 색 "① 빙하 호수": 청록 `#00696B` + 산호 `#E8603F`, 토큰은 `style.css` 맨 위(밝은/어두운 화면). Material 3 Expressive 바탕, 유리 효과는 떠 있는 버튼·메뉴에만.
- 원: "리퀴드 글래스 구슬"(`orb.js`, 클래스 이름 `VoiceOrb`와 사용법은 그대로). 사용자가 고른 모양이라 함부로 바꾸지 않아요.
- 지도 첫 화면: 지도 위 카드 넘기기(2안) + ◀ ▶ 버튼, ＋/－ 버튼, 핀마다 번호와 이름.

## 지도 규칙
- 일정 날짜·순서는 `schedule.json`만 기준이에요. `spots.json`은 일정 항목 id → 장소 연결표(`match`가 일정 `place`와 같을 때만 연결)와 관광지 안내예요.
- 관광지 설명은 공식 출처만 확인해서 쓰고(리뷰 요약 금지, 지어내기 금지) 출처·확인일을 넣어요. 좌표는 Wikidata 등 Google이 아닌 출처로 넣어요. 확인 전인 곳은 `lat`이 `null`이라 핀 없이 "위치 확인 중"으로 나와요.
- Google 장소 정보(식당 이름·평점·영업시간 등)는 저장·캐시하지 않고 읽어 주지도 않아요. 저장해도 되는 것은 place ID뿐이에요. "자료: Google Maps"를 표시해요.
- Google 지도 키·Map ID는 앱 설정에서만 넣어요(`localStorage`의 `map.googleKey`, `map.mapId`). 채팅이나 저장소에 넣지 않아요. Map ID가 없으면 `DEMO_MAP_ID`를 써요.
- 길찾기·Google 지도 열기는 키가 필요 없는 Google Maps URL이에요. 이동수단은 사용자가 골라요.

## 바꿀 때마다
- `sw.js`의 `CACHE` 버전(`interp-vN`)을 하나 올려요. 안 올리면 폰에 예전 파일이 남아요. 새 파일을 만들면 `FILES` 목록에도 넣어요.
- OpenAI 키는 사용자가 앱 설정에서만 넣어요(폰 `localStorage`의 `interp.openaiKey`). 채팅이나 저장소에 키를 넣지 않아요.
- 확인은 Playwright로 해요. 이 Mac에서는 저장소 밖(작업용 임시 폴더)에 `playwright-core`를 설치하고 Mac의 Chrome으로 돌려요. 외부 API와 Google 지도(`window.google.maps`)는 가짜로 바꿔치기해요. 로컬 서버는 `python3 -m http.server 8765`.

## AI 모델
- `ai.js`: 번역(문장 단위 방식), AI 비서, 사진 번역, 카드 번역이 모두 `gpt-6.1-sol` + `reasoning_effort: medium`(사용자 지정). 쓸 수 없으면 `gpt-4o-mini`로 넘어가요.
- `realtime.js`: 기본 통역은 `gpt-realtime-translate` 실시간 동시통역. WebRTC 세션 두 개(→영어, →한국어). 휴대폰이 말하는 동안 반대편 세션 마이크를 막아 되먹임을 막아요. 켜져 있는 동안 1분에 약 0.07달러라서, 2분 동안 말이 없으면 저절로 꺼져요(사용자 지정). 연결이 안 되면 문장 단위 방식으로 넘어가요.
- 음성인식(문장 단위 방식, AI 비서): `gpt-4o-mini-transcribe`, 안 되면 `whisper-1`.
- 읽어 주기: `gpt-4o-mini-tts`, 기본 목소리 `marin`. 실패하면 폰 기본 음성.

## 파일
- `index.html`, `style.css`, `app.js`(화면, 아래 메뉴, 통역/비서 흐름), `orb.js`(리퀴드 글래스 구슬 원)
- `map.js`(지도 화면: 카드, 목록, 장소 설명, 길찾기, 주소 보여주기, 근처 음식점), `places.js`(Google Maps JS API·Places 연결, 키 설정), `spots.json`(관광지 안내·연결표), `privacy.html`(개인정보·이용 안내)
- `translate.js`(통역 규칙 프롬프트), `assistant.js`(한국어 비서 규칙, 일정·환율·팁 정보), `audio.js`, `stt.js`
- `schedule.json`(여행 일정 원본), `schedule.js`, `camera.js`(사진 번역), `cards.js`(보여 주는 카드), `currency.js`(CAD/USD ↔ KRW), `tips.js`(팁·세금), `weather.js`, `packing.js`, `tools.js`
- 아이콘: `icon.svg`(로키 호수 + 단풍잎 해, 사용자가 고른 B안)에서 PNG를 만들어요.

## 남은 일
- 관광지 21곳 중 내추럴 브리지·서프라이즈 코너는 믿을 만한 좌표가 없어 핀이 없어요. 2027년 봄에 영업시간·가격·셔틀·멀린 캐니언(2026년 시즌 폐쇄) 재개 여부를 다시 확인해요.
- 사용자가 Google Cloud에서 Maps JavaScript API·Places API (New) 켜기, 키(웹사이트·API 제한), Map ID(벡터, 기울기·회전 끔) 만들기 → 부모님 폰 설정에 넣기. 무료 체험은 2027-01-17에 끝나요(그 전에 유료 계정 전환).
- 실제 폰에서 확인: 위치 권한, 길찾기 → Google 지도 앱, 지도 손가락 조작, 유리구슬 원 속도.
- 7/24 귀국 항공편이 아직 정해지지 않았어요. 사용자가 알려 주면 `schedule.json`을 고쳐요.
- 실시간 동시통역은 실제 폰에서 아직 시험 전이에요(속도, 되먹임, 스피커로 나오는지).
