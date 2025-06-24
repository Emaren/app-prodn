FROM node:24-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ───────────────────────────────
FROM node:24-slim

WORKDIR /app
COPY --from=builder /app ./

# Use non-root user for better security
RUN addgroup app && adduser -S -G app app
USER app

EXPOSE 3000
ENV NODE_ENV=production

CMD ["npm", "start"]
