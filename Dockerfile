# Steps (Ubuntu):
# 1. Run the command to build and push image with a version-specific tag (e.g. '1.9.0'):
#    ! Dont forget to adapt the tag !    
#    > sudo docker buildx build --platform linux/amd64,linux/arm64 -t johnnyde/simpleca1.0.0 --push . 
# 2. Run the command to build and push image with the 'latest' tag:
#    > sudo docker buildx build --platform linux/amd64,linux/arm64 -t johnnyde/simpleca:latest --push . 

# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Install OpenSSL (and bash if you need scripts)
RUN apt-get update && apt-get install -y openssl bash && rm -rf /var/lib/apt/lists/*

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
