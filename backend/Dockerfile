FROM node:22-slim

# Install Chromium + explicit runtime libs required for headless Chrome on Debian 12 Bookworm
# Package names WITHOUT t64 suffix (t64 is Ubuntu 24.04/Debian trixie only)
RUN apt-get update && apt-get install -y \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Use the system Chromium; skip puppeteer's own download
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
