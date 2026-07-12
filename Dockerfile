# DX Copilot — 依存ゼロでも動作するが、liveモード用に @anthropic-ai/sdk を同梱する
FROM node:22-slim

WORKDIR /app

# 依存インストール(レイヤーキャッシュのため package.json のみ先にコピー)
COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=3000
EXPOSE 3000

# data/store.json を永続化したい場合はここをボリュームマウントする
VOLUME ["/app/data"]

CMD ["node", "server.js"]
