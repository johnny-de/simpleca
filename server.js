const express = require('express');
const path = require('path');
const fs = require('fs');
const selfsigned = require('selfsigned');
const { execFileSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const CERT_DIR = path.join(__dirname, 'data');
const PRIVATE_FILE = path.join(CERT_DIR, 'root-key.pem');
const PUBLIC_FILE = path.join(CERT_DIR, 'root-crt.pem');
const DER_FILE = path.join(CERT_DIR, 'root-crt.der');
const CERTS_JSON = path.join(CERT_DIR, 'certs.json');

// Body parsing for JSON requests (parse application/json and application/x-www-form-urlencoded)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// liefert /public/certgen.html unter /certgen aus
app.get('/certgen', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'certgen.html'));
});

// Helper functions

// Check whether the CA private key and public certificate files exist
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

// Function to convert PEM to DER format
function convertPemToDer(pemFilePath, derFilePath) {
    const pemData = fs.readFileSync(pemFilePath, 'utf8');
    const derData = Buffer.from(pemData.replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\n/g, ''), 'base64');
    fs.writeFileSync(derFilePath, derData);
}

// CA status: return whether a Root CA is present
app.get('/api/root-ca/exsists', (req, res) => {
  res.json({ exists: caExists() });
});

// Import a regular expression to check for IP addresses
const isIpAddress = (value) => /^(\d{1,3}\.){3}\d{1,3}$/.test(value);

// Generate a self-signed Root CA pair.
// Accepts options via JSON body: commonName, days (validity), keySize, algorithm.
// If "force" query flag is not set and CA exists, respond with 409 Conflict.
app.post('/api/root-ca/generate', (req, res) => {
  const force = req.query.force === '1' || req.query.force === 'true';
  if (caExists() && !force) {
    return res.status(409).json({ error: 'CA already exists' });
  }

  const { commonName = 'SimpleCA Root', days = 3650, keySize = 2048, algorithm = 'sha256' } = req.body || {};
  //console.log('New certificate requested: ', req.body);

  // Validation of input parameters: ensure numeric ranges and allowed key sizes
  const daysNum = parseInt(days, 10);
  const keySizeNum = parseInt(keySize, 10);

  // Initialize altNames array with CN as the first SAN entry
  const altNames = [];

  // Check if the commonName is an IP address or a DNS name
  if (isIpAddress(commonName)) {
      altNames.push({ type: 7, ip: commonName });  // IP type for IP address CN
  } else {
      altNames.push({ type: 2, value: commonName }); // DNS type for domain CN
  }
  
  // Define attributes for the certificate
  const attrs = [
      { name: 'commonName', value: commonName }
  ];

  // Define the options for the certificate generation
  const options = {
      keySize: keySizeNum,
      days: daysNum,
      algorithm: 'sha256',
      extensions: [
          {
              name: 'basicConstraints',
              cA: true
          },
          {
              name: 'keyUsage',
              keyCertSign: true,
              cRLSign: true
          },
          // ensure the CN is also present as SAN for the root cert
          {
              name: 'subjectAltName',
              altNames: altNames
          }
      ]
  };

  try {
    // Generate self-signed certificate with updated options
    const pems = selfsigned.generate(attrs, options);

    ensureCertDir();
    // write root key/cert with secure permissions
    fs.writeFileSync(PRIVATE_FILE, pems.private, { mode: 0o600 });
    fs.writeFileSync(PUBLIC_FILE, pems.cert, { mode: 0o644 });

    // Convert the PEM certificate to DER format
    convertPemToDer(PUBLIC_FILE, DER_FILE);

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

    // require root CA to exist
    if (!caExists()) {
      return res.status(400).json({ error: 'Root CA not present. Generate/upload root CA first.' });
    }

    // Prüfen auf vorhandenen Eintrag in certs.json ---
    const certsObj = readCertsJson();
    const normalizedNewName = String(commonName).trim().toLowerCase();
    const exists = (certsObj.certificates || []).some(c => String(c.name || '').trim().toLowerCase() === normalizedNewName);
    if (exists) {
      return res.status(409).json({ error: 'Certificate with that name already exists' });
    }

    // Build SAN entries: include CN as first SAN, then any additional SANs
    const sanEntries = [];
    if (commonName) {
      if (isIpAddress(commonName)) sanEntries.push({ type: 'IP', value: commonName });
      else sanEntries.push({ type: 'DNS', value: commonName });
    }
    if (sans) {
      const parts = String(sans).split(',').map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (isIpAddress(p)) sanEntries.push({ type: 'IP', value: p });
        else sanEntries.push({ type: 'DNS', value: p });
      }
    }

    // prepare filenames
    ensureCertDir();
    const base = sanitizeName(commonName || 'certificate');
    const certFile = uniqueFilename(base, '-cert.pem');
    const keyFile = uniqueFilename(base, '-key.pem');
    const certPath = path.join(CERT_DIR, certFile);
    const keyPath = path.join(CERT_DIR, keyFile);

    // temporary files (CSR and openssl config) placed in CERT_DIR
    const csrFile = path.join(CERT_DIR, `${base}-req.csr`);
    const cfgFile = path.join(CERT_DIR, `${base}-openssl.cnf`);

    // Build openssl config with SANs
    let altNamesSection = '';
    let dnsCount = 0;
    let ipCount = 0;
    for (const entry of sanEntries) {
      if (entry.type === 'DNS') {
        dnsCount += 1;
        altNamesSection += `DNS.${dnsCount} = ${entry.value}\n`;
      } else {
        ipCount += 1;
        altNamesSection += `IP.${ipCount} = ${entry.value}\n`;
      }
    }

    const cfg = `
[ req ]
default_bits = ${keySizeNum}
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[ req_distinguished_name ]
CN = ${commonName}

[ v3_req ]
subjectAltName = @alt_names
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[ alt_names ]
${altNamesSection}
`.trim();

    fs.writeFileSync(cfgFile, cfg, { mode: 0o600 });

    try {
      // generate key
      execFileSync('openssl', ['genrsa', '-out', keyPath, String(keySizeNum)], { cwd: CERT_DIR });

      // generate CSR using config (adds SANs)
      execFileSync('openssl', ['req', '-new', '-key', keyPath, '-subj', `/CN=${commonName}`, '-config', cfgFile, '-reqexts', 'v3_req', '-out', csrFile], { cwd: CERT_DIR });

      // sign CSR with Root CA (uses v3_req from the config to add SANs and usages)
      execFileSync('openssl', [
        'x509', '-req',
        '-in', csrFile,
        '-CA', PUBLIC_FILE,
        '-CAkey', PRIVATE_FILE,
        '-CAcreateserial',
        '-out', certPath,
        '-days', String(daysNum),
        '-sha256',
        '-extfile', cfgFile,
        '-extensions', 'v3_req'
      ], { cwd: CERT_DIR });
    } catch (e) {
      // cleanup possible partial files
      try { if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath); } catch (_) {}
      try { if (fs.existsSync(certPath)) fs.unlinkSync(certPath); } catch (_) {}
      try { if (fs.existsSync(csrFile)) fs.unlinkSync(csrFile); } catch (_) {}
      try { if (fs.existsSync(cfgFile)) fs.unlinkSync(cfgFile); } catch (_) {}
      console.error('OpenSSL step failed', e && e.message ? e.message : e);
      return res.status(500).json({ error: 'Failed to create or sign certificate (openssl error)', details: String(e && e.message ? e.message : e) });
    } finally {
      // remove csr and config (keep serial file created by CA if any)
      try { if (fs.existsSync(csrFile)) fs.unlinkSync(csrFile); } catch (_) {}
      try { if (fs.existsSync(cfgFile)) fs.unlinkSync(cfgFile); } catch (_) {}
    }

    // Create a fullchain (leaf cert followed by root CA) so webservers can use it directly
    const chainFile = uniqueFilename(base, '-fullchain.pem');
    const chainPath = path.join(CERT_DIR, chainFile);
    try {
      const leafPem = fs.readFileSync(certPath, 'utf8');
      const caPem = fs.readFileSync(PUBLIC_FILE, 'utf8');
      fs.writeFileSync(chainPath, leafPem + '\n' + caPem, { mode: 0o644 });
    } catch (e) {
      console.error('Failed to write fullchain', e);
      // non-fatal: continue but inform user
    }

    // set file permissions
    try { fs.chmodSync(keyPath, 0o600); } catch (_) {}
    try { fs.chmodSync(certPath, 0o644); } catch (_) {}

    // update certs.json
    const expiry = formatExpiryDate(daysNum);
    certsObj.certificates = certsObj.certificates || [];
    certsObj.certificates.push({
      name: String(commonName),
      expiry: expiry,
      cert_file: certFile,
      key_file: keyFile,
      chain_file: typeof chainFile !== 'undefined' ? chainFile : null
    });
    writeCertsJson(certsObj);

    return res.json({
      message: 'Leaf certificate generated and signed by Root CA',
      name: commonName,
      expiry,
      cert_file: certFile,
      key_file: keyFile,
      chain_file: typeof chainFile !== 'undefined' ? chainFile : null,
      download_cert: `/data/${certFile}`,
      download_key: `/data/${keyFile}`,
      download_chain: typeof chainFile !== 'undefined' ? `/data/${chainFile}` : null
    });
  } catch (err) {
    console.error('Leaf generation failed', err);
    return res.status(500).json({ error: 'Failed to generate leaf certificate', details: String(err && err.message ? err.message : err) });
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

  // Prepare checks for cert, key and optional chain file
  const certCheck = resolveFilename(entry.cert_file);
  const keyCheck = resolveFilename(entry.key_file);
  const chainCheck = entry.chain_file ? resolveFilename(entry.chain_file) : null;

  const deleted = [];
  const missing = [];
  const errors = [];

  const attemptUnlink = (check) => {
    if (!check) return; // nothing to delete (e.g. no chain file)
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
  attemptUnlink(chainCheck); // neu: versucht auch das fullchain-file zu löschen

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