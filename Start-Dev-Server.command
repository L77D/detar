#!/bin/bash
# DETAR — Dev-Server per Doppelklick.
# Startet einen lokalen Server im detar-webar-Ordner und öffnet den Browser
# im Desktop-Dev-Modus. Beenden: dieses Fenster schließen (oder Ctrl+C).
cd "$(dirname "$0")"
echo "DETAR Dev-Server läuft auf http://localhost:8080"
echo "Modi:  ?desktop&dev  = Editor am Rechner   |   ?desktop&debug = Hilfslinien"
echo "Beenden: Ctrl+C oder Fenster schließen."
( sleep 1; open "http://localhost:8080/?desktop&dev" ) &
python3 -m http.server 8080
