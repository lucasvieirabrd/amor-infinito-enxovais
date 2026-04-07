FROM node:22-slim AS build

WORKDIR /app

# O contexto agora é a raiz do projeto, então os arquivos estão em ./frontend
COPY frontend/package*.json ./

RUN npm install

COPY frontend/ .

RUN npm run build

FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
