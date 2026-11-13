# Tesla Navidrome

## Deployment

- Die produktive App wird unter <https://navidrome.alpenchat.at/tesla/> ausgeliefert.
- Das Produktionssystem ist `alpenchat.at`.
- Das Repository liegt dort unter `/root/git/tesla-navidrome`.
- Der Deployment-Helper auf dem Produktionssystem heißt `tesla-navidrome-deploy`.
- Nicht auf dem lokalen Entwicklungsrechner nach `/var/www` deployen.
- Änderungen an der App nach erfolgreichem Build immer mit dem Produktions-Helper ausrollen und die öffentlich ausgelieferte Version anschließend prüfen.
- Jede ausgerollte Version muss mit allen zugehörigen Änderungen in Git committet und auf das konfigurierte Remote-Repository gepusht werden. Ein Deployment ist erst abgeschlossen, wenn auch Commit und Push erfolgreich sind.
