/* =============================================================================
   DETAR — Build-Marker. BEI JEDEM PUSH HOCHZÄHLEN (Konvention: Commit-Anzahl,
   `git rev-list --count HEAD` des neuen Commits — dann ist die Nummer eindeutig
   und muss nie „ausgedacht" werden).

   ?stats zeigt die Nummer an UND holt diese Datei zusätzlich frisch vom Server
   (cache: no-store) — steht dort eine höhere Nummer, läuft am Gerät ein alter
   Cache → „neu laden". Damit ist am Handy ablesbar, ob der Stand aktuell ist.
   ============================================================================= */
export const BUILD = 15;
export const BUILD_DATE = "2026-07-16";
