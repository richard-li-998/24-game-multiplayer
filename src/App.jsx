import React, { useState, useEffect, useMemo } from 'react';
import { database } from './firebase';
import { ref, set, onValue, update, get, onDisconnect } from 'firebase/database';

const EPSILON = 0.001;

// Game constants
const CLOCK_DURATION = 60;
const COPY_FEEDBACK_DURATION = 2000;
const FIREBASE_SYNC_DELAY = 800;
const MAX_PLAYER_NAME_LENGTH = 30;
const MAX_CARD_GENERATION_ATTEMPTS = 100;
const ROOM_CODE_LENGTH = 6;

// Validation helpers
const validatePlayerName = (name) => {
  const trimmed = name.trim();
  if (!trimmed) return { valid: false, error: 'Please enter your name' };
  if (trimmed.length > MAX_PLAYER_NAME_LENGTH) return { valid: false, error: `Max ${MAX_PLAYER_NAME_LENGTH} characters` };
  if (!/^[a-zA-Z0-9 '-]+$/.test(trimmed)) return { valid: false, error: 'Only letters, numbers, spaces, hyphens allowed' };
  return { valid: true, name: trimmed };
};

const validateRoomCode = (code) => {
  const cleaned = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(cleaned)) return { valid: false, error: 'Invalid room code' };
  return { valid: true, code: cleaned };
};

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

  while (attempts < MAX_CARD_GENERATION_ATTEMPTS) {
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
  const displayValue = card.rank;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative aspect-[2/3] rounded-lg border-2 bg-white flex flex-col items-center justify-center transition-all shadow-sm ${
        isSelected
          ? 'border-black ring-2 ring-gray-400'
          : 'border-gray-500 hover:border-gray-700'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {card.isOriginal ? (
        <>
          <div className={`absolute top-1.5 left-2 flex flex-col items-center leading-none ${SUIT_COLORS[card.suit]}`}>
            <div className="text-lg font-medium">{card.rank}</div>
            <div className="text-sm">{card.suit}</div>
          </div>
          <div className={`text-5xl ${SUIT_COLORS[card.suit]}`}>
            {card.suit}
          </div>
          <div className={`absolute bottom-1.5 right-2 flex flex-col items-center leading-none rotate-180 ${SUIT_COLORS[card.suit]}`}>
            <div className="text-lg font-medium">{card.rank}</div>
            <div className="text-sm">{card.suit}</div>
          </div>
        </>
      ) : (
        <div className="text-2xl font-medium text-gray-700">
          {displayValue}
        </div>
      )}
    </button>
  );
}

function TwentyFourGame() {
  const [gameMode, setGameMode] = useState(null); // 'single' or 'multi'
  const [gameState, setGameState] = useState('setup');
  const [roomId, setRoomId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [playerName, setPlayerName] = useState('');
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
  
  // Single player specific states
  const [singlePlayerScore, setSinglePlayerScore] = useState(0);
  const [singlePlayerBestTime, setSinglePlayerBestTime] = useState(null);

  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  // Memoized player lists
  const sortedPlayers = useMemo(() =>
    Object.values(roomData?.players || {})
      .sort((a, b) => (b.score || 0) - (a.score || 0)),
    [roomData?.players]
  );


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
      setGameMode('multi');
    }

    // Generate player ID
    const pid = 'player_' + Math.random().toString(36).substr(2, 9);
    setPlayerId(pid);
  }, []);

  useEffect(() => {
    let interval;
    if (gameMode === 'multi' && gameState === 'playing' && roomData?.gameStarted && !winner) {
      interval = setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameMode, gameState, roomData, winner]);

  // Clock countdown timer
  useEffect(() => {
    let interval;
    if (clockTimer !== null && clockTimer > 0) {
      interval = setInterval(() => {
        setClockTimer(t => {
          const newTime = t - 1;
          if (newTime > 0 && !iWon) {
            setMessage(`⏰ You've been clocked! ${newTime} seconds to finish!`);
          } else if (newTime === 0 && !iWon) {
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
    if (roomId && gameMode === 'multi') {
      const roomRef = ref(database, `rooms/${roomId}`);
      const unsubscribe = onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setRoomData(prev => {
            // Check if I was kicked
            if (data.players && !data.players[playerId]) {
              setMessage('❌ You were removed from the room');
              setGameState('setup');
              setRoomId(null);
              return null;
            }

            // Only set initial cards when game starts or new round
            if (data.gameStarted && (!prev?.gameStarted || data.roundNumber !== prev?.roundNumber)) {
              setCards(data.originalCards || []);
              setOriginalCards(data.originalCards || []);
              setMoveHistory([]);
              setCardHistory([]);
              setSelectedCard(null);
              setSelectedOperation(null);
              setIWon(false);
              setMyReady(false);
              setWinner(null);
              setClockTimer(null);
            }

            // Check for winner
            if (data.winner && !prev?.winner) {
              setWinner(data.winner);
              const winnerName = data.players[data.winner]?.name;
              if (data.winner === playerId) {
                setIWon(true);
                setMessage('🎉 You won!');
              } else {
                setMessage(`${winnerName} won! Keep playing to finish.`);
              }
            }

            // Show clock message if clocked and start countdown
            if (data.clocked && !prev?.clocked) {
              setClockTimer(CLOCK_DURATION);
            }

            if (data.gameStarted && !prev?.gameStarted) {
              setGameState('playing');
            }

            return data;
          });
        }
      });

      return () => unsubscribe();
    }
  }, [roomId, gameMode, playerId]);

  // Set up disconnect handler to save score and remove player
  useEffect(() => {
    if (roomId && gameMode === 'multi' && playerId && roomData?.players?.[playerId]) {
      const playerRef = ref(database, `rooms/${roomId}/players/${playerId}`);
      const currentPlayer = roomData.players[playerId];

      // On disconnect: save score to history, then remove player
      const scoreHistoryRef = ref(database, `rooms/${roomId}/scoreHistory/${currentPlayer.name}`);
      onDisconnect(scoreHistoryRef).set(currentPlayer.score || 0);
      onDisconnect(playerRef).remove();

      // Cleanup: cancel onDisconnect when effect re-runs or unmounts
      return () => {
        onDisconnect(scoreHistoryRef).cancel();
        onDisconnect(playerRef).cancel();
      };
    }
  }, [roomId, gameMode, playerId, roomData?.players]);

  // Auto-check if all players are ready when roomData changes
  useEffect(() => {
    if (roomData && winner && roomData.players) {
      checkAndStartNextRound();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.players, winner]);

  // Single player timer effect
  useEffect(() => {
    let interval;
    if (gameMode === 'single' && gameState === 'playing' && !winner) {
      interval = setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameMode, gameState, winner]);

  // Single player game functions
  const startSinglePlayerGame = () => {
    const newCards = generateCards();
    setCards(newCards);
    setOriginalCards(newCards);
    setMoveHistory([]);
    setCardHistory([]);
    setSelectedCard(null);
    setSelectedOperation(null);
    setWinner(null);
    setTimer(0);
    setMessage('');
    setGameState('playing');
  };

  const nextRoundSinglePlayer = () => {
    const newCards = generateCards();
    setCards(newCards);
    setOriginalCards(newCards);
    setMoveHistory([]);
    setCardHistory([]);
    setSelectedCard(null);
    setSelectedOperation(null);
    setWinner(null);
    setIWon(false);
    setTimer(0);
    setMessage('');
  };

  const backToMenu = () => {
    setGameMode(null);
    setGameState('setup');
    setCards([]);
    setOriginalCards([]);
    setMoveHistory([]);
    setCardHistory([]);
    setSelectedCard(null);
    setSelectedOperation(null);
    setWinner(null);
    setTimer(0);
    setMessage('');
    setSinglePlayerScore(0);
    setSinglePlayerBestTime(null);
  };

  const createRoom = async () => {
    const validation = validatePlayerName(playerName);
    if (!validation.valid) {
      setMessage(`❌ ${validation.error}`);
      return;
    }

    setIsLoading(true);
    setMessage('⏳ Creating room...');

    try {
      const newRoomId = Math.random().toString(36).substr(2, ROOM_CODE_LENGTH).toUpperCase();
      const newCards = generateCards();
      const roomRef = ref(database, `rooms/${newRoomId}`);

      await set(roomRef, {
        host: playerId,
        players: {
          [playerId]: {
            id: playerId,
            name: validation.name,
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

      setGameMode('multi');
      setRoomId(newRoomId);
      setGameState('waiting');
      setMessage('');
    } catch (error) {
      console.error('Create room error:', error);
      setMessage('❌ Failed to create room. Check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const joinRoom = async () => {
    const nameValidation = validatePlayerName(playerName);
    if (!nameValidation.valid) {
      setMessage(`❌ ${nameValidation.error}`);
      return;
    }

    const roomValidation = validateRoomCode(joinRoomId);
    if (!roomValidation.valid) {
      setMessage(`❌ ${roomValidation.error}`);
      return;
    }

    setMessage('⏳ Joining room...');

    try {
      const roomRef = ref(database, `rooms/${roomValidation.code}`);
      const snapshot = await get(roomRef);
      const data = snapshot.val();

      if (!data) {
        setMessage('❌ Room not found!');
        return;
      }

      // Restore score if player was in this room before
      const previousScore = data.scoreHistory?.[nameValidation.name] || 0;

      setGameMode('multi');
      setRoomId(roomValidation.code);

      await update(roomRef, {
        [`players/${playerId}`]: {
          id: playerId,
          name: nameValidation.name,
          score: previousScore,
          ready: false,
          sittingOut: false,
          joinedAt: Date.now()
        },
        gameStarted: true
      });

      setGameState('playing');
      setMessage('');
    } catch (error) {
      console.error('Join room error:', error);
      setMessage('❌ Failed to join room. Check your connection.');
    }
  };

  const copyRoomLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCardClick = async (card) => {
    if (gameState !== 'playing' || iWon) return;
    if (gameMode === 'multi' && clockTimer === 0) return;

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
    if (iWon) return;
    if (gameMode === 'multi' && clockTimer === 0) return;
    
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
        if (gameMode === 'single') {
          // Single player win
          setWinner(playerId);
          setIWon(true);
          setSinglePlayerScore(prev => prev + 1);
          
          // Check and update best time
          if (singlePlayerBestTime === null || timer < singlePlayerBestTime) {
            setSinglePlayerBestTime(timer);
            setMessage(`🎉 You won in ${timer}s! New best time!`);
          } else {
            setMessage(`🎉 You won in ${timer}s!`);
          }
        } else {
          // Multiplayer win
          const roomRef = ref(database, `rooms/${roomId}`);

          // Check if someone already won
          if (!winner) {
            try {
              const newScore = (roomData.players[playerId]?.score || 0) + 1;

              await update(roomRef, {
                winner: playerId,
                winTime: Date.now(),
                [`players/${playerId}/score`]: newScore
              });
              setIWon(true);
              setMessage('🎉 You won!');
            } catch (error) {
              console.error('Failed to record win:', error);
              setMessage('❌ Error saving win. Please try again.');
            }
          } else {
            setMessage(`${roomData?.players?.[winner]?.name || 'Someone'} already won! But you finished!`);
          }
        }
      } else {
        setMessage(`❌ Final value is ${displayValue}, not 24. Keep trying!`);
      }
    } else {
      if (gameMode === 'single') {
        setMessage(`Result: ${displayValue}. ${newCards.length} cards remaining.`);
      } else {
        const msg = winner 
          ? `Result: ${displayValue}. ${roomData.players[winner]?.name} won, but keep going!`
          : `Result: ${displayValue}. ${newCards.length} cards remaining.`;
        setMessage(msg);
      }
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
    
    if (gameMode === 'single') {
      setMessage('Last move undone. Continue playing!');
    } else {
      setMessage(winner ? `${roomData.players[winner]?.name} won! Keep playing to finish.` : 'Last move undone. Continue playing!');
    }
  };

  const resetBoard = () => {
    setCards([...originalCards]);
    setMoveHistory([]);
    setCardHistory([]);
    setSelectedCard(null);
    setSelectedOperation(null);
    
    if (gameMode === 'single') {
      setMessage('Board reset to original cards.');
    } else {
      setMessage(winner ? `${roomData.players[winner]?.name} won! Board reset.` : 'Board reset to original cards.');
    }
  };

  const kickPlayer = async (targetPlayerId) => {
    if (roomData?.host !== playerId) return;
    if (targetPlayerId === playerId) return;

    try {
      const roomRef = ref(database, `rooms/${roomId}`);
      await update(roomRef, { [`players/${targetPlayerId}`]: null });
    } catch (error) {
      console.error('Failed to kick player:', error);
      setMessage('❌ Failed to kick player. Try again.');
    }
  };

  const toggleSitOut = async () => {
    if (!roomId) return;

    const newSitOutStatus = !isSittingOut;

    try {
      const roomRef = ref(database, `rooms/${roomId}`);
      await update(roomRef, { [`players/${playerId}/sittingOut`]: newSitOutStatus });
      setIsSittingOut(newSitOutStatus);

      if (newSitOutStatus) {
        setMessage('Sitting out. Your score is saved!');
      } else {
        setMessage('Back in the game!');
        if (roomData?.originalCards) {
          setCards([...roomData.originalCards]);
          setOriginalCards([...roomData.originalCards]);
          setMoveHistory([]);
          setCardHistory([]);
          setSelectedCard(null);
          setSelectedOperation(null);
        }
      }
    } catch (error) {
      console.error('Failed to toggle sit out:', error);
      setMessage('❌ Failed to update status. Try again.');
    }
  };

  const startNewRound = async () => {
    const newCards = generateCards();
    const newRoundNumber = (roomData.roundNumber || 1) + 1;
    const roomRef = ref(database, `rooms/${roomId}`);

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
  };

  const checkAndStartNextRound = async () => {
    if (!roomData || !roomData.players) return;

    const activePlayers = Object.values(roomData.players).filter(p => !p.sittingOut);
    const readyCount = activePlayers.filter(p => p.ready).length;

    if (readyCount === activePlayers.length && activePlayers.length > 0 && roomData.host === playerId) {
      try {
        await startNewRound();
      } catch (error) {
        console.error('Failed to start next round:', error);
        setMessage('Failed to start next round.');
      }
    }
  };

  const readyUp = async () => {
    if (!roomId || !roomData || isSittingOut) return;

    try {
      setMyReady(true);
      const roomRef = ref(database, `rooms/${roomId}`);

      await update(roomRef, { [`players/${playerId}/ready`]: true });
      setMessage('Ready! Waiting for other players...');

      setTimeout(() => checkAndStartNextRound(), FIREBASE_SYNC_DELAY);
    } catch (error) {
      console.error('Failed to ready up:', error);
      setMyReady(false);
      setMessage('Failed to ready up.');
    }
  };

  const skipToNextRound = async () => {
    if (!iWon || clockTimer !== 0 || !roomData) return;

    try {
      await startNewRound();
    } catch (error) {
      console.error('Failed to skip round:', error);
      setMessage('Failed to skip round.');
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-white p-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-4">
          <h1 className="text-3xl font-semibold text-gray-900">24</h1>
        </div>

        {/* Mode Selection */}
        {!gameMode && gameState === 'setup' && (
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setGameMode('single');
                startSinglePlayerGame();
              }}
              className="px-6 py-3 border border-gray-300 hover:border-gray-900 hover:bg-gray-50 rounded text-gray-700 hover:text-gray-900 transition"
            >
              Solo
            </button>
            <button
              onClick={() => setGameMode('multi')}
              className="px-6 py-3 border border-gray-300 hover:border-gray-900 hover:bg-gray-50 rounded text-gray-700 hover:text-gray-900 transition"
            >
              Multiplayer
            </button>
          </div>
        )}

        {gameMode === 'multi' && gameState === 'setup' && (
          <div className="space-y-4 max-w-sm mx-auto">
            <input
              type="text"
              placeholder="Your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:border-gray-900 focus:outline-none"
            />
            <div className="flex gap-2 justify-center pt-2">
              <button
                onClick={() => setGameMode(null)}
                className="px-4 py-2 text-gray-500 hover:text-gray-900 transition text-sm"
              >
                ← Back
              </button>
              <button
                onClick={createRoom}
                disabled={isLoading}
                className="px-4 py-2 border border-gray-300 hover:border-gray-900 rounded transition text-sm disabled:opacity-50"
              >
                {isLoading ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => setGameState('join')}
                disabled={isLoading}
                className="px-4 py-2 border border-gray-300 hover:border-gray-900 rounded transition text-sm disabled:opacity-50"
              >
                Join
              </button>
            </div>
          </div>
        )}

        {gameState === 'join' && (
          <div className="space-y-3 max-w-sm mx-auto">
            <input
              type="text"
              placeholder="Your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:border-gray-900 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Room code"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:border-gray-900 focus:outline-none font-mono"
            />
            <div className="flex gap-2 justify-center pt-2">
              <button
                onClick={() => {
                  setGameState('setup');
                  setGameMode(null);
                }}
                className="px-4 py-2 text-gray-500 hover:text-gray-900 transition text-sm"
              >
                ← Back
              </button>
              <button
                onClick={joinRoom}
                className="px-4 py-2 border border-gray-300 hover:border-gray-900 rounded transition text-sm"
              >
                Join
              </button>
            </div>
          </div>
        )}

        {gameState === 'waiting' && (
          <div className="space-y-4 max-w-sm mx-auto text-center">
            <div className="text-sm text-gray-500">
              {Object.keys(roomData?.players || {}).length} players
            </div>
            <div className="font-mono text-2xl tracking-wider">{roomId}</div>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}${window.location.pathname}?room=${roomId}`}
                className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs font-mono text-gray-500"
              />
              <button
                onClick={copyRoomLink}
                className="px-3 py-1 text-xs border border-gray-300 hover:border-gray-900 rounded transition"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              {roomData?.players && Object.values(roomData.players).map((player) => (
                <div key={player.id}>
                  {player.name} {player.id === playerId && <span className="text-gray-400">(you)</span>}
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-center pt-2">
              <button
                onClick={() => {
                  if (roomData?.host === playerId) {
                    const roomRef = ref(database, `rooms/${roomId}`);
                    set(roomRef, null);
                  }
                  setGameState('setup');
                  setGameMode(null);
                  setRoomId(null);
                  setRoomData(null);
                }}
                className="px-4 py-2 text-gray-500 hover:text-gray-900 transition text-sm"
              >
                Leave
              </button>
              {roomData?.host === playerId && Object.keys(roomData?.players || {}).length >= 2 && (
                <button
                  onClick={async () => {
                    const roomRef = ref(database, `rooms/${roomId}`);
                    await update(roomRef, { gameStarted: true });
                  }}
                  className="px-4 py-2 border border-gray-300 hover:border-gray-900 rounded transition text-sm"
                >
                  Start
                </button>
              )}
            </div>
          </div>
        )}

        {/* Single Player Mode */}
        {gameMode === 'single' && gameState === 'playing' && (
          <div className="space-y-4">
            {/* Game Info Bar */}
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-4">
                <span className="font-mono">{formatTime(timer)}</span>
                <span className="text-gray-500">Score: {singlePlayerScore}</span>
                {singlePlayerBestTime !== null && (
                  <span className="text-gray-400">Best: {formatTime(singlePlayerBestTime)}</span>
                )}
              </div>
              <button
                onClick={backToMenu}
                className="text-gray-500 hover:text-gray-900 transition"
              >
                ← Exit
              </button>
            </div>

            {/* Winner Banner */}
            {winner && (
              <div className="text-center py-4 border-y border-gray-200">
                <div className="text-lg mb-2">Solved in {formatTime(timer)}{timer === singlePlayerBestTime && ' — New best!'}</div>
                <button
                  onClick={nextRoundSinglePlayer}
                  className="px-4 py-2 border border-gray-300 hover:border-gray-900 rounded transition text-sm"
                >
                  Next Round
                </button>
              </div>
            )}

            {/* Cards Display */}
            <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
              {cards.map((card) => (
                <PlayingCard
                  key={card.id}
                  card={card}
                  isSelected={selectedCard?.id === card.id}
                  onClick={() => handleCardClick(card)}
                  disabled={winner}
                />
              ))}
            </div>

            {/* Operations */}
            <div className="flex gap-2 justify-center">
              {['+', '-', '×', '÷'].map((op, i) => (
                <button
                  key={op}
                  onClick={() => handleOperationClick(['+', '-', '*', '/'][i])}
                  disabled={!selectedCard || winner}
                  className={`w-12 h-12 border rounded text-xl transition disabled:opacity-30 ${
                    selectedOperation === ['+', '-', '*', '/'][i]
                      ? 'border-gray-900 bg-gray-100'
                      : 'border-gray-300 hover:border-gray-900'
                  }`}
                >
                  {op}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-center text-sm">
              <button
                onClick={undoLastMove}
                disabled={cardHistory.length === 0 || winner}
                className="px-3 py-1 text-gray-500 hover:text-gray-900 disabled:opacity-30 transition"
              >
                Undo
              </button>
              <button
                onClick={resetBoard}
                disabled={winner}
                className="px-3 py-1 text-gray-500 hover:text-gray-900 disabled:opacity-30 transition"
              >
                Reset
              </button>
            </div>

            {/* Message Display */}
            {message && (
              <div className={`text-center text-sm py-2 ${
                message.includes('❌') ? 'text-red-600' : 'text-gray-600'
              }`}>
                {message}
              </div>
            )}

            {/* Move History */}
            {moveHistory.length > 0 && (
              <div className="text-xs text-gray-400 text-center font-mono">
                {moveHistory.join(' → ')}
              </div>
            )}
          </div>
        )}

        {(gameState === 'playing' || gameState === 'won') && gameMode === 'multi' && roomData && (
          <div className="space-y-4">
            {/* Game Info Bar */}
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-3">
                <span className="font-mono">{formatTime(timer)}</span>
                {clockTimer !== null && clockTimer > 0 && (
                  <span className={`font-mono ${clockTimer <= 10 ? 'text-red-600' : 'text-orange-500'}`}>
                    {clockTimer}s
                  </span>
                )}
              </div>
              <span className="font-mono text-gray-400">{roomId}</span>
              <button
                onClick={copyRoomLink}
                className="text-gray-500 hover:text-gray-900 transition"
              >
                {copied ? 'Copied' : 'Share'}
              </button>
            </div>

            {/* Players */}
            <div className="flex flex-wrap gap-2 justify-center text-sm">
              {sortedPlayers.map((player) => {
                const isMe = player.id === playerId;
                const isWinner = winner === player.id;

                return (
                  <div
                    key={player.id}
                    className={`px-3 py-1 rounded border ${
                      isMe ? 'border-gray-900 bg-gray-50' : 'border-gray-200'
                    }`}
                  >
                    <span className={isWinner ? 'font-semibold' : ''}>
                      {player.name}
                    </span>
                    <span className="text-gray-400 ml-2">{player.score || 0}</span>
                    {player.sittingOut && <span className="text-gray-400 ml-1">•</span>}
                    {player.ready && winner && <span className="text-green-500 ml-1">✓</span>}
                    {roomData.host === playerId && player.id !== playerId && (
                      <button
                        onClick={() => kickPlayer(player.id)}
                        className="ml-2 text-gray-400 hover:text-red-500"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Sit Out */}
            <div className="text-center">
              <button
                onClick={toggleSitOut}
                className="text-xs text-gray-500 hover:text-gray-900 transition"
              >
                {isSittingOut ? 'Join back in' : 'Sit out'}
              </button>
            </div>

            {/* Ready Up Section */}
            {(winner || clockTimer === 0) && (
              <div className="text-center py-3 border-y border-gray-200 space-y-2">
                {clockTimer === 0 && !iWon && (
                  <div className="text-sm text-gray-500">Time's up</div>
                )}
                {!isSittingOut && (
                  <div className="flex gap-2 justify-center">
                    {!(myReady || roomData?.players?.[playerId]?.ready) && (
                      <button
                        onClick={readyUp}
                        className="px-4 py-2 border border-gray-300 hover:border-gray-900 rounded transition text-sm"
                      >
                        Ready
                      </button>
                    )}
                    {iWon && clockTimer === 0 && (
                      <button
                        onClick={skipToNextRound}
                        className="px-4 py-2 border border-gray-300 hover:border-gray-900 rounded transition text-sm"
                      >
                        Skip
                      </button>
                    )}
                    {(myReady || roomData?.players?.[playerId]?.ready) && (
                      <span className="text-sm text-gray-500">Waiting for others...</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Cards Display */}
            <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
              {cards.map((card) => (
                <PlayingCard
                  key={card.id}
                  card={card}
                  isSelected={selectedCard?.id === card.id}
                  onClick={() => handleCardClick(card)}
                  disabled={winner || isSittingOut || clockTimer === 0}
                />
              ))}
            </div>

            {/* Operations */}
            <div className="flex gap-2 justify-center">
              {['+', '-', '×', '÷'].map((op, i) => (
                <button
                  key={op}
                  onClick={() => handleOperationClick(['+', '-', '*', '/'][i])}
                  disabled={!selectedCard || winner || isSittingOut || clockTimer === 0}
                  className={`w-12 h-12 border rounded text-xl transition disabled:opacity-30 ${
                    selectedOperation === ['+', '-', '*', '/'][i]
                      ? 'border-gray-900 bg-gray-100'
                      : 'border-gray-300 hover:border-gray-900'
                  }`}
                >
                  {op}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-center text-sm">
              <button
                onClick={undoLastMove}
                disabled={cardHistory.length === 0 || winner || isSittingOut || clockTimer === 0}
                className="px-3 py-1 text-gray-500 hover:text-gray-900 disabled:opacity-30 transition"
              >
                Undo
              </button>
              <button
                onClick={resetBoard}
                disabled={winner || isSittingOut || clockTimer === 0}
                className="px-3 py-1 text-gray-500 hover:text-gray-900 disabled:opacity-30 transition"
              >
                Reset
              </button>
            </div>

            {/* Message Display */}
            {message && (
              <div className={`text-center text-sm py-2 ${
                message.includes('❌') ? 'text-red-600' : 'text-gray-600'
              }`}>
                {message}
              </div>
            )}

            {/* Move History */}
            {moveHistory.length > 0 && (
              <div className="text-xs text-gray-400 text-center font-mono">
                {moveHistory.join(' → ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TwentyFourGame;
