FROM node:22-slim AS build

WORKDIR /app

# O contexto é a raiz do projeto
COPY frontend/package*.json ./

RUN npm install

# Copia todo o conteúdo da pasta frontend para o WORKDIR
COPY frontend/ .

# Executa o build (o tsconfig.json ajustado agora é autossuficiente)
RUN npm run build

FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
