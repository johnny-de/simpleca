/*document.addEventListener('DOMContentLoaded', () => {
  // Query and cache frequently used DOM elements for status, messages and forms
  const statusEl = document.getElementById('ca-status');
  const genMsgEl = document.getElementById('gen-message');
  const uploadMsgEl = document.getElementById('upload-message');
  const genForm = document.getElementById('generate-form');
  const genBtn = document.getElementById('generate-btn');
  const genForceBtn = document.getElementById('generate-force-btn');
  const uploadForm = document.getElementById('upload-form');
  const privatePemEl = document.getElementById('privatePem');
  const publicPemEl = document.getElementById('publicPem');
  const commonNameEl = document.getElementById('commonName');
  const daysEl = document.getElementById('days');
  const keySizeEl = document.getElementById('keySize');

  // Helper to show messages to the user. Uses bootstrap text classes for basic styling.
  function setMessage(el, text, isError = false) {
    el.textContent = text;
    el.className = isError ? 'text-danger' : 'text-success';
  }

  // Fetch the current CA status from the server and update the UI text.
  function fetchStatus() {
    fetch('/api/root-ca/exsists')
      .then(r => r.json())
      .then(data => {
        if (statusEl) statusEl.textContent = data.exists ? 'Root-CA vorhanden' : 'Keine Root-CA vorhanden';
      })
      .catch(() => {
        if (statusEl) statusEl.textContent = 'Fehler beim Laden des Status';
      });
  }

  // Perform CA generation: collect form values, validate them, call the backend API.
  // The "force" flag overrides existing CA files when set.
  async function doGenerate(force = false) {
    const commonName = commonNameEl.value.trim() || 'SimpleCA Root';
    const days = parseInt(daysEl.value, 10) || 3650;
    const keySize = parseInt(keySizeEl.value, 10) || 2048;

    // Validate numeric inputs and allowed key sizes before sending request
    if (days <= 0 || days > 36500) {
      setMessage(genMsgEl, 'Gültigkeit (Tage) ungültig', true);
      return;
    }
    if (![1024, 2048, 4096].includes(keySize)) {
      setMessage(genMsgEl, 'Key-Größe ungültig', true);
      return;
    }

    setMessage(genMsgEl, 'Generiere...', false);
    // Send POST request to /api/root-ca/generate with JSON payload and handle response
    try {
      const resp = await fetch('/api/root-ca/generate' + (force ? '?force=1' : ''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commonName, days, keySize, algorithm: 'sha256' })
      });
      const j = await resp.json().catch(()=>({}));
      if (!resp.ok) throw new Error(j.error || 'Fehler');
      setMessage(genMsgEl, j.message || 'Root-CA erfolgreich generiert', false);
      fetchStatus();
    } catch (err) {
      setMessage(genMsgEl, 'Fehler: ' + err.message, true);
    }
  }

  // Handle generate form submit: prevent default form behavior and start generation
  genForm.addEventListener('submit', (e) => {
    e.preventDefault();
    doGenerate(false);
  });

  // Handle upload form submit: validate presence of both PEM fields and POST them to server
  uploadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const privatePem = privatePemEl.value.trim();
    const publicPem = publicPemEl.value.trim();
    if (!privatePem || !publicPem) {
      setMessage(uploadMsgEl, 'Beide PEM-Felder ausfüllen', true);
      return;
    }
    setMessage(uploadMsgEl, 'Lade hoch...', false);
    fetch('/api/root-ca/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ private: privatePem, public: publicPem })
    })
      .then(async r => {
        if (!r.ok) {
          const j = await r.json().catch(()=>({}));
          throw new Error(j.error || 'Fehler');
        }
        return r.json();
      })
      .then(() => {
        setMessage(uploadMsgEl, 'Root-CA erfolgreich hochgeladen');
        privatePemEl.value = '';
        publicPemEl.value = '';
        fetchStatus();
      })
      .catch(err => setMessage(uploadMsgEl, 'Fehler: ' + err.message, true));
  });

  // Initial warm-up call to the API and load the current status of the CA on page load
  fetchStatus();

  // defensive: only attach listener if the optional force-button exists
  if (genForceBtn) {
    genForceBtn.addEventListener('click', () => {
      if (!confirm('Bestehende CA überschreiben?')) return;
      doGenerate(true);
    });
  }
});*/
