FROM node:22-slim

# System libraries required by Chrome/Chromium headless on Debian 12 (Bookworm)
# Does NOT install system Chromium — Puppeteer downloads its own tested Chrome version
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libglib2.0-0t64 \
    libnss3 \
    libnspr4 \
    libatk1.0-0t64 \
    libatk-bridge2.0-0t64 \
    libcups2t64 \
    libdbus-1-3 \
    libdrm2 \
    libxkbcommon0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0t64 \
    libcairo2 \
    libasound2t64 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# O contexto agora é a raiz do projeto, então os arquivos estão em ./backend
COPY backend/package*.json ./

# Puppeteer downloads its own compatible Chrome during npm install
RUN npm install

COPY backend/ .

RUN npm run build

RUN cp -r src/assets dist/assets

EXPOSE 3000

CMD ["npm", "start"]
