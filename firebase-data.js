// TaskNova Firebase Data Manager
// This file handles all Firebase data fetching and updating

const firebaseConfig = {
  apiKey: "AIzaSyBbDeBse2WXwzd_X0Mr8VyEzytI8Yya_uc",
  authDomain: "tasknova-66d0f.firebaseapp.com",
  databaseURL: "https://tasknova-66d0f-default-rtdb.firebaseio.com",
  projectId: "tasknova-66d0f",
  storageBucket: "tasknova-66d0f.firebasestorage.app",
  messagingSenderId: "135129024485",
  appId: "1:135129024485:web:232a90fd0752086568510c"
};

// Initialize Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Check if user is logged in
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // User is logged in — fetch data
    const uid = user.uid;
    localStorage.setItem('uid', uid);
    
    const snapshot = await get(ref(db, 'users/' + uid));
    if (snapshot.exists()) {
      const data = snapshot.val();
      
      // Update balance everywhere
      updateUI(data);
    }
  } else {
    // Not logged in — redirect to login
    const currentPage = window.location.href;
    if (!currentPage.includes('tasknova_login')) {
      window.location.href = 'tasknova_login-1.html';
    }
  }
});

function updateUI(data) {
  // Balance
  const balanceEls = document.querySelectorAll('.user-balance');
  balanceEls.forEach(el => el.textContent = '₹' + (data.balance || 0).toFixed(2));

  // Coins
  const coinsEls = document.querySelectorAll('.user-coins');
  coinsEls.forEach(el => el.textContent = (data.coins || 0) + ' Coins');

  // Name
  const nameEls = document.querySelectorAll('.user-name');
  nameEls.forEach(el => el.textContent = data.name || 'User');

  // Total Earned
  const earnedEls = document.querySelectorAll('.user-total-earned');
  earnedEls.forEach(el => el.textContent = '₹' + (data.totalEarned || 0));

  // Tasks Done
  const tasksEls = document.querySelectorAll('.user-tasks');
  tasksEls.forEach(el => el.textContent = data.tasksDone || 0);

  // Referrals
  const referEls = document.querySelectorAll('.user-referrals');
  referEls.forEach(el => el.textContent = data.referrals || 0);

  // Referral Code
  const codeEls = document.querySelectorAll('.user-referral-code');
  codeEls.forEach(el => el.textContent = data.referralCode || 'TN000000');

  // Email
  const emailEls = document.querySelectorAll('.user-email');
  emailEls.forEach(el => el.textContent = data.email || '');
}
