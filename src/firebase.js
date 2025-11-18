import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAdWMb2UwJ6iyhlw5scQoF-cH80p781Pbo",
  authDomain: "game-68453.firebaseapp.com",
  databaseURL: "https://game-68453-default-rtdb.firebaseio.com",
  projectId: "game-68453",
  storageBucket: "game-68453.firebasestorage.app",
  messagingSenderId: "870114125400",
  appId: "1:870114125400:web:baf4bddf46361383cc0c2d",
  measurementId: "G-EW9Y996RMB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database };