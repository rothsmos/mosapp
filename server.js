'use strict';
require('dotenv').config({ path: 'credentials.env' });

const express  = require('express');
const cors     = require('cors');
const axios    = require('axios');
const multer   = require('multer');
const FormData = require('form-data');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 << 20 } });
app.use(cors());

const { MOODLE_URL, MOODLE_TOKEN, MOODLE_COURSE_ID } = process.env;
if (!MOODLE_URL || !MOODLE_TOKEN) { console.error('credentials.env fehlt'); process.exit(1); }

const moodleBase = MOODLE_URL.replace(/\/$/, '');
const base       = moodleBase + '/webservice/rest/server.php';
const uploadUrl  = moodleBase + '/webservice/upload.php';

function moodleGet(fn, params = {}) {
  return axios.get(base, { params: { wstoken: MOODLE_TOKEN, moodlewsrestformat: 'json', wsfunction: fn, ...params }, timeout: 15000 }).then(r => r.data);
}

function moodlePost(fn, params = {}) {
  const p = new URLSearchParams({ wstoken: MOODLE_TOKEN, moodlewsrestformat: 'json', wsfunction: fn, ...params });
  return axios.post(base, p, { timeout: 15000 }).then(r => r.data);
}

function wrap(fn) {
  return async (req, res) => {
    try {
      const data = await fn(req);
      if (data?.exception) return res.status(400).json({ error: data.message });
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.response ? 'Moodle ' + e.response.status : e.message });
    }
  };
}

app.get('/api/course-contents', wrap(req =>
  moodleGet('core_course_get_contents', { courseid: req.query.courseid || MOODLE_COURSE_ID })
));

app.get('/api/assignments', wrap(req =>
  moodleGet('mod_assign_get_assignments', { 'courseids[0]': req.query.courseid || MOODLE_COURSE_ID })
));

app.get('/api/submission-status', wrap(req =>
  moodleGet('mod_assign_get_submission_status', { assignid: req.query.assignid })
));

app.get('/api/user-courses', wrap(async () => {
  const info = await moodleGet('core_webservice_get_site_info');
  if (info.exception) throw new Error(info.message);
  return moodleGet('core_enrol_get_users_courses', { userid: info.userid });
}));

// Datei-Proxy: hängt Token serverseitig an, Token bleibt geheim
app.get('/api/file', async (req, res) => {
  const url = req.query.url || '';
  if (!url.startsWith(moodleBase)) return res.status(400).json({ error: 'Ungültige URL' });
  try {
    const sep = url.includes('?') ? '&' : '?';
    const r = await axios.get(url + sep + 'token=' + MOODLE_TOKEN, { responseType: 'stream', timeout: 30000 });
    if (r.headers['content-type'])        res.set('content-type', r.headers['content-type']);
    if (r.headers['content-disposition']) res.set('content-disposition', r.headers['content-disposition']);
    r.data.pipe(res);
  } catch (e) { res.status(502).json({ error: 'Datei-Fehler: ' + e.message }); }
});

// Aufgaben-Abgabe: Datei → Moodle Draft → save_submission → submit_for_grading
app.post('/api/submit', upload.single('file'), async (req, res) => {
  try {
    const { assignmentid } = req.body;
    if (!assignmentid) throw new Error('assignmentid fehlt');

    // 1. Datei in Moodle Draft-Bereich hochladen
    const form = new FormData();
    form.append('token', MOODLE_TOKEN);
    form.append('file', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
    const up = await axios.post(uploadUrl, form, { headers: form.getHeaders(), timeout: 30000 });
    const itemid = up.data[0]?.itemid;
    if (!itemid) throw new Error('Upload fehlgeschlagen – kein itemid');

    // 2. Abgabe speichern
    const save = await moodlePost('mod_assign_save_submission', {
      assignmentid,
      'plugindata[files_filemanager]': itemid,
      'plugindata[onlinetext_editor][text]': '',
      'plugindata[onlinetext_editor][format]': 1,
      'plugindata[onlinetext_editor][itemid]': 0,
    });
    if (save?.exception) throw new Error(save.message);

    // 3. Endgültig abgeben (optional, ignoriert Fehler falls nicht erforderlich)
    await moodlePost('mod_assign_submit_for_grading', { assignmentid, acceptsubmissionstatement: 1 }).catch(() => {});

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(3001, () =>
  console.log(`Proxy läuft auf http://localhost:3001  (Kurs-ID: ${MOODLE_COURSE_ID})`));
