# Game API (Socket.IO). Build from repo root: docker build -t footboll-api .
# Render/Fly/Koyeb can use this instead of the native Node buildpack.
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared ./shared
COPY server ./server

RUN npm ci && npm run build -w @soccer-snake/shared && npm run build -w server

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "server/dist/index.js"]
