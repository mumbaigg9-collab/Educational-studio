# Class 10 Video Library — Setup Guide

Ye project aapki Claude artifact wali app ka standalone version hai — Firebase
Firestore ke saath, jo real-time sync karta hai (aap Manage mode se video
daalte hi sab devices par turant dikhega, refresh karne ki bhi zarurat nahi).

Sab steps free hain.

---

## Step 1 — Firebase project banao (free)

1. https://console.firebase.google.com kholo, Google account se login karo
2. "Add project" > naam do (e.g. `class10-video-library`) > Continue > project bana lo
3. Left menu me **Build > Firestore Database** > "Create database" > **Start in test mode** > apna region select karo > Enable
   - Test mode 30 din tak open rehta hai. Neeche Step 2 me isko lock karna hai.
4. Left menu me gear icon > **Project settings** > neeche scroll karo "Your apps" > `</>` (Web) icon par click karo > app ka naam do > "Register app"
5. Jo `firebaseConfig` object dikhega, use copy karo

Ab `src/firebase.js` file kholo aur `firebaseConfig` ki values apne project ki values se replace karo.

---

## Step 2 — Firestore security rules (zaroori)

Firebase console me **Firestore Database > Rules** tab kholo, aur ye rules paste karo:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /appdata/main {
      allow read: if true;
      allow write: if true;
    }
  }
}
```

Ye sabko read/write allow karta hai (kyunki app khud PIN se write ko control
karti hai). Agar aap chahte hain ki Firestore level par bhi likhna sirf aap
control karein, to Firebase Authentication add karni hogi — agar chahiye to
bata dena, wo bhi free hai, thoda extra setup lagega.

---

## Step 3 — Apne computer par run karke test karo

Node.js install hona chahiye (https://nodejs.org se free download).

Project folder me terminal khol kar:

```
npm install
npm run dev
```

Browser me jo localhost link aayega usse app khul jayegi. Manage button se
apna PIN (`6200146572`) daal kar test karo ki video add ho raha hai ya nahi.

---

## Step 4 — Live website banao (free hosting)

**Vercel** (sabse aasan, free):

1. Apna code GitHub par push karo (naya repo banake)
2. https://vercel.com par GitHub se login karo
3. "Add New Project" > apna repo select karo > "Deploy"
4. 1-2 minute me aapko ek live link mil jayega (e.g. `your-app.vercel.app`)

---

## Step 5 — APK banao (free)

1. https://www.pwabuilder.com par jao
2. Apna live Vercel link (Step 4 wala) paste karo > "Start"
3. Ye aapki app scan karega, "Android" package select karo
4. "Generate" par click karo — chand seconds me APK/AAB file download ho jayegi
5. Ye APK kisi ke bhi Android phone par install ho sakti hai (Play Store pe
   daalne ke liye AAB file chahiye hogi, wo bhi yahin milegi)

Note: PWABuilder ko icon files chahiye — `public/manifest.json` me
`icon-192.png` aur `icon-512.png` ka reference hai, in do image files ko
apne `public` folder me daal dena (koi bhi 192x192 aur 512x512 px ka square
logo/icon PNG chalega).

---

## Summary — kya free hai, kya paid

| Cheez | Cost |
|---|---|
| Firebase Firestore (chhote app ke liye) | Free |
| Vercel hosting | Free |
| PWABuilder APK generation | Free |
| Play Store par publish karna | One-time $25 (Google developer account) — agar sirf APK share karna hai to ye bhi zaroori nahi |

Agar kahin atak jao (Firebase config, deploy error, PWABuilder issue), mujhe
error message bata dena, main us step ko fix karne me madad karunga.
