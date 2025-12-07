# Steps:
# 1. Start Docker Desktop
# 2. Open Visual Studio terminal
# 3. Run the command to build and push image with a version-specific tag (e.g. '1.9.0'):
#    ! Dont forget to adapt the tag !    
#    > docker buildx build --platform linux/amd64,linux/arm64 -t johnnyde/alarmwatcher:1.9.0 --push . 
# 4. Run the command to build and push image with the 'latest' tag:
#    > docker buildx build --platform linux/amd64,linux/arm64 -t johnnyde/alarmwatcher:latest --push . 

# Use an official Node.js runtime as a parent image
FROM node:20

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

# Start the Node.js application
CMD ["node", "server.js"]
