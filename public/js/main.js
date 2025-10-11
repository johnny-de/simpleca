document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/hello')
    .then(r => r.json())
    .then(data => console.log('API:', data))
    .catch(() => {});
});