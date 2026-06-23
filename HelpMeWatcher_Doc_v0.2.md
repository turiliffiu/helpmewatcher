# HelpMeWatcher — Documentazione Finale v0.2

> Sistema di notifica multi-canale per le richieste di propria competenza su HelpMe Delivery, con rilevamento del timeout silenzioso di sessione.

---

## Indice

1. [Panoramica](#1-panoramica)
2. [Come Funziona](#2-come-funziona)
3. [Prerequisiti](#3-prerequisiti)
4. [Installazione Tampermonkey](#4-installazione-tampermonkey)
5. [Notifiche di Sistema](#5-notifiche-di-sistema)
6. [Script Principale v0.2](#6-script-principale-v02)
7. [Configurazione Parametri](#7-configurazione-parametri)
8. [Verifica Funzionamento](#8-verifica-funzionamento)
9. [Script di Test](#9-script-di-test)
10. [Diagnostica](#10-diagnostica)
11. [Comandi Utili](#11-comandi-utili)
12. [Troubleshooting](#12-troubleshooting)
13. [FAQ](#13-faq)

---

## 1. Panoramica

### Problema
L'applicazione web **HelpMe Delivery** (`https://helpmedelivery.azure.fibercop.local/`) avvisa l'arrivo di una richiesta di propria competenza facendo comparire una piccola scritta — `N New, fai refresh` — accanto a "Richieste in coda". L'operatore deve poi premere il pulsante di refresh perché il ticket compaia effettivamente nella tabella. Questo crea due problemi:

- **Avviso facile da perdere**: la scritta è poco visibile e la notifica sonora interna dipende dal canale realtime dell'applicazione.
- **Timeout silenzioso**: dopo un periodo di inattività la sessione va in timeout **senza alcun avviso**. La pagina resta visivamente identica, ma è "congelata" su uno stato vecchio: si crede di star supervisionando e invece non arriva più nulla.

### Soluzione
Script JavaScript iniettato tramite Tampermonkey che attiva **due meccanismi indipendenti**:

1. **Rilevamento nuovo ticket** — osserva in tempo reale la scritta `N New, fai refresh` e, appena compare o il numero cresce, fa scattare 4 canali di notifica.
2. **Anti-timeout** — sorveglia il WebSocket dell'applicazione e, se la connessione cade e non si ripristina, fa scattare un allarme grave e distinto.

| Canale | Descrizione | Visibilità |
|--------|-------------|------------|
| 🟢 **Popup** | Banner colorato in alto a destra | Solo sulla pagina |
| 🔔 **Beep** | Segnali sonori (Web Audio API) | Udibile ovunque |
| 🖥️ **Notifica OS** | Notifica di sistema Windows | Anche con browser minimizzato |
| 🗣️ **Voce (TTS)** | Sintesi vocale in italiano | Udibile ovunque |

### Caratteristiche Tecniche
- **Zero modifiche al server**: tutto lato client.
- **Nessun rumore**: notifica esclusivamente le richieste di propria competenza, non l'intera coda condivisa.
- **Sorgente affidabile**: si aggancia direttamente alla scritta che il server stesso aggiorna in base alle skill dell'operatore.
- **Suono proprio**: usa la Web Audio API, indipendente dall'audio dell'applicazione (che all'avvio può generare errori `HTML5 Audio pool exhausted`).
- **Anti-timeout**: intercetta il WebSocket nativo e rileva la chiusura anomala della connessione (`close code 1006`).
- **HTTPS nativo**: nessuna configurazione speciale del browser richiesta per le notifiche di sistema.

---

## 2. Come Funziona

### Architettura
HelpMe Delivery è costruita su jQuery + Bootstrap + DataTables, con un canale realtime **WebSocket/WAMP** (libreria *autobahn.js*) all'endpoint `wss://helpmedelivery.azure.fibercop.local/ws2`. L'analisi del traffico ha stabilito che:

- Il WebSocket trasporta la **coda condivisa** (topic `cubohelpme.code.4`) e le **chat dei ticket** (topic `cubohelpme.chat.<id>`), ma **non** l'avviso di nuovo ticket personale.
- L'avviso di competenza personale viene calcolato dal server in base alle skill dell'operatore ed è esposto **unicamente** tramite la scritta `#badgerRadInCoda` ("N New, fai refresh"), aggiornata fuori dal flusso WebSocket.

Per questo motivo il rilevamento del nuovo ticket si basa sull'osservazione di quella scritta (sorgente certa e già filtrata dal server), mentre il WebSocket viene usato solo come sensore di vita della connessione.

### Flusso di Rilevamento — Nuovo Ticket
1. Un `MutationObserver` sorveglia l'elemento `#badgerRadInCoda`.
2. Ad ogni cambiamento del testo, lo script estrae il numero da `N New`.
3. Se il numero **aumenta** rispetto al valore precedente → scatta la notifica nuovo ticket (per ogni nuovo arrivo).
4. Quando l'operatore preme refresh e la scritta torna vuota (`""`) → il contatore viene azzerato **in silenzio**, senza falsi allarmi.

### Flusso di Rilevamento — Anti-Timeout
1. Lo script intercetta il costruttore `WebSocket` nativo all'avvio (`@run-at document-start`) e si aggancia in modo non invasivo (`addEventListener`) al socket `/ws2`.
2. Alla chiusura del socket (evento `close`, tipicamente `code 1006` = chiusura anomala da timeout) parte una **finestra di grazia** (default 12 secondi).
3. Se entro la finestra il socket si **riconnette** (riconnessione automatica di autobahn) → nessun allarme, situazione rientrata.
4. Se **non** si riconnette → scatta l'allarme grave "SUPERVISIONE INTERROTTA", ripetuto finché non si torna online o si ricarica la pagina.

---

## 3. Prerequisiti
- Browser desktop basato su Chromium (Chrome / Edge) aggiornato.
- Estensione **Tampermonkey** installata.
- Accesso autenticato a HelpMe Delivery.
- Audio del sistema attivo (per beep e voce).

---

## 4. Installazione Tampermonkey

### 4.1 Installa l'estensione
Installa Tampermonkey dallo store del browser, se non già presente.

### 4.2 Abilita la Modalità Sviluppatore
Negli ultimi Chrome/Edge è necessaria per l'esecuzione degli userscript:
- Vai su `chrome://extensions` (o `edge://extensions`).
- Attiva l'interruttore **Modalità sviluppatore** in alto a destra.

### 4.3 Crea il nuovo script
- Apri il pannello di Tampermonkey → **Crea un nuovo script**.
- Cancella il contenuto di esempio e incolla il contenuto di `helpmewatcher.user.js` (vedi sezione 6).
- Salva con **Ctrl+S**.
- Verifica che lo script risulti **abilitato** e con accesso al sito `helpmedelivery.azure.fibercop.local`.

---

## 5. Notifiche di Sistema
A differenza di altri gestionali interni in HTTP, HelpMe Delivery è servito in **HTTPS**: le notifiche di sistema funzionano senza dover abilitare eccezioni in `chrome://flags`.

Al primo avvio lo script richiede il permesso per le notifiche. Concedilo (`Consenti`). Per verificarlo, dalla console (F12):

```js
Notification.permission   // deve restituire "granted"
```

Se in passato è stato cliccato "Blocca": apri il lucchetto accanto all'URL → Impostazioni sito → Notifiche → **Consenti**, poi ricarica.

---

## 6. Script Principale v0.2

> Incollare integralmente nel corpo dello script Tampermonkey.

```javascript
// ==UserScript==
// @name         HelpMeWatcher v0.2
// @namespace    http://tampermonkey.net/
// @version      0.2.0
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
    reconnectGraceSec: 12,     // dopo un "close" attende tot sec: se non si riconnette -> ALLARME

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

  LOG('v0.2 caricato @', ts());

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
```

---

## 7. Configurazione Parametri

Tutti i parametri sono raccolti nel blocco `CONFIG` in cima allo script.

### 7.1 Rilevamento Nuovo Ticket
| Parametro | Default | Descrizione |
|-----------|---------|-------------|
| `badgeIds` | `['badgerRadInCoda']` | ID dell'elemento (o elementi) da osservare per la scritta "N New, fai refresh" |

### 7.2 Parametri Notifica Nuovo Ticket
| Parametro | Default | Descrizione |
|-----------|---------|-------------|
| `nt_popup` | `true` | Banner verde sulla pagina |
| `nt_beep` | `true` | Segnale sonoro |
| `nt_os` | `true` | Notifica di sistema |
| `nt_tts` | `true` | Annuncio vocale |
| `nt_beepFreq` | `880` | Frequenza del beep in Hz (tono squillante) |
| `nt_beepCount` | `4` | Numero di beep consecutivi |
| `nt_beepDur` | `0.22` | Durata di ogni beep in secondi |
| `tts_new` | `"Nuova richiesta di tua competenza. Fai refresh."` | Frase vocale |

### 7.3 Parametri Allarme Connessione Persa / Timeout
| Parametro | Default | Descrizione |
|-----------|---------|-------------|
| `cl_popup` | `true` | Banner rosso permanente |
| `cl_beep` | `true` | Segnale sonoro grave |
| `cl_os` | `true` | Notifica di sistema |
| `cl_tts` | `true` | Annuncio vocale |
| `cl_beepFreq` | `440` | Frequenza del beep in Hz (tono basso e insistente) |
| `cl_beepDur` | `0.5` | Durata di ogni beep in secondi |
| `cl_repeatEverySec` | `8` | Ogni quanti secondi ripetere l'allarme finché non si riconnette |
| `tts_lost` | `"Attenzione. Supervisione interrotta. Ricaricare la pagina."` | Frase vocale |

### 7.4 Parametri Anti-Timeout
| Parametro | Default | Descrizione |
|-----------|---------|-------------|
| `wsUrlMatch` | `'/ws2'` | Frammento di URL che identifica il WebSocket da sorvegliare |
| `reconnectGraceSec` | `12` | Secondi di attesa dopo una caduta prima di far scattare l'allarme (copre la riconnessione automatica) |

### 7.5 Parametri Voce (TTS)
| Parametro | Default | Descrizione |
|-----------|---------|-------------|
| `ttsLang` | `'it-IT'` | Lingua della sintesi vocale |
| `ttsVolume` | `1.0` | Volume (0.0 – 1.0) |
| `ttsRate` | `0.95` | Velocità di lettura |
| `ttsPitch` | `1.0` | Tono della voce |

### 7.6 Diagnostica
| Parametro | Default | Descrizione |
|-----------|---------|-------------|
| `debug` | `false` | `true` = log dettagliato in console (osservazione scritta, eventi WebSocket) |

---

## 8. Verifica Funzionamento

### 8.1 Badge Visivo
In basso a sinistra compare un badge di stato sempre visibile:
- 🟢 **HMW attivo** — connesso, nessun ticket in attesa.
- 🟠 **HMW · N da prendere** — ci sono N richieste segnalate dalla scritta.
- 🔴 **HMW ALLARME** — connessione caduta, allarme in corso.
- ⚪ **HMW · connessione...** — in attesa del primo aggancio al WebSocket.

Cliccando il badge si apre un riepilogo dello stato.

### 8.2 Messaggi Console
All'avvio (F12 → Console):
```
[HMW] v0.2 caricato @ HH:MM:SS
[HMW] attivo. Sorveglio la scritta "N New" e la connessione. Comandi: HMW.test() · HMW.stato()
```
All'arrivo di un ticket reale:
```
[HMW] 🔔 Nuova richiesta di tua competenza (totale in attesa: 1) @ HH:MM:SS
```
> Gli errori `HTML5 Audio pool exhausted` provengono dalla libreria *howler* dell'applicazione, non dallo script: sono innocui.

### 8.3 Test Rapido del Suono
Clicca **una volta** nella pagina (per sbloccare l'audio del browser), poi in console:
```js
HMW.test()
```
Devono partire beep, popup verde e voce. Se li percepisci, il watcher è pienamente operativo.

---

## 9. Script di Test

### 9.1 Prova del Suono (nuovo ticket)
```js
HMW.test()
```

### 9.2 Simulare l'arrivo di un nuovo ticket (via DOM)
Forza la scritta come farebbe il server: deve scattare la notifica.
```js
document.getElementById('badgerRadInCoda').textContent = '1 New, fai refresh';
// poi, per simulare un secondo arrivo:
document.getElementById('badgerRadInCoda').textContent = '2 New, fai refresh';
// per simulare il refresh (azzeramento silenzioso):
document.getElementById('badgerRadInCoda').textContent = '';
```

### 9.3 Simulare il timeout di sessione
Chiude forzatamente il WebSocket sorvegliato. Dopo `reconnectGraceSec` secondi, se non riconnette, deve partire l'allarme rosso.
```js
HMW.config;                 // verifica reconnectGraceSec
// individua e chiudi il socket monitorato:
HMW.stato();                // mostra lo stato del WebSocket
```
> In condizioni reali la chiusura avviene da sola al timeout (`code 1006`), come osservato sul campo.

---

## 10. Diagnostica

Per analizzare il comportamento interno, imposta in cima allo script:
```js
debug: true,
```
Con il debug attivo la console mostra: testo iniziale della scritta osservata, eventi di apertura/chiusura del WebSocket con relativo `code`, e i cali della scritta (refresh / presa in carico).

Per ispezionare lo stato a runtime:
```js
HMW.stato();    // pannello riepilogativo
HMW.config;     // configurazione attiva
```

---

## 11. Comandi Utili

### 11.1 Prova suono e notifica
```js
HMW.test()
```

### 11.2 Stato corrente
```js
HMW.stato()
```
Mostra: stato connessione, richieste in attesa, avvisi suonati nella sessione, stato del WebSocket e ora dell'ultimo messaggio, permesso notifiche.

### 11.3 Vedere/modificare la configurazione a runtime
```js
HMW.config                       // legge la config
HMW.config.nt_beepCount = 6      // es. piu beep (fino al reload)
```

---

## 12. Troubleshooting

### 12.1 Non sento alcun suono
Il browser blocca l'audio finché non c'è un'interazione utente. **Clicca una volta nella pagina**, poi riprova con `HMW.test()`. Lo script tenta comunque di sbloccare l'audio al primo click/tasto.

### 12.2 Lo script non si carica
- Verifica che sia **abilitato** in Tampermonkey.
- Verifica la **Modalità sviluppatore** attiva in `chrome://extensions`.
- Controlla che l'URL del sito rientri nella regola `@match`.
- In console deve comparire la riga `[HMW] v0.2 caricato`.

### 12.3 Non arriva la notifica di sistema
- `Notification.permission` deve valere `"granted"`.
- Se vale `"denied"`, sblocca dal lucchetto accanto all'URL e ricarica.
- Le notifiche restano visibili anche a browser minimizzato, non con il PC bloccato.

### 12.4 L'allarme timeout parte troppo presto / troppo tardi
Regola `reconnectGraceSec`: aumentalo se la riconnessione automatica impiega più dei 12 secondi previsti, diminuiscilo se vuoi essere avvisato prima.

### 12.5 Non mi avvisa per un nuovo ticket
- Conferma che la scritta dell'app sia effettivamente `#badgerRadInCoda` (con `debug: true` ne vedrai il testo iniziale all'avvio).
- Ricorda: lo script notifica solo quando il numero **aumenta**; un ticket già presente prima del caricamento non viene rinotificato.

---

## 13. FAQ

### Q1: Lo script funziona se chiudo il browser?
No. Tampermonkey gira solo a pagina aperta. Tieni aperta la scheda di HelpMe Delivery.

### Q2: Mi avvisa per i ticket di tutti o solo per i miei?
Solo per quelli di **tua competenza**. La scritta `N New` è già calcolata dal server in base alle tue skill: il rumore della coda condivisa non ti raggiunge.

### Q3: Perché non usa il WebSocket per rilevare il nuovo ticket?
Perché l'avviso personale non viaggia sul WebSocket: il server lo espone solo tramite la scritta. Il WebSocket è usato esclusivamente come sensore della connessione per l'anti-timeout.

### Q4: Cosa succede quando premo refresh e prendo i ticket?
La scritta torna vuota e lo script azzera il contatore **in silenzio**, senza falsi allarmi.

### Q5: Se arrivano due ticket ravvicinati?
La scritta passa da `1 New` a `2 New`: lo script rileva l'incremento e suona di nuovo.

### Q6: Cosa sono gli errori "HTML5 Audio pool exhausted"?
Provengono dalla libreria audio *howler* dell'applicazione, non dallo script. Sono innocui e indipendenti dal suono del watcher (che usa la Web Audio API).

### Q7: Posso cambiare la frase vocale o i suoni?
Sì, dai parametri `tts_new` / `tts_lost` e dai parametri beep (`nt_beepFreq`, `nt_beepCount`, ecc.) nel blocco `CONFIG`.

### Q8: Posso disattivare uno dei canali di notifica?
Sì, porta a `false` il relativo flag (`nt_popup`, `nt_beep`, `nt_os`, `nt_tts` per i nuovi ticket; `cl_*` per l'allarme connessione).

### Q9: Il badge in basso a sinistra mi dà fastidio, posso nasconderlo?
È volutamente discreto e utile come spia di stato. Se necessario può essere nascosto agendo sullo stile dell'elemento `#hmwBadge`.

### Q10: Lo script registra o invia dati da qualche parte?
No. Tutto resta nel browser. Nessun dato lascia la pagina.

---

## Checklist Installazione Completa
- [ ] Tampermonkey installato e Modalità sviluppatore attiva
- [ ] Script `helpmewatcher.user.js` incollato, salvato e **abilitato**
- [ ] Permesso notifiche concesso (`Notification.permission === "granted"`)
- [ ] In console compare `[HMW] v0.2 caricato`
- [ ] Badge 🟢 visibile in basso a sinistra
- [ ] Click nella pagina + `HMW.test()` → beep, popup e voce funzionano
- [ ] (Opzionale) Simulazione nuovo ticket via DOM verificata
- [ ] (Opzionale) Comportamento timeout verificato sul campo

---

## Note Finali

### Versioni
| Versione | Data | Note |
|----------|------|------|
| 0.1.0 → 0.1.4 | 2026-06-23 | Versioni diagnostiche: reverse engineering del protocollo WAMP, decodifica della coda, mappatura servizi/aree/stati |
| **0.2.0** | 2026-06-23 | Prima versione operativa: rilevamento via scritta `#badgerRadInCoda`, notifica multi-canale, anti-timeout su `close 1006` |

### Supporto
Per modifiche o estensioni futuri (es. arrivi multipli, taratura della finestra di grazia, statistiche di coda con `debug: true`), agire sul blocco `CONFIG` o estendere l'oggetto `window.HMW`.

### Crediti
Sviluppato da **Salvo** — Competence Center Radio, FiberCop TGS Sicilia.
Architettura derivata dal progetto **TicketWatcher** (app MARS), adattata al canale WebSocket/WAMP e al meccanismo a scritta di HelpMe Delivery.
