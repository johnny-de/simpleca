# SimpleCA - NodeJS + Bootstrap Beispiel

Lokal:
1. Node.js installieren (>=18).
2. Abhängigkeiten installieren:
   npm install
3. App starten:
   npm start
4. Dev-Modus:
   npm run dev

Mit Docker:
1. Docker bauen:
   docker build -t simpleca .
2. Container starten:
   docker run -p 3000:3000 simpleca

Oder mit docker-compose:
   docker-compose up --build

Webapp erreichbar unter http://localhost:3000