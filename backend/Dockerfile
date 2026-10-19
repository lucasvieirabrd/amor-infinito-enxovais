FROM node:22-slim

# Install runtime libs required for headless Chrome on Debian 12 Bookworm
# Package names WITHOUT t64 suffix (t64 is Ubuntu 24.04/Debian trixie only)
# Note: 'chromium' binary NOT installed here — puppeteer downloads its own tested Chrome
RUN apt-get update && apt-get install -y \
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

# Fix Chrome download path so it is consistent between build and runtime
# Must be set BEFORE npm install so puppeteer downloads Chrome here
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

WORKDIR /app

COPY backend/package*.json ./

# npm install downloads puppeteer's own Chrome into /app/.cache/puppeteer
RUN npm install

COPY backend/ .

RUN npm run build

RUN cp -r src/assets dist/assets

EXPOSE 3000

CMD ["npm", "start"]
