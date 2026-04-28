FROM node:22-slim

# Install Chromium and required system libraries for headless PDF generation
RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell puppeteer to skip downloading its own Chromium and use the system one
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# O contexto agora é a raiz do projeto, então os arquivos estão em ./backend
COPY backend/package*.json ./

RUN npm install

COPY backend/ .

RUN npm run build

RUN cp -r src/assets dist/assets

EXPOSE 3000

CMD ["npm", "start"]
