import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDBi3PpLwvQ_BgWcLIc_7YtogfsHftMuk4",
  authDomain: "educational-source.firebaseapp.com",
  projectId: "educational-source",
  storageBucket: "educational-source.firebasestorage.app",
  messagingSenderId: "622045234459",
  appId: "1:622045234459:web:adb685367be0235e5f7fbe",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
