// ==UserScript==
// @name         HelpMeWatcher v0.2
// @namespace    http://tampermonkey.net/
// @version      0.2.1
// @description  Avvisa quando arriva una richiesta di tua competenza su HelpMe Delivery (scritta "N New, fai refresh") e segnala la caduta della connessione/sessione (anti-timeout). Notifiche multi-canale: suono, popup, voce, notifica di sistema.
// @author       Salvo
// @match        https://helpmedelivery.azure.fibercop.local/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  if (window.__HMW_INSTALLED__) { console.warn('[HMW] gia installato, salto'); return; }
  window.__HMW_INSTALLED__ = true;

  // ═══════════════════════════════════════════════════════════════
  //  CONFIGURAZIONE
  // ═══════════════════════════════════════════════════════════════
  const CONFIG = {
    // --- Rilevamento nuovo ticket (scritta accanto a "Richieste in coda") ---
    badgeIds:          ['badgerRadInCoda'],   // elemento/i da osservare per "N New, fai refresh"

    // --- Notifiche NUOVO TICKET ---
    nt_popup:          true,
    nt_beep:           true,
    nt_os:             true,
    nt_tts:            true,
    nt_beepFreq:       880,    // tono squillante
    nt_beepCount:      4,
    nt_beepDur:        0.22,
    nt_tts:            true,

    // --- Notifiche CONNESSIONE PERSA / TIMEOUT (allarme grave, ripetuto) ---
    cl_popup:          true,
    cl_beep:           true,
    cl_os:             true,
    cl_tts:            true,
    cl_beepFreq:       440,    // tono basso e insistente
    cl_beepDur:        0.5,
    cl_repeatEverySec: 8,      // ripete l'allarme finche non si riconnette / ricarichi

    // --- Anti-timeout ---
    wsUrlMatch:        '/ws2', // WebSocket da sorvegliare
    reconnectGraceSec: 25,     // dopo un "close" attende tot sec: se non si riconnette -> ALLARME (25s assorbe i blip di rete che si ririconnettono da soli)

    // --- Voce (TTS) ---
    ttsLang:           'it-IT',
    ttsVolume:         1.0,
    ttsRate:           0.95,
    ttsPitch:          1.0,
    tts_new:           'Nuova richiesta di tua competenza. Fai refresh.',
    tts_lost:          'Attenzione. Supervisione interrotta. Ricaricare la pagina.',

    debug:             false,  // true = log dettagliato in console
  };

  const LOG  = (...a) => console.log('%c[HMW]', 'color:#2980b9;font-weight:bold', ...a);
  const WARN = (...a) => console.warn('%c[HMW]', 'background:#e67e22;color:#fff;padding:2px 4px', ...a);
  const DBG  = (...a) => { if (CONFIG.debug) console.log('%c[HMW]', 'color:#7f8c8d', ...a); };
  const ts   = () => new Date().toLocaleTimeString('it-IT');

  LOG('v0.2.1 caricato @', ts());

  // ═══════════════════════════════════════════════════════════════
  //  STATO
  // ═══════════════════════════════════════════════════════════════
  let pendingNew   = 0;       // ultimo valore "N New" letto dalla scritta
  let totalAlerts  = 0;       // quante volte ha suonato per nuovi ticket (sessione)
  let connected    = false;
  let alarmActive  = false;
  let alarmTimer   = null;
  let graceTimer   = null;
  let monitoredWS  = null;
  let lastWsMsg    = null;
  let audioCtx     = null;

  // ═══════════════════════════════════════════════════════════════
  //  RILEVAMENTO NUOVO TICKET (osserva la scritta "N New, fai refresh")
  // ═══════════════════════════════════════════════════════════════
  function parseNew(text) {
    const m = (text || '').match(/(\d+)\s*New/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  function onBadgeText(text) {
    const n = parseNew(text);
    if (n > pendingNew) {
      const arrivals = n - pendingNew;   // quanti nuovi rispetto a prima
      pendingNew = n;
      notifyNewTicket(arrivals, n);
    } else {
      // n minore o uguale: o hai fatto refresh (torna a "") o nessun cambiamento
      if (n !== pendingNew) DBG('scritta scesa a', n, '(refresh / presa in carico)');
      pendingNew = n;
    }
    updateBadge();
  }

  function watchBadge(tries) {
    tries = tries || 0;
    let found = 0;
    CONFIG.badgeIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      found++;
      if (el.__hmwObserved) return;
      el.__hmwObserved = true;
      pendingNew = parseNew(el.textContent);   // allinea allo stato attuale
      DBG('osservo scritta #' + id + ' (iniziale: "' + (el.textContent || '').trim() + '")');
      new MutationObserver(() => onBadgeText(el.textContent))
        .observe(el, { childList: true, characterData: true, subtree: true });
    });
    if (!found && tries < 15) setTimeout(() => watchBadge(tries + 1), 1500);
  }

  // ═══════════════════════════════════════════════════════════════
  //  ANTI-TIMEOUT (intercetta il WebSocket, sorveglia la connessione)
  // ═══════════════════════════════════════════════════════════════
  const NativeWS = window.WebSocket;
  function WSProxy(url, protocols) {
    const ws = protocols !== undefined ? new NativeWS(url, protocols) : new NativeWS(url);
    try {
      if (String(url).indexOf(CONFIG.wsUrlMatch) !== -1) {
        DBG('WebSocket intercettato:', url);
        attachWs(ws);
      }
    } catch (e) { WARN('attach WS fallito', e); }
    return ws;
  }
  WSProxy.prototype  = NativeWS.prototype;
  WSProxy.CONNECTING = NativeWS.CONNECTING;
  WSProxy.OPEN       = NativeWS.OPEN;
  WSProxy.CLOSING    = NativeWS.CLOSING;
  WSProxy.CLOSED     = NativeWS.CLOSED;
  window.WebSocket   = WSProxy;

  function attachWs(ws) {
    monitoredWS = ws;
    ws.addEventListener('open',    onWsOpen);
    ws.addEventListener('message', () => { lastWsMsg = Date.now(); });
    ws.addEventListener('close',   onWsClose);
    ws.addEventListener('error',   () => WARN('errore WebSocket @ ' + ts()));
  }

  function onWsOpen() {
    connected = true;
    lastWsMsg = Date.now();
    DBG('● connesso @ ' + ts());
    if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
    clearAlarm();
    updateBadge();
  }

  function onWsClose(ev) {
    connected = false;
    WARN('● DISCONNESSO @ ' + ts() + ' | code=' + ev.code + ' wasClean=' + ev.wasClean);
    updateBadge();
    if (graceTimer) clearTimeout(graceTimer);
    graceTimer = setTimeout(() => {
      if (!connected) {
        WARN('nessuna riconnessione dopo ' + CONFIG.reconnectGraceSec + 's -> ALLARME');
        triggerConnectionLost(ev.code);
      }
    }, CONFIG.reconnectGraceSec * 1000);
  }

  // ═══════════════════════════════════════════════════════════════
  //  NOTIFICHE
  // ═══════════════════════════════════════════════════════════════
  function notifyNewTicket(arrivals, total) {
    totalAlerts++;
    const titolo = arrivals > 1 ? ('🔔 ' + arrivals + ' nuove richieste') : '🔔 Nuova richiesta di tua competenza';
    const corpo  = total > 1 ? ('In attesa: ' + total + ' — premi refresh') : 'Premi refresh per lavorarla';
    LOG(titolo + ' (totale in attesa: ' + total + ') @ ' + ts());
    if (CONFIG.nt_beep)  beep(CONFIG.nt_beepFreq, CONFIG.nt_beepCount, CONFIG.nt_beepDur, 0.16);
    if (CONFIG.nt_popup) popup(titolo, corpo, '#27ae60', 11000);
    if (CONFIG.nt_os)    osNotify(titolo, corpo, true);
    if (CONFIG.nt_tts)   speak(CONFIG.tts_new);
  }

  function triggerConnectionLost(code) {
    if (alarmActive) return;
    alarmActive = true;
    const fire = () => {
      if (CONFIG.cl_beep) beep(CONFIG.cl_beepFreq, 3, CONFIG.cl_beepDur, 0.22);
      if (CONFIG.cl_tts)  speak(CONFIG.tts_lost);
    };
    if (CONFIG.cl_popup) popup('⚠️ SUPERVISIONE INTERROTTA',
                               'Connessione caduta (code ' + code + '). Ricarica la pagina (F5).',
                               '#c0392b', 0);
    if (CONFIG.cl_os)    osNotify('⚠️ SUPERVISIONE INTERROTTA', 'Connessione HelpMe caduta. Ricarica la pagina.', true);
    fire();
    alarmTimer = setInterval(fire, CONFIG.cl_repeatEverySec * 1000);
    updateBadge();
  }

  function clearAlarm() {
    if (!alarmActive) return;
    alarmActive = false;
    if (alarmTimer) { clearInterval(alarmTimer); alarmTimer = null; }
    const p = document.getElementById('hmwAlarmPopup');
    if (p) p.remove();
    LOG('✓ riconnesso: allarme rientrato @ ' + ts());
  }

  // ═══════════════════════════════════════════════════════════════
  //  PRIMITIVE
  // ═══════════════════════════════════════════════════════════════
  function ensureAudio() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  document.addEventListener('click', ensureAudio);
  document.addEventListener('keydown', ensureAudio);

  function beep(freq, count, dur, gap) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      const start = t0 + i * (dur + gap);
      g.gain.setValueAtTime(0.55, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.start(start); osc.stop(start + dur);
    }
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = CONFIG.ttsLang; u.volume = CONFIG.ttsVolume; u.rate = CONFIG.ttsRate; u.pitch = CONFIG.ttsPitch;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function osNotify(title, body, sticky) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try { const n = new Notification(title, { body: body, requireInteraction: !!sticky });
            n.onclick = () => { window.focus(); n.close(); }; } catch (e) {}
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => { if (p === 'granted') osNotify(title, body, sticky); });
    }
  }

  function popup(title, body, color, durationMs) {
    const isAlarm = (durationMs === 0);
    if (isAlarm) { const old = document.getElementById('hmwAlarmPopup'); if (old) old.remove(); }
    const el = document.createElement('div');
    if (isAlarm) el.id = 'hmwAlarmPopup'; else el.className = 'hmwToast';
    el.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<div style="flex:1">' +
          '<div style="font-weight:700;font-size:1.05rem">' + title + '</div>' +
          '<div style="margin-top:3px;opacity:.92;font-size:.9rem">' + body + '</div>' +
          '<div style="font-size:.72rem;margin-top:4px;opacity:.7">' + ts() + '</div>' +
        '</div>' +
        '<button style="background:rgba(255,255,255,.25);border:none;color:#fff;width:26px;height:26px;' +
        'border-radius:50%;cursor:pointer;font-size:1rem">&times;</button>' +
      '</div>';
    const stackOffset = isAlarm ? 20 : (20 + document.querySelectorAll('.hmwToast').length * 92);
    Object.assign(el.style, {
      position: 'fixed', top: stackOffset + 'px', right: '20px', zIndex: '2147483647',
      background: color, color: '#fff', padding: '14px 18px', borderRadius: '10px',
      boxShadow: '0 8px 28px rgba(0,0,0,.4)', minWidth: '300px', maxWidth: '380px',
      fontFamily: 'system-ui,sans-serif',
    });
    el.querySelector('button').onclick = () => el.remove();
    (document.body || document.documentElement).appendChild(el);
    if (durationMs > 0) setTimeout(() => el.remove(), durationMs);
  }

  // ═══════════════════════════════════════════════════════════════
  //  BADGE DI STATO
  // ═══════════════════════════════════════════════════════════════
  function updateBadge() {
    let b = document.getElementById('hmwBadge');
    if (!b) {
      b = document.createElement('div');
      b.id = 'hmwBadge';
      Object.assign(b.style, {
        position: 'fixed', bottom: '10px', left: '10px', zIndex: '2147483646',
        padding: '6px 12px', borderRadius: '16px', color: '#fff', cursor: 'pointer',
        fontFamily: 'system-ui,sans-serif', fontSize: '13px', fontWeight: '600',
        boxShadow: '0 2px 10px rgba(0,0,0,.3)', userSelect: 'none',
      });
      b.onclick = showStatus;
      (document.body || document.documentElement).appendChild(b);
    }
    if (alarmActive)        { b.style.background = '#c0392b'; b.textContent = '🔴 HMW ALLARME'; }
    else if (pendingNew > 0){ b.style.background = '#e67e22'; b.textContent = '🟠 HMW · ' + pendingNew + ' da prendere'; }
    else if (connected)     { b.style.background = '#27ae60'; b.textContent = '🟢 HMW attivo'; }
    else                    { b.style.background = '#7f8c8d'; b.textContent = '⚪ HMW · connessione...'; }
  }

  function showStatus() {
    const rs = monitoredWS ? monitoredWS.readyState : '-';
    const rsTxt = { 0: 'CONNECTING', 1: 'OPEN', 2: 'CLOSING', 3: 'CLOSED' }[rs] || rs;
    const last = lastWsMsg ? new Date(lastWsMsg).toLocaleTimeString('it-IT') : '-';
    alert(
      'HelpMeWatcher v0.2\n\n' +
      'Stato: ' + (alarmActive ? 'ALLARME ⚠️' : (connected ? 'connesso ✓' : 'connessione...')) + '\n' +
      'Richieste in attesa (scritta): ' + pendingNew + '\n' +
      'Avvisi suonati (sessione): ' + totalAlerts + '\n' +
      'WebSocket: ' + rsTxt + ' · ultimo msg ' + last + '\n\n' +
      'Notifiche di sistema: ' + (('Notification' in window) ? Notification.permission : 'n/d') + '\n\n' +
      'Comandi console: HMW.test() prova suono · HMW.stato()'
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  AVVIO
  // ═══════════════════════════════════════════════════════════════
  function init() {
    if (('Notification' in window) && Notification.permission === 'default') {
      Notification.requestPermission().then(p => DBG('permesso notifiche OS:', p));
    }
    updateBadge();
    watchBadge();
    window.HMW = {
      test:  () => { notifyNewTicket(1, pendingNew + 1); return 'suono di prova inviato'; },
      stato: showStatus,
      config: CONFIG,
    };
    LOG('attivo. Sorveglio la scritta "N New" e la connessione. Comandi: HMW.test() · HMW.stato()');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
