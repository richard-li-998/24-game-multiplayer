# 24 Game - Multiplayer

A real-time multiplayer math card game where players race to combine four cards using basic arithmetic operations (+, -, *, /) to reach exactly 24.

**Live Demo:** [https://24-game-multiplayer.vercel.app/](https://24-game-multiplayer.vercel.app/)

---

## About

The 24 Game is a competitive card game for 2-6 players. Each round, all players receive the same four randomly generated playing cards and race to combine them using addition, subtraction, multiplication, and division to produce the number 24. The first player to find a valid solution wins the round and earns a point.

A single-player mode is also available for solo practice, with time tracking and a running score counter.

---

## Features

### Gameplay

- **Real-time multiplayer** - Play with 2-6 players simultaneously
- **Single-player mode** - Practice solo with solvable puzzles and time tracking
- **Live synchronization** - All players see game state updates instantly
- **Score tracking** - Persistent scores across rounds
- **Clock mechanic** - The round winner can start a 60-second countdown for remaining players
- **Undo and reset** - Reverse your last move or return to the original four cards
- **Fraction display** - Division results are shown as fractions, not decimals

### User Experience

- **Visual playing cards** - Card designs with suits and colors
- **Click-based selection** - Select a card, choose an operation, then select another card to combine
- **Sit-out option** - Take a break between rounds without losing your score
- **Host controls** - The room host can kick inactive players
- **Mid-game joining** - Players can join a room at any point, up to the player limit
- **Leaderboard** - Player list sorted by score

### Multiplayer

- **Room-based system** - Create private rooms with shareable links or room codes
- **Player limit** - Host selects a capacity between 2 and 6 players
- **Ready-up system** - All active players must ready up before the next round begins
- **Auto-start** - A new round begins automatically when every player is ready

---

## Tech Stack

### Frontend

- **React** (v19) - Component-based UI framework
- **Vite** - Build tool and development server
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Icon library

### Backend and Database

- **Firebase Realtime Database** - NoSQL cloud database for live data synchronization, automatic client updates on data changes, and persistent game state

### Deployment

- **Vercel** - Frontend hosting with automatic deployments from Git

---

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- A Firebase account

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/YOUR-USERNAME/24-game-multiplayer.git
cd 24-game-multiplayer
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up Firebase**

   - Create a project at [firebase.google.com](https://firebase.google.com)
   - Enable the Realtime Database
   - Copy your Firebase configuration

4. **Configure Firebase**

Update `src/firebase.js` with your project credentials:

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

In the Firebase Console, go to Realtime Database and then Rules:

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

6. **Run the development server**

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Create a production build
- `npm run preview` - Preview the production build locally
- `npm run lint` - Run ESLint

---

## Deployment

### Deploy to Vercel

1. Push your code to GitHub.

2. Go to [vercel.com](https://vercel.com), import your GitHub repository, and click Deploy. Vercel auto-detects the Vite configuration.

3. Every push to `main` triggers a new deployment automatically.

---

## How to Play

### Setup

1. Enter your name and choose a game mode (single-player or multiplayer).
2. For multiplayer, create a room or join an existing one using a room code or link.
3. The host waits for players to join, then all players ready up to begin.

### Gameplay

1. All players receive the same four cards.
2. Select a card, pick an operation (+, -, *, /), then select a second card to combine them.
3. Continue combining until one card remains.
4. The first player to reach exactly 24 wins the round.

### Controls

- **Reset** - Return to the original four cards
- **Undo** - Reverse your last move
- **Clock** - After winning, start a 60-second countdown for other players
- **Sit Out** - Skip the current round while keeping your score

### Scoring

- The first player to make 24 earns one point.
- The winner may clock remaining players, freezing the game when the timer reaches zero.
- All players ready up to start the next round.

---

## Project Structure

```
24-game-multiplayer/
├── src/
│   ├── App.jsx            # Main game component with all game and multiplayer logic
│   ├── firebase.js        # Firebase configuration and initialization
│   ├── main.jsx           # React entry point
│   ├── index.css          # Tailwind directives
│   └── App.css            # Component styles
├── public/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── eslint.config.js
└── README.md
```

---

## Game Logic

### Card Validation

A recursive algorithm tests all possible combinations of four cards and four operations to verify that each generated puzzle has at least one valid solution.

### Real-time Synchronization

Firebase listeners update all connected clients whenever room data changes. Winner detection uses timestamps to handle race conditions. Only the host generates new cards to prevent desynchronization.

### Data Validation

Firebase security rules enforce data types and value ranges. Scores are validated server-side, player limits are enforced per room, and player names are length-restricted.

---

## Contributing

Contributions are welcome. Feel free to report bugs, suggest features, or submit pull requests.

---

## License

This project is open source and available under the MIT License.

---

## Future Enhancements

- Firebase Authentication for improved security
- Cross-room leaderboards
- Tournament mode
- Custom difficulty levels
- Mobile application
- In-game chat
- Solution replay
- Daily challenges

---

Built with React, Firebase, and Tailwind CSS.

**Play now:** [https://24-game-multiplayer.vercel.app/](https://24-game-multiplayer.vercel.app/)
