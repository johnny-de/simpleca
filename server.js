const express = require('express');
const path = require('path');
const fs = require('fs');
const selfsigned = require('selfsigned');

const app = express();
const PORT = process.env.PORT || 3000;
const CERT_DIR = path.join(__dirname, 'data');
const PRIVATE_FILE = path.join(CERT_DIR, 'root-key.pem');
const PUBLIC_FILE = path.join(CERT_DIR, 'root-crt.pem');
const CERTS_JSON = path.join(CERT_DIR, 'certs.json');

// Body parsing for JSON requests (parse application/json and application/x-www-form-urlencoded)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets (HTML, CSS, JS) from the "public" directory
// Serve static files from the "data" directory
// [REMOVED] Serve static assets and /data here (moved further down so API routes register first)
// app.use(express.static(path.join(__dirname, 'public')));
// app.use('/data', express.static(path.join(__dirname, 'data')));

// liefert /public/certgen.html unter /certgen aus
app.get('/certgen', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'certgen.html'));
});

// Helper functions

// Check whether the CA private key and public certificate files exist on disk
function caExists() {
  try {
    return fs.existsSync(PRIVATE_FILE) && fs.existsSync(PUBLIC_FILE);
  } catch (e) {
    return false;
  }
}

// sanitize common name to filename base: lowercase, only letters+digits
function sanitizeName(name) {
  if (!name) return 'certificate';
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function ensureCertDir() {
  // Ensure the certificate storage directory exists and set secure permissions (0700)
  if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, { mode: 0o700, recursive: true });
  }
}

// read certs.json or return base structure
function readCertsJson() {
  try {
    ensureCertDir();
    if (!fs.existsSync(CERTS_JSON)) {
      return { certificates: [] };
    }
    const raw = fs.readFileSync(CERTS_JSON, 'utf8');
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.certificates)) {
        return { certificates: [] };
      }
      return parsed;
    } catch (e) {
      // invalid JSON -> start fresh
      return { certificates: [] };
    }
  } catch (e) {
    return { certificates: [] };
  }
}

function writeCertsJson(obj) {
  try {
    ensureCertDir();
    fs.writeFileSync(CERTS_JSON, JSON.stringify(obj, null, 2), { mode: 0o644 });
  } catch (e) {
    console.error('Failed to write certs.json', e);
    throw e;
  }
}

// generate unique filename in CERT_DIR with given base and suffix
function uniqueFilename(base, suffix) {
  let name = `${base}${suffix}`;
  let full = path.join(CERT_DIR, name);
  let counter = 1;
  while (fs.existsSync(full)) {
    name = `${base}-${counter}${suffix}`;
    full = path.join(CERT_DIR, name);
    counter += 1;
  }
  return name;
}

// format expiry date as DD.MM.YYYY (de-DE)
function formatExpiryDate(days) {
  const dt = new Date(Date.now() + (days * 24 * 60 * 60 * 1000));
  return dt.toLocaleDateString('de-DE');
}

// CA status: return whether a Root CA is present and a path to the private key (if present)
app.get('/api/root-ca/exsists', (req, res) => {
  res.json({ exists: caExists(), privatePath: caExists() ? '/certs/root.key.pem' : null });
});

// Generate a self-signed Root CA pair.
// Accepts options via JSON body: commonName, days (validity), keySize, algorithm.
// If "force" query flag is not set and CA exists, respond with 409 Conflict.
app.post('/api/root-ca/generate', (req, res) => {
  const force = req.query.force === '1' || req.query.force === 'true';
  if (caExists() && !force) {
    return res.status(409).json({ error: 'CA already exists' });
  }

  const { commonName = 'SimpleCA Root', days = 3650, keySize = 2048, algorithm = 'sha256' } = req.body || {};

  // Validation of input parameters: ensure numeric ranges and allowed key sizes
  const daysNum = parseInt(days, 10);
  const keySizeNum = parseInt(keySize, 10);
  if (!Number.isFinite(daysNum) || daysNum <= 0 || daysNum > 36500) {
    return res.status(400).json({ error: 'Invalid days value' });
  }
  if (![1024, 2048, 4096].includes(keySizeNum)) {
    return res.status(400).json({ error: 'Invalid keySize. Allowed: 1024, 2048, 4096' });
  }

  try {
    const attrs = [{ name: 'commonName', value: String(commonName) }];
    const opts = { keySize: keySizeNum, days: daysNum, algorithm: String(algorithm) };
    const pems = selfsigned.generate(attrs, opts);

    ensureCertDir();
    fs.writeFileSync(PRIVATE_FILE, pems.private, { mode: 0o600 });
    fs.writeFileSync(PUBLIC_FILE, pems.cert, { mode: 0o644 });

    return res.json({ message: 'Root CA generated', commonName: commonName, days: daysNum, keySize: keySizeNum });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to generate CA' });
  }
});

// Upload existing PEM-formatted private key and certificate.
// Performs simple format checks and writes the files with secure permissions.
app.post('/api/root-ca/upload', (req, res) => {
  const { private: privatePem, public: publicPem } = req.body || {};
  if (!privatePem || !publicPem) {
    return res.status(400).json({ error: 'Both private and public PEM must be provided' });
  }
  // simple validation
  if (!privatePem.includes('-----END RSA PRIVATE KEY-----') || !publicPem.includes('-----END CERTIFICATE-----')) {
    return res.status(400).json({ error: 'Invalid PEM format' });
  }
  try {
    ensureCertDir();
    fs.writeFileSync(PRIVATE_FILE, privatePem, { mode: 0o600 });
    fs.writeFileSync(PUBLIC_FILE, publicPem, { mode: 0o644 });
    return res.json({ message: 'CA uploaded' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to save CA' });
  }
});

// Generate a new leaf certificate (self-signed for now), save cert+key and update certs.json
app.post('/api/leaf/generate', (req, res) => {
  try {
    const { commonName = 'localhost', sans = '', days = 365, keySize = 2048 } = req.body || {};

    const daysNum = parseInt(days, 10);
    const keySizeNum = parseInt(keySize, 10);
    if (!Number.isFinite(daysNum) || daysNum <= 0 || daysNum > 36500) {
      return res.status(400).json({ error: 'Invalid days value' });
    }
    if (![1024, 2048, 4096].includes(keySizeNum)) {
      return res.status(400).json({ error: 'Invalid keySize. Allowed: 1024, 2048, 4096' });
    }

    // Build SANs array for selfsigned
    const sanList = String(sans || '').split(',').map(s => s.trim()).filter(Boolean);
    const altNames = sanList.map((entry) => {
      // rudimentary IP vs DNS detection
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(entry)) {
        return { type: 7, ip: entry };
      }
      return { type: 2, value: entry };
    });

    // Prepare attributes & options for selfsigned (separate implementation from root CA generation)
    const attrs = [{ name: 'commonName', value: String(commonName) }];
    const opts = {
      keySize: keySizeNum,
      days: daysNum,
      algorithm: 'sha256',
      extensions: [
        {
          name: 'subjectAltName',
          altNames: altNames
        }
      ]
    };

    const pems = selfsigned.generate(attrs, opts);

    // ensure data dir
    ensureCertDir();

    // prepare filenames
    const base = sanitizeName(commonName);
    const certFile = uniqueFilename(base, '-cert.pem');
    const keyFile = uniqueFilename(base, '-key.pem');

    const certPath = path.join(CERT_DIR, certFile);
    const keyPath = path.join(CERT_DIR, keyFile);

    // write files
    fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });
    fs.writeFileSync(certPath, pems.cert, { mode: 0o644 });

    // update certs.json
    const certsObj = readCertsJson();
    const expiry = formatExpiryDate(daysNum);
    certsObj.certificates = certsObj.certificates || [];
    certsObj.certificates.push({
      name: String(commonName),
      expiry: expiry,
      cert_file: certFile,
      key_file: keyFile
    });
    writeCertsJson(certsObj);

    return res.json({
      message: 'Leaf certificate generated',
      name: commonName,
      expiry,
      cert_file: certFile,
      key_file: keyFile,
      download_cert: `/data/${certFile}`,
      download_key: `/data/${keyFile}`
    });
  } catch (err) {
    console.error('Leaf generation failed', err);
    return res.status(500).json({ error: 'Failed to generate leaf certificate' });
  }
});

// delete helper: sucht Eintrag in certs.json, löscht die beiden Dateien (cert_file, key_file)
// und entfernt den Eintrag nur wenn keine I/O-Fehler beim Löschen aufgetreten sind.
// Rückgabe: { status: 'ok'|'notfound'|'error', details: { deleted:[], missing:[], errors:[] }, entry? }
function deleteCertificateByName(name) {
  if (!name) return { status: 'notfound' };
  const certsObj = readCertsJson();
  certsObj.certificates = certsObj.certificates || [];

  const idx = certsObj.certificates.findIndex(c => c.name === String(name));
  if (idx === -1) {
    console.log(`[delete] Eintrag mit name="${name}" nicht gefunden in certs.json`);
    return { status: 'notfound' };
  }

  const entry = certsObj.certificates[idx];
  console.log('[delete] Gefundener Eintrag:', entry);

  const dirResolved = path.resolve(CERT_DIR) + path.sep;
  const resolveFilename = (filename) => {
    if (!filename) return { ok: false, reason: 'no filename', filename: null };
    const full = path.join(CERT_DIR, filename);
    const resolved = path.resolve(full);
    if (!resolved.startsWith(dirResolved)) return { ok: false, reason: 'path outside cert dir', filename };
    return { ok: true, resolved, filename };
  };

  const certCheck = resolveFilename(entry.cert_file);
  const keyCheck = resolveFilename(entry.key_file);

  const deleted = [];
  const missing = [];
  const errors = [];

  const attemptUnlink = (check) => {
    if (!check.ok) {
      errors.push({ file: check.filename, reason: check.reason });
      return;
    }
    try {
      if (fs.existsSync(check.resolved)) {
        fs.unlinkSync(check.resolved);
        deleted.push(check.filename);
      } else {
        // Datei fehlt bereits -> als "missing" vermerken, aber kein fataler Fehler
        missing.push(check.filename);
      }
    } catch (e) {
      errors.push({ file: check.filename, error: String(e) });
    }
  };

  attemptUnlink(certCheck);
  attemptUnlink(keyCheck);

  if (errors.length > 0) {
    // Bei echten Fehlern: nichts an certs.json ändern
    return { status: 'error', details: { deleted, missing, errors }, entry };
  }

  // Wenn kein schwerer Fehler aufgetreten ist, Eintrag entfernen und persistieren
  certsObj.certificates.splice(idx, 1);
  try {
    writeCertsJson(certsObj);
    console.log(`[delete] certs.json aktualisiert, Eintrag "${name}" entfernt`);
  } catch (e) {
    console.error('[delete] Failed to write certs.json after deletion', e);
    return { status: 'error', details: { deleted, missing, writeError: String(e) }, entry };
  }

  return { status: 'ok', details: { deleted, missing }, entry };
}

// ersetze POST-Route durch Aufruf des Helpers und ausführliches Logging
app.post('/api/leaf/delete', (req, res) => {
  try {
    const { name } = req.body || {};
    console.log('[api] POST /api/leaf/delete request body:', req.body);
    if (!name) return res.status(400).json({ error: 'Missing certificate name' });

    const result = deleteCertificateByName(name);
    if (result.status === 'notfound') {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    if (result.status === 'error') {
      return res.status(500).json({ error: 'Failed to delete certificate', details: result.details });
    }
    return res.json({ message: 'Certificate deleted', name, details: result.details });
  } catch (err) {
    console.error('Delete leaf failed', err);
    return res.status(500).json({ error: 'Failed to delete certificate', details: String(err) });
  }
});

// optionaler GET-Test-Endpunkt (einfach im Browser testbar): /api/leaf/delete?name=localhost
// Achtung: GET löscht ebenfalls — nur als Debug/Convenience lokal gedacht.
app.get('/api/leaf/delete', (req, res) => {
  try {
    const name = req.query.name;
    console.log('[api] GET /api/leaf/delete?name=', name);
    if (!name) return res.status(400).send('Missing "name" query parameter');

    const result = deleteCertificateByName(name);
    if (result.status === 'notfound') {
      return res.status(404).send('Certificate not found');
    }
    if (result.status === 'error') {
      return res.status(500).json({ error: 'Failed to delete certificate', details: result.details });
    }
    return res.json({ message: 'Certificate deleted', name, details: result.details });
  } catch (err) {
    console.error('GET delete failed', err);
    return res.status(500).json({ error: 'Failed to delete certificate', details: String(err) });
  }
});

// --- ensure static file serving is registered after API routes ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(path.join(__dirname, 'data')));

app.listen(PORT, () => {
  console.log(`App läuft auf http://localhost:${PORT}`);
});