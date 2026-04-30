<<<<<<< HEAD
# SkillExchange

A React + Vite skill exchange platform with Firebase email/password auth, Firestore-backed profiles and chat, Firebase Storage profile photos, skill-based match ranking, reviews, requests, alerts, and responsive mobile/desktop layouts.

## Features

- Firebase email/password login and signup
- Profile completion prompts and completion percentage
- Editable profile with Storage-backed avatar upload and password change
- Search suggestions and match ranking based on your skills
- Realtime Firebase chat with timestamps and seen/unread state
- Reviews, requests, notifications, favorites, and reporting
- Firebase rules files for Firestore and Storage deployment

## Run

1. Install Node.js
2. Run `npm install`
3. Run `npm run dev`

## Firebase

1. Copy `.env.example` to `.env`
2. Fill in your Firebase web app config values
3. Enable `Authentication` with `Email/Password`
4. Create `Firestore Database`
5. Create `Firebase Storage`
6. Deploy app and rules with `firebase.cmd deploy`

This project includes:

- `src/firebase.js` for app setup
- `firestore.rules` for Firestore security
- `storage.rules` for image upload security
- `firebase.json` for Hosting plus Firebase rules deployment
=======
# skillexchange
A skill exchange platform is a community-driven space where people trade skills instead of money. Users offer what they know—like coding, design, or languages—and learn from others in return. It promotes collaboration, accessible learning, and mutual growth, allowing everyone to be both a teacher and a learner.
>>>>>>> 1e5cec631feb9d7e75b566c1aed97173a5e530e4
