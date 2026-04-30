import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, query, orderByChild, limitToLast, off } from "firebase/database";

const firebaseConfig = {
  databaseURL: "https://bantaydagat-4b8b6-default-rtdb.firebaseio.com/",
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

export { db, ref, onValue, query, orderByChild, limitToLast, off };
