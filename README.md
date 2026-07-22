# Gestionale Magyc — Versione 1.0

Versione finale del primo ciclo di sviluppo.

## Funzioni incluse

- accesso tramite Supabase;
- gestione di più campionati;
- ruoli proprietario, amministratore e allenatore;
- squadre, crediti e rose;
- aste a buste chiuse;
- mercato e storico delle operazioni;
- calendario automatico;
- inserimento e modifica dei risultati;
- classifica automatica;
- statistiche del campionato;
- documenti e registro attività;
- backup e importazione;
- diagnostica integrata;
- PWA installabile su iPhone;
- interfaccia mobile;
- identità grafica ufficiale Magyc con logo neon blu.

## Installazione da RC1

1. esportare un backup;
2. sostituire tutti i file pubblicati con quelli della Versione 1.0;
3. mantenere nel `config.js` esclusivamente URL Supabase e chiave pubblicabile;
4. eseguire le migrazioni SQL non ancora applicate;
5. pubblicare su GitHub Pages;
6. rimuovere e reinstallare l'app dalla Home di iPhone per aggiornare icona e cache;
7. aprire Impostazioni → Diagnostica.

## Sicurezza

Non inserire mai nel repository una Secret key o una Service Role key Supabase.
Nel frontend deve essere usata solamente la chiave pubblicabile prevista per l'applicazione.

## Collaudo

La struttura e la sintassi sono state controllate localmente. Prima dell'uso definitivo è necessario provare tutti i flussi con il progetto Supabase reale e con gli account dei diversi ruoli.
