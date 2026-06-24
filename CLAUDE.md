# MOS München – Lernplattform (mosapp)

Schlanke **Moodle-REST-Bridge**: Ein Node/Express-Proxy hält den Moodle-API-Token
geheim und liefert ein Single-File-Web-Frontend aus, das Kursinhalte, Aufgaben und
Abgaben für Schüler:innen darstellt.

## Architektur

```
Browser (index.html)  ──HTTP──>  Express-Proxy (server.js :3001)  ──REST──>  Moodle Web Service
```

- Der **Token bleibt serverseitig**. Das Frontend kennt ihn nie; auch Dateien werden
  über den Proxy (`/api/file`) geladen, der den Token anhängt.
- Das Frontend hat einen **Demo-Fallback** (`DEMO` in index.html), falls der Proxy
  nicht erreichbar ist.

## Dateien

| Datei | Zweck |
|---|---|
| `server.js` | Express-Proxy, Moodle-REST-Wrapper, Datei-Proxy, Aufgaben-Abgabe |
| `index.html` | Komplettes Frontend (HTML + CSS + JS in einer Datei) |
| `docs/template_original.html` | Statisches Design-Template (Zielbild fürs Layout, nicht live) |
| `credentials.env` | Geheimnisse (per `.gitignore` ausgeschlossen, **nie committen**) |

## Setup & Start

1. `npm install`
2. `credentials.env` im Projektordner anlegen:
   ```
   MOODLE_URL=https://moodle.example.org
   MOODLE_TOKEN=<web-service-token>
   MOODLE_COURSE_ID=145
   ```
3. `npm start` (oder `npm run dev` für Auto-Reload) → Proxy auf http://localhost:3001
4. `index.html` öffnen (lädt Daten vom Proxy).

Ohne `MOODLE_URL`/`MOODLE_TOKEN` beendet sich der Server sofort (`server.js:15`).

## API-Endpunkte (server.js)

| Endpunkt | Moodle-Funktion |
|---|---|
| `GET /api/course-contents` | `core_course_get_contents` |
| `GET /api/assignments` | `mod_assign_get_assignments` |
| `GET /api/submission-status` | `mod_assign_get_submission_status` |
| `GET /api/user-courses` | `core_webservice_get_site_info` + `core_enrol_get_users_courses` |
| `GET /api/file?url=` | Datei-Proxy (hängt Token an, nur URLs unter `MOODLE_URL`) |
| `POST /api/submit` | Upload → `mod_assign_save_submission` → `mod_assign_submit_for_grading` |

## Datenmodell-Mapping (Moodle → Frontend)

Moodle liefert nur **2 Ebenen**: `Kurs → Abschnitt (section) → Modul (module)`.

Aktueller Stand in `index.html`:
- Moodle-**Abschnitt** → horizontaler Reiter (`renderTabs`, `showSection`)
- Moodle-**Modul** → flache Zeile (`renderMod`), Inhalt je `modname` (`renderModContent`)
- `modLabel()` mappt `modname` → Anzeigelabel (resource→PDF, url→URL, page→Seite,
  assign→Aufgabe …)

Zielbild (template_original.html) hat **3 Ebenen**: `Sektion → Phase → Material`.
Diese Phasen-Verschachtelung und die Material-Reiter sind im Frontend **noch nicht**
umgesetzt. Zwei Autoren-Wege in Moodle, um die 3. Ebene zu erzeugen:

- **Weg A (Moodle 4.5+):** native **Unterabschnitte** — Abschnitt = Sektion,
  Unterabschnitt = Phase, Modul = Material.
- **Weg B:** Abschnittsnamen mit Trennzeichen `Sektion | Phase`, Frontend gruppiert
  nach Präfix.

Material-Reiter (Video/PDF/Seite) ergeben sich aus den `modname` der Module einer Phase
(`page`→Seite, `resource`→PDF, `url`/Videodatei→Video, `assign`→Abgabe).

## Konventionen

- UI-Texte und Code-Kommentare auf **Deutsch**.
- Kein Build-Step, kein Framework — bewusst minimal (HTML/CSS/JS in einer Datei).
- `multer` ist auf 2.x (Sicherheits-Fix ggü. 1.x).
