# HelpMeWatcher

> Sistema di notifica multi-canale per **HelpMe Delivery** — rilevamento automatico delle richieste di propria competenza e allarme anti-timeout di sessione.

![Version](https://img.shields.io/badge/version-0.2.0-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Tampermonkey](https://img.shields.io/badge/Tampermonkey-compatible-orange.svg)

## 🎯 Problema

L'applicazione web **HelpMe Delivery** segnala l'arrivo di una richiesta di competenza con una piccola scritta — `N New, fai refresh` — accanto a "Richieste in coda". L'operatore rischia di non accorgersene perché:

- ❌ La scritta è poco visibile e priva di un avviso sonoro affidabile
- ❌ Il ticket compare nella tabella solo dopo aver premuto refresh
- ❌ Dopo un periodo di inattività la sessione va in **timeout silenzioso**: la pagina sembra attiva ma è "congelata" e non arriva più nulla

## ✨ Soluzione

Script JavaScript iniettato tramite **Tampermonkey** che attiva due meccanismi indipendenti, ciascuno con **4 canali di notifica**:

| Canale | Descrizione | Beneficio |
|--------|-------------|-----------|
| 🟢 **Popup** | Banner colorato in alto a destra | Notifica visiva immediata |
| 🔔 **Beep** | Segnali sonori (Web Audio API) | Alert udibile anche senza guardare lo schermo |
| 🖥️ **Notifica OS** | Notifica di sistema Windows | Funziona con browser minimizzato |
| 🗣️ **TTS** | Voce italiana sintetizzata | Notifica vocale |

## 🚀 Features

- ✅ **Solo i tuoi ticket**: si aggancia alla scritta `N New`, già filtrata dal server in base alle skill dell'operatore — niente rumore dalla coda condivisa
- ✅ **Anti-timeout**: intercetta il WebSocket e rileva la caduta della connessione (`close code 1006`)
- ✅ **Finestra di grazia**: ignora le cadute momentanee che si riconnettono da sole, allarme solo per i timeout veri
- ✅ **Badge visivo**: spia di stato sempre visibile (🟢 attivo / 🟠 da prendere / 🔴 allarme)
- ✅ **Azzeramento intelligente**: nessun falso allarme quando prendi i ticket in carico
- ✅ **Suono indipendente**: usa la Web Audio API, separata dall'audio dell'applicazione
- ✅ **Zero configurazione server**: funziona esclusivamente lato client

## 📦 Installazione Rapida

### 1. Installa Tampermonkey
- [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

### 2. Abilita la Modalità Sviluppatore
- `chrome://extensions` (o `edge://extensions`) → **Modalità sviluppatore** ON

### 3. Installa lo Script
1. Apri Tampermonkey → **Crea un nuovo script**
2. Copia il contenuto di [`helpmewatcher.user.js`](./helpmewatcher.user.js)
3. Salva con **Ctrl+S** e verifica che sia abilitato

### 4. Concedi le Notifiche
HelpMe Delivery è in **HTTPS**: le notifiche di sistema funzionano senza configurazioni speciali. Al primo avvio concedi il permesso quando richiesto.

## 📖 Documentazione

Documentazione completa in [`HelpMeWatcher_Doc_v0.2.md`](./HelpMeWatcher_Doc_v0.2.md): architettura, installazione dettagliata, configurazione parametro per parametro, test, diagnostica, troubleshooting e FAQ.

## 🧪 Test Rapido

Clicca una volta nella pagina (per sbloccare l'audio), poi in console (F12):

```js
HMW.test()    // prova suono + popup + voce
HMW.stato()   // pannello di stato
```

Per simulare l'arrivo di un ticket:
```js
document.getElementById('badgerRadInCoda').textContent = '1 New, fai refresh';
```

## ⚙️ Configurazione

Tutti i parametri sono nel blocco `CONFIG` in cima allo script: toni e numero dei beep, frasi vocali, secondi della finestra di grazia anti-timeout (`reconnectGraceSec`), attivazione/disattivazione dei singoli canali. Vedi la sezione 7 della documentazione.

## 🔧 Troubleshooting

### Non sento alcun suono
Il browser blocca l'audio finché non interagisci con la pagina. Clicca una volta, poi riprova con `HMW.test()`.

### Lo script non si carica
Verifica che sia abilitato in Tampermonkey, che la Modalità sviluppatore sia attiva e che in console compaia `[HMW] v0.2 caricato`.

### L'allarme timeout parte troppo presto o tardi
Regola `reconnectGraceSec` nel blocco `CONFIG`.

## 📊 Compatibilità

| Componente | Stato |
|------------|-------|
| Chrome / Edge (Chromium) | ✅ Supportato |
| Tampermonkey | ✅ Compatibile |
| HelpMe Delivery (WebSocket/WAMP) | ✅ Testato sul campo |

## 📝 License

MIT

## 👤 Autore

**Salvo** — Competence Center Radio, FiberCop TGS Sicilia.
Architettura derivata dal progetto **TicketWatcher** (app MARS), adattata al canale WebSocket/WAMP e al meccanismo a scritta di HelpMe Delivery.

## 🔖 Versioni

Vedi [`CHANGELOG.md`](./CHANGELOG.md) per la cronologia completa. Versione corrente: **0.2.0**.
