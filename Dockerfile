# Use a lightweight Node 18 image based on Alpine for a small final image
FROM node:18-alpine

# Install OpenSSL (and bash if you need scripts)
RUN apk add --no-cache openssl bash

WORKDIR /usr/src/app

# Copy dependency manifests first so Docker can cache 'npm ci' layer when only source files change.
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm install --production

# Copy the rest of the application code
COPY . .

# Expose the HTTP port the app uses and set default environment variable
EXPOSE 3000
ENV PORT=3000

# Start the Node.js application
CMD ["node", "server.js"]
