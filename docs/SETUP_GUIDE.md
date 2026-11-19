# WorkPulse ESS — Setup, ERPNext Connection & Capacitor Android Guide

## Architecture Overview
- **Frontend & PWA**: React 19 + TypeScript + Tailwind CSS + `vite-plugin-pwa` (lightweight offline asset caching + IndexedDB offline punch queue preserving original punch timestamps and GPS coordinates).
- **Secure Backend Proxy (`server.ts`)**: Express API proxy running on port `3000`. All ERPNext `/api/resource/*` and `/api/method/*` calls stay on the server so `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET`, and ERPNext session cookies (`sid`) are **never** exposed to client code.
- **Locale & Timezone Standard**: `Asia/Karachi` (PKT, UTC+5), `dd-mm-yyyy` date formatting, `24-hour` (`HH:mm`) time.
- **Mobile Native Wrapper**: Capacitor (`capacitor.config.ts`) for Android APK/AAB and iOS builds.

---

## 1. Run Locally (Test Sandbox Mode)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment template:
   ```bash
   cp .env.example .env
   ```
   Keep `SANDBOX_MODE="true"` (default) to run in **ERPNext v15 Test Sandbox Mode** with sample data (even if `ERPNEXT_URL` is configured):
   - **Employee (Shift-B Night `19:00–03:00`)**: ID `6112` or `tariq.mahmood@almizan.pk` / `password123`
   - **Manager / HR (Shift-A Day `07:00–15:00`)**: ID `6105` or `ayesha.hr@almizan.pk` / `password123`
3. Start development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000`.

---

## 2. Connect to Live ERPNext / Frappe HRMS v15

1. Add the custom fields and verify role permissions in `docs/ERPNEXT_CUSTOM_FIELDS.md`.
2. Ensure every employee has a numeric Employee ID (e.g., `6112`) and a linked ERPNext `User` in `Employee.user_id`.
3. Ensure `Shift Type` (`Shift-A`, `Shift-B`, `Security-Night`) and active `Shift Assignment` records are configured in ERPNext HRMS.
4. Update `.env` (or AI Studio Secrets) and set `SANDBOX_MODE="false"`:
   ```env
   SANDBOX_MODE="false"
   ERPNEXT_URL="https://erp.yourcompany.com"
   ERPNEXT_API_KEY="your_server_api_key"
   ERPNEXT_API_SECRET="your_server_api_secret"
   SESSION_SECRET="replace-with-64-char-random-string"
   COMPANY_NAME="Your Company Name"
   COMPANY_PRIMARY_COLOR="#0F6E52"
   GEOFENCE_ZONES='[{"id":"plant-1","name":"Main Factory","lat":31.5204,"lng":74.3587,"radiusMeters":250}]'
   ```
   > **Security Note**: `ERPNEXT_API_KEY` and `ERPNEXT_API_SECRET` are read exclusively by `server.ts` and `server/erpnextClient.ts` (`Authorization: token key:secret`). Never prefix them with `VITE_`.
5. Build and start in production:
   ```bash
   npm run build && npm start
   ```

---

## 3. Build Android APK / AAB with Capacitor

1. Install Capacitor CLI and Android platform + native security plugins:
   ```bash
   npm install @capacitor/core @capacitor/android @capacitor/geolocation @capacitor/camera @capacitor/push-notifications @aparajita/capacitor-biometric-auth capacitor-secure-storage-plugin
   npm install -D @capacitor/cli
   ```
2. Build the production web assets:
   ```bash
   npm run build
   ```
3. Add Android project & sync:
   ```bash
   npx cap add android
   npx cap sync android
   ```
4. Add Android permissions in `android/app/src/main/AndroidManifest.xml`:
   ```xml
   <uses-permission android:name="android.permission.CAMERA" />
   <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
   <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
   <uses-permission android:name="android.permission.USE_BIOMETRIC" />
   <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
   ```
5. Set `capacitor.config.ts` `server.url` to your deployed HTTPS backend proxy URL so `/api/*` requests route over HTTPS to your Node proxy.
6. Open Android Studio to sign and build APK/AAB:
   ```bash
   npx cap open android
   ```
   In Android Studio: **Build > Generate Signed Bundle / APK**.

---

## 4. Low-End Android & Known Limitations (MVP)
- **Lightweight On-Device Face Verification**: Uses a 64-dim normalized facial luminance-gradient descriptor + inter-frame motion liveness check (max 360px compressed JPEG selfies) so entry-level Android phones on slow factory Wi-Fi/3G do not download 20–30MB ML weights or drain battery. For stricter anti-spoofing, replace `src/services/faceVerification.ts` with a server-side embedding endpoint.
- **Offline Punch Queue**: When offline, punches are stored in IndexedDB with their original `Asia/Karachi` punch timestamp (`time`), GPS coordinates, and compressed selfie, then automatically replayed when connectivity returns (`synced_from_offline`).
- **Push Notifications**: In-app alerts and browser Web Notifications work in PWA mode; background FCM delivery when an Android APK is closed requires adding `google-services.json` and wiring Capacitor `PushNotifications` device tokens to an FCM sender in `server.ts`.
- **Biometric Quick Unlock**: On Web/PWA, relies on encrypted session storage + platform authenticator check; hardware Fingerprint/Face ID requires the Capacitor native build (`@aparajita/capacitor-biometric-auth`).
- **ERPNext Salary Slip PDF**: Live mode proxies ERPNext's standard `Salary Slip Standard` print format; ensure `wkhtmltopdf` / WeasyPrint is configured on your Frappe server.
