**SimpleCA** is a lightweight, self-hosted Certificate Authority (CA) web application.  
It allows you to easily generate your own Root Certificate or upload an existing one, and then issue Leaf Certificates based on them. These certificates can be used to secure websites and services in a lab or private network environment.

<a target="_blank" href="https://github.com/johnny-de/simpleca"><img src="https://img.shields.io/github/stars/johnny-de/simpleca?style=flat" /></a> 
<a target="_blank" href="https://github.com/johnny-de/simpleca"><img src="https://img.shields.io/github/v/release/johnny-de/simpleca" /></a> 
<a target="_blank" href="https://github.com/johnny-de/simpleca"><img src="https://img.shields.io/github/last-commit/johnny-de/simpleca" /></a>
<a target="_blank" href="https://hub.docker.com/r/johnnyde/simpleca"><img src="https://img.shields.io/docker/pulls/johnnyde/simpleca" /></a> 
<a target="_blank" href="https://hub.docker.com/r/johnnyde/simpleca"><img src="https://img.shields.io/docker/v/johnnyde/simpleca" /></a>

<div align="center">
    <a href="https://github.com/johnny-de/simpleca/">
        <img src="https://github.com/johnny-de/data/blob/main/simpleca/app.png?raw=true" 
             alt="Screenshot" 
             width="600" 
             style="border: 2px solid black;"/>
    </a>
</div>

## Features

- **Root Certificate:** Generate a new Root CA or upload your own.
- **Leaf Certificate:** Create end-entity certificates signed by your Root CA.
- **Web-based frontend:** Intuitive interface for managing certificates.
- **Simple workflow:** Designed for labs and test environments for quick setup.
- **Exportable keys and certs:** Download PEM files for direct use in servers and clients.
- **Dockerized deployment:** Run SimpleCA easily in any environment using Docker.

## How it works

1. **Create or upload a Root Certificate**  
   - This Root CA will be used to sign all Leaf Certificates.  
   - On client devices, you must **trust this Root Certificate** (import it into the OS/browser trust store).

2. **Generate Leaf Certificates**  
   - Create Leaf Certificates for your websites or services.  
   - Each Leaf Certificate comes with its private key.

3. **Deploy certificates**  
   - On your web server, configure the Leaf Certificate and private key.  
   - Since clients already trust the Root CA, connections to your site will be recognized as secure.

## Docker usage

SimpleCA is available as a Docker image on [Docker Hub](https://hub.docker.com/r/johnnyde/simpleca).

Run it with:

```bash
docker run -d \
  -p 3000:3000 \
  --name simpleca \
  johnnyde/simpleca
```

## Example usage 
- Import the Root Certificate into your browser or operating system. 
- Configure your web server (e.g., Nginx, Apache, or Dockerized service) with the Leaf Certificate and its key. 
- Access your site via HTTPS — the browser will trust it because the Root CA is known. 

## Bug reports / feature requests 
If you want to report a bug or request a new feature, feel free to open a [new issue](https://github.com/johnny-de/simpleca/issues).