# Issues TODO

## 4. Scrollrad Next Back

Next/Back geht aktuell noch nicht über scrollrad.
Hier sollten wir evt. im Test WebUI analysieren, was der browser davon empfangen kann. das wäre für den
betrieb im Fahrzeug schon sehr wichtig.

## 15. Scrollrad Play Pause

Pause (stop) über scrollrad funktioniert, play aber nicht.
Für kurze Wiedergabepause ist es aktuell unbrauchbar, wäre aber sehr wichtig.

## 24. Tesla Audio Hinweis

Im Tesla prüfen: Browser-Hinweis, dass nur Audio und kein Video abgespielt wird.
Die App nutzt nur ein HTML-Audioelement, aber das Verhalten muss im Fahrzeug verifiziert werden.

# Issues Erledigt

## 1. Auto Continue

Auto continue, wenn app wieder gestartet wird (erneutes einsteigen in das fahzeug)
Sobald der Browser wieder geöffnet wird, muss die Musik exakt dort fortgesetzt werden, wo sie aufgehört hat.

## 2. Theme Fahrzeug

Dark/Light theme soll vom Fahzeug übernommen werden, möglichst live.
Das wird je nach außenhelligkeit automatisch vom fahrzeug umgestellt.

## 3. Aktueller Song

Aktueller Song im Verlauf soll mittig in den screen rücken, wenn mit next/back geskippt wird oder
der nächste Song automatisch beginnt,
sodass die paar vergangenen und die paar kommenden lesbar sind.

## 6. Alle Wiedergeben

Neuer Button [Alle wiedergeben]: alle Songs in der Trefferliste werden in die Verlauf gegeben

## 7. Treffer Songklick

Treffer: klick auf song in der trefferliste: nur diesen song einfügen

## 8. Verlauf Zukunft

Verlauf soll immer 8 titel in zukunft haben, zur not mit zufall erweitert.

## 9. Direkte Titelwahl

Direkte titelwahl in der Trefferliste: einfügen nach aktuellem song, sofort starten, Verlauf aber beibehalten.

## 10. Zufall Zukunft

Zufall: nur 8 Songs in Zukunft an die Verlauf anhängen.

## 11. Passwort Auge

Login: Auge-Button für Passworteingabe im Klartext

## 12. Login Position

Login-Textfelder und Buttons weiter nach oben schieben, damit diese nicht von der Tastatur überlagert werden

## 13. Like Sichtbarkeit

Like-Button nur für aktuellen Song zeigen

## 14. Zurück Trackstart

Zurück soll zum Anfang des tracks springen, außer Song läuft erst max. 3s.

## 16. Verlauf Vergangenheit

Vergangenheit in Verlauf sollte niemals gelöscht werden. Diese soll aber auf 200 Einträge begrenzt werden.

## 17. Queue Begriff

Deutscher Begriff für Queue: Verlauf

## 19. Treffer Long Press

Lang drücken auf Song in Trefferliste bietet die Option:
[Einfügen nach aktuellem Song]
[Zur Playlist hinzufügen] --> dann kommt auswahl an vorhandenen Playlists und ein Plus-Symbol für das erzeugen
einer neuen Playlist (dies ist für den Fahrer uninteressant, aber für den Beifahrer).

## 20. Verlauf Long Press

Long-Press auf Song in Verlauf:
[Zur Playlist hinzufügen]
[Zeige Album] --> Trefferliste zeigt dann die Album-Songs.
[Zeige Artist] --> Trefferliste zeigt dann alle Songs zu dem Artisten.
[Entfernen]

## 21. Verlauf Menü

Verlauf-Menü:
[Löschen] --> löscht aktuelle Verlauf und füllt sie entsprechend automatisch mit 8 Zufallslieder.
[Verlauf würfeln] Dabei wird die aktuelle Verlauf gemischt,
und der aktuell abgespielte Song rutscht auf Platz 1. Damit die Wiedergabe nicht unterbrochen wird.
[Unbeliebte Songs entfernen] --> entfernt Songs, die mehr als 10% aber weniger als zu 50% gespielt wurden.
Gefällt ein Lied nicht besonders gut, wird es typischerweise geskippt.

## 22. Suchfeld Löschen

Suchfeld braucht rechts einen X-Button zum löschen der Eingabe

## 23. Verlauf Button

Verlauf ist per se kein typischer Button, daher braucht es keinen long-press. Stelle den Titel "Verlauf"
als Button dar. Somit sollte sich der User gut zurecht finden.

## 23b. Treffer Titelbutton

Treffer-Titel-Label wird zum Button. --> Untermenü

## 25. Untermenü Schrift

Untermenüs brauchen auch Große Schrift für die Auswahlelemente.

## 26. Logout Benutzername

Der Logoutbutton soll "karl" heißen, wenn das der eingeloggte User ist.
Erst durch einen Klick darauf bekommt man ein Menü für Logout.
Später werden wir hier weitere User auflisten, zu denen man schnell wechseln können wird.

## 27. Treffer Einfügen

Bei klick auf Mehr bei einem Song in der Trefferliste und der Auswahl
[Einfügen nach aktuellem Song] darf diesen nicht sofort spielen. der Bisherige
Song muss zuerst fertig gespielt haben.

## 28. Liked Icon

Zustands-Icon muss für liked Songs dargestellt werden in der Trefferliste (read only)

## 29. Alle Im Menü

[Alle wiedergeben] soll in das Menü "Treffer".

## 30. Playlist Suche

Suche soll auch nach Playlists suchen. Wenn es eine Playlist "Party" gibt, und ich
suche nach "Par", dann muss diese Playlist in den Treffer angezeigt werden.

## 31. Listen Buttons

Verlauf und Treffer müssen als Button erkenntlich sein!

## 32. Zufall Trefferliste

Der Button [Zufall] soll nur eine Trefferliste mit 8 Songs erstellen, aber sie nicht automatisch
im Verlauf anhängen.

## 33. Verlauf Entfernen

Verlaufbutton: neuer Eintrag: [Entferne vergangene Songs] und [Entferne zukünftige Songs]

## 34. Auto Anhängen

Das Verhalten für das automatische Anhängen von 8 Zufallssongs muss leicht geändert werden.
Erst bei einem Skip wird diese Regel angewandt, nicht immmer. Das ermöglicht,
dass man sich eine eigene Playlist im Verlauf zusammenstellen kann.

## 35. Drei Punkte

Long-Press im Verlauf wird ersetzt durch ein vertikales 3-punkt symbol am rechten Rand eines
Eintrags in der Verlaufsliste.

## 36. Song Ende

Im Tesla hatte ich einmal den Bug, dass ein Song fertig war, und dann nicht der nächste
Song im Verlauf abgespielt wurde. Die Wiedergabe stoppte.

## 37. Song Neustart

Den weiteren Bug: ich hatte ein Lied abgespielt, dann auf like geklickt, dann im
Verlauf ein anderes Lied gestartet und dann mit [Back] wieder das vorige lied gestartet,
dabei wurde das lied an dessen letzter position fortgesetzt. Das ist unerwartetes verhalten.
Ein song sollte immer am Anfang starten.

## 38. Theme Menü

Im User-Menü soll man auch einstellen können, ob man Light/Darktheme oder Auto verwenden möchte.

## 39. Erledigte Issues

Verschiebe die erledigten Issues ins nächste Kapitel "Issues Erledigt". Behalte die Nummerierung aber bei.

## 40. Space Playback

Eingabe eines Leerzeichens (am PC-Browser) in der Suchzeile toggelt Playback/Pause
völlig unerwartetes und unerwünschtes verhalten.

## 41. Touchfläche Punkte

Die Touchfläche 3-punkt in der Verlaufsliste soll nicht als separater button
dargestellt werden, sondern als rechtsbündige punkte im Eintrag.
klickt man also am rechen rand, erhält man das optionsmenü, sonst wird der
song abgespielt.

## 42. Listen Darstellung

Die Buttonflächen Treffer und Verlauf sollen wie ein Button, Rechteckig, abgerundet
dargestellt sein.

## 43. Treffer Bulk Menü

Treffer-Menü: zusätzlich zu [Alle wiedergeben] bitte auch noch
[Alle anhängen] (ganz unten) und
[Alle einfügen] (nach aktuellem Song)

## 44. Anhängen Begriff

gleiche nomenklatur auch für die Menüs einzelner Songs:
statt Button "Verlauf" soll hier "anhängen" stehen.

## 45. Verlauf Breite

gib der Liste "Verlauf" mehr Breite. Somit kannst du auch an jedem Song links
ein Handle darstellen, wo man den Song im Verlauf verschieben kann, per drag.

## 46. Treffer Menütitel

Das Menü zum Button [Treffer] zeigt als Titel "Verlauf" statt "Treffer".

## 47. Verlauf Verschieben

Das Verschieben der Songs im Verlauf funktioniert nicht.

## 48. Monolithische Einträge

Optisch würde ich mir die Listeneinträge im Verlauf monolithisch vorstellen.
Also ein großes abgerundetes Rechteck. Links die Handle Punkte, rechts die Menüpunkte.
Ohne abtrennungen zum mittleren Teil, dem Songnamen (der auch klickbar ist).
Es muss also ein Element werden, das links die Griffpunkte zum verschieben hat,
mittig kann es geklickt werden zum abspielen dieses Songs,
rechts hat es einen 3-punkt für weitere Optionen.

## 49. Schließen Schreibweise

Schließen schreibt man mit scharfem S.

## 50. Playlist Öffnen

Die bisherige Treffer-Liste kann auch eine Playlist sein.
Dabei verändert sich der Titel von "Treffer" auf z.B. "Party".
Dies erscheint, wenn man eine Playlist in der Trefferliste anklickt (bisher
wurde sie soforft eingefügt und abgespielt - das ist unerwartet).
Mit dem großen Listen-Titel-Button z.B. [Party] gibt es dann die gewohnten optionen
[Alle wiedergeben]
[Alle einfügen]
[Alle anhängen]

## 51. Verlauf Ersetzen

Das menü aus punkt 50 soll noch erweitert werden um den Punkt
[Verlauf ersetzen] - das löscht somit den Verlauf, fügt alle Songs aus
Treffer/Playlist ein und startet die wiedergabe.

## 52. Suchfeld X

Der Löschen-Button X soll rechtsbündig in der Eingabezeile stehen, nicht daneben.

## 53. Drag Visualisierung

Drag'n'Drop funktioniert im Verlauf nun.
Aber das gezogene Element soll sichtbar am Finger hängen und die Zielposition
muss intuitiv visualisiert werden (z.B. durch horizontalen einfügebalken).

## 54. Playlist Button

Das "öffnen" einer Playlist ist verwirrend, weil es einerseits den expliziten button gibt,
aber man kann auch in natürlicher form direkt auf den playlistnamen klicken.
ich würde vorschlagen, den button einfach wegzulassen.

## 55. Playlist Zurück

Wenn eine Playlist geöffnet wurde, dann soll statt der Eingabeleiste ein
[Zurcük] Button erscheinen. Damit kommt man wieder zu der Treffer-Liste.

## 56. Treffer Deaktiviert

Wenn die Trefferliste leer ist, muss der Button [Treffer] ausgegraut sein.

## 57. Zufall Dreißig

Der Zufall-Button soll 30 zufällige Lieder laden, nicht nur 8.

## 58. Playlist Griffe

Wenn eine Playlist geladen ist, müssen die Listeneinträge links auch solche
verschiebe-griffe haben, damit man die Playlist umsortieren kann.

## 59. Playlist Entfernen

Wenn eine Playlist geladen ist, braucht das 3-punkt Menü zusätzlich den Eintrag
[Aus der Playlist entfernen]

## 60. Einfügen Begriff

Statt [Einfügen nach dem aktuellen Song] einfach nur [Einfügen].

## 61. Liked Button

Links vom Button [Zufall] bitte einen neuen Button [Liked]
Damit sollen alle gelikten Lieder in der Trefferliste erscheinen.

## 62. Playlist Suchwort

Mit dem Suchbegriff "Playlist" oder anfänge davon sollen (auch) alle Playlists gelistet werden.
Wenn es andere Suchergebnisse mit diesem begriff gibt, müssen sie natürlich auch gelistet werden.

## 63. Künstler Album

In der Trefferliste müssen im 3-punkt Menü auch die Einträge
[Zeige Artist] und
[Zeige Album] gelistet sein, mit identischer Funktion wie für Songs im Verlauf.
Die Liste heißt dann z.b. "Album Best of Beatles" oder "Artist Mozart".
Es erscheint wiederum der Zurückbutton.

## 64. Dialog Tastatur

Die Eingabezeile, bzw. der Button [Plus] beim erstellen einer neuen Playlist
wird von der Tesla Tastatur verdeckt. Die Dialogbox soll ganz oben sitzen am
Bildschirm, und zusätzlich scrollbar sein, und darf max. 550px groß sein.

## 65. Dialog Fokus

Dialogboxen dürfen anfangs immer bis zu 900px hoch sein.
Bekommt aber die Texteingabe den Fokus, dann muss die Dialogbox auf 550px schrumpfen,
und so scrollen, dass das Eingabefeld sichtbar ist innerhalb der geschrumpften Box.

## 66. Künstler Begriff

Ersetze den Begriff "Artist" durch "Künstler"

## 67. Start Navigation

Für einen eifachern Start möchte ich, dass du die Sucheingabezeile etwas abänderst:
Nach dem Start sind 4 Buttons zu sehen:
[Lupe] führt zur Sucheingabe wie bisher. Aber rechts von der Eingabezeile gibt es einen
neuen Button [Zurück], dieser wechselt zurück zu den neuen 4 Buttons.
[Alben] --> Listet alle Alben auf.
[Künstler] --> Listet alle Künstler auf.
[Playlists] --> Listet alle Playlists auf.

## 68. Start Zufall

Nach dem Start soll eine Zufallsliste geladen werden, identisch mit dem klicken auf [Zufall]
Dies ist hilfreich, damit überhaupt Lieder sichtbar sind nach dem ersten Start.

## 69. Playback Spacing

Minimaler optischer Fix: die drei Haupttaster Back/PlayPause/Next sind nicht schön
mit identischem Zwischenraum angeordnet, auch zum Text für den aktuellen Song fehlt
der Zwischenraum. Bitte mach das etwas schöner.

## 70. Login Zufall

Nach einem neuen login muss natürlich auch diese Zufallsliste geladen werden.
Siehe Issue 68.

## 71. Lupe Fokus

Wenn auf [Lupe] geklickt wird, muss der Fokus in die Eingabezeile springen.

## 72. Benutzer Wechsel

Wir brauchen nun noch das Feature, zwischen mehreren angemeldeten Usern wechseln zu können.
Wenn ich auf [user] klicke, soll der bisherige dialog angezeigt werden, aber zusätzlich
müssen alle angemeldeten User gelistet sein, und einen zusätzlicher Button
[Anmelden] braucht es auch, der zum Loginscreen führt.
Damit soll dann ein weiterer User angemeldet werden können.
Die Verlaufsliste muss lokal für jeden User separat im Browser gespeichert bleiben.

## 73. User Button

Der Button [user] soll rechtsbündig angeordnet sein, also mit Abstand zum Button [Zufall]

## 74. Benutzer Spacing

Die Buttons in der Dialogbox für "Benutzer" haben kein einheitliches Spacing.

## 75. Einzelner Logout

[Logout] darf nur den aktuellen User abmelden, nicht alle.
Solange noch User angemeldet sind, bleibt der "Benutzer" Dialog offen, anstatt zum Login zu springen.

## 76. Dialog Eingabe

Beim Klick in eine Dialog-Eingabezeile wird der Dialog unerwartet geschlossen.
Betrifft alle diese Dialoge. Das ist unerwartetes, unbrauchbares Verhalten.

## 77. Anmelden Dialog

Der Button [Anmelden] funktioniert im Benutzer-Dialog nicht. Der Dialog wird einfach geschlossen.
