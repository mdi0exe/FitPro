# هایپرتروفی | Persian Hypertrophy Tracker

اپلیکیشن تمرینی **Tauri v2 (Android + Desktop)** با بک‌اند **Rust** و رابط کاربری **فارسی (RTL)** برای برنامه ۴ روزه بالاتنه/پایین‌تنه، ثبت ست‌به‌ست وزنه، تایمر استراحت، افزایش وزنه دو هفته‌ای و چک‌لیست تغذیه دانشجویی.

```
APK/
├─ index.html                  # RTL shell + Vazirmatn CDN
├─ src/                        # فرانت‌اند (Vite + TypeScript + Tailwind)
│  ├─ main.ts                  # بوت، رندر، سوئیچ تب
│  ├─ types.ts                 # آینه تایپ‌های Rust
│  ├─ styles.css               # تم تیره + کلاس‌های کامپوننت
│  ├─ data/seed.ts             # داده اولیه برای حالت مرورگر
│  ├─ lib/
│  │  ├─ api.ts                # پل هیبریدی invoke / localStorage
│  │  ├─ localBackend.ts       # شبیه‌ساز دستورات Rust در مرورگر
│  │  ├─ store.ts              # استیت + ذخیره debounce
│  │  ├─ timer.ts              # تایمرها + Web Audio + لرزش
│  │  ├─ fa.ts                 # اعداد فارسی، تقویم جلالی
│  │  ├─ dom.ts / icons.ts     # کمک‌تابع‌های DOM و آیکون‌ها
│  ├─ components/              # ui، shell، restTimer، gifModal، exerciseEditor
│  └─ views/                   # workout، progress، nutrition، coach
├─ src-tauri/
│  ├─ Cargo.toml               # crate-type = staticlib + cdylib + rlib (اندروید)
│  ├─ tauri.conf.json          # کانفیگ Tauri v2 (withGlobalTauri, CSP)
│  ├─ capabilities/default.json
│  ├─ icons/                   # آیکون‌های تولیدشده (PNG/ICO/ICNS)
│  └─ src/
│     ├─ models.rs             # تمام ساختارهای داده
│     ├─ storage.rs            # ذخیره اتمیک JSON + داده اولیه ۴ روزه
│     ├─ lib.rs                # دستورات #[tauri::command] + run()
│     ├─ main.rs
│     └─ timeutil.rs
└─ scripts/                    # تولید آیکون + سرور استاتیک + بررسی UI
```

## اجرا

```bash
npm install

# دسکتاپ (Tauri)
npm run tauri:dev

# فقط فرانت‌اند در مرورگر (localStorage fallback)
npm run dev

# اندروید
npm run tauri:android          # اولین بار: npx tauri android init
```

پیش‌نیاز اندروید: Android Studio + SDK/NDK، JDK 17، و `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`.

## بررسی و بیلد

```bash
npm run typecheck              # tsc --noEmit
npm run build                  # Vite → dist/
cd src-tauri && cargo check --all-targets
cd src-tauri && cargo test     # تست‌های منطق افزایش وزنه و داده اولیه
npm run tauri:build            # بسته نهایی دسکتاپ
```

## دستورات Rust

| دستور | کار |
| --- | --- |
| `get_app_state` | خواندن `gym_state.json` یا ساخت داده اولیه ۴ روزه |
| `save_app_state` | ذخیره اتمیک کل استیت (tmp + rename) |
| `apply_progressive_overload` | `+۲٫۵kg` روی همه حرکات وزنه‌دار، `+۱ تکرار` برای وزن بدن، به‌روزرسانی تاریخ، ثبت رویداد |
| `log_body_weight` | ثبت وزن روز، افزودن به تاریخچه ۶۵ → ۷۵ و ثبت رویداد |
| `reset_to_defaults` | بازگردانی برنامه پیش‌فرض با حفظ تاریخچه وزن |
| `overload_status` | روزهای باقی‌مانده تا چرخه بعدی |

## ذخیره‌سازی

- داخل Tauri: `app_data_dir()/gym_state.json` با نوشتن اتمیک (فایل موقت + `sync_all` + `rename`). اگر فایل خراب باشد، یک نسخه پشتیبان با تاریخ گرفته و برنامه بازسازی می‌شود.
- در مرورگر: `localStorage` با همان قواعد کاری (`src/lib/localBackend.ts`).

## نکته‌های UI

- چیدمان کامل `dir="rtl"` با فونت وزیرمتن (CDN + فالبک Tahoma برای حالت آفلاین).
- تایمر ۵ دقیقه هوازی و تایمر استراحت ۹۰ ثانیه‌ای با بیپ Web Audio و `navigator.vibrate` برای اندروید.
- گیف هر حرکت: مودال داخلی + جستجوی گوگل (`itp:animated` + `fitnessprogramer`) و MuscleWiki؛ امکان چسباندن لینک مستقیم `.gif` که داخل کارت حرکت رندر می‌شود.
- CRUD کامل حرکات (افزودن، ویرایش، حذف، جابه‌جایی) و چک‌لیست تغذیه با ریست روزانه خودکار.

## ساخت خودکار APK با GitHub Actions

فایل `.github/workflows/android-apk.yml` در هر push روی `main`/`master`، در Pull Request و با اجرای دستی (workflow_dispatch) یک APK دیباگ می‌سازد.

مراحل ورک‌فلو:

1. نصب Node 20، Java 17 (Temurin)، Rust + چهار تارگت اندروید و Android SDK/NDK
2. `npm ci` و سپس `tauri android init --ci` اگر پوشه `src-tauri/gen/android` وجود نداشته باشد
3. تشخیص خودکار نسخه NDK (از پروژه تولیدشده یا جدیدترین نسخه نصب‌شده) و پلتفرم `compileSdk`
4. `tauri android build --apk --debug` (فرانت‌اند به‌صورت خودکار بیلد می‌شود)
5. آپلود فایل‌های APK + `SHA256SUMS.txt` به‌عنوان artifact با نام `persian-hypertrophy-android-debug`

برای دانلود: صفحه Actions → آخرین اجرا → بخش **Artifacts**. سپس روی گوشی:

```bash
adb install -r app-universal-debug.apk
```

نکته‌ها: APK با کلید دیباگ امضا می‌شود (نصب‌شدنی، اما مناسب انتشار در Play Store نیست). با اجرای دستی می‌توان ورودی `target` را روی `aarch64` گذاشت تا فقط ARM64 ساخته شود (سریع‌تر). کش‌ها: Rust (`Swatinem/rust-cache`)، Gradle (`setup-gradle`) و npm.

## ابزار توسعه

```bash
node scripts/gen-icons.mjs       # بازتولید آیکون‌ها (PNG + ICO + ICNS)
node scripts/serve-dist.mjs      # سرور استاتیک dist روی 127.0.0.1:4400
node scripts/verify-ui.mjs       # اسکرین‌شات هر تب با Edge headless + گزارش خطاها
node scripts/e2e-check.mjs       # تست عملکردی: ثبت ست، تایمر، افزایش وزنه، ویرایش، ذخیره‌سازی
```

`verify-ui.mjs` و `e2e-check.mjs` از `puppeteer-core` و مرورگر Edge نصب‌شده روی ویندوز استفاده می‌کنند (بدون دانلود مرورگر جداگانه).
