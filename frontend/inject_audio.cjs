const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add Sound State and Ref for seatModal
const stateStr = `const [seatModal, setSeatModal] = useState({ open: false, room: null, selectedSeats: [] });`;
const newStateStr = `const [seatModal, setSeatModal] = useState({ open: false, room: null, selectedSeats: [] });
    const seatModalRef = useRef(seatModal);
    useEffect(() => { seatModalRef.current = seatModal; }, [seatModal]);
    
    const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('sound') !== 'false');
    useEffect(() => { localStorage.setItem('sound', soundEnabled); }, [soundEnabled]);
`;
content = content.replace(stateStr, newStateStr);

// 2. Insert Sound Toggle Button in Header
const headerStr = `<div className="inline-flex rounded-full border border-white/10 bg-black/30 p-0.5 scale-90">
                            <button type="button" onClick={() => setLanguage('am')} className={\`rounded-full px-2 py-0.5 text-[10px] font-bold transition \${language === 'am' ? 'bg-equb-500 text-white' : 'text-white/45 hover:text-white/70'}\`}>{language === 'am' ? '🇪🇹' : 'AMH'}</button>
                            <button type="button" onClick={() => setLanguage('en')} className={\`rounded-full px-2 py-0.5 text-[10px] font-bold transition \${language === 'en' ? 'bg-equb-500 text-white' : 'text-white/45 hover:text-white/70'}\`}>EN</button>
                        </div>`;
const newHeaderStr = `<div className="inline-flex items-center gap-2">
                            <button 
                                onClick={() => setSoundEnabled(!soundEnabled)} 
                                className={\`rounded-full p-1.5 border transition \${soundEnabled ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10' : 'border-white/10 text-white/40 hover:text-white/70 bg-black/30'}\`}
                                title={soundEnabled ? 'Sound On' : 'Sound Off'}
                            >
                                {soundEnabled ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                                )}
                            </button>
                            <div className="inline-flex rounded-full border border-white/10 bg-black/30 p-0.5 scale-90">
                                <button type="button" onClick={() => setLanguage('am')} className={\`rounded-full px-2 py-0.5 text-[10px] font-bold transition \${language === 'am' ? 'bg-equb-500 text-white' : 'text-white/45 hover:text-white/70'}\`}>{language === 'am' ? '🇪🇹' : 'AMH'}</button>
                                <button type="button" onClick={() => setLanguage('en')} className={\`rounded-full px-2 py-0.5 text-[10px] font-bold transition \${language === 'en' ? 'bg-equb-500 text-white' : 'text-white/45 hover:text-white/70'}\`}>EN</button>
                            </div>
                        </div>`;
content = content.replace(headerStr, newHeaderStr);

// 3. Update Socket logic to trigger Audio
const socketTickRegex = /if \(timeRemaining <= 5 && timeRemaining > 0\) playTick\(\);\s*}\);/g;
const newSocketTick = `if (timeRemaining <= 5 && timeRemaining > 0) {
                if (localStorage.getItem('sound') !== 'false') playTick();
            }

            if (seatModalRef.current.open && seatModalRef.current.room?.id === roomId) {
                if (localStorage.getItem('sound') !== 'false') {
                    const amhNums = {10: "አስር", 9: "ዘጠኝ", 8: "ስምንት", 7: "ሰባት", 6: "ስድስት", 5: "አምስት", 4: "አራት", 3: "ሶስት", 2: "ሁለት", 1: "አንድ"};
                    if (timeRemaining === 10) {
                        const msg = new SpeechSynthesisUtterance("የከፈቱት ክፍል እጣ ሊወጣ አስር ሰከንድ ብቻ ቀርቷል");
                        msg.lang = 'am-ET';
                        window.speechSynthesis.speak(msg);
                    }
                    if (timeRemaining <= 10 && timeRemaining > 0) {
                        const numMsg = new SpeechSynthesisUtterance(amhNums[timeRemaining]);
                        numMsg.lang = 'am-ET';
                        window.speechSynthesis.speak(numMsg);
                    }
                }
            }
        });`;
content = content.replace(socketTickRegex, newSocketTick);

// 4. Update Socket winner announcement
const socketWinnerRegex = /setTimeout\(\(\) => \{\s+triggerConfetti\(\);/g;
const newSocketWinner = `setTimeout(() => {
                triggerConfetti();
                if (localStorage.getItem('sound') !== 'false' && seatModalRef.current.room?.id === data.roomId || drawModal.room === data.roomId) {
                    const msg = new SpeechSynthesisUtterance(\`ዕጣው የወጣለት አሸናፊ ቁጥር \${data.winnerSeatNumber} ነው! እንኳን ደስ አሎት!\`);
                    msg.lang = 'am-ET';
                    window.speechSynthesis.speak(msg);
                }`;
content = content.replace(socketWinnerRegex, newSocketWinner);

// 5. Visual UI change for the countdown timer in seatModal
const uiTimerRegex = /<span className="text-3xl font-black text-white leading-none tracking-tight">00:\{\(activeRoom\.timeRemaining \|\| 60\)\.toString\(\)\.padStart\(2, '0'\)\}<\/span>/g;
const newUiTimer = `<span className={\`text-3xl font-black leading-none tracking-tight transition-colors duration-300 \${(activeRoom.timeRemaining || 60) <= 3 ? 'text-rose-500 animate-pulse' : (activeRoom.timeRemaining || 60) <= 10 ? 'text-amber-400' : 'text-white'}\`}>00:{(activeRoom.timeRemaining || 60).toString().padStart(2, '0')}</span>`;
content = content.replace(uiTimerRegex, newUiTimer);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Voice countdown and timer styling injected.');
