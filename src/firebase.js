// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCEq-Trf1oFsvPF5tlMvqU83ea_J2DLZjs",
  authDomain: "finance-app-2026-3e318.firebaseapp.com",
  projectId: "finance-app-2026-3e318",
  storageBucket: "finance-app-2026-3e318.firebasestorage.app",
  messagingSenderId: "855414629770",
  appId: "1:855414629770:web:8bb07198b8245b63781473"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);