document.addEventListener('DOMContentLoaded', () => {
  // Element references
  const createRow = document.getElementById('generate-form')?.closest('.row');
  const downloadAnchor = document.querySelector('a[href="/data/root-crt.pem"]');
  const downloadRow = downloadAnchor ? downloadAnchor.closest('.row') : null;

  // Helper: set visible/invisible (reset display if visible=true and displayDefault is '')
  function setVisible(el, visible, displayDefault = '') {
    if (!el) return;
    el.style.display = visible ? displayDefault : 'none';
  }

  // Checks /api/root-ca/exsists and adjusts UI accordingly
  async function checkRootCA() {
    try {
      const res = await fetch('/api/root-ca/exsists', { cache: 'no-store' });
      if (!res.ok) throw new Error('Network response not ok');
      const json = await res.json();
      const exists = !!json.exists;

      if (exists) {
        // CA exists: hide form, show downloads
        setVisible(createRow, false);
        setVisible(downloadRow, true, '');
      } else {
        // CA missing: show form, hide downloads
        setVisible(createRow, true, '');
        setVisible(downloadRow, false);
      }
    } catch (err) {
      // On error: just log, don't change UI
      console.error('Failed to check root-CA status:', err);
    }
  }

  // Initial check and repeat periodically
  checkRootCA();
  const INTERVAL_MS = 2000;
  // periodically re-check CA presence
  setInterval(checkRootCA, INTERVAL_MS);

  // Helper: set message text and optional styling (type: 'success'|'error'|'')
  function setMessage(el, text, type = '') {
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('text-success', 'text-danger');
    if (type === 'success') el.classList.add('text-success');
    if (type === 'error') el.classList.add('text-danger');
  }

  // Handle generate form submit: call API to generate root CA
  const generateForm = document.getElementById('generate-form');
  const genMessage = document.getElementById('gen-message');
  const generateBtn = document.getElementById('generate-btn');

  if (generateForm) {
    generateForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      // read form values
      const commonName = document.getElementById('commonName')?.value || 'SimpleCA Root';
      const days = document.getElementById('days')?.value || '3650';
      const keySize = document.getElementById('keySize')?.value || '2048';

      // disable button and show status
      if (generateBtn) generateBtn.disabled = true;
      setMessage(genMessage, 'Generating root CA...', '');

      try {
        const res = await fetch('/api/root-ca/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commonName, days, keySize })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          // handle known server errors (e.g. 409 conflict)
          const errMsg = data && data.error ? data.error : `Request failed (${res.status})`;
          setMessage(genMessage, errMsg, 'error');
        } else {
          setMessage(genMessage, 'Root CA generated successfully.', 'success');
          // update UI: hide generate form row and show download row
          setVisible(createRow, false);
          setVisible(downloadRow, true, 'block');
        }
      } catch (err) {
        console.error('Generate request failed:', err);
        setMessage(genMessage, 'Network error while generating CA', 'error');
      } finally {
        if (generateBtn) generateBtn.disabled = false;
      }
    });
  }
});
