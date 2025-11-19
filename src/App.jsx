import React, { useState, useEffect } from 'react';
import { Shuffle, Trophy, Users, Clock, Copy, Check, Link as LinkIcon } from 'lucide-react';
import { database } from './firebase';
import { ref, set, onValue, update } from 'firebase/database';

const EPSILON = 0.001;

// Card value mapping
const CARD_VALUES = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13
};

const CARD_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_COLORS = {
  '♠': 'text-gray-800',
  '♣': 'text-gray-800',
  '♥': 'text-red-600',
  '♦': 'text-red-600'
};

// 24 Game Solver
function canMake24(cards) {
  const nums = cards.map(c => CARD_VALUES[c.rank] || parseFloat(c.rank));
  
  function solve(numbers) {
    if (numbers.length === 1) {
      return Math.abs(numbers[0] - 24) < EPSILON;
    }
    
    for (let i = 0; i < numbers.length; i++) {
      for (let j = 0; j < numbers.length; j++) {
        if (i === j) continue;
        
        const a = numbers[i];
        const b = numbers[j];
        const remaining = numbers.filter((_, idx) => idx !== i && idx !== j);
        
        const operations = [
          a + b,
          a - b,
          a * b,
          b !== 0 ? a / b : null
        ];
        
        for (const result of operations) {
          if (result !== null && solve([...remaining, result])) {
            return true;
          }
        }
      }
    }
    return false;
  }
  
  return solve(nums);
}

// Generate random cards with suits
function generateCards() {
  let attempts = 0;
  const maxAttempts = 100;
  
  while (attempts < maxAttempts) {
    const cards = [];
    for (let i = 0; i < 4; i++) {
      const randomRank = CARD_NAMES[Math.floor(Math.random() * CARD_NAMES.length)];
      const randomSuit = SUITS[Math.floor(Math.random() * SUITS.length)];
      cards.push({ 
        rank: randomRank, 
        suit: randomSuit, 
        id: `${randomRank}-${randomSuit}-${Date.now()}-${i}`,
        isOriginal: true
      });
    }
    
    if (canMake24(cards)) {
      return cards;
    }
    attempts++;
  }
  
  // Fallback
  return [
    { rank: '3', suit: '♠', id: '3-♠-0', isOriginal: true },
    { rank: '3', suit: '♥', id: '3-♥-1', isOriginal: true },
    { rank: '8', suit: '♦', id: '8-♦-2', isOriginal: true },
    { rank: '8', suit: '♣', id: '8-♣-3', isOriginal: true }
  ];
}

// Fraction helper
function toFraction(decimal) {
  const tolerance = 1.0E-6;
  let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
  let b = decimal;
  
  do {
    let a = Math.floor(b);
    let aux = h1;
    h1 = a * h1 + h2;
    h2 = aux;
    aux = k1;
    k1 = a * k1 + k2;
    k2 = aux;
    b = 1 / (b - a);
  } while (Math.abs(decimal - h1 / k1) > decimal * tolerance);
  
  return { numerator: h1, denominator: k1 };
}

function PlayingCard({ card, isSelected, onClick, disabled }) {
  const isResult = !card.isOriginal;
  const displayValue = card.rank;
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative aspect-[2/3] rounded-lg border-2 bg-white flex flex-col items-center justify-center transition-all transform hover:scale-105 shadow-lg ${
        isSelected
          ? 'border-blue-600 ring-4 ring-blue-300 scale-105'
          : 'border-gray-400 hover:border-gray-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {card.isOriginal ? (
        <>
          <div className={`absolute top-2 left-2 flex flex-col items-center leading-none ${SUIT_COLORS[card.suit]}`}>
            <div className="text-2xl font-bold">{card.rank}</div>
            <div className="text-xl">{card.suit}</div>
          </div>
          <div className={`text-6xl ${SUIT_COLORS[card.suit]}`}>
            {card.suit}
          </div>
          <div className={`absolute bottom-2 right-2 flex flex-col items-center leading-none rotate-180 ${SUIT_COLORS[card.suit]}`}>
            <div className="text-2xl font-bold">{card.rank}</div>
            <div className="text-xl">{card.suit}</div>
          </div>
        </>
      ) : (
        <div className="text-3xl font-bold text-purple-700">
          {displayValue}
        </div>
      )}
    </button>
  );
}

function TwentyFourGame() {
  const [gameState, setGameState] = useState('setup');
  const [roomId, setRoomId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [playerLimit, setPlayerLimit] = useState(2); // Host chooses 2-6
  const [cards, setCards] = useState([]); // Local card state
  const [originalCards, setOriginalCards] = useState([]); // Original cards for reset
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedOperation, setSelectedOperation] = useState(null);
  const [winner, setWinner] = useState(null);
  const [timer, setTimer] = useState(0);
  const [clockTimer, setClockTimer] = useState(null); // Countdown when clocked
  const [message, setMessage] = useState('');
  const [moveHistory, setMoveHistory] = useState([]); // Local move history
  const [cardHistory, setCardHistory] = useState([]); // Local undo history
  const [roomData, setRoomData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [iWon, setIWon] = useState(false);
  const [myReady, setMyReady] = useState(false);
  const [isSittingOut, setIsSittingOut] = useState(false);

  useEffect(() => {
    document.title = '24';
    
    const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
    link.type = 'image/svg+xml';
    link.rel = 'icon';
    link.href = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%234F46E5'/><text x='50' y='70' font-size='50' font-weight='bold' fill='white' text-anchor='middle' font-family='Arial'>24</text></svg>";
    document.head.appendChild(link);

    // Check for room ID in URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
      setJoinRoomId(roomFromUrl);
      setGameState('join');
    }

    // Generate player ID
    const pid = 'player_' + Math.random().toString(36).substr(2, 9);
    setPlayerId(pid);
  }, []);

  useEffect(() => {
    let interval;
    if (gameState === 'playing' && roomData?.gameStarted && !winner) {
      interval = setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState, roomData, winner]);

  // Clock countdown timer
  useEffect(() => {
    let interval;
    if (clockTimer !== null && clockTimer > 0 && !iWon) {
      interval = setInterval(() => {
        setClockTimer(t => {
          const newTime = t - 1;
          if (newTime > 0) {
            setMessage(`⏰ You've been clocked! ${newTime} seconds to finish!`);
          } else {
            setMessage("⏰ Time's up! Game frozen - Click Ready to continue.");
            // Clear selections when game freezes
            setSelectedCard(null);
            setSelectedOperation(null);
          }
          return newTime;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [clockTimer, iWon]);

  // Listen to room updates
  useEffect(() => {
    if (roomId) {
      const roomRef = ref(database, `rooms/${roomId}`);
      const unsubscribe = onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setRoomData(data);
          
          // Check if I was kicked
          if (data.players && !data.players[playerId]) {
            alert('You were removed from the room');
            setGameState('setup');
            setRoomId(null);
            return;
          }
          
          // Only set initial cards when game starts or new round
          if (data.gameStarted && (cards.length === 0 || data.roundNumber !== roomData?.roundNumber)) {
            // Don't update cards if sitting out
            if (!isSittingOut) {
              setCards(data.originalCards || []);
              setOriginalCards(data.originalCards || []);
              setMoveHistory([]);
              setCardHistory([]);
              setSelectedCard(null);
              setSelectedOperation(null);
              setIWon(false);
              setMyReady(false); // Reset ready status
              setWinner(null);
              setClockTimer(null); // Reset clock timer for new round
            }
          }
          
          // Check for winner
          if (data.winner && !winner) {
            setWinner(data.winner);
            const winnerName = data.players[data.winner]?.name;
            if (data.winner === playerId) {
              setIWon(true);
              setMessage(`🎉 You won!`);
            } else {
              setMessage(`${winnerName} won! Keep playing to finish.`);
            }
          }
          
          // Show clock message if clocked and start countdown
          if (data.clocked && !iWon && !isSittingOut && clockTimer === null) {
            setClockTimer(60);
          }
          
          // Update message based on clock timer
          if (clockTimer !== null && !iWon && !isSittingOut) {
            if (clockTimer > 0) {
              setMessage(`⏰ You've been clocked! ${clockTimer} seconds to finish!`);
            } else {
              setMessage(`⏰ Time's up! Click Ready to continue.`);
            }
          }
          
          if (data.gameStarted && gameState !== 'playing' && !winner) {
            setGameState('playing');
          }
        }
      });

      return () => unsubscribe();
    }
  }, [roomId, gameState, playerId, cards.length, winner, iWon, isSittingOut, myReady, clockTimer]);

  // Auto-check if all players are ready when roomData changes
  useEffect(() => {
    if (roomData && winner && roomData.players) {
      checkAndStartNextRound();
    }
  }, [roomData?.players, winner]);

  const createRoom = async () => {
    if (!playerName.trim()) {
      alert('Please enter your name!');
      return;
    }

    const newRoomId = Math.random().toString(36).substr(2, 6).toUpperCase();
    setRoomId(newRoomId);

    const newCards = generateCards();
    const roomRef = ref(database, `rooms/${newRoomId}`);
    
    await set(roomRef, {
      host: playerId,
      playerLimit: playerLimit,
      players: {
        [playerId]: { 
          id: playerId, 
          name: playerName, 
          score: 0, 
          ready: false,
          sittingOut: false,
          joinedAt: Date.now()
        }
      },
      originalCards: newCards,
      gameStarted: false,
      winner: null,
      roundNumber: 1,
      clocked: false,
      createdAt: Date.now()
    });

    setGameState('waiting');
  };

  const joinRoom = async () => {
    if (!playerName.trim()) {
      alert('Please enter your name!');
      return;
    }

    if (!joinRoomId.trim()) {
      alert('Please enter a room code!');
      return;
    }

    const roomRef = ref(database, `rooms/${joinRoomId.toUpperCase()}`);
    
    // Check if room exists
    onValue(roomRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        alert('Room not found!');
        return;
      }

      const playerCount = Object.keys(data.players || {}).length;
      if (playerCount >= data.playerLimit) {
        alert(`Room is full! (${data.playerLimit} players max)`);
        return;
      }

      setRoomId(joinRoomId.toUpperCase());
      
      await update(roomRef, {
        [`players/${playerId}`]: { 
          id: playerId, 
          name: playerName, 
          score: 0, 
          ready: false,
          sittingOut: false,
          joinedAt: Date.now()
        },
        gameStarted: true
      });

      setGameState('playing');
    }, { onlyOnce: true });
  };

  const copyRoomLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCardClick = async (card) => {
    if (gameState !== 'playing' || iWon || clockTimer === 0) return;

    // If clicking the same card that's already selected (and no operation chosen), deselect it
    if (selectedCard?.id === card.id && !selectedOperation) {
      setSelectedCard(null);
      setMessage('Card deselected. Select a card to begin!');
      return;
    }

    // If no card selected and no operation, select this card
    if (!selectedCard && !selectedOperation) {
      setSelectedCard(card);
      setMessage(`Selected ${card.isOriginal ? `${card.rank}${card.suit}` : card.rank}. Now choose an operation.`);
      return;
    }

    // If card selected but no operation yet, switch to new card
    if (selectedCard && !selectedOperation) {
      setSelectedCard(card);
      setMessage(`Selected ${card.isOriginal ? `${card.rank}${card.suit}` : card.rank}. Now choose an operation.`);
      return;
    }

    // If card and operation selected, combine them
    if (selectedCard && selectedOperation) {
      await combineCards(selectedCard, card, selectedOperation);
    }
  };

  const handleOperationClick = async (op) => {
    if (iWon || clockTimer === 0) return;
    
    if (!selectedCard) {
      setMessage('Please select a card first!');
      return;
    }
    
    // If clicking the same operation, deselect it
    if (selectedOperation === op) {
      setSelectedOperation(null);
      setMessage(`Selected ${selectedCard.isOriginal ? `${selectedCard.rank}${selectedCard.suit}` : selectedCard.rank}. Now choose an operation.`);
      return;
    }
    
    // Otherwise, set/switch to the clicked operation
    setSelectedOperation(op);
    setMessage(`${selectedCard.isOriginal ? `${selectedCard.rank}${selectedCard.suit}` : selectedCard.rank} ${op} ... Select the second card.`);
  };

  const combineCards = async (card1, card2, operation) => {
    if (card1.id === card2.id) {
      setMessage('Please select two different cards!');
      return;
    }

    // Get numeric values - use stored value if available, otherwise parse rank
    const val1 = card1.value !== undefined 
      ? card1.value 
      : (CARD_VALUES[card1.rank] || parseFloat(card1.rank));
    
    const val2 = card2.value !== undefined 
      ? card2.value 
      : (CARD_VALUES[card2.rank] || parseFloat(card2.rank));
    
    let result;
    let displayValue;
    
    switch (operation) {
      case '+':
        result = val1 + val2;
        displayValue = result.toString();
        break;
      case '-':
        result = val1 - val2;
        displayValue = result.toString();
        break;
      case '*':
        result = val1 * val2;
        displayValue = result.toString();
        break;
      case '/':
        if (val2 === 0) {
          setMessage('Cannot divide by zero!');
          setSelectedCard(null);
          setSelectedOperation(null);
          return;
        }
        result = val1 / val2;
        if (Number.isInteger(result)) {
          displayValue = result.toString();
        } else {
          const frac = toFraction(result);
          displayValue = `${frac.numerator}/${frac.denominator}`;
        }
        break;
      default:
        return;
    }

    // Save current state for undo
    setCardHistory([...cardHistory, { cards: [...cards], moveHistory: [...moveHistory] }]);

    const newCard = {
      rank: displayValue,
      suit: null,
      id: `result-${Date.now()}`,
      isOriginal: false,
      value: result
    };

    const newCards = cards.filter(c => c.id !== card1.id && c.id !== card2.id);
    newCards.push(newCard);

    const card1Display = card1.isOriginal ? `${card1.rank}${card1.suit}` : card1.rank;
    const card2Display = card2.isOriginal ? `${card2.rank}${card2.suit}` : card2.rank;
    
    const newMoveHistory = [...moveHistory, `${card1Display} ${operation} ${card2Display} = ${displayValue}`];

    setCards(newCards);
    setMoveHistory(newMoveHistory);
    setSelectedCard(null);
    setSelectedOperation(null);

    // Check win condition
    if (newCards.length === 1) {
      const finalValue = newCards[0].value || CARD_VALUES[newCards[0].rank] || parseFloat(newCards[0].rank);
      if (Math.abs(finalValue - 24) < EPSILON) {
        // Try to claim victory
        const roomRef = ref(database, `rooms/${roomId}`);
        
        // Check if someone already won
        if (!winner) {
          const newScore = (roomData.players[playerId]?.score || 0) + 1;
          
          await update(roomRef, {
            winner: playerId,
            winTime: Date.now(),
            [`players/${playerId}/score`]: newScore
          });
          setIWon(true);
          setMessage('🎉 You won!');
        } else {
          setMessage(`${roomData.players[winner]?.name} already won! But you finished!`);
        }
      } else {
        setMessage(`❌ Final value is ${displayValue}, not 24. Keep trying!`);
      }
    } else {
      const msg = winner 
        ? `Result: ${displayValue}. ${roomData.players[winner]?.name} won, but keep going!`
        : `Result: ${displayValue}. ${newCards.length} cards remaining.`;
      setMessage(msg);
    }
  };

  const undoLastMove = async () => {
    if (cardHistory.length === 0 || iWon) return;

    const lastState = cardHistory[cardHistory.length - 1];
    setCards(lastState.cards);
    setMoveHistory(lastState.moveHistory);
    setCardHistory(cardHistory.slice(0, -1));
    setSelectedCard(null);
    setSelectedOperation(null);
    setMessage(winner ? `${roomData.players[winner]?.name} won! Keep playing to finish.` : 'Last move undone. Continue playing!');
  };

  const resetBoard = () => {
    setCards([...originalCards]);
    setMoveHistory([]);
    setCardHistory([]);
    setSelectedCard(null);
    setSelectedOperation(null);
    setMessage(winner ? `${roomData.players[winner]?.name} won! Board reset.` : 'Board reset to original cards.');
  };

  const clockOpponent = async () => {
    if (!iWon || !roomData) return;
    
    const roomRef = ref(database, `rooms/${roomId}`);
    await update(roomRef, {
      clocked: true
    });
    
    setMessage('⏰ All players clocked!');
  };

  const kickPlayer = async (targetPlayerId) => {
    if (roomData?.host !== playerId) return;
    if (targetPlayerId === playerId) return; // Can't kick yourself
    
    const roomRef = ref(database, `rooms/${roomId}`);
    await update(roomRef, {
      [`players/${targetPlayerId}`]: null
    });
  };

  const toggleSitOut = async () => {
    if (!roomId) return;
    
    const newSitOutStatus = !isSittingOut;
    setIsSittingOut(newSitOutStatus);
    
    const roomRef = ref(database, `rooms/${roomId}`);
    await update(roomRef, {
      [`players/${playerId}/sittingOut`]: newSitOutStatus
    });
    
    if (newSitOutStatus) {
      setMessage('Sitting out. Your score is saved!');
    } else {
      setMessage('Back in the game!');
      // Reset board state for this player
      if (roomData?.originalCards) {
        setCards([...roomData.originalCards]);
        setOriginalCards([...roomData.originalCards]);
        setMoveHistory([]);
        setCardHistory([]);
        setSelectedCard(null);
        setSelectedOperation(null);
      }
    }
  };

  const checkAndStartNextRound = async () => {
    if (!roomData || !roomData.players) return;
    
    const activePlayers = Object.values(roomData.players).filter(p => !p.sittingOut);
    const activePlayerCount = activePlayers.length;
    const readyCount = activePlayers.filter(p => p.ready).length;
    
    console.log(`Ready check: ${readyCount}/${activePlayerCount} players ready`);
    
    if (readyCount === activePlayerCount && activePlayerCount > 0) {
      console.log('All players ready!');
      
      // Only the host should generate new cards
      const isHost = roomData.host === playerId;
      
      if (isHost) {
        console.log('I am host - generating new cards and starting new round...');
        
        const newCards = generateCards();
        const newRoundNumber = (roomData.roundNumber || 1) + 1;
        const roomRef = ref(database, `rooms/${roomId}`);
        
        // Reset all players' ready status and game state
        const updates = {
          originalCards: newCards,
          winner: null,
          clocked: false,
          roundNumber: newRoundNumber
        };
        
        Object.keys(roomData.players).forEach(pid => {
          updates[`players/${pid}/ready`] = false;
        });
        
        await update(roomRef, updates);
        console.log('New round started!');
      } else {
        console.log('Waiting for host to start new round...');
      }
    }
  };

  const readyUp = async () => {
    if (!roomId || !roomData || isSittingOut) return;
    
    console.log('Ready up clicked!');
    setMyReady(true);
    const roomRef = ref(database, `rooms/${roomId}`);
    
    await update(roomRef, {
      [`players/${playerId}/ready`]: true
    });
    
    console.log('Ready status updated in Firebase');
    setMessage('Ready! Waiting for other players...');
    
    // Check if all active players are ready after a short delay to let Firebase sync
    setTimeout(() => checkAndStartNextRound(), 800);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold text-gray-800 mb-2">24 Game</h1>
          <p className="text-gray-600 text-lg">Multiplayer - Combine all cards to make 24!</p>
        </div>

        {gameState === 'setup' && (
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <Users className="w-24 h-24 mx-auto text-blue-600 mb-4" />
            <h2 className="text-3xl font-bold text-gray-800 mb-4">Create or Join Game</h2>
            <div className="space-y-4 max-w-md mx-auto mb-8">
              <input
                type="text"
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-lg"
              />
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Player Limit (for new rooms)
                </label>
                <select
                  value={playerLimit}
                  onChange={(e) => setPlayerLimit(parseInt(e.target.value))}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-lg bg-white"
                >
                  <option value={2}>2 Players</option>
                  <option value={3}>3 Players</option>
                  <option value={4}>4 Players</option>
                  <option value={5}>5 Players</option>
                  <option value={6}>6 Players</option>
                </select>
              </div>
            </div>
            <div className="flex gap-4 justify-center">
              <button
                onClick={createRoom}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl text-xl font-bold shadow-lg transform hover:scale-105 transition"
              >
                Create Room
              </button>
              <button
                onClick={() => setGameState('join')}
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-xl text-xl font-bold shadow-lg transform hover:scale-105 transition"
              >
                Join Room
              </button>
            </div>
          </div>
        )}

        {gameState === 'join' && (
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <LinkIcon className="w-24 h-24 mx-auto text-green-600 mb-4" />
            <h2 className="text-3xl font-bold text-gray-800 mb-4">Join a Room</h2>
            <div className="space-y-4 max-w-md mx-auto mb-8">
              <input
                type="text"
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-lg"
              />
              <input
                type="text"
                placeholder="Enter room code"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none text-lg font-mono"
              />
            </div>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => setGameState('setup')}
                className="bg-gray-500 hover:bg-gray-600 text-white px-8 py-4 rounded-xl text-xl font-bold shadow-lg transition"
              >
                Back
              </button>
              <button
                onClick={joinRoom}
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-xl text-xl font-bold shadow-lg transform hover:scale-105 transition"
              >
                Join Game
              </button>
            </div>
          </div>
        )}

        {gameState === 'waiting' && (
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <Users className="w-24 h-24 mx-auto text-blue-600 mb-4 animate-pulse" />
            <h2 className="text-3xl font-bold text-gray-800 mb-4">
              Waiting for Players... ({Object.keys(roomData?.players || {}).length}/{roomData?.playerLimit})
            </h2>
            <p className="text-gray-600 mb-6">Room Code: <span className="font-mono font-bold text-2xl text-blue-600">{roomId}</span></p>
            <div className="max-w-md mx-auto mb-6 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-2">Share this link with your friends:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}${window.location.pathname}?room=${roomId}`}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono bg-white"
                />
                <button
                  onClick={copyRoomLink}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="text-gray-500 mb-6">
              <p className="mb-2 font-semibold">Players in room:</p>
              {roomData?.players && Object.values(roomData.players).map((player, idx) => (
                <p key={player.id} className="font-semibold text-gray-700">
                  ✓ {player.name} {player.id === playerId && '(You)'}
                </p>
              ))}
            </div>
            {roomData?.host === playerId && Object.keys(roomData?.players || {}).length >= 2 && (
              <button
                onClick={async () => {
                  const roomRef = ref(database, `rooms/${roomId}`);
                  await update(roomRef, { gameStarted: true });
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-xl text-xl font-bold shadow-lg transform hover:scale-105 transition"
              >
                Start Game Now
              </button>
            )}
          </div>
        )}

        {(gameState === 'playing' || gameState === 'won') && roomData && (
          <div className="space-y-6">
            {/* Game Info Bar */}
            <div className="bg-white rounded-xl shadow-lg p-4">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-gray-600" />
                    <span className="text-xl font-mono font-bold">{formatTime(timer)}</span>
                  </div>
                  {clockTimer !== null && !iWon && (
                    <div className={`flex items-center gap-2 px-4 py-1.5 rounded-lg border-2 ${
                      clockTimer <= 10 
                        ? 'bg-red-200 border-red-500 animate-pulse' 
                        : 'bg-red-100 border-red-400'
                    }`}>
                      <span className={`font-bold text-xl ${
                        clockTimer <= 10 ? 'text-red-700' : 'text-red-600'
                      }`}>
                        ⏰ {clockTimer}s
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600">Room Code</div>
                  <div className="text-xl font-mono font-bold text-blue-600">{roomId}</div>
                </div>
                <button
                  onClick={copyRoomLink}
                  className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg transition"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  Share
                </button>
              </div>

              {/* Compact Player Cards - Sorted by Score */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.values(roomData.players || {})
                  .sort((a, b) => (b.score || 0) - (a.score || 0))
                  .map((player) => {
                    const isMe = player.id === playerId;
                    const isWinner = winner === player.id;
                    const isHost = roomData.host === player.id;
                    
                    return (
                      <div
                        key={player.id}
                        className={`relative p-3 rounded-lg border-2 transition-all ${
                          isMe 
                            ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-300' 
                            : isWinner
                            ? 'border-green-600 bg-green-50'
                            : 'border-gray-300 bg-white'
                        }`}
                      >
                        {/* Winner Crown */}
                        {isWinner && (
                          <div className="absolute -top-3 -right-3">
                            <Trophy className="w-6 h-6 text-yellow-500 fill-yellow-400" />
                          </div>
                        )}
                        
                        {/* Player Info */}
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1">
                            <span className={`font-bold text-sm truncate max-w-[100px] ${isMe ? 'text-blue-700' : 'text-gray-800'}`}>
                              {player.name}
                            </span>
                            {isHost && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">HOST</span>}
                          </div>
                          <span className={`text-2xl font-bold ${isMe ? 'text-blue-600' : 'text-gray-700'}`}>
                            {player.score || 0}
                          </span>
                        </div>
                        
                        {/* Status Indicators */}
                        <div className="flex items-center gap-2 text-xs">
                          {player.sittingOut && (
                            <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Sitting Out</span>
                          )}
                          {player.ready && !player.sittingOut && (
                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">✓ Ready</span>
                          )}
                          {!player.ready && !player.sittingOut && winner && (
                            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Playing...</span>
                          )}
                          
                          {/* Kick Button for Host */}
                          {roomData.host === playerId && !isMe && (
                            <button
                              onClick={() => kickPlayer(player.id)}
                              className="ml-auto text-red-600 hover:text-red-800 text-xs font-semibold"
                            >
                              Kick
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Sit Out Button */}
              <div className="mt-4 text-center">
                <button
                  onClick={toggleSitOut}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
                    isSittingOut
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                  }`}
                >
                  {isSittingOut ? '↩️ Join Back In' : '⏸️ Sit Out'}
                </button>
              </div>
            </div>

            {/* Ready Up Section - Between Player Cards and Game Board */}
            {(winner || clockTimer === 0) && (
              <div className="p-6 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border-2 border-orange-300 shadow-lg">
                <div className="text-center">
                  <div className="text-xl font-bold text-orange-800 mb-4">
                    {clockTimer === 0 
                      ? "⏰ Time's Up! Game Frozen - Ready Up!" 
                      : roomData?.clocked 
                      ? `⏰ Clock Running - ${clockTimer}s remaining` 
                      : '🏁 Round Complete!'}
                  </div>
                  
                  {/* Ready Status */}
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-2">Ready Status:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {Object.values(roomData.players || {})
                        .filter(p => !p.sittingOut)
                        .map(player => (
                          <span 
                            key={player.id}
                            className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              player.ready 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {player.ready ? '✓' : '○'} {player.name}
                          </span>
                        ))
                      }
                    </div>
                  </div>
                  
                  {isSittingOut ? (
                    <div className="text-lg font-semibold text-gray-600">
                      You're sitting out this round
                    </div>
                  ) : myReady || roomData?.players?.[playerId]?.ready ? (
                    <div className="text-lg font-semibold text-green-600">
                      ✓ Ready! Waiting for others...
                    </div>
                  ) : (
                    <button
                      onClick={readyUp}
                      className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl text-xl font-bold shadow-lg transform hover:scale-105 transition"
                    >
                      Ready for Next Round
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Cards Display */}
            <div className="bg-white rounded-2xl shadow-xl p-8">
              {isSittingOut && (
                <div className="mb-6 p-4 bg-yellow-100 border-2 border-yellow-400 rounded-lg text-center">
                  <p className="text-yellow-800 font-bold">You're sitting out. Click "Join Back In" to play!</p>
                </div>
              )}
              
              {clockTimer === 0 && !iWon && (
                <div className="mb-6 p-4 bg-red-100 border-2 border-red-500 rounded-lg text-center">
                  <p className="text-red-800 font-bold text-lg">🔒 Time's Up - Game Frozen!</p>
                  <p className="text-red-700 text-sm mt-1">Click "Ready for Next Round" below to continue</p>
                </div>
              )}
              
              <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">
                {cards.length === 4 ? 'Starting Cards' : `${cards.length} Card${cards.length !== 1 ? 's' : ''} Remaining`}
              </h2>
              <div className="grid grid-cols-2 gap-6 max-w-md mx-auto mb-8">
                {cards.map((card) => (
                  <PlayingCard
                    key={card.id}
                    card={card}
                    isSelected={selectedCard?.id === card.id}
                    onClick={() => handleCardClick(card)}
                    disabled={iWon || isSittingOut || clockTimer === 0}
                  />
                ))}
              </div>

              {/* Operations */}
              <div className="mb-6">
                <h3 className="text-xl font-bold text-center mb-4 text-gray-800">
                  {clockTimer === 0
                    ? '🔒 Game Frozen - Ready Up to Continue!' 
                    : isSittingOut 
                    ? 'Sitting Out' 
                    : iWon 
                    ? 'You already won!' 
                    : winner 
                    ? `${roomData.players[winner]?.name} won! Keep playing to finish.` 
                    : selectedCard 
                    ? 'Choose Operation' 
                    : 'Select a card first'}
                </h3>
                <div className="flex gap-4 justify-center mb-4">
                  {['+', '-', '*', '/'].map(op => (
                    <button
                      key={op}
                      onClick={() => handleOperationClick(op)}
                      disabled={!selectedCard || iWon || isSittingOut || clockTimer === 0}
                      className={`w-16 h-16 bg-orange-500 hover:bg-orange-600 text-white text-3xl font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-110 transition ${
                        selectedOperation === op ? 'ring-4 ring-orange-300 scale-110' : ''
                      }`}
                    >
                      {op}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={undoLastMove}
                    disabled={cardHistory.length === 0 || iWon || isSittingOut || clockTimer === 0}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg text-sm"
                  >
                    ↶ Undo
                  </button>
                  <button
                    onClick={resetBoard}
                    disabled={iWon || isSittingOut || clockTimer === 0}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg text-sm"
                  >
                    🔄 Reset
                  </button>
                  {iWon && !roomData?.clocked && (
                    <button
                      onClick={clockOpponent}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition shadow-lg text-sm"
                    >
                      ⏰ Clock All Players
                    </button>
                  )}
                </div>
              </div>

              {/* Message Display */}
              {message && (
                <div className={`text-center text-lg font-semibold p-4 rounded-lg ${
                  iWon
                    ? 'bg-green-100 text-green-800' 
                    : message.includes('❌')
                    ? 'bg-red-100 text-red-800'
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {message}
                </div>
              )}

              {/* Move History */}
              {moveHistory.length > 0 && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-bold text-gray-700 mb-2">Your Move History:</h4>
                  <div className="space-y-1">
                    {moveHistory.map((move, idx) => (
                      <div key={idx} className="text-sm text-gray-600 font-mono">
                        {idx + 1}. {move}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Game Rules */}
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <h3 className="font-bold text-lg mb-3 text-gray-800">How to Play (2-6 Players):</h3>
              <ul className="space-y-2 text-gray-700">
                <li>✓ All players get the same 4 cards each round</li>
                <li>✓ Race to combine them into 24 first!</li>
                <li>✓ Click card → operation → card to combine</li>
                <li>✓ Selecting a different card/operation auto-switches</li>
                <li>✓ Use 🔄 Reset to go back to original 4 cards</li>
                <li>✓ Use ↶ Undo to reverse your last move</li>
                <li>✓ First player to make 24 wins the round and gets +1 score!</li>
                <li>✓ Winner can ⏰ Clock all players (starts 60-second countdown)</li>
                <li>✓ Keep playing during countdown - race to finish!</li>
                <li>✓ When timer hits 0, game freezes and you must ready up</li>
                <li>✓ Use ⏸️ Sit Out to take a break (keeps your score)</li>
                <li>✓ Host can kick AFK players</li>
                <li>✓ Players can join anytime (up to room limit)</li>
                <li>✓ All active players must ready up for next round</li>
                <li>✓ Player cards sorted by score - your card is highlighted blue</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TwentyFourGame;
