importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBbDeBse2WXwzd_X0Mr8VyEzytI8Yya_uc",
  authDomain: "tasknova-66d0f.firebaseapp.com",
  databaseURL: "https://tasknova-66d0f-default-rtdb.firebaseio.com",
  projectId: "tasknova-66d0f",
  storageBucket: "tasknova-66d0f.firebasestorage.app",
  messagingSenderId: "135129024485",
  appId: "1:135129024485:web:232a90fd0752086568510c"
});

const messaging = firebase.messaging();

// App band ho tab bhi (background) notification dikhane ke liye
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'TaskNova';
  const options = {
    body: payload.notification?.body || '',
    icon: '/icon.png'
  };
  self.registration.showNotification(title, options);
});
