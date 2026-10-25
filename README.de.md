<p align="center">
  <img src="docs/images/de/banner.svg" alt="Pare-DSH — Pares KI-Datenträgeruntersuchung in DeepSeek Harness" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.fr.md">Français</a> · <b>Deutsch</b>
</p>

<p align="center">
  <img alt="npm" src="https://img.shields.io/npm/v/@drag0nm/pare-dsh?style=flat-square&color=3a3a3a&labelColor=1b1b1b">
  <img alt="DeepSeek Harness" src="https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.2-3a3a3a?style=flat-square&labelColor=1b1b1b">
  <img alt="Pare core" src="https://img.shields.io/badge/Pare%20core-0.4.0-3a3a3a?style=flat-square&labelColor=1b1b1b">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-3a3a3a?style=flat-square&labelColor=1b1b1b">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-3a3a3a?style=flat-square&labelColor=1b1b1b">
</p>

Pare-DSH bringt die KI-Datenträgeruntersuchung von [Pare](https://github.com/DRAG0NM/Pare) in DeepSeek Harness (DSH). Der DSH-Agent untersucht mit den schreibgeschützten Werkzeugen von Pare, wo auf diesem Rechner Speicherplatz verschwendet wird, und bereitet eine Bereinigung vor. Scannen, Untersuchen und Bereinigen übernimmt der separate Pare-Kern; das Plugin startet nur den Kern, registriert die Werkzeuge und fordert die Freigabe an.

Nichts ändert sich, bevor Sie in der eigenen Freigabeabfrage von DSH zugestimmt haben, und Dateien werden nicht gelöscht, sondern in eine umkehrbare Quarantäne verschoben.

<p align="center">
  <img src="docs/images/en/demo.gif" alt="Eine DSH-Sitzung: Scan, Untersuchung, Freigabe und Bereinigungsbericht" width="100%">
</p>
<p align="center"><sub>Aufgenommen in einer echten DSH-Sitzung mit einem Demo-Ordner. Die Oberfläche von DSH gibt es nur auf Englisch und Chinesisch, daher zeigen die Screenshots die englische Oberfläche.</sub></p>

## Installation

```powershell
dsh plugin --profile web add @drag0nm/pare-dsh
```

Starten Sie das Profil neu (zum Beispiel `dsh web`). Es ist keine Konfiguration nötig. Beim ersten Start lädt das Plugin den festgelegten Pare-Kern herunter und prüft ihn (siehe [Der festgelegte Kern](#der-festgelegte-kern)).

## Genauer hingesehen

<table>
  <tr>
    <td width="50%"><img src="docs/images/en/approval.png" alt="DSH-Freigabeabfrage mit den genauen Dateien"><br><sub><b>Freigabe</b> — Die Abfrage listet die genauen Dateien auf, bevor etwas verschoben wird.</sub></td>
    <td width="50%"><img src="docs/images/en/result.png" alt="Bericht des Agenten nach der Bereinigung"><br><sub><b>Ergebnis</b> — Der Bericht des Agenten nach der Bereinigung, mit dem, was behalten wurde, und warum.</sub></td>
  </tr>
</table>

## Werkzeuge

Das Plugin startet einen dauerhaft laufenden `pare serve`-Prozess (Protokoll `pare.serve/1`, zeilenweise getrenntes JSON über Standardeingabe und -ausgabe) und registriert diese Werkzeuge. Der Scan-Index liegt in diesem Prozess, führen Sie daher `pare_scan` vor den Untersuchungswerkzeugen aus.

| Werkzeug | Aufgabe | Freigabe nötig |
|---|---|:---:|
| `pare_scan` | Schreibgeschützter Scan eines Laufwerks oder Ordners; behält den Index im Kernprozess | Nein |
| `pare_scan_overview`, `pare_list_dir`, `pare_find_large_files`, `pare_same_size_files`, `pare_breakdown`, `pare_file_head`, `pare_read_text`, `pare_path_info`, `pare_installed_programs`, `pare_running_processes`, `pare_run_diagnostic` | Schreibgeschützte Untersuchungswerkzeuge des Kerns. Die Liste wird beim Start beim Kern abgefragt (`hello`) und folgt der Kernversion | Nein |
| `pare_read_sensitive` | Liest Dateien, die Pare als sensibel einstuft (Schlüssel, `.env`, Browser-Anmeldedaten, Anmeldeinformationsspeicher) | Ja, jedes Mal |
| `pare_prepare_cleanup` | Registriert Pfade für die Quarantäne und unterstützte Aktionsvorlagen und liefert eine Bereinigungs-ID. Noch ändert sich nichts | Nein |
| `pare_execute` | Führt eine vorbereitete Bereinigung anhand ihrer ID aus | Ja |
| `pare_list_quarantine` | Listet Quarantäne-Stapel auf lokalen Laufwerken und deren Inhalt auf | Nein |
| `pare_undo` | Stellt einen Quarantäne-Stapel an seinem ursprünglichen Ort wieder her, ohne je eine Datei zu überschreiben, die den ursprünglichen Pfad inzwischen belegt | Ja |
| `pare_purge` | Löscht einen Quarantäne-Stapel endgültig, um Speicherplatz freizugeben; nicht rückgängig zu machen | Ja |

Das Plugin bietet keine rohen Shell-Befehle. Das in DSH eingebaute Bash-Werkzeug hat seine eigene Freigabe.

## Freigabe und Sicherheit

Das Plugin lauscht auf `tools/pre-execute` von DSH und antwortet für `pare_execute`, `pare_undo`, `pare_purge` und `pare_read_sensitive` mit `{kind: 'ask'}`. DSH fragt Sie über seinen eigenen Freigabedienst. Nur ein einmaliges `allowed-once` lässt den Aufruf durch; lehnen Sie ab, brechen Sie ab oder ist niemand zum Antworten da, wird der Aufruf verweigert (Fail-closed). Jede Abfrage wird im Audit-Protokoll der Sitzung festgehalten.

- Die Freigabeabfrage für `pare_execute` wird aus dem vom Plugin gespeicherten Plan erzeugt und listet die genauen Pfade und Vorlagenbefehle auf. Sie stammt nicht aus der Beschreibung des Modells.
- Unbekannte, abgelaufene und vor einem erneuten Scan erzeugte Bereinigungs-IDs werden ohne Nachfrage abgelehnt. Eine Bereinigungs-ID kann höchstens einmal ausgeführt werden.
- Das Abbrechen eines laufenden Aufrufs beendet den Kernprozess; der nächste Aufruf startet einen neuen, und `pare_scan` muss erneut ausgeführt werden.

Der Kern führt unabhängig vom Host eigene Prüfungen durch:

- Geschützte Orte werden immer abgelehnt.
- Jeder Eintrag trägt von `BuildSelected` erzeugte Belege.
- Vor dem Verschieben jeder Datei prüft der Ausführer erneut ihre Identität, ob sie verändert wurde und ob sie in Gebrauch ist.
- Aktionsvorlagen werden validiert, der Digest der Vorschau muss übereinstimmen, und eine Vorschau läuft nach 30 Minuten ab.
- Die Vorschau wird als verwendet markiert, bevor die Ausführung beginnt.
- `undo` und `purge` akzeptieren nur Manifeste innerhalb der Pare-Quarantäne.

Datenschutz: Die Untersuchungswerkzeuge geben Pfade und Dateinamen an das Modell (und dessen Anbieter) zurück. Der Inhalt sensibler Dateien erfordert bei jedem Lesen Ihre Freigabe.

## Der festgelegte Kern

Der Eintrag `pareCore` in `package.json` legt den Kern für diese Plugin-Version fest: Version 0.4.0, die Download-URL (das Asset `pare-0.4.0-win-x64.exe` des Releases `v0.4.0` von `DRAG0NM/Pare`) und dessen SHA-256, `23a09ed98b24642e80c1ee83d8a7464e6fa0df2ac1a1d6e078cd5882672001fb`.

Wenn weder `parePath` noch `PARE_CORE_PATH` gesetzt ist:

- Das Plugin verwendet `%LOCALAPPDATA%\Pare\core\pare-0.4.0.exe`, pro Benutzer außerhalb des Plugin-Verzeichnisses gespeichert, sodass eine Neuinstallation oder ein Upgrade des Plugins die Datei nicht verliert. Fehlt die Datei, wird sie von der festgelegten URL heruntergeladen: zuerst mit `curl.exe` aus System32 (das `HTTPS_PROXY` beachtet), bei einem Fehlschlag mit `Invoke-WebRequest` von PowerShell (das den Windows-Systemproxy verwendet).
- Nach dem Download wird der SHA-256 geprüft. Die Datei bleibt nur erhalten, wenn er übereinstimmt; ein nicht übereinstimmender Download wird gelöscht.
- Der Hash wird bei jedem Start und vor jedem Start des Kernprozesses erneut geprüft. Wurde die Datei verändert, verweigert das Plugin die Ausführung (es ersetzt sie nie automatisch), und die Fehlermeldung rät, die Datei zu löschen, damit sie neu heruntergeladen wird.
- Die von `hello` gemeldete Version muss der festgelegten Version entsprechen; andernfalls lehnt das Plugin den Kern ab und registriert keine Untersuchungswerkzeuge.
- Auf manchen Rechnern ist `AppData\Local` per EFS verschlüsselt, und ein Umbenennen innerhalb des Verzeichnisses wird abgelehnt (EXDEV), oder ein Virenscanner hält die Datei kurz fest. Das Plugin versucht es einige Sekunden lang erneut und weicht dann auf Kopieren und Löschen der temporären Datei aus; die endgültige Datei muss dieselbe Hash-Prüfung bestehen.

Zur Entwicklung können Sie `parePath` (Plugin-Option) oder die Umgebungsvariable `PARE_CORE_PATH` auf eine selbst gebaute `pare.exe` zeigen lassen (`go build -o pare.exe ./cmd/pare`). Dann findet keine Hash-Prüfung statt; es wird nur der Protokollname geprüft.

Auf Rechnern ohne Netzverbindung legen Sie dieselbe Datei (mit übereinstimmendem SHA-256) unter `%LOCALAPPDATA%\Pare\core\pare-0.4.0.exe` ab oder setzen `parePath`.

`timeoutMs` ist das Zeitlimit pro Aufruf, standardmäßig 600000 ms.

## Voraussetzungen

- Windows.
- DeepSeek Harness `0.2.1-rc.2` (Cordis `4.0.5`). Harness ist noch eine Entwicklervorschau, und seine Schnittstellen können sich inkompatibel ändern; Pare-DSH legt die Peer-Version auf die Werkzeugschnittstelle fest, gegen die es geprüft wurde. Testen Sie daher vor einem Upgrade erneut.
- Node.js 22.19 oder neuer (Anforderung von DSH selbst).
- Beim ersten Start Zugriff auf GitHub, um den festgelegten Kern herunterzuladen.

## Aus dem Quellcode bauen

```powershell
pnpm install
pnpm check
dsh plugin --profile web add .
```

In DSH 0.2.1-rc.2 durchgängig geprüft, einschließlich Ablehnen, Zulassen, Rückgängigmachen und endgültigem Löschen sowie der Installation aus npm.

## Lizenz

MIT, siehe [LICENSE](LICENSE). Hinweise zu den Abhängigkeiten stehen in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Der Kern ist [Pare](https://github.com/DRAG0NM/Pare), ebenfalls unter der MIT-Lizenz.

## Offizielle DSH-Ressourcen

- [Official Harness repository and release status](https://github.com/deepseek-ai/deepseek-harness)
- [Official first-plugin guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md)
- [Official tool authoring guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.md)
- [Official plugin packaging guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
