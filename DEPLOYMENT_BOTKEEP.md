# دليل رفع وتشغيل البوت على سيرفرات botkeep.cloud

مشروع **Quantum Quant Trading Engine** تم إعداده وتجهيزه بالكامل للرفع والتشغيل على سيرفرات **botkeep.cloud** أو أي خادم **VPS (Node.js / Docker)** خلال أقل من دقيقتين.

---

## 🚀 الطريقة الأولى: التشغيل المباشر عبر Node.js & PM2 (الأسهل والأسرع)

### 1. رفع ملفات المشروع إلى السيرفر:
قم برفع مجلد المشروع إلى السيرفر عبر `Git` أو `SFTP/FTP`.

### 2. تثبيت المكتبات وبناء الملفات (Build):
افتح مخرج الأوامر (Terminal) على السيرفر وقم بتنفيذ الأوامر التالية:
```bash
# تثبيت الحزم
npm install

# بناء مشروع الـ Frontend والـ Backend الإنتاجي
npm run build
```

### 3. إعداد متغيرات البيئة (.env):
قم بإنشاء ملف `.env` في المجلد الرئيسي واكتب الإعدادات التالية:
```env
PORT=3000
NODE_ENV=production
BINANCE_API_KEY=ضع_مفتاح_بايننس_هنا
BINANCE_API_SECRET=ضع_المفتاح_السري_هنا
TELEGRAM_BOT_TOKEN=ضع_توكن_تليجرام_هنا
TELEGRAM_CHAT_ID=ضع_معرف_القناة_هنا
```

### 4. تشغيل البوت بواسطة PM2 (ضمان العمل 24/7 دون توقف):
```bash
# تثبيت PM2 عالمياً (إذا لم يكن مثبتاً)
npm install -g pm2

# تشغيل البوت باستخدام ملف PM2 الجاهز
pm2 start ecosystem.config.cjs

# حفظ الحالة ليعمل البوت تلقائياً مع إعادة تشغيل السيرفر
pm2 save
pm2 startup
```

---

## 🐳 الطريقة الثانية: التشغيل عبر Docker (Containers)

إذا كانت منصة **botkeep.cloud** تدعم بيئة Docker تلقائياً:

```bash
# بناء صورة الدوكر
docker build -t quantum-quant-bot .

# تشغيل البوت
docker run -d \
  --name quantum-bot \
  -p 3000:8080 \
  --restart always \
  --env-file .env \
  quantum-quant-bot
```

---

## 📂 الملفات المرفقة والتنفيذ
* `dist/server.cjs`: السيرفر التنفيذي المحزّم الجاهز للإنتاج.
* `ecosystem.config.cjs`: إعدادات التشغيل الحية ببرنامج PM2.
* `Dockerfile`: ملف الحاويات الجاهز.
* `quantum_training_state.json` & `agent_learning.json`: ذاكرة التعلم الذاتي ومحفظة الـ $200 الحالية.
