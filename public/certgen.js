document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('leaf-cert-form');
  const msg = document.getElementById('status-message');

  function setMessage(text, isError = false) {
    if (!msg) return;
    msg.textContent = text || '';
    msg.classList.remove('text-success', 'text-danger');
    msg.classList.add(isError ? 'text-danger' : 'text-success');
  }

  if (!form) return;

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    // Keine Statusmeldung bei Start; nur Fehler sollen angezeigt werden.

    const commonName = document.getElementById('input-common-name')?.value || '';
    const sans = document.getElementById('input-sans')?.value || '';
    const days = document.getElementById('input-days')?.value || '365';
    const keySize = document.getElementById('select-key-size')?.value || '2048';

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch('/api/leaf/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commonName, sans, days, keySize })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = data && data.error ? data.error : `Server error (${res.status})`;
        setMessage(err, true);
      } else {
        // On success redirect back to main page
        window.location.href = '/';
      }
    } catch (err) {
      console.error('Network error', err);
      setMessage('Network error while generating certificate', true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
});
