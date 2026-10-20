const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const regexToReplace = /socket\.on\('room:time_tick'.*?return \(\) => socket\.off\(\);\s*\}, \[\]\);/s;

const correctSocketBlock = `socket.on('room:time_tick', ({ roomId, roomNumber, timeRemaining, filledSeats, groupSize, playerCount }) => {
            setRooms(prev => prev.map(r => r.id === roomId ? { 
                ...r, 
                roomNumber: roomNumber !== undefined ? roomNumber : r.roomNumber,
                timeRemaining,
                filledSeats: filledSeats !== undefined ? filledSeats : r.filledSeats,
                groupSize: groupSize !== undefined ? groupSize : r.groupSize,
                playerCount: playerCount !== undefined ? playerCount : r.playerCount
            } : r));
            setSeatModal(prev => (prev.open && prev.room && prev.room.id === roomId ? {
                ...prev,
                room: { 
                    ...prev.room, 
                    timeRemaining,
                    filledSeats: filledSeats !== undefined ? filledSeats : prev.room.filledSeats,
                    playerCount: playerCount !== undefined ? playerCount : prev.room.playerCount
                }
            } : prev));
            
            if (timeRemaining <= 5 && timeRemaining > 0) {
                if (localStorage.getItem('sound') !== 'false') playTick();
            }

            if (seatModalRef.current.open && seatModalRef.current.room?.id === roomId) {
                if (localStorage.getItem('sound') !== 'false') {
                    const amhNums = {10: "አስር", 9: "ዘጠኝ", 8: "ስምንት", 7: "ሰባት", 6: "ስድስት", 5: "አምስት", 4: "አራት", 3: "ሶስት", 2: "ሁለት", 1: "አንድ"};
                    const speak = (text) => {
                        const url = \`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=am&q=\${encodeURIComponent(text)}\`;
                        new Audio(url).play().catch(e => console.error("Audio error", e));
                    };
                    
                    if (timeRemaining === 10) {
                        speak("የከፈቱት ክፍል እጣ ሊወጣ አስር ሰከንድ ብቻ ቀርቷል");
                    }
                    if (timeRemaining <= 10 && timeRemaining > 0) {
                        setTimeout(() => { speak(amhNums[timeRemaining]); }, timeRemaining === 10 ? 3000 : 0);
                    }
                }
            }
        });

        socket.on('room:waiting_for_players', ({ roomId, roomNumber, currentPlayers, requiredPlayers }) => {
            setRooms(prev => prev.map(r => r.id === roomId ? { ...r, isWaiting: true, timeRemaining: 60 } : r));
        });

        socket.on('room:seat_claimed', ({ roomId, roomNumber, filledSeats, groupSize, playerCount, newSeats }) => {
            setRooms(prev => prev.map(r => r.id === roomId ? { 
                ...r, 
                roomNumber: roomNumber !== undefined ? roomNumber : r.roomNumber,
                filledSeats, 
                groupSize: groupSize !== undefined ? groupSize : r.groupSize,
                playerCount: playerCount !== undefined ? playerCount : r.playerCount,
                seats: r.seats ? [...r.seats, ...(newSeats||[])] : newSeats 
            } : r));
            setSeatModal(prev => {
                if (prev.open && prev.room && prev.room.id === roomId) {
                    const claimedNumbers = (newSeats || []).map(s => s.seatNumber);
                    return {
                        ...prev,
                        room: {
                            ...prev.room,
                            filledSeats,
                            playerCount,
                            seats: prev.room.seats ? [...prev.room.seats, ...(newSeats || [])] : newSeats
                        },
                        selectedSeats: prev.selectedSeats.filter(num => !claimedNumbers.includes(num))
                    };
                }
                return prev;
            });
            if (localStorage.getItem('sound') !== 'false') playSeatBuy();
        });

        socket.on('draw:started', (data) => {
            setDrawModal({ open: true, room: data.roomId, roomNumber: data.roomNumber, result: null });
            setSeatModal(prev => prev.room && prev.room.id === data.roomId ? { open: false, room: null, selectedSeats: [] } : prev);
            if (drawIntervalRef.current) clearInterval(drawIntervalRef.current);
            drawIntervalRef.current = setInterval(() => {
                const balls = document.querySelectorAll('.keno-ball');
                if (balls.length > 0) {
                    balls.forEach(b => {
                        b.classList.replace('bg-gold-500', 'bg-surface-800');
                    });
                    const randomBall = balls[Math.floor(Math.random() * balls.length)];
                    randomBall.classList.replace('bg-surface-800', 'bg-gold-500');
                }
            }, 80);
        });

        socket.on('draw:winner_revealed', (data) => {
            if (drawIntervalRef.current) clearInterval(drawIntervalRef.current);
            setDrawModal(prev => ({ ...prev, result: data }));
            
            setResults(prev => [{
                id: data.roomId,
                room_number: data.roomNumber,
                tier: data.tierCategory,
                target_jackpot: data.targetJackpot,
                winner_username: data.winnerUsername,
                amount: data.netPayout,
                seat_number: data.winnerSeatNumber,
                settled_at: new Date().toISOString()
            }, ...prev].slice(0, 20));

            setTimeout(() => {
                triggerConfetti();
                if (localStorage.getItem('sound') !== 'false' && (seatModalRef.current.room?.id === data.roomId || drawModal.room === data.roomId || drawModal.open)) {
                    const text = \`ዕጣው የወጣለት አሸናፊ ቁጥር \${data.winnerSeatNumber} ነው! እንኳን ደስ አሎት!\`;
                    const url = \`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=am&q=\${encodeURIComponent(text)}\`;
                    new Audio(url).play().catch(e => console.error("Audio error", e));
                }
                setUser(u => u && u.id === data.winnerUserId ? { ...u, balance: data.winnerBalance } : u);
            }, 1000);
        });

        return () => socket.off();
    }, []);`;

content = content.replace(regexToReplace, correctSocketBlock);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Restored socket event block.');
