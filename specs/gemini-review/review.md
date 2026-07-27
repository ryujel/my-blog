# Gemini 코드 품질 및 아키텍처 리뷰 보고서

이 보고서는 정적 블로그 생성기 및 포함된 미니 웹앱(2048 게임, 픽셀 아트 에디터)의 코드 품질, 아키텍처, 보안, 잠재적 버그, 웹 접근성, 성능 등을 다차원적으로 정밀 검증한 결과입니다. (기존에 완료된 2048 게임의 기능 검증과는 중복되지 않는 새로운 비기능적 결함들만 수록하였습니다.)

---

## 1. 보안 (Security & Injection Vulnerabilities)

### [취약점 01] 마크다운 파서 내 Stored XSS(교차 사이트 스크립팅) 취약점
- **파일 경로 및 라인**: `lib/markdown.js:5-13` (`applyInline` 함수)
- **심각도**: **높음 (High)**
- **문제 설명**:
  `applyInline` 함수는 인라인 마크다운 요소들을 HTML로 변환합니다. 이때 이미지(`![alt](src)`)와 링크(`[label](href)`)를 변환하는 정규식 치환 과정에서 `src`와 `href` 속성값을 아무런 이스케이프나 정규화 과정 없이 HTML 속성 내부에 그대로 주입합니다.
  ```javascript
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => `<img src="${src}" alt="${alt}">`);
  out = out.replace(/(?<!!)\[([^\]]*)\]\(([^)]+)\)/g, (_, label, href) => `<a href="${href}">${label}</a>`);
  ```
  악의적인 작성자가 마크다운 본문에 `[클릭하세요](javascript:alert(document.cookie))` 또는 `![공격](https://invalid-image" onerror="alert(1))`와 같은 공격 구문을 작성하면, 독자가 이 글을 읽을 때 브라우저에서 스크립트가 실행되는 **Stored XSS** 취약점이 발생합니다.
- **제안 수정 방향**:
  속성에 대입할 주소(`href`, `src`)는 HTML 속성값 전용 이스케이프 함수를 거치도록 해야 합니다. 또한, 주소의 프로토콜이 안전한지(`http:`, `https:`, 또는 상대 경로) 체크하고, `javascript:`와 같은 위험한 가짜 프로토콜 스키마를 걸러내는 화이트리스트 필터링 로직을 도입해야 합니다.

### [취약점 02] 어드민 API 인증 및 CSRF 방어 부재
- **파일 경로 및 라인**: `admin-server.js` (서버 구조 전반 및 `admin/index.html`)
- **심각도**: **높음 (High)**
- **문제 설명**:
  로컬 관리자 서버(`admin-server.js`)는 게시글 생성, 수정, 삭제를 수행하는 API(`/api/posts`)를 어떠한 사용자 인증(Authentication)이나 세션 확인 없이 전역적으로 노출하고 있습니다. 또한 CSRF(Cross-Site Request Forgery) 방어막이 전혀 존재하지 않습니다. 어드민 페이지가 열려 있는 상태에서 사용자가 다른 악성 사이트를 방문하면, 그 사이트에 포함된 스크립트가 로컬에 실행 중인 `http://localhost:3001/api/posts`로 무단 요청을 보내 게시글을 임의로 생성, 수정 또는 삭제해 버릴 수 있습니다.
- **제안 수정 방향**:
  기본적인 세션/토큰 기반 인증 레이어를 구축하고, 상태를 변조하는 API(POST, PUT, DELETE) 요청 헤더에 관리자 화면에서 발급한 고유 CSRF 토큰 검증 로직을 추가하여 외부 오리진(Origin)에서의 무단 요청을 전면 차단해야 합니다.

### [취약점 03] Frontmatter / YAML 인젝션 취약점
- **파일 경로 및 라인**: `admin-server.js:61-71` (`serializePost` 함수)
- **심각도**: **중간 (Medium)**
- **문제 설명**:
  `serializePost` 함수는 글 저장 시 클라이언트가 제공한 `title`, `date`, `tags` 값을 문자열 조합 방식으로 그대로 마크다운 파일 상단의 Frontmatter 양식에 끼워 넣습니다.
  ```javascript
  function serializePost({ title, date, tags, body }) {
    const tagsLine = Array.isArray(tags) && tags.length ? `[${tags.join(', ')}]` : '[]';
    return `---
title: ${title}
...
`;
  }
  ```
  만약 공격자 혹은 사용자가 게시글 제목(title) 입력 칸에 개행 문자(`\n`)를 포함해 `My Title\ndate: 2020-01-01\ntags: [hacked]\n---`와 같은 값을 전달하면, 생성되는 파일의 Frontmatter 구조 자체가 망가지거나 악성 데이터가 삽입되어 변조되는 **Frontmatter Injection**이 발생합니다.
- **제안 수정 방향**:
  게시글 메타데이터를 저장하기 전에 제목이나 날짜 값 등에 개행 문자(`\r`, `\n`)가 포함되어 있는지 엄격하게 검증하여 차단해야 하며, 안전한 파일 생성을 위해 신뢰성이 확보된 YAML 직렬화(Serialize) 라이브러리를 사용하여 Frontmatter를 구성하도록 변경해야 합니다.

### [취약점 04] 정적 파일 처리 시 Partial Path Traversal (디렉터리 상위 이동) 취약점
- **파일 경로 및 라인**: `admin-server.js:115-119` (`serveFile` 함수)
- **심각도**: **중간 (Medium)**
- **문제 설명**:
  `serveFile` 함수는 요청된 상대 경로(`relPath`)를 `baseDir`와 병합한 뒤, 상위 디렉터리 경로 탈출을 막기 위해 `filePath.startsWith(baseDir)` 검사를 적용하고 있습니다.
  ```javascript
  const filePath = path.join(baseDir, relPath);
  if (!filePath.startsWith(baseDir)) { ... Forbidden }
  ```
  이 검사는 문자열 기준으로만 확인하므로 불완전합니다. 예를 들어, `baseDir`가 `C:\my-blog\assets`이고 사용자가 `relPath`를 `../assets-private/secret.txt`로 설정해 요청하면, 병합된 최종 경로 `C:\my-blog\assets-private\secret.txt` 역시 `baseDir` 문자열(`C:\my-blog\assets`)로 시작하므로 정상적인 검사를 우회하여 리소스를 유출할 가능성이 생깁니다.
- **제안 수정 방향**:
  경로를 완전히 절대경로로 확인하는 `path.resolve`를 적용한 뒤, `baseDir` 문자열에 반드시 폴더 구분자(`path.sep`)를 뒤에 덧붙여(예: `baseDir + path.sep`) 시작점 검사를 수행하거나, `path.relative`를 활용하여 상위 디렉터리로의 이동 시도 여부를 명확히 차단해야 합니다.

---

## 2. 에러 처리 및 신뢰성 (Error Handling & Reliability)

### [잠재적 버그 05] 대용량 페이로드 요청 거부 시 프로세스 비정상 종료 (Uncaught Exception)
- **파일 경로 및 라인**: `admin-server.js:101-105` (`readJsonBody` 함수 내 `req.destroy()`)
- **심각도**: **중간 (Medium)**
- **문제 설명**:
  `readJsonBody` 함수는 요청 스트림의 데이터 크기가 5MB를 초과하면 `req.destroy()`로 즉시 소켓을 강제 차단하고 `reject`를 반환합니다.
  하지만 이를 가로챈 API 핸들러의 `catch` 블록에서는 이미 파괴된 스트림에 대해 `sendJson(res, 400, { error: err.message })`을 호출하여 강제 쓰기를 시도합니다. 이 시점에 Node.js 런타임은 `ERR_STREAM_WRITE_AFTER_END` 예외를 전역으로 던지게 되며, 이를 포착하는 리스너가 서버 내에 없어 **어드민 Node.js 프로세스가 비정상 종료(Crash)**하게 됩니다.
- **제안 수정 방향**:
  `req.destroy()`를 호출해 소켓을 직접 닫았다면, `reject` 처리 이후 응답 스트림 쓰기(`res.writeHead`, `res.end`)를 완전히 건너뛰도록 처리 흐름을 분기해야 합니다. 또한, 서버 실행 파일 전반에 `process.on('uncaughtException')` 및 소켓 연결 `error` 리스너를 붙여 예기치 못한 크래시를 방지해야 합니다.

### [코드 품질 06] 마크다운 변환 ReDoS(정규식 서비스 거부) 취약성
- **파일 경로 및 라인**: `lib/markdown.js:12-15` (`applyInline` 내 볼드/이탤릭 정규식)
- **심각도**: **낮음 (Low)**
- **문제 설명**:
  `/\*\*([^*]+?)\*\*/g` 이나 `/__([^_]+?)__/g` 같은 중첩/지정 패턴의 비탐욕적(Non-greedy) 정규 표현식들은 입력 마크다운 텍스트 내에 닫히지 않은 기호가 매우 많이 중첩되어 길게 이어질 경우, 무수한 백트래킹(Backtracking)이 유발되어 CPU 사용률을 100%로 만들 수 있는 **ReDoS** 위험을 내포하고 있습니다.
- **제안 수정 방향**:
  정규식 구조를 백트래킹이 기하급수적으로 늘어나지 않도록 선형 탐색 패턴으로 최적화하거나, 한 줄에서 처리할 수 있는 최대 문자 수를 제한하는 로직을 삽입해야 합니다.

---

## 3. 성능 및 리소스 관리 (Performance & Resources)

### [성능 07] 블록킹 I/O: Node.js 동기식(Sync) 파일 API 남용
- **파일 경로 및 라인**: `build.js` 및 `admin-server.js` 파일 입출력 로직 전반
- **심각도**: **중간 (Medium)**
- **문제 설명**:
  게시글 디렉터리를 지우거나 읽고, 파일로 정적 산출물을 쓰는 전 과정에서 `fs.rmSync`, `fs.mkdirSync`, `fs.readFileSync`, `fs.writeFileSync`, `fs.readdirSync` 등 동기식(Synchronous) API들이 독점적으로 사용되고 있습니다.
  싱글 스레드로 도는 Node.js 특성상, 어드민 페이지에서 게시글을 수정 및 삭제하여 `build()`가 한 번 실행되는 동안 전체 파일 입출력 오버헤드로 인해 Node.js 메인 이벤트 루프가 완전히 멈추게(Blocking) 됩니다. 이 시간 동안 다른 사용자의 서비스 요청이나 리소스 반환 요청이 완전히 대기 상태에 머무르게 됩니다.
- **제안 수정 방향**:
  `fs` 대신 `fs.promises` 모듈을 도입하여, 동기 함수들을 비동기 프로미스 기반(`async/await`) API(예: `fs.promises.readFile`, `fs.promises.writeFile` 등)로 대체 구현해야 합니다.

### [리소스 누수 08] 전역 window/document 이벤트 리스너 누수 (Memory Leak)
- **파일 경로 및 라인**: `pixel-art-editor/editor.js:122-126` (`initDrawingEvents` 함수)
- **심각도**: **낮음 (Low)**
- **문제 설명**:
  `initDrawingEvents` 내에서 픽셀 드로잉 감지를 위해 `document`와 `window` 전역 객체에 `pointermove`, `pointerup`, `pointerleave`, `pointercancel` 이벤트 리스너를 무작용으로 직접 추가합니다.
  ```javascript
  document.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', endStroke);
  ```
  현재 이 앱은 단일 페이지에서 리로드되어 동작하므로 누수가 즉시 치명적이진 않으나, 향후 SPA(Single Page Application) 형태로 통합되거나 탭을 전환하는 컴포넌트가 추가될 경우, 컴포넌트가 제거되어도 전역 객체인 `window`/`document`에 리스너가 평생 상주하게 되어 메모리 누수와 오동작을 초래합니다.
- **제안 수정 방향**:
  해당 드로잉 컴포넌트가 화면에서 마운트 해제되거나 해체되는 라이프사이클에 맞춰 리스너들을 해제해 줄 수 있는 이벤트 클린업 함수(예: `removeEventListener`)를 정의하고 제공해야 합니다.

### [성능 09] 실시간 포스트 검색 시 디바운스(Debounce) 미비로 인한 UI 쓰레드 블로킹
- **파일 경로 및 라인**: `assets/js/search.js:46-48` (`input` 이벤트 리스너)
- **심각도**: **낮음 (Low)**
- **문제 설명**:
  검색 입력 칸에 텍스트를 입력할 때마다 이벤트가 지연 없이 매 키 입력마다 `applyFilters`를 실행합니다.
  `applyFilters`는 모든 포스트 카드를 순회(O(N))하며 DOM 클래스 조작(`classList.toggle`)과 문자열 매칭 연산을 실시간으로 즉각 수행하므로, 블로그 포스트 개수가 수백 개 이상으로 누적될 경우 타이핑을 빠르게 칠 때 화면 프레임이 심하게 밀리거나 UI 버벅임 현상이 발생하는 성능 저하가 일어납니다.
- **제안 수정 방향**:
  사용자가 타이핑을 잠시 멈췄을 때(예: 약 200~300ms 이후) 필터가 동작하도록 돕는 디바운싱(Debouncing) 처리를 인풋 이벤트 리스너에 적용해야 합니다.

---

## 4. 사용자 경험 및 웹 표준 접근성 (UX & Web Accessibility)

### [접근성 10] 키보드 단독 조작 및 스크린 리더 접근성 부재 (픽셀 아트 에디터)
- **파일 경로 및 라인**: `pixel-art-editor/editor.js` 및 `pixel-art-editor/index.html` 전반
- **심각도**: **중간 (Medium)**
- **문제 설명**:
  픽셀 아트 에디터는 마우스나 터치 드래그 기반의 포인터 이벤트(`pointerdown`, `pointermove`)로만 그리기를 수행할 수 있습니다. 마우스 조작이 불가능한 사용자나 시각 장애를 가진 사용자가 키보드 탭 키 등으로 개별 셀에 접근할 수 없으며, 현재 선택된 색상이나 지우개 모드 등의 정보가 웹 접근성 표준(WAI-ARIA)에 부합하도록 스크린 리더로 피드백되지 않습니다.
- **제안 수정 방향**:
  각 셀 요소(`.pixel-cell`)에 `tabindex="0"`을 적용하여 포커스를 주입하고, 셀에 포커스가 간 상태에서 `Enter`나 `Space`를 누르면 색칠될 수 있도록 조작 키 인터페이스를 작성해야 합니다. 또한 부모 격자 요소에 `role="grid"`, 셀에 `role="gridcell"`과 적절한 `aria-label`(예: "1행 1열, 현재 흰색")을 부여하여 스크린 리더 피드백을 제공해야 합니다.

### [UX 저하 11] 전역 키 다운 이벤트 캡처로 인한 정상적인 스크롤 마비
- **파일 경로 및 라인**: `2048-game/game.js:283-288` (keydown 이벤트 리스너)
- **심각도**: **중간 (Medium)**
- **문제 설명**:
  2048 게임은 게임 방향키 조작 시 화면이 함께 스크롤되는 것을 막기 위해 `ArrowLeft/Right/Up/Down` 입력 발생 시 일률적으로 `e.preventDefault()`를 호출하고 있습니다.
  ```javascript
  document.addEventListener('keydown', function (e) {
    var moveFn = KEY_MOVES[e.key];
    if (!moveFn) return;
    e.preventDefault();
    handleMove(moveFn);
  });
  ```
  그러나 리스너가 `document` 전역에 바인딩되어 있어, 사용자가 게임 보드 영역 외의 다른 블로그 글 목록을 아래로 스크롤하여 탐색하고자 방향키(`ArrowDown`)를 누를 때도 페이지 전체 스크롤이 전역적으로 완전히 불통이 되는 극단적인 사용자 경험(UX) 저하가 발생합니다.
- **제안 수정 방향**:
  이벤트 리스너를 전역 `document`가 아닌 게임 보드 래퍼 요소(`.board-wrapper`)에만 걸도록 제한해야 합니다. 보드 요소에 `tabindex="0"`을 지정하여 사용자가 게임 보드를 클릭하거나 포커스를 준 상태에서만 조작 방향키를 입력받고 `preventDefault`가 실행되도록 수정함으로써, 게임 밖 영역에서의 기본 브라우저 동작을 정상 보전해야 합니다.

---

## 5. 아키텍처 및 유지보수성 (Code Quality & Clean Architecture)

### [유지보수성 12] HTML 이스케이프 함수 중복 및 로직 불완전
- **파일 경로 및 라인**: `build.js:14-21` (`escapeHtmlAttr`) 및 `lib/markdown.js:1-3` (`escapeHtml`)
- **심각도**: **낮음 (Low)**
- **문제 설명**:
  HTML 특수 문자를 이스케이프하여 출력하는 유틸리티 함수가 `build.js`와 `lib/markdown.js` 두 곳에 분산되어 구현되어 있고 로직 또한 일관되지 않습니다.
  특히 `lib/markdown.js`의 `escapeHtml`은 `&`, `<`, `>` 문자만 처리하므로, 큰따옴표(`"`)나 작은따옴표(`'`)가 포함된 데이터가 HTML 속성 필드에 대입될 경우 구문 탈출(XSS) 가능성이 여전히 존재하는 치명적인 구조적 빈틈이 있습니다.
- **제안 수정 방향**:
  공통 문자열 유틸 함수들이 담긴 `lib/text.js` 또는 별도의 공통 라이브러리 모듈로 통일성 있는 `escapeHtml` 유틸리티(큰따옴표 `&quot;`, 작은따옴표 `&#39;` 치환 포함)를 단 하나만 구현한 뒤, 빌더와 마크다운 모듈에서 일관되게 공유해 불러다 쓰도록(require) 통합 단일화해야 합니다.

### [버그 13] Frontmatter 내 따옴표 포함 쉼표 분할 파싱 오류
- **파일 경로 및 라인**: `lib/frontmatter.js:1-9` (`parseValue` 함수)
- **심각도**: **낮음 (Low)**
- **문제 설명**:
  `parseValue` 함수는 Frontmatter 필드의 값이 대괄호(`[...]`)로 감싸진 배열 형태일 때 단순히 `split(',')`를 호출해 쉼표를 기준으로 잘라냅니다.
  ```javascript
  inner.split(',').map((item) => stripQuotes(item.trim()))
  ```
  이 무조건적인 스플릿 처리는 값 내부에 쉼표가 들어간 데이터가 있을 때 오작동을 유발합니다. 예를 들어 `tags: ["news, tech", "daily"]`와 같이 특정 태그 안에 쉼표가 포함되어 쌍따옴표로 올바르게 감싸져 있음에도 파서는 이를 `["news", "tech", "daily"]` 총 3개로 잘못 분할해 버리는 파싱 버그를 일으킵니다.
- **제안 수정 방향**:
  쉼표로 단순 쪼개기를 하는 대신, 쌍따옴표 내부의 쉼표를 무시할 수 있는 간단한 정규 표현식을 적용하거나 따옴표 매칭을 추적하는 온전한 상태 기반 파싱 루틴을 도입해야 합니다.

---

### [종합 소견]
본 저장소의 정적 블로그 생성기 및 미니 웹앱들은 핵심적인 비즈니스 기능(동작성)은 잘 완수되어 있으나, **XSS, CSRF, Frontmatter 주입과 같은 고위험군 웹 보안 취약점**이 여러 부분에서 감지되었습니다. 또한 단일 스레드 기반의 Node.js에서 동기식 I/O를 과하게 사용해 동시 처리 및 전반적인 가동성이 크게 제한됩니다. 
향후 안정적인 블로그 운영 및 어드민 도구 사용을 위해, 코드 수정을 원천 불허한 이번 제약을 넘어서는 다음 개발 단계에서는 상기 지적 사항들을 철저히 수정한 뒤 서비스를 오픈할 것을 강력히 권고합니다.
