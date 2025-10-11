const express = require('express');
const path = require('path');
const fs = require('fs');
const selfsigned = require('selfsigned');

const app = express();
const PORT = process.env.PORT || 3000;
const CERT_DIR = path.join(__dirname, 'certs');
const PRIVATE_FILE = path.join(CERT_DIR, 'root.key.pem');
const PUBLIC_FILE = path.join(CERT_DIR, 'root.crt.pem');

// Body parsing for JSON requests (parse application/json and application/x-www-form-urlencoded)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets (HTML, CSS, JS) from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Helper functions

// Check whether the CA private key and public certificate files exist on disk
function caExists() {
  try {
    return fs.existsSync(PRIVATE_FILE) && fs.existsSync(PUBLIC_FILE);
  } catch (e) {
    return false;
  }
}

function ensureCertDir() {
  // Ensure the certificate storage directory exists and set secure permissions (0700)
  if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, { mode: 0o700, recursive: true });
  }
}

// CA status: return whether a Root CA is present and a path to the private key (if present)
app.get('/api/ca/status', (req, res) => {
  res.json({ exists: caExists(), privatePath: caExists() ? '/certs/root.key.pem' : null });
});

// Generate a self-signed Root CA pair.
// Accepts options via JSON body: commonName, days (validity), keySize, algorithm.
// If "force" query flag is not set and CA exists, respond with 409 Conflict.
app.post('/api/ca/generate', (req, res) => {
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
app.post('/api/ca/upload', (req, res) => {
  const { private: privatePem, public: publicPem } = req.body || {};
  if (!privatePem || !publicPem) {
    return res.status(400).json({ error: 'Both private and public PEM must be provided' });
  }
  // simple validation
  if (!privatePem.includes('BEGIN') || !publicPem.includes('BEGIN')) {
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

// Simple API endpoint used as a lightweight health-check / handshake from the frontend
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hallo von der API' });
});

// Catch-all fallback to serve the single-page application's index.html.
// This ensures that direct navigation to client routes returns the UI.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the HTTP server on configured port and log the access URL
app.listen(PORT, () => {
  console.log(`App läuft auf http://localhost:${PORT}`);
});