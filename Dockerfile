FROM node:18-alpine

WORKDIR /usr/src/app

# Abhängigkeiten zuerst kopieren, damit Docker-Layer Caching greift
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm install --production

# App-Code kopieren
COPY . .

EXPOSE 3000
ENV PORT=3000

CMD ["node", "index.js"]
