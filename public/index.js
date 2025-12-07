document.addEventListener('DOMContentLoaded', () => {
  // Element references
  const createRow = document.getElementById('generate-form')?.closest('.row');
  const leafCertRow = document.getElementById('create-leaf-btn')?.closest('.row');
  const downloadAnchor = document.querySelector('a[href="/data/root-crt.pem"]');
  const downloadRow = downloadAnchor ? downloadAnchor.closest('.row') : null;

  // reference to the whole app content that is hidden by default
  const appContent = document.getElementById('app-content');

  // Helper: set visible/invisible (reset display if visible=true and displayDefault is '')
  function setVisible(el, visible, displayDefault = '') {
    if (!el) return;
    el.style.display = visible ? displayDefault : 'none';
  }

  // Checks /api/root-ca/exsists and adjusts UI accordingly
  async function checkRootCA() {
    try {
      const res = await fetch('/api/root-ca/exsists');
      if (!res.ok) throw new Error('Network response not ok');
      const json = await res.json();
      const exists = !!json.exists;

      if (exists) {
        // CA exists: hide form, show downloads
        setVisible(createRow, false);
        setVisible(downloadRow, true, '');
        setVisible(leafCertRow, true, '');
      } else {
        // CA missing: show form, hide downloads
        setVisible(createRow, true, '');
        setVisible(downloadRow, false);
        setVisible(leafCertRow, false);
      }
    } catch (err) {
      // On error: just log, don't change UI
      console.error('Failed to check root-CA status:', err);
    }
  }

  // Initial check: warte auf das Ergebnis und zeige dann den zuvor versteckten Hauptbereich.
  const INTERVAL_MS = 2000;
  (async function init() {
    try {
      await checkRootCA();
    } catch (e) {
      // intentional: proceed to show UI even if checkRootCA threw (errors are logged inside)
    } finally {
      if (appContent) {
        // restore display (leer lässt das CSS/GH-Layout entscheiden) — falls Probleme, 'block' setzen
        appContent.style.display = '';
      }
      // danach das periodische Polling starten
      setInterval(checkRootCA, INTERVAL_MS);
    }
  })();

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

  // --- Helper function to load leaf-certs ---
  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderLeafList(certs) {
    const tbody = document.getElementById('leaf-list');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!certs || certs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-muted">No leaf certificates</td></tr>';
      return;
    }
    certs.forEach((entry) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(entry.name)}</td>
        <td>${escapeHtml(entry.expiry)}</td>
        <td>
          <a href="/data/${encodeURIComponent(entry.chain_file)}" class="btn btn-sm btn-primary m-1" download>Download Certificate</a>
          <a href="/data/${encodeURIComponent(entry.key_file)}" class="btn btn-sm btn-secondary m-1" download>Download Key</a>
          <!-- pass only the certificate name to the delete handler -->
          <button class="btn btn-sm btn-danger" data-name="${escapeHtml(entry.name)}" title="Delete">
            <img src="/delete.svg" alt="Delete" width="16" height="16" />
          </button>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  // delegate click events on delete buttons (sends { name } to /api/leaf/delete)
  (function attachDeleteHandler() {
    const tbody = document.getElementById('leaf-list');
    if (!tbody) return;
    tbody.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button[data-name]');
      if (!btn) return;
      const name = btn.getAttribute('data-name');
      if (!name) return;
      if (!confirm(`Delete certificate "${name}"?`)) return;

      btn.disabled = true;
      // show a short status in the existing gen-message area (if available)
      setMessage(genMessage, `Deleting ${name}...`, '');

      try {
        const res = await fetch('/api/leaf/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = data && data.error ? data.error : `Delete failed (${res.status})`;
          setMessage(genMessage, err, 'error');
        } else {
          setMessage(genMessage, `Deleted ${name}`, 'success');
          // reload list to reflect deletion
          await loadLeafList();
        }
      } catch (err) {
        console.error('Delete request failed', err);
        setMessage(genMessage, 'Network error while deleting certificate', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  })();

  async function loadLeafList() {
    try {
      // Load the static certs.json from /data (no cache to reflect updates immediately)
      const res = await fetch('/data/certs.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to fetch certs.json (${res.status})`);
      const json = await res.json();
      // certs.json has a top-level "certificates" array
      renderLeafList(json && Array.isArray(json.certificates) ? json.certificates : []);
    } catch (err) {
      console.error('Failed to load certs.json from /data:', err);
      // Keep previous UI state; show placeholder row if needed
      renderLeafList([]);
    }
  };

  // initial and periodic load
  loadLeafList();
  const LEAF_REFRESH_MS = 5000;
  setInterval(loadLeafList, LEAF_REFRESH_MS);
});
