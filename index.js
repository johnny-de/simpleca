const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Statische Dateien ausliefern
app.use(express.static(path.join(__dirname, 'public')));

// Optional: einfache API-Route
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hallo von der API' });
});

// Fallback: index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`App läuft auf http://localhost:${PORT}`);
});
