# Changelog

Tutte le modifiche notevoli a questo progetto saranno documentate in questo file.

Il formato è basato su [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
e questo progetto aderisce a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-23

### Added
- Rilevamento nuovo ticket basato sull'osservazione della scritta `#badgerRadInCoda` ("N New, fai refresh") tramite `MutationObserver`
- Notifica multi-canale nuovo ticket: beep Web Audio, popup verde, notifica di sistema, voce TTS in italiano
- Anti-timeout: intercettazione del WebSocket nativo (`WSProxy`) con rilevamento della chiusura anomala (`close code 1006`)
- Allarme grave "SUPERVISIONE INTERROTTA" ripetuto, con finestra di grazia per la riconnessione automatica (`reconnectGraceSec`)
- Badge di stato in basso a sinistra (🟢 attivo / 🟠 N da prendere / 🔴 allarme / ⚪ connessione)
- Comandi console `HMW.test()`, `HMW.stato()`, `HMW.config`
- Sblocco automatico dell'audio al primo click/tasto
- Documentazione completa in stile TicketWatcher (`HelpMeWatcher_Doc_v0.2.md`)

### Changed
- Riscrittura completa: da strumento diagnostico a strumento operativo
- La sorgente del nuovo ticket passa dal WebSocket alla scritta server-side (filtrata per competenza dell'operatore)
- Il WebSocket viene ora usato solo come sensore di vita della connessione, non per il rilevamento ticket

### Removed
- Riepiloghi automatici della coda e log "cattura-tutto" della fase diagnostica (disponibili ora solo con `debug: true`)
- Filtri lato client per gruppo/servizio/area, resi superflui dalla notifica via scritta

### Fixed
- Eliminati i falsi allarmi causati dai "ticket fantasma" della coda condivisa (`cubohelpme.code.4`), che inoltrava i ticket di tutti i team
- Azzeramento silenzioso del contatore dopo il refresh (nessun allarme alla presa in carico)

## [0.1.4] - 2026-06-23

### Added
- Cattura di qualsiasi messaggio WebSocket contenente la matricola, per individuare il canale personale
- Osservatore della scritta badge in parallelo all'analisi WebSocket

### Changed
- Conferma sul campo: l'avviso personale non transita dal WebSocket ma solo dalla scritta `#badgerRadInCoda`

## [0.1.3] - 2026-06-23

### Added
- Incorporazione delle mappe id→nome (servizi, aree, stati) estratte dall'HTML dell'applicazione
- Spia dedicata al canale personale (`cubohelpme.<matricola>`)

## [0.1.2] - 2026-06-23

### Added
- Riepilogo periodico dei conteggi per gruppo/servizio in console (`HMW.riepilogo()` con `console.table`)

## [0.1.1] - 2026-06-23

### Added
- Decodifica dei messaggi WAMP EVENT e classificazione dei ticket di coda

## [0.1.0] - 2026-06-23

### Added
- Prima versione diagnostica: intercettazione del WebSocket nativo a `document-start` (`WSProxy`)
- Reverse engineering del protocollo WebSocket/WAMP di HelpMe Delivery (HELLO/WELCOME/SUBSCRIBE/EVENT/GOODBYE)
- Rilevamento della caduta di connessione (`close code 1006`)
