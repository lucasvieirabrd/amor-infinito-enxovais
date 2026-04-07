FROM node:22-slim

WORKDIR /app

# O contexto agora é a raiz do projeto, então os arquivos estão em ./backend
COPY backend/package*.json ./

RUN npm install

COPY backend/ .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
