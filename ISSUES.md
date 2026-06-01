# Issues TODO

1. Auto continue, wenn app wieder gestartet wird (erneutes einsteigen in das fahzeug)
   Sobald der Browser wieder geöffnet wird, muss die Musik exakt dort fortgesetzt werden, wo sie aufgehört hat. 
2. Dark/Light theme soll vom Fahzeug übernommen werden, möglichst live. 
   Das wird je nach außenhelligkeit automatisch vom fahrzeug umgestellt.
3. Aktueller Song im Verlauf soll mittig in den screen rücken, wenn mit next/back geskippt wird oder 
   der nächste Song automatisch beginnt,
   sodass die paar vergangenen und die paar kommenden lesbar sind. 
4. Next/Back geht aktuell noch nicht über scrollrad
   Hier sollten wir evt. im Test WebUI analysieren, was der browser davon empfangen kann. das wäre für den 
   betrieb im Fahrzeug schon sehr wichtig. 
6. Neuer Button [Alle wiedergeben]: alle Songs in der Trefferliste werden in die Verlauf gegeben
7. Treffer: klick auf song in der trefferliste: nur diesen song einfügen
8. Verlauf soll immer 8 titel in zukunft haben, zur not mit zufall erweitert.
9. Direkte titelwahl in der Trefferliste: einfügen nach aktuellem song, sofort starten, Verlauf aber beibehalten.
10. Zufall: nur 8 Songs in Zukunft an die Verlauf anhängen. 
11. Login: Auge-Button für Passworteingabe im Klartext
12. Login-Textfelder und Buttons weiter nach oben schieben, damit diese nicht von der Tastatur überlagert werden
13. Like-Button nur für aktuellen Song zeigen
14. Zurück soll zum Anfang des tracks springen, außer Song läuft erst max. 3s. 
15. Pause (stop) über scrollrad funktioniert, play aber nicht. 
    Für kurze Wiedergabepause ist es aktuell unbrauchbar, wäre aber sehr wichtig. 
16. Vergangenheit in Verlauf sollte niemals gelöscht werden. Diese soll aber auf 200 Einträge begrenzt werden. 
17. Deutscher Begriff für Queue: Verlauf 
19. Lang drücken auf Song in Trefferliste bietet die Option: 
    [Einfügen nach aktuellem Song]
    [Zur Playlist hinzufügen] --> dann kommt auswahl an vorhandenen Playlists und ein Plus-Symbol für das erzeugen 
    einer neuen Playlist (dies ist für den Fahrer uninteressant, aber für den Beifahrer). 
20. Long-Press auf Song in Verlauf: 
    [Zur Playlist hinzufügen]
    [Zeige Album] --> Trefferliste zeigt dann die Album-Songs. 
    [Zeige Artist] --> Trefferliste zeigt dann alle Songs zu dem Artisten. 
    [Entfernen]
21. Long-Press auf "Verlauf" soll die Option bieten: 
    [Löschen] --> löscht aktuelle Verlauf und füllt sie entsprechend automatisch mit 8 Zufallslieder. 
    [Unbeliebte Songs entfernen] --> entfernt Songs, die mehr als 10% aber weniger als zu 50% gespielt wurden. 
    Gefällt ein Lied nicht besonders gut, wird es typischerweise geskippt. 
    [Verlauf als Playlist speichern]
    [Verlauf würfeln] Dabei wird die aktuelle Verlauf gemischt, 
    und der aktuell abgespielte Song rutscht auf Platz 1. Damit die Wiedergabe nicht unterbrochen wird. 
22. Suchfeld braucht rechts einen X-Button zum löschen der Eingabe
23. Verlauf ist per se kein typischer Button, daher braucht es keinen long-press. Stelle den Titel "Verlauf"
    als Button dar. Somit sollte sich der User gut zurecht finden. 
23b. Treffer-Titel-Label wird zum Button. --> Untermenü
24. Wie sagen dem Tesla-Browser offenbar, dass wir ein Video abspielen. Dadurch kommt oben 
    im Broweser ein Hinweis, dass nur Audio abgespielt wird, Video nicht (während der Fahrt). 
    Wir sollten den Browser nicht glauben lassen, dass wir ein Video abspielen, 
    sondern ohnehin nur Audio. 
25. Untermenüs brauchen auch Große Schrift für die Auswahlelemente. 
26. Der Logoutbutton soll "karl" heißen, wenn das der eingeloggte User ist. 
    Erst durch einen Klick darauf bekommt man ein Menü für Logout. 
    Später werden wir hier weitere User auflisten, zu denen man schnell wechseln können wird. 
27. Bei klick auf Mehr bei einem Song in der Trefferliste und der Auswahl
    [Einfügen nach aktuellem Song] darf diesen nicht sofort spielen. der Bisherige
    Song muss zuerst fertig gespielt haben. 
28. Zustands-Icon muss für liked Songs dargestellt werden in der Trefferliste (read only)
29. [Alle wiedergeben] soll in das Menü "Treffer". 
30. Suche soll auch nach Playlists suchen. Wenn es eine Playlist "Party" gibt, und ich 
    suche nach "Par", dann muss diese Playlist in den Treffer angezeigt werden. 
31. Verlauf und Treffer müssen als Button erkenntlich sein!
32. Der Button [Zufall] soll nur eine Trefferliste mit 8 Songs erstellen, aber sie nicht automatisch 
    im Verlauf anhängen. 
33. Verlaufbutton: neuer Eintrag: [Entferne vergangene Songs] und [Entferne zukünftige Songs]
34. Das Verhalten für das automatische Anhängen von 8 Zufallssongs muss leicht geändert werden. 
    Erst bei einem Skip wird diese Regel angewandt, nicht immmer. Das ermöglicht, 
    dass man sich eine eigene Playlist im Verlauf zusammenstellen kann. 
35. Long-Press im Verlauf wird ersetzt durch ein vertikales 3-punkt symbol am rechten Rand eines 
    Eintrags in der Verlaufsliste. 
36. Im Tesla hatte ich einmal den Bug, dass ein Song fertig war, und dann nicht der nächste
    Song im Verlauf abgespielt wurde. Die Wiedergabe stoppte. 
37. Den weiteren Bug: ich hatte ein Lied abgespielt, dann auf like geklickt, dann im
    Verlauf ein anderes Lied gestartet und dann mit [Back] wieder das vorige lied gestartet, 
    dabei wurde das lied an dessen letzter position fortgesetzt. Das ist unerwartetes verhalten. 
    Ein song sollte immer am Anfang starten. 
38. Im User-Menü soll man auch einstellen können, ob man Light/Darktheme oder Auto verwenden möchte. 
39. Verschiebe die erledigten Issues ins nächste Kapitel "Issues Erledigt". Behalte die Nummerierung aber bei. 


# Issues Erledigt

// bitte verschieben