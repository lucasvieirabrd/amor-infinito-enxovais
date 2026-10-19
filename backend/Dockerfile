FROM node:22-slim

# Install Chromium with ALL its recommended dependencies (no --no-install-recommends)
# This ensures all required system libs (libdbus, libgbm, libatk, etc.) are present
RUN apt-get update && apt-get install -y \
    chromium \
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
