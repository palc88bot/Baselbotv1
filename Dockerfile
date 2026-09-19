# 1. المرحلة الأولى: بناء المشروع (Builder Stage)
FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json bun.lockb* package-lock.json* ./
RUN bun install

COPY . .
RUN bun run build

# 2. المرحلة الثانية: بيئة التشغيل الإنتاجية الخفيفة (Runtime Stage)
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json bun.lockb* package-lock.json* ./
RUN bun install --production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

EXPOSE 8080

# أمر التشغيل السحابي للمحرك المتكامل والـ WebSocket
CMD ["bun", "run", "dist/server.cjs"]
