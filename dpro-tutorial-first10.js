// DPRO TUTORIAL IZAKAYA R3 / STANDARD V1.1 / exactly-10 / UI-only / business mutation 0
(() => {
  'use strict';

  const VERSION = 'IZAKAYA-FIRST10-R3-V1.1-20260830';
  const STORAGE_KEY = 'dpro_tutorial_izakaya_v1';
  const FIRST10 = Object.freeze([
    Object.freeze({id:'IZ-F10-01',title:'予約の流れを確認',route:'index.html?embed_demo=1',selectors:['section.hero-panel','#reserve-date','#btn-create-reservation'],body:'まず、予約リクエストの全体像と「日時・人数 → 確認 → 店舗確認」の流れを確認します。'}),
    Object.freeze({id:'IZ-F10-02',title:'日付と人数',route:'index.html?embed_demo=1',selectors:['#reserve-date','#party-size','section.hero-panel'],body:'予約日と人数を選ぶ場所です。チュートリアルは入力を自動変更せず、場所だけを案内します。'}),
    Object.freeze({id:'IZ-F10-03',title:'予約時間',route:'index.html?embed_demo=1',selectors:['#slot-list','#reserve-date','#party-size'],body:'営業日設定をもとに予約可能時間が表示されます。時間ボタンの選択は画面内の一時状態だけで、チュートリアルは自動選択しません。'}),
    Object.freeze({id:'IZ-F10-04',title:'自分の予約',route:'index.html?embed_demo=1',selectors:['#my-reservation-list','button[onclick="fetchMyReservations()"]','section.hero-panel'],body:'送信後の予約状態を確認する場所です。公開デモではサンプル予約を表示し、変更・キャンセルの実処理は停止されています。'}),
    Object.freeze({id:'IZ-F10-05',title:'今日の営業',route:'admin.html?embed_demo=1',selectors:['section.hero-panel','#today-operation-summary','#today-operation-stats'],body:'本日の予約件数・人数・仮予約・通知待ちをまとめて確認する営業コックピットです。'}),
    Object.freeze({id:'IZ-F10-06',title:'優先確認リスト',route:'admin.html?embed_demo=1',selectors:['#today-action-list','#pending-mini-list','#confirmed-mini-list'],body:'仮予約や席希望、メモなど、先に確認したい予約をまとめて見る場所です。'}),
    Object.freeze({id:'IZ-F10-07',title:'日別の予約一覧',route:'admin.html?embed_demo=1',selectors:['#admin-date','#reservation-list','#day-summary'],body:'日付を基準に予約一覧と人数集計を確認します。チュートリアルは日付変更や状態更新を自動実行しません。'}),
    Object.freeze({id:'IZ-F10-08',title:'本日の営業ボード',route:'owner-ipad.html?embed_demo=1',selectors:['section.top-panel','#top-summary','#top-stats'],body:'営業中に見る予約件数・人数・仮予約・通知待ちの概要です。'}),
    Object.freeze({id:'IZ-F10-09',title:'店舗ステータス',route:'owner-ipad.html?embed_demo=1',selectors:['#shop-status-current','#shop-status-message','#status-open'],body:'お客様側に見える空席状況の現在表示を確認します。チュートリアルは「空席あり」等の更新ボタンを押しません。'}),
    Object.freeze({id:'IZ-F10-10',title:'仮予約・来店準備・通知・履歴',route:'owner-ipad.html?embed_demo=1',selectors:['#tab-pending','#content-area','#tab-today'],body:'タブで当日の情報を切り替えて確認します。タブ切替は画面内表示の変更だけで、業務データを書き換えません。'})
  ]);

  let root = null;
  let frame = null;
  let card = null;
  let highlight = null;
  let launcher = null;
  let activeIndex = 0;
  let currentTarget = null;
  let drag = null;
  let priorFocus = null;
  let renderToken = 0;

  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
  const now = () => new Date().toISOString();

  function defaultState() { return {version:VERSION,status:'NOT_STARTED',index:0,updated_at:now()}; }
  function parse(raw) { try { return JSON.parse(raw); } catch { return null; } }
  function readState() {
    try {
      const s = parse(localStorage.getItem(STORAGE_KEY) || '');
      if (!s || s.version !== VERSION) return defaultState();
      return {...defaultState(), ...s, index:clamp(Number.isInteger(s.index) ? s.index : 0, 0, FIRST10.length - 1)};
    } catch { return defaultState(); }
  }
  function writeState(patch) {
    const next = {...readState(), ...patch, version:VERSION, updated_at:now()};
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    refreshLauncher();
    return next;
  }

  function safeRoute(route) {
    const u = new URL(route, location.href);
    if (u.origin !== location.origin) throw new Error('Tutorial route must stay same-origin');
    if (['index.html','admin.html','owner-ipad.html'].some(p => u.pathname.endsWith('/'+p) || u.pathname === '/'+p)) {
      u.searchParams.set('embed_demo','1');
    }
    return u;
  }

  function css() {
    if (document.getElementById('dproIzakayaTutorialStyles')) return;
    const s = document.createElement('style');
    s.id = 'dproIzakayaTutorialStyles';
    s.textContent = `
      html,body{max-width:100%;overflow-x:hidden}
      #dproIzTutorialRoot{position:fixed;inset:0;z-index:2147480000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;color:#292524}
      #dproIzTutorialFrameWrap{position:absolute;inset:0;background:#fff;overflow:hidden}
      #dproIzTutorialFrame{display:block;width:100%;height:100%;border:0;background:#fff}
      #dproIzTutorialHighlight{position:fixed;z-index:2147481800;pointer-events:none;border:4px solid #f59e0b;border-radius:16px;box-shadow:0 0 0 9999px rgba(28,25,23,.28),0 0 0 8px rgba(245,158,11,.22);transition:left .12s,top .12s,width .12s,height .12s;display:none}
      #dproIzTutorialCard{box-sizing:border-box;position:fixed;z-index:2147482200;left:50%;bottom:14px;transform:translateX(-50%);width:min(700px,calc(100vw - 24px));max-height:min(60vh,560px);overflow:auto;background:#fff;border:1px solid #fdba74;border-radius:24px;padding:16px;box-shadow:0 22px 80px rgba(0,0,0,.32);overscroll-behavior:contain}
      #dproIzTutorialCard[data-moved="1"]{transform:none}
      #dproIzTutorialCard.dpro-dragging{box-shadow:0 28px 95px rgba(0,0,0,.38)}
      .dpro-iz-top{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:9px;align-items:start}
      .dpro-iz-kicker{font-size:11px;font-weight:950;color:#9a3412;letter-spacing:.06em}.dpro-iz-title{margin:5px 0 0;font-size:22px;line-height:1.28;font-weight:950}
      #dproIzDragHandle{min-height:38px;padding:8px 11px;border:1px dashed #fb923c;border-radius:999px;background:#fff7ed;color:#9a3412;font-weight:950;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
      #dproIzTutorialCard.dpro-dragging #dproIzDragHandle{cursor:grabbing;background:#ffedd5}
      #dproIzClose{width:42px;height:42px;border:1px solid #e7e5e4;border-radius:999px;background:#fff;font-size:20px;cursor:pointer}
      .dpro-iz-body{margin:12px 0;font-size:14px;line-height:1.75;color:#57534e;font-weight:800}.dpro-iz-note{padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:13px;color:#7c2d12;font-size:12px;font-weight:850;line-height:1.55}.dpro-iz-fallback{margin-top:8px;padding:9px 11px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;color:#92400e;font-size:11px;font-weight:850;display:none}
      .dpro-iz-progress{height:7px;background:#f5f5f4;border-radius:999px;overflow:hidden;margin:12px 0}.dpro-iz-progress>span{display:block;height:100%;background:#ea580c}
      .dpro-iz-actions{display:flex;gap:8px;flex-wrap:wrap}.dpro-iz-actions button{min-height:42px;border:0;border-radius:999px;padding:10px 14px;font:inherit;font-weight:950;cursor:pointer}.dpro-iz-prev{background:#f5f5f4;color:#44403c}.dpro-iz-next{background:#16a34a;color:#fff}.dpro-iz-skip{background:#fff;color:#9a3412;border:1px solid #fdba74!important}
      #dproIzLauncher{position:fixed;right:12px;bottom:12px;z-index:2147482400;display:none;gap:7px;align-items:center;justify-content:flex-end;flex-wrap:wrap;max-width:calc(100vw - 24px)}#dproIzLauncher button,#dproIzLauncher a{min-height:42px;padding:10px 13px;border-radius:999px;border:1px solid #fdba74;background:#fff;color:#9a3412;font:inherit;font-weight:950;text-decoration:none;cursor:pointer}#dproIzLauncher .main{background:#292524;color:#fff;border-color:#292524}
      #dproIzTutorialRoot :focus-visible,#dproIzLauncher :focus-visible{outline:3px solid #2563eb!important;outline-offset:3px!important}
      @media(max-width:560px){#dproIzTutorialCard{bottom:8px;width:calc(100vw - 16px);max-height:62vh;padding:14px;border-radius:20px}.dpro-iz-top{grid-template-columns:minmax(0,1fr) auto}.dpro-iz-top>div:first-child{grid-column:1;grid-row:2}.dpro-iz-title{font-size:19px}#dproIzDragHandle{grid-column:1/-1;grid-row:1;justify-self:end}#dproIzClose{grid-column:2;grid-row:2}.dpro-iz-actions button{flex:1 1 42%}}
      @media(max-width:340px){#dproIzTutorialCard{padding:11px}.dpro-iz-title{font-size:17px}.dpro-iz-body{font-size:12px}.dpro-iz-actions{gap:6px}.dpro-iz-actions button{padding:9px 10px;font-size:12px}}
    `;
    document.head.appendChild(s);
  }

  function hostReady() {
    css();
    if (root) return;
    root = document.createElement('div');
    root.id = 'dproIzTutorialRoot';
    root.innerHTML = `
      <div id="dproIzTutorialFrameWrap"><iframe id="dproIzTutorialFrame" title="DPRO 居酒屋 操作チュートリアル"></iframe></div>
      <div id="dproIzTutorialHighlight" aria-hidden="true"></div>
      <section id="dproIzTutorialCard" role="dialog" aria-modal="false" aria-labelledby="dproIzTitle">
        <div class="dpro-iz-top">
          <div><div class="dpro-iz-kicker" id="dproIzKicker"></div><h2 class="dpro-iz-title" id="dproIzTitle"></h2></div>
          <button id="dproIzDragHandle" type="button" aria-label="チュートリアルカードを移動">↕ 移動</button>
          <button id="dproIzClose" type="button" aria-label="チュートリアルを閉じる">×</button>
        </div>
        <div class="dpro-iz-body" id="dproIzBody"></div>
        <div class="dpro-iz-note">安全モード：説明とハイライトのみ。予約・状態・通知・設定などの業務更新は自動実行しません。</div>
        <div class="dpro-iz-fallback" id="dproIzFallback"></div>
        <div class="dpro-iz-progress"><span id="dproIzProgress"></span></div>
        <div class="dpro-iz-actions">
          <button class="dpro-iz-prev" id="dproIzPrev" type="button">戻る</button>
          <button class="dpro-iz-next" id="dproIzNext" type="button">次へ</button>
          <button class="dpro-iz-skip" id="dproIzSkip" type="button">スキップ</button>
        </div>
      </section>`;
    document.body.appendChild(root);
    frame = document.getElementById('dproIzTutorialFrame');
    card = document.getElementById('dproIzTutorialCard');
    highlight = document.getElementById('dproIzTutorialHighlight');
    bindUi();
    window.addEventListener('resize', () => { clampCard(); positionHighlight(); });
    window.addEventListener('scroll', positionHighlight, true);
  }

  function launcherReady() {
    css();
    if (launcher) return;
    launcher = document.createElement('div');
    launcher.id = 'dproIzLauncher';
    launcher.innerHTML = `<button class="main" id="dproIzLaunchMain" type="button"></button><button id="dproIzReplay" type="button">最初から</button><a href="guide.html">Guide Center</a>`;
    document.body.appendChild(launcher);
    document.getElementById('dproIzLaunchMain').addEventListener('click', () => {
      const s = readState();
      if (s.status === 'IN_PROGRESS') resume(); else start();
    });
    document.getElementById('dproIzReplay').addEventListener('click', replay);
    refreshLauncher();
  }
  function refreshLauncher() {
    if (!launcher) return;
    const s = readState();
    const main = document.getElementById('dproIzLaunchMain');
    main.textContent = s.status === 'IN_PROGRESS' ? `再開 ${s.index + 1}/10` : s.status === 'COMPLETED' ? 'もう一度見る' : 'チュートリアル開始';
    launcher.style.display = root && root.isConnected ? 'none' : 'flex';
  }

  function bindUi() {
    document.getElementById('dproIzPrev').addEventListener('click', prev);
    document.getElementById('dproIzNext').addEventListener('click', next);
    document.getElementById('dproIzSkip').addEventListener('click', skip);
    document.getElementById('dproIzClose').addEventListener('click', close);
    const h = document.getElementById('dproIzDragHandle');
    h.addEventListener('pointerdown', dragStart);
    window.addEventListener('pointermove', dragMove);
    window.addEventListener('pointerup', dragEnd);
    window.addEventListener('pointercancel', dragEnd);
    document.addEventListener('keydown', e => {
      if (!root || !root.isConnected) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
  }

  function dragStart(e) {
    if (!card) return;
    e.preventDefault();
    const r = card.getBoundingClientRect();
    card.dataset.moved = '1';
    card.style.left = r.left + 'px'; card.style.top = r.top + 'px'; card.style.bottom = 'auto'; card.style.transform = 'none';
    drag = {id:e.pointerId, dx:e.clientX-r.left, dy:e.clientY-r.top};
    card.classList.add('dpro-dragging');
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  }
  function dragMove(e) {
    if (!drag || e.pointerId !== drag.id || !card) return;
    e.preventDefault();
    const maxX = Math.max(6, innerWidth - card.offsetWidth - 6); const maxY = Math.max(6, innerHeight - card.offsetHeight - 6);
    card.style.left = clamp(e.clientX-drag.dx, 6, maxX) + 'px'; card.style.top = clamp(e.clientY-drag.dy, 6, maxY) + 'px';
  }
  function dragEnd(e) { if (!drag || e.pointerId !== drag.id) return; drag = null; card?.classList.remove('dpro-dragging'); clampCard(); }
  function clampCard() {
    if (!card || card.dataset.moved !== '1') return;
    const r = card.getBoundingClientRect();
    card.style.left = clamp(r.left, 6, Math.max(6, innerWidth-r.width-6)) + 'px';
    card.style.top = clamp(r.top, 6, Math.max(6, innerHeight-r.height-6)) + 'px';
  }

  function routeKey(u) { return `${u.pathname.split('/').pop() || 'index.html'}${u.search}`; }
  async function ensureRoute(step, token) {
    const wanted = safeRoute(step.route);
    let current = null;
    try { current = new URL(frame.src || 'about:blank', location.href); } catch {}
    if (!current || routeKey(current) !== routeKey(wanted)) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error('route load timeout')); }, 12000);
        const cleanup = () => { clearTimeout(timer); frame.removeEventListener('load', onload); };
        const onload = () => { cleanup(); resolve(); };
        frame.addEventListener('load', onload, {once:true}); frame.src = wanted.toString();
      });
    }
    if (token !== renderToken) return false;
    return true;
  }

  function visible(el, win) {
    if (!el || !el.isConnected) return false;
    const cs = win.getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  }
  async function findTarget(step, token) {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      if (token !== renderToken) return null;
      try {
        const doc = frame.contentDocument; const win = frame.contentWindow;
        if (doc && win) {
          for (let i=0;i<step.selectors.length;i++) {
            const el = doc.querySelector(step.selectors[i]);
            if (visible(el, win)) return {el, selector:step.selectors[i], fallback:i>0};
          }
        }
      } catch {}
      await new Promise(r => setTimeout(r, 120));
    }
    return null;
  }

  function positionHighlight() {
    if (!highlight || !currentTarget || !frame) return;
    try {
      const fr = frame.getBoundingClientRect(); const tr = currentTarget.getBoundingClientRect();
      const left = clamp(fr.left + tr.left - 6, 4, innerWidth - 12); const top = clamp(fr.top + tr.top - 6, 4, innerHeight - 12);
      const width = clamp(tr.width + 12, 18, innerWidth-left-4); const height = clamp(tr.height + 12, 18, innerHeight-top-4);
      highlight.style.left=left+'px'; highlight.style.top=top+'px'; highlight.style.width=width+'px'; highlight.style.height=height+'px'; highlight.style.display='block';
    } catch { highlight.style.display='none'; }
  }

  async function render(index) {
    hostReady(); launcherReady();
    activeIndex = clamp(index, 0, FIRST10.length-1); const step = FIRST10[activeIndex]; const token = ++renderToken;
    currentTarget = null; highlight.style.display='none';
    document.getElementById('dproIzKicker').textContent = `${step.id} ・ ${activeIndex+1}/10`;
    document.getElementById('dproIzTitle').textContent = step.title;
    document.getElementById('dproIzBody').textContent = step.body;
    document.getElementById('dproIzProgress').style.width = `${((activeIndex+1)/FIRST10.length)*100}%`;
    document.getElementById('dproIzPrev').disabled = activeIndex === 0;
    document.getElementById('dproIzNext').textContent = activeIndex === FIRST10.length-1 ? '完了' : '次へ';
    const fb = document.getElementById('dproIzFallback'); fb.style.display='none'; fb.textContent='';
    writeState({status:'IN_PROGRESS',index:activeIndex});
    try {
      await ensureRoute(step, token); if (token !== renderToken) return;
      const found = await findTarget(step, token); if (token !== renderToken) return;
      if (found) {
        currentTarget = found.el;
        try { found.el.scrollIntoView({behavior:'auto',block:'center',inline:'nearest'}); } catch {}
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        positionHighlight();
        if (found.fallback) { fb.textContent = `主対象が表示されていないため、安全な代替表示（${found.selector}）を案内しています。`; fb.style.display='block'; }
      } else {
        fb.textContent = '対象が現在の表示状態で見つかりません。業務操作は行わず、この説明を安全な代替表示として続行できます。'; fb.style.display='block';
      }
    } catch (err) {
      fb.textContent = `画面の読み込みを確認できませんでした。業務操作は行わず続行できます。`; fb.style.display='block';
      console.warn('[DPRO Tutorial] route/target fallback', err?.message || err);
    }
    clampCard();
    setTimeout(positionHighlight, 220);
  }

  function mount() {
    priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    hostReady(); launcherReady(); refreshLauncher();
    requestAnimationFrame(() => document.getElementById('dproIzDragHandle')?.focus());
  }
  function unmount() {
    ++renderToken; currentTarget=null; root?.remove(); root=null; frame=null; card=null; highlight=null; drag=null; refreshLauncher();
    try { priorFocus?.focus({preventScroll:true}); } catch {}
  }
  function start() { mount(); writeState({status:'IN_PROGRESS',index:0}); render(0); }
  function resume() { const s=readState(); mount(); render(s.status === 'IN_PROGRESS' ? s.index : 0); }
  function replay() { mount(); writeState({status:'IN_PROGRESS',index:0}); render(0); }
  function close() { if (readState().status !== 'COMPLETED') writeState({status:'IN_PROGRESS',index:activeIndex}); unmount(); }
  function skip() { writeState({status:'COMPLETED',index:0}); unmount(); }
  function next() { if (activeIndex >= FIRST10.length-1) { writeState({status:'COMPLETED',index:0}); unmount(); return; } render(activeIndex+1); }
  function prev() { if (activeIndex > 0) render(activeIndex-1); }

  window.DPRO_IZAKAYA_FIRST10 = FIRST10;
  window.DPRO_IZAKAYA_TUTORIAL = Object.freeze({version:VERSION,storageKey:STORAGE_KEY,FIRST10,readState,start,resume,replay,close,skip,next,prev});

  function boot() {
    launcherReady();
    const p = new URLSearchParams(location.search);
    if (document.body?.dataset?.dproTutorialHost === '1') {
      if (p.get('replay') === '1') replay(); else if (p.get('resume') === '1') resume(); else if (p.get('start') === '1') start();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
