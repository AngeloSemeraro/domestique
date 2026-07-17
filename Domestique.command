#!/usr/bin/env bash
#
# Avvia Domestique con un doppio click (macOS).
# Fa partire il server locale e apre il browser su http://localhost:3000.
# Per fermarlo: chiudi questa finestra del Terminale o premi Ctrl+C.
#
# Vai nella cartella di questo script (gestisce anche i path con spazi/iCloud).
cd "$(cd "$(dirname "$0")" && pwd)" || exit 1

URL="http://localhost:3000"

# Apre Domestique in Safari (ripiega sul browser predefinito).
# Per una finestra dedicata con la nostra icona: in Safari, File → Aggiungi al Dock.
open_app() {
  local url="$1"
  if [ -d "/Applications/Safari.app" ]; then
    open -a Safari "$url"
  else
    open "$url"
  fi
}

# Già in esecuzione? Apri solo la finestra.
if lsof -ti tcp:3000 >/dev/null 2>&1; then
  echo "Domestique è già avviato — apro la finestra."
  open_app "$URL"
  exit 0
fi

# Node/npm installati?
if ! command -v npm >/dev/null 2>&1; then
  echo "✗ Node.js non è installato."
  echo "  Scaricalo (versione LTS) da https://nodejs.org, installalo e riprova."
  read -r -p "Premi Invio per chiudere… " _
  exit 1
fi

# Prima volta: installa le dipendenze.
if [ ! -d node_modules ]; then
  echo "▸ Primo avvio: installo le dipendenze (~1–2 minuti)…"
  npm install || {
    echo "✗ Installazione fallita."
    read -r -p "Premi Invio per chiudere… " _
    exit 1
  }
fi

# Appena il server risponde, apri la finestra dell'app.
(
  for _ in $(seq 1 90); do
    if curl -s -o /dev/null "$URL"; then
      open_app "$URL"
      break
    fi
    sleep 1
  done
) &

echo "▸ Avvio Domestique su $URL"
echo "  La finestra resta aperta mentre l'app gira."
echo "  Per fermarla: chiudi questa finestra o premi Ctrl+C."
echo

# Sostituisce la shell con il server (resta in primo piano).
exec npm run dev
