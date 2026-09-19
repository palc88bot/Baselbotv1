# 1. استخدام صورة Bun الخفيفة والذكية لتوفير الموارد
FROM oven/bun:1-alpine AS base
WORKDIR /app

# 2. تثبيت الاعتماديات الخاصة بالتشغيل فقط
COPY package.json bun.lockb* package-lock.json* ./
RUN bun install --production

# 3. نسخ كود المصدر بالكامل
COPY . .

# 4. بناء المشروع بالكامل (الواجهة الأمامية + الخادم الخلفي) لضمان العمل السحابي 24/7
RUN bun run build

# 5. إعدادات المنفذ لـ Cloud Run
ENV PORT=8080
EXPOSE 8080

# 6. أمر التشغيل السحابي لتشغيل المحرك المتكامل والـ WebSocket
CMD ["bun", "run", "dist/server.cjs"]
