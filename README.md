# 🎮 24 Game - Multiplayer

A real-time multiplayer math card game where players race to combine four cards using basic operations (+, -, \*, /) to make 24!

**🔗 Live Demo:** [https://24-game-multiplayer.vercel.app/](https://24-game-multiplayer.vercel.app/)

---

## 🎯 About The Game

The 24 Game is a competitive multiplayer card game where 2-6 players:

- Receive the same 4 random playing cards each round
- Race to combine them using +, -, \*, / to make exactly 24
- First player to solve it wins the round and earns a point
- Winner can "clock" opponents with a 60-second countdown
- Play multiple rounds and track scores across games

---

## ✨ Features

### 🎲 Gameplay

- **Real-time multiplayer** - Play with 2-6 friends simultaneously
- **Live sync** - All players see moves happen in real-time
- **Score tracking** - Persistent scores across rounds
- **Clock mechanic** - Winner can pressure opponents with a countdown timer
- **Undo/Reset** - Fix mistakes with undo or reset to original cards
- **Fraction display** - Division results shown as fractions (no decimals)

### 🎨 User Experience

- **Visual playing cards** - Realistic card designs with suits
- **Drag-free selection** - Click card → operation → card to combine
- **Sit-out feature** - Take breaks without losing your score
- **Host controls** - Kick AFK players
- **Join anytime** - Players can join mid-game (up to room limit)
- **Sorted leaderboard** - Player cards ranked by score

### 🔒 Multiplayer Features

- **Room-based system** - Create private rooms with shareable links
- **Player limit selection** - Host chooses 2-6 player capacity
- **Ready-up system** - All active players must ready for next round
- **Auto-start** - New round begins when all players are ready

---

## 🛠️ Tech Stack

### **Frontend**

- **React** (v18) - Component-based UI framework
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework for styling
- **Lucide React** - Icon library for UI elements

### **Backend & Database**

- **Firebase Realtime Database** - NoSQL cloud database for live data sync
  - Real-time multiplayer synchronization
  - Automatic client updates on data changes
  - Persistent game state across sessions

### **Deployment**

- **Vercel** - Cloud platform for frontend hosting
  - Automatic deployments from Git
  - CDN for global performance
  - Zero-config setup

### **Core Libraries**

```json
{
  "react": "^18.3.1",
  "firebase": "^11.1.0",
  "lucide-react": "^0.263.1"
}
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Firebase account

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/YOUR-USERNAME/24-game.git
cd 24-game
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up Firebase**

   - Create a Firebase project at [firebase.google.com](https://firebase.google.com)
   - Enable Realtime Database
   - Copy your Firebase config

4. **Configure Firebase**

Update `src/firebase.js` with your config:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID",
};
```

5. **Set Firebase Database Rules**

In Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true,
        "players": {
          "$playerId": {
            ".write": true,
            "score": {
              ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000"
            },
            "name": {
              ".validate": "newData.isString() && newData.val().length <= 30"
            }
          }
        }
      }
    }
  }
}
```

6. **Run development server**

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📦 Deployment

### Deploy to Vercel

1. **Push to GitHub**

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. **Connect to Vercel**

   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Vercel auto-detects Vite configuration
   - Click "Deploy"

3. **Automatic Deployments**
   - Every push to `main` triggers a new deployment
   - Preview deployments for pull requests

---

## 🎮 How to Play

### Setup

1. **Create a Room**

   - Enter your name
   - Choose player limit (2-6)
   - Click "Create Room"

2. **Invite Friends**
   - Share the room link or room code
   - Friends click the link or enter code to join

### Gameplay

1. **Study Your Cards** - All players see the same 4 cards
2. **Combine Cards** - Click: Card → Operation → Card
3. **Keep Combining** - Merge results until one card remains
4. **Make 24** - First to reach exactly 24 wins!

### Game Controls

- **🔄 Reset** - Return to original 4 cards
- **↶ Undo** - Reverse your last move
- **⏰ Clock** - Winner starts 60-second countdown for others
- **⏸️ Sit Out** - Take a break (keeps your score)

### Winning

- First player to combine cards into 24 wins the round
- Winner gets +1 point
- Winner can clock other players
- When clocked, game freezes at 0 seconds
- All players ready up for next round

---

## 🏗️ Project Structure

```
24-game/
├── src/
│   ├── App.jsx              # Main game component with multiplayer logic
│   ├── firebase.js          # Firebase configuration
│   ├── main.jsx             # React entry point
│   └── index.css            # Global styles
├── public/
├── package.json
├── vite.config.js
└── README.md
```

---

## 🧮 Game Logic

### Card Validation

- Uses recursive algorithm to verify if 4 cards can make 24
- Tests all possible combinations and operations
- Ensures generated puzzles are solvable

### Real-time Sync

- Firebase listeners update all clients instantly
- Winner detection uses timestamp-based race condition handling
- Only host generates new cards (prevents desyncs)

### Security

- Firebase rules validate data types and ranges
- Score manipulation prevented (scores only increase)
- Player limit enforced server-side
- Room creation throttled

---

## 🤝 Contributing

Contributions are welcome! Feel free to:

- Report bugs
- Suggest new features
- Submit pull requests

---

## 📝 License

This project is open source and available under the MIT License.

---

## 🎯 Future Enhancements

- [ ] Firebase Authentication for better security
- [ ] Leaderboards across all rooms
- [ ] Tournament mode
- [ ] Custom difficulty levels
- [ ] Mobile app version
- [ ] Chat system
- [ ] Replay mode to review solutions
- [ ] Daily challenges

---

## 👥 Credits

Built with React, Firebase, and Tailwind CSS.

**Play Now:** [https://24-game-multiplayer.vercel.app/](https://24-game-multiplayer.vercel.app/)

---

## 📧 Contact

For questions or feedback, please open an issue on GitHub.

**Enjoy the game! 🎮**
