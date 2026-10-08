# دليل رفع وتشغيل البوت على سيرفرات botkeep.cloud وVPS

مشروع **Quantum Quant Trading Engine (Basel AlgoCore)** تم إعداده وتأمينه بالكامل للرفع والتشغيل على سيرفرات **botkeep.cloud** أو أي خادم **VPS (Node.js / Docker)** مع تطبيق كافة معايير الأمان المالي والتشفير.

---

## 🔒 متطلبات الأمان والتنفيذ (Security & Configuration)

يدعم النظام الآن آليات الحماية الصارمة التالية:
1. **وضع التنفيذ الافتراضي الآمن (PAPER Mode):** يبدأ النظام تلقائياً في وضع المحاكاة الآمنة (`PAPER`) لحماية أموالك من أي أخطاء غير مقصودة.
2. **بوابة تأكيد التداول الحي (Live Trading Confirmation Barrier):** لتفعيل التداول الحي الحقيقي على أموال فعلية، يلزم ضبط `EXECUTION_MODE=LIVE` وأيضاً `CONFIRM_LIVE_TRADING=true`. في حال غياب التأكيد الصريح، يقوم المحرك تلقائياً بحجب الأوامر الحقيقية والتحول لـ `PAPER`.
3. **دعم التسميات القياسية لمفاتيح بايننس:** يدعم المحرك كلا المسميين (`BINANCE_API_KEY` أو `EXCHANGE_API_KEY`) و(`BINANCE_API_SECRET` أو `EXCHANGE_API_SECRET`).
4. **المصادقة الصارمة (Strict Fail-Closed Auth):** جميع مسارات التحكم والأوامر تتطلب توكن موثق، مع إمكانية استخدام `OPERATOR_SECRET` لإدارة السيرفر المباشرة أو قائمة `ADMIN_EMAILS` المسموح لها.

---

## 🚀 الطريقة الأولى: التشغيل المباشر عبر Node.js & PM2 (الأسهل والأسرع)

### 1. رفع ملفات المشروع إلى السيرفر:
قم برفع مجلد المشروع إلى السيرفر عبر `Git` أو `SFTP/FTP` أو فك ضغط ملف `quantum-bot-deploy.zip`.

### 2. تثبيت المكتبات وبناء الملفات (Build):
افتح مخرج الأوامر (Terminal) على السيرفر وقم بتنفيذ الأوامر التالية:
```bash
# تثبيت الحزم
npm install

# بناء مشروع الـ Frontend والـ Backend الإنتاجي
npm run build
```

### 3. إعداد متغيرات البيئة (.env):
قم بإنشاء ملف `.env` في المجلد الرئيسي بالسيرفر واضبط الإعدادات التالية:
```env
PORT=3000
NODE_ENV=production

# وضع التنفيذ: اختر PAPER (افتراضي آمن) أو TESTNET أو LIVE
EXECUTION_MODE=PAPER

# تأكيد التداول الحي الإلزامي (مطلوب فقط عند تفعيل EXECUTION_MODE=LIVE)
CONFIRM_LIVE_TRADING=false

# مفاتيح Binance Futures API (يدعم كلا الاسمين)
BINANCE_API_KEY=your_binance_api_key_here
BINANCE_API_SECRET=your_binance_api_secret_here

# إشعارات تليجرام الفورية (اختياري)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_telegram_channel_or_chat_id_here

# حماية السيرفر والمصادقة (Operator Secret أو Admin Allowlist)
OPERATOR_SECRET=your_strong_secret_token_here
ADMIN_EMAILS=pal.c88@gmail.com

# نطاقات CORS المسموح بها (اختياري، الافتراضي يدعم localhost والنطاق المرفوع عليه)
ALLOWED_ORIGINS=https://botkeep.cloud,http://localhost:3000
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

## 📂 فحص الحالة وسجلات التشغيل:
```bash
# استعراض حالة البوت في PM2
pm2 status

# متابعة سجلات الأوامر وعمليات التداول لحظياً
pm2 logs quantum-bot
```
