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
- تایمر ۵ دقیقه هوازی و تایمر استراحت ۹۰ ثانیه‌ای با **فایل‌های صوتی واقعی MP3** و `navigator.vibrate` برای اندروید.
- گیف هر حرکت: مودال داخلی + جستجوی گوگل (`itp:animated` + `fitnessprogramer`) و MuscleWiki؛ امکان چسباندن لینک مستقیم `.gif` که داخل کارت حرکت رندر می‌شود.
- CRUD کامل حرکات (افزودن، ویرایش، حذف، جابه‌جایی) و چک‌لیست تغذیه با ریست روزانه خودکار.

## ورود اعداد بدون کیبورد + گیف‌های آماده

- **گیف حرکت‌ها:** لینک مستقیم `.gif` تمام ۲۶ حرکت و ۱۰ آیتم گرم‌کردن در `src/data/default-gifs.json` نگهداری می‌شود. همین فایل هم توسط فرانت‌اند ایمپورت می‌شود و هم با `include_str!` در Rust خوانده می‌شود، پس دو لایه هرگز از هم جدا نمی‌شوند. در `normalize()` هر گیف خالی به‌صورت خودکار پر می‌شود (کاربر می‌تواند با ذخیره مقدار خالی، گیف را برای همیشه حذف کند). تصاویر با `referrerPolicy="no-referrer"` و پس‌زمینه سفید/`object-contain` نمایش داده می‌شوند تا بریده نشوند.
- **بدون کیبورد:** هیچ `<input>` عددی در مسیر ثبت تمرین وجود ندارد.
  - هر ست: `[−] ۱۲٫۵ [+]` برای وزنه (گام ۲٫۵) و `[−] ۸ [+]` برای تکرار (گام ۱).
  - ضربه روی عدد → شیت انتخاب سریع با دکمه‌های ±، شبکه وزنه‌های آماده و «اعمال برای همه ست‌های این حرکت».
  - ثبت وزن بدن: عدد بزرگ + دکمه‌های ‎−۱/−۰٫۵/−۰٫۱ و ‎+۰٫۱/+۰٫۵/+۱.
  - تنظیم استراحت: چیپ‌های ۶۰/۹۰/۱۲۰/۱۵۰/۱۸۰ ثانیه + ‎±۱۵ ثانیه.
  - ویرایش حرکت: چیپ‌های ست (۲..۵)، بازه تکرار و وزنه‌های آماده به‌همراه استپر.
- ورودی‌های متنی باقی‌مانده (نام حرکت، لینک گیف، پروفایل) با `parseNum()`/`en()` ارقام فارسی و عربی را هم می‌پذیرند.

## آیکون برداری و صداهای استودیویی

- **آیکون:** منبع اصلی `src-tauri/icons/icon.svg` است (برداری ۱۰۲۴×۱۰۲۴: سپر ششضلعی نئونی، دمبل المپیکی ‎-۲۸°، گرادیانها و `feDropShadow`). `node scripts/gen-icons.mjs` آن را با puppeteer-core + Edge در ابعاد ۱۰۲۴ و پسزمینه شفاف به `app-icon.png`/`icon.png` تبدیل میکند، سپس `npx tauri icon src-tauri/icons/icon.svg` تمام سایزها، `icon.ico`، `icon.icns` و mipmapهای اندروید را میسازد. CLI خودش SVG را رستر میکند (Rust خالص)، پس CI لینوکس نیازی به مرورگر ندارد. دقت: CLI فایل `icon.png` را بهعنوان خروجی در ۵۱۲ بازنویسی میکند، برای همین اسکریپت بعد از آن مَستر ۱۰۲۴ را برمیگرداند.
- **صداها:** چهار فایل استودیویی `.mp3` در `public/sounds/` کامیت شدهاند و Vite آنها را به `dist/sounds/` کپی میکند، یعنی داخل خود APK و کاملاً آفلاین: `alarm.mp3` (پایان استراحت/هوازی)، `success.mp3` (تکمیل ست و افزایش وزنه)، `water.mp3` (یادآور آب)، `tap.mp3` (تیک چکلیستها).
- `src/lib/timer.ts` دیگر هیچ oscillator/WAV مصنوعی نمیسازد: فایلها یکبار با `fetch` + `decodeAudioData` کش میشوند، سپس `BufferSource → GainNode → DynamicsCompressor → destination` پخش میشوند. تقویت هشدار باشگاه `1.8` (با کمپرسور برای جلوگیری از کلیپ شدن)، صدای آب `0.35`، تیک `0.5`. اگر WebView نتواند MP3 را دیکود کند، همان فایل با `<audio>` از کانال مدیای سختافزار پخش میشود.
- CSP در `tauri.conf.json` شامل `media-src` و `connect-src` برای `asset:`/`http://asset.localhost` است تا `fetch` و پخش صدا در WebView اندروید مجاز باشد.
- در تب مربی → تنظیمات، دو دکمه «تست صدای هشدار استراحت (بلند)» و «تست یادآور آب (ملایم)» وجود دارد تا قبل از تمرین بلندی صدا را چک کنید.

## نوتیفیکیشن بومی اندروید

- **پلاگین:** `tauri-plugin-notification` (Rust) + `@tauri-apps/plugin-notification` (JS). در `src-tauri/src/lib.rs` با `.plugin(tauri_plugin_notification::init())` ثبت شده و در `src-tauri/capabilities/default.json` مجوز `notification:default` دارد.
- **چرا لازم بود:** `new Notification(...)` داخل WebView اندروید کار نمی‌کند. پلاگین اعلان را از طریق `NotificationManager` سیستم‌عامل در نوار اعلان و صفحه قفل نمایش می‌دهد. روی اندروید ۱۳+ مجوز `POST_NOTIFICATIONS` لازم است که خود پلاگین در مانیفست اعلام می‌کند و در زمان اجرا با دیالوگ سیستمی گرفته می‌شود.
- **کانال:** `src/lib/notify.ts` یک کانال با شناسه `fitpro-alerts` و اهمیت `High` می‌سازد تا اعلان به‌صورت heads-up بالای صفحه ظاهر شود. `pushSystemNotification()` هیچ‌وقت خودش مجوز نمی‌پرسد؛ درخواست مجوز فقط از یک لمس کاربر انجام می‌شود (کلید یادآور آب یا دکمه تست).
- **اتصال‌ها:** `waterAlert()` → اعلان «💧 وقت نوشیدن آب است!»، پایان تایمر استراحت → «💪 استراحت تمام شد!». دکمه «🔔 تست نوتیفیکیشن در نوار اعلان» در تنظیمات تب مربی هم مجوز را می‌گیرد و یک اعلان آزمایشی می‌فرستد.
- **محدودیت:** تایمرها در جاوااسکریپت هستند، پس اگر برنامه کاملاً بسته یا در پس‌زمینه با محدودیت شدید باشد، یادآور در همان لحظه اجرا نمی‌شود. برای یادآوری تضمینی در حالت بسته باید از `schedule` خود پلاگین (اعلان زمان‌بندی‌شده بومی) استفاده کرد.

## تقویم هفته و کارنامه روزانه

- **مدل داده:** `DailyActivity` در `src-tauri/src/models.rs` و `src/types.ts` با فیلدهای `date`, `workoutTitle`, `completedExercises`, `setsDone`, `warmupsDone`, `dietDone`, `dietTotal`, `waterGlasses`, `bodyWeight`. آرایه `activityHistory` در `AppStateData` نگه داشته می‌شود (حداکثر ۹۰ روز، جدیدترین اول) و با `#[serde(default)]` پرونده‌های قدیمی بدون تغییر لود می‌شوند.
- **ثبت خودکار:** `syncTodayActivity()` در `src/lib/store.ts` از داخل `persist()` و `setState()` صدا زده می‌شود؛ یعنی هر تیک ست/گرم‌کردن، لیوان آب، وعده سلمی و ثبت وزن، بلافاصله در کارنامه امروز می‌نشیند. روزهای گذشته دست‌نخورده می‌مانند.
- **نمایش:** `src/components/weeklyActivity.ts` یک نوار ۷ روزه از **شنبه تا جمعه** با تاریخ شمسی می‌سازد؛ نقطه سبز = تمرین، نقطه فیروزه‌ای = تغذیه/آب. با لمس هر روز، کارت پایینش جزئیات همان روز را نشان می‌دهد: عنوان روز تمرینی، تعداد ست، برچسب نام حرکات، لیوان آب، وعده‌های سلف و وزن ثبت‌شده. فهرست «روزهای فعال اخیر» هم ۷ روز آخر را خلاصه می‌کند.
- این کارت هم در تب **پیشرفت** (بلافاصله بعد از کارت وزن) و هم در انتهای تب **تمرین** رندر می‌شود؛ در تب تمرین با هر تیک ست، فقط همان کارت در جا رفرش می‌شود تا فوکوس اینپوت‌ها از دست نرود.

## ساخت خودکار APK با GitHub Actions

فایل `.github/workflows/android-apk.yml` در هر push روی `main`/`master`، در Pull Request و با اجرای دستی (workflow_dispatch) یک APK دیباگ می‌سازد.

مراحل ورک‌فلو:

1. نصب وابستگیهای لینوکس (`libwebkit2gtk-4.1-dev` و ...) و Node 20، Java 17 (Temurin)، Rust + چهار تارگت اندروید، Android SDK/NDK و Gradle
2. `npm ci` و نصب وابستگیها
3. تشخیص خودکار نسخه NDK و پلتفرم `compileSdk` (قبل از init تا متغیرها به CLI برسند)
4. `tauri android init --ci` اگر پوشه `src-tauri/gen/android` وجود نداشته باشد
5. `npx tauri icon src-tauri/icons/icon.svg` تا آیکون اختصاصی جای آیکون پیشفرض Tauri را در mipmapها بگیرد
6. `tauri android build --apk --debug` (فرانتاند بهصورت خودکار بیلد میشود)
7. جمعآوری APKها + `SHA256SUMS.txt` و آپلود artifact با نام `persian-hypertrophy-android-debug`

برای دانلود: صفحه Actions → آخرین اجرا → بخش **Artifacts**. سپس روی گوشی:

```bash
adb install -r app-universal-debug.apk
```

نکته‌ها: APK با کلید دیباگ امضا می‌شود (نصب‌شدنی، اما مناسب انتشار در Play Store نیست). به‌صورت پیش‌فرض فقط `armv7` (armeabi-v7a) ساخته می‌شود که روی گوشی‌های ۳۲ بیتی و اکثر گوشی‌های ۶۴ بیتی اجرا می‌شود و حجم را کم نگه می‌دارد؛ نسخه universal چهار برابر بزرگ‌تر است چون هر ABI یک `lib*.so` جدا دارد. در بیلد دیباگ، سمبل‌های دیباگِ Rust بخش عمده حجم هستند؛ ورک‌فلو با `CARGO_PROFILE_DEV_STRIP=debuginfo` آن‌ها را فقط در CI حذف می‌کند تا APK از حدود ۵۰۰ مگابایت به چند ده مگابایت برسد. برای ساخت همه ABIها، اجرای دستی با `target: all`؛ برای گوشی‌های ۶۴ بیتیِ بدون پشتیبانی ۳۲ بیت، `target: aarch64`. کش‌ها: Rust (`Swatinem/rust-cache`)، Gradle (`setup-gradle`) و npm.

## ابزار توسعه

```bash
node scripts/gen-icons.mjs       # رندر SVG با Edge + تمام آیکون‌ها (PNG/ICO/ICNS/mipmap)
node scripts/serve-dist.mjs      # سرور استاتیک dist روی 127.0.0.1:4400
node scripts/verify-ui.mjs       # اسکرین‌شات هر تب با Edge headless + گزارش خطاها
node scripts/e2e-check.mjs       # تست عملکردی: ثبت ست، تایمر، افزایش وزنه، ویرایش، ذخیره‌سازی
node scripts/e2e-fixes.mjs       # تست اصلاحات: ارقام فارسی، ریست روز، مودال‌ها، پروفایل
node scripts/e2e-water.mjs       # تست تغذیه، شمارنده آب و مهاجرت داده قدیمی
node scripts/e2e-audio.mjs       # تست صداهای MP3، گین‌ها، ویبره و مسیر جایگزین
node scripts/e2e-calendar.mjs    # تست تقویم هفته، کارنامه روزانه و اتصال نوتیفیکیشن
```

`verify-ui.mjs` و `e2e-check.mjs` از `puppeteer-core` و مرورگر Edge نصب‌شده روی ویندوز استفاده می‌کنند (بدون دانلود مرورگر جداگانه).
