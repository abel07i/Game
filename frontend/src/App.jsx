import { useEffect, useState, useRef, useMemo } from 'react';
import { getSocket, onSocketEvent, offSocketEvent, cleanupSocket } from './socketManager';
import { fetchWithTimeout, API_URL } from './config';

let audioCtx = null;
const initAudio = () => {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {
        console.warn('AudioContext init error:', e);
    }
};

const getSoundSettings = () => {
    return {
        master: localStorage.getItem('sound') !== 'false',
        sfx: localStorage.getItem('sound_sfx') !== 'false',
        voice: localStorage.getItem('sound_voice') !== 'false',
        volume: parseFloat(localStorage.getItem('sound_volume') || '0.8'),
        voiceLang: localStorage.getItem('sound_voice_lang') || 'auto'
    };
};

const playTick = () => {
    const s = getSoundSettings();
    if (!s.master || !s.sfx) return;
    initAudio();
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.12 * s.volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.08);
    } catch {}
};

const playSeatBuy = () => {
    const s = getSoundSettings();
    if (!s.master || !s.sfx) return;
    initAudio();
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1040, audioCtx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.25 * s.volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.28);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.28);
    } catch {}
};

const triggerConfetti = () => {
    for (let i = 0; i < 50; i++) {
        const conf = document.createElement('div');
        conf.className = 'confetti';
        conf.style.left = Math.random() * 100 + 'vw';
        conf.style.backgroundColor = ['#10b981', '#f59e0b', '#06b6d4', '#ef4444'][Math.floor(Math.random() * 4)];
        conf.style.animationDuration = (Math.random() * 2 + 2) + 's';
        document.body.appendChild(conf);
        setTimeout(() => conf.remove(), 5000);
    }
};

let singleVoiceAudio = null;
let currentAppLanguage = 'am';

const stopAllVoice = () => {
    // 1. Immediately cancel any pending/active browser speech synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
            window.speechSynthesis.cancel();
        } catch {}
    }
    // 2. Stop and reset the single active voice audio element
    if (singleVoiceAudio) {
        try {
            singleVoiceAudio.pause();
            singleVoiceAudio.currentTime = 0;
        } catch {}
    }
};

const resolveVoiceLang = (appLang = currentAppLanguage) => {
    const pref = localStorage.getItem('sound_voice_lang') || 'auto';
    if (pref === 'am' || pref === 'en') return pref;
    return appLang === 'en' ? 'en' : 'am';
};

const playSingleVoice = (src, onEnded) => {
    if (typeof window === 'undefined') return;
    const s = getSoundSettings();
    if (!s.master || !s.voice) return;

    // Immediately stop any currently playing voice
    stopAllVoice();

    try {
        if (!singleVoiceAudio) {
            singleVoiceAudio = new Audio();
            singleVoiceAudio.preload = 'auto';
        }
        singleVoiceAudio.volume = Math.max(0, Math.min(1, s.volume));
        singleVoiceAudio.src = src;
        singleVoiceAudio.currentTime = 0;
        singleVoiceAudio.onended = onEnded || null;
        const playPromise = singleVoiceAudio.play();
        if (playPromise !== undefined) {
            playPromise.catch((err) => {
                // If it was aborted because another voice was requested or stopped, ignore.
                // Do not fallback to speech synthesis to prevent voice overlaps.
                if (err && err.name !== 'AbortError') {
                    console.warn('Voice play error for ' + src + ':', err);
                }
            });
        }
    } catch (e) {
        console.warn('Voice play exception:', e);
    }
};

const playCountdownVoice = (num, lang = currentAppLanguage) => {
    if (num < 1 || num > 10) return;
    const activeLang = resolveVoiceLang(lang);
    if (activeLang === 'en') {
        playSingleVoice(`/sounds/voice/en_${num}.mp3`);
    } else {
        playSingleVoice(`/sounds/voice/${num}.mp3`);
    }
};

const playWinnerVoice = (winAmount, lang = currentAppLanguage) => {
    const activeLang = resolveVoiceLang(lang);
    if (activeLang === 'en') {
        playSingleVoice('/sounds/voice/win_en.mp3');
    } else {
        playSingleVoice('/sounds/voice/win_am.mp3');
    }
};

const playLoserVoice = (lang = currentAppLanguage) => {
    const activeLang = resolveVoiceLang(lang);
    if (activeLang === 'en') {
        playSingleVoice('/sounds/voice/lose_en.mp3');
    } else {
        playSingleVoice('/sounds/voice/lose_am.mp3');
    }
};

const playGameFinishVoice = (winnerUsername, winAmount, lang = currentAppLanguage) => {
    const activeLang = resolveVoiceLang(lang);
    if (activeLang === 'en') {
        playSingleVoice('/sounds/voice/finish_en.mp3');
    } else {
        playSingleVoice('/sounds/voice/finish_am.mp3');
    }
};

function formatAlertMessage(rawMessage, lang) {
    if (!rawMessage) return '';
    const msg = String(rawMessage);
    if (lang === 'am') {
        const maxMatch = msg.match(/Max (\d+) seats allowed per player for group size (\d+)/i);
        if (maxMatch) {
            return `ለ ${maxMatch[2]} ተጫዋቾች ክፍል በአንድ ሰው ከፍተኛ ${maxMatch[1]} መቀመጫ ብቻ ነው የሚፈቀደው።`;
        }
        const seatTakenMatch = msg.match(/Seat (\d+) is already taken/i);
        if (seatTakenMatch) {
            return `መቀመጫ #${seatTakenMatch[1]} በሌላ ተጫዋች ተይዟል። እባክዎ ሌላ ቁጥር ይምረጡ።`;
        }
        if (msg.includes('Please select at least one seat') || msg.includes('ቢያንስ አንድ')) {
            return 'እባክዎ ቢያንስ አንድ መቀመጫ ይምረጡ።';
        }
        if (msg.includes('Please login first') || msg.includes('loginFirst') || msg.includes('Only registered real players')) {
            return 'እባክዎ በመጀመሪያ ይግቡ።';
        }
        if (msg.includes('Purchase failed')) {
            return 'መቀመጫ መግዛት አልተሳካም። እባክዎ ቀሪ ሂሳብዎን ያረጋግጡ።';
        }
        if (msg.includes('Insufficient balance') || msg.includes('Insufficient funds')) {
            return 'ቀሪ ሂሳብዎ በቂ አይደለም። እባክዎ በዋሌት ገንዘብ ያስገቡ።';
        }
        if (msg.includes('Authentication failed')) {
            return 'መግባት አልተሳካም። ስልክ ቁጥር ወይም የይለፍ ቃል የተሳሳተ ነው።';
        }
        if (msg.includes('Please enter a Telebirr Transaction ID') || msg.includes('Transaction ID')) {
            return 'እባክዎ የቴሌብር ግብይት ቁጥር (Transaction ID) ያስገቡ።';
        }
        if (msg.includes('Invalid amount') || msg.includes('valid amount')) {
            return 'እባክዎ ትክክለኛ የገንዘብ መጠን ያስገቡ።';
        }
        if (msg.includes('Withdrawal request submitted')) {
            return 'የገንዘብ ማውጣት ጥያቄዎ በተሳካ ሁኔታ ቀርቧል! በቅርቡ ይረጋገጣል።';
        }
        if (msg.includes('Profile updated successfully')) {
            return 'የመገለጫ መረጃዎ በተሳካ ሁኔታ ተቀይሯል!';
        }
        if (msg.includes('Failed to update profile')) {
            return 'የመገለጫ መረጃ መቀየር አልተሳካም።';
        }
        if (msg.includes('Account deleted forever')) {
            return 'መለያዎ በቋሚነት ተሰርዟል።';
        }
        if (msg.includes('Failed to delete account')) {
            return 'መለያውን መሰረዝ አልተሳካም።';
        }
        if (msg.includes('Failed to create room')) {
            return 'ክፍል መፍጠር አልተሳካም።';
        }
        if (msg.includes('Successfully verified and deposited')) {
            return msg.replace('Successfully verified and deposited', 'በተሳካ ሁኔታ ገቢ ተደርጓል:').replace('ETB', 'ብር');
        }
        if (msg.includes('Failed to deposit')) {
            return 'ገንዘብ ማስገባት አልተሳካም። እባክዎ እንደገና ይሞክሩ።';
        }
        if (msg.includes('Failed to withdraw')) {
            return 'ገንዘብ ማውጣት አልተሳካም። እባክዎ እንደገና ይሞክሩ።';
        }
    } else {
        const maxMatch = msg.match(/Max (\d+) seats allowed per player for group size (\d+)/i);
        if (maxMatch) {
            return `Max ${maxMatch[1]} seats allowed per player for group size ${maxMatch[2]}.`;
        }
        const seatTakenMatch = msg.match(/Seat (\d+) is already taken/i);
        if (seatTakenMatch) {
            return `Seat #${seatTakenMatch[1]} is already taken. Please choose another seat.`;
        }
    }
    return msg;
}

const NavigationLinks = ({ activeTab, seatModal, t, setActiveTab }) => (
    <>
        {[
            { id: 'home', key: 'home' },
            { id: 'rooms', key: 'rooms' },
            { id: 'wallet', key: 'wallet' }, 
            { id: 'profile', key: 'profile' },
            { id: 'how_to_play', key: 'howToPlay' }
        ].map(tab => (
            <button 
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSeatModal({...seatModal, open: false}); }}
                className={`px-3 py-2 text-sm font-bold transition ${activeTab === tab.id && !seatModal.open ? 'text-equb-400' : 'text-white/60 hover:text-white'}`}
            >
                {t(tab.key)}
            </button>
        ))}
    </>
);

export default function App() {
    const [user, setUserState] = useState(() => {
        const saved = localStorage.getItem('fastderash_user');
        const token = localStorage.getItem('fastderash_token');
        if (saved && token) {
            try { return JSON.parse(saved); } catch {}
        }
        if (saved && !token) {
            localStorage.removeItem('fastderash_user');
        }
        return null;
    });

    const setUser = (newUser) => {
        if (typeof newUser === 'function') {
            setUserState((prev) => {
                const updated = newUser(prev);
                if (updated) localStorage.setItem('fastderash_user', JSON.stringify(updated));
                else { localStorage.removeItem('fastderash_user'); localStorage.removeItem('fastderash_token'); }
                return updated;
            });
        } else {
            if (newUser) localStorage.setItem('fastderash_user', JSON.stringify(newUser));
            else { localStorage.removeItem('fastderash_user'); localStorage.removeItem('fastderash_token'); }
            setUserState(newUser);
        }
    };

    // Authenticated fetch — adds Bearer token to every request and auto-clears on 401
    const authFetch = async (url, options = {}) => {
        const token = localStorage.getItem('fastderash_token');
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(url, { ...options, headers });
        if (res.status === 401) {
            setUser(null);
            localStorage.removeItem('fastderash_token');
            localStorage.removeItem('fastderash_user');
        }
        return res;
    };

    const [mode, setMode] = useState('real');
    const [rooms, setRooms] = useState([]);

    // Live open games, always keeping 5, 10, 20, 40, 60, 80 accessible
    const liveRealRooms = useMemo(() => {
        return (rooms || [])
            .filter(r => r.status === 'open' || r.status === 'drawing')
            .sort((a, b) => {
                if (a.status === 'drawing' && b.status !== 'drawing') return -1;
                if (b.status === 'drawing' && a.status !== 'drawing') return 1;
                if (a.groupSize !== b.groupSize) return (a.groupSize || 0) - (b.groupSize || 0);
                return (b.roomNumber || 0) - (a.roomNumber || 0);
            });
    }, [rooms]);
    const [activeTab, setActiveTab] = useState('home'); // home, rooms, wallet, profile
    const [seatModal, setSeatModal] = useState({ open: false, room: null, selectedSeats: [] });
    const seatModalRef = useRef(seatModal);
    useEffect(() => { seatModalRef.current = seatModal; }, [seatModal]);
    const lastCountdownTickRef = useRef({ roomId: null, sec: null });
    
    const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('sound') !== 'false');
    const [soundSfxEnabled, setSoundSfxEnabled] = useState(() => localStorage.getItem('sound_sfx') !== 'false');
    const [soundVoiceEnabled, setSoundVoiceEnabled] = useState(() => localStorage.getItem('sound_voice') !== 'false');
    const [soundVolume, setSoundVolume] = useState(() => parseFloat(localStorage.getItem('sound_volume') || '0.8'));
    const [voiceLangPref, setVoiceLangPref] = useState(() => localStorage.getItem('sound_voice_lang') || 'auto');
    const [soundSettingsOpen, setSoundSettingsOpen] = useState(false);
    const [isTestingAudio, setIsTestingAudio] = useState(false);
    const isTestingAudioRef = useRef(false);

    useEffect(() => {
        localStorage.setItem('sound', soundEnabled);
        if (!soundEnabled) {
            stopAllVoice();
        }
    }, [soundEnabled]);

    useEffect(() => {
        localStorage.setItem('sound_sfx', soundSfxEnabled);
    }, [soundSfxEnabled]);

    useEffect(() => {
        localStorage.setItem('sound_voice', soundVoiceEnabled);
        if (!soundVoiceEnabled) {
            stopAllVoice();
        }
    }, [soundVoiceEnabled]);

    useEffect(() => {
        localStorage.setItem('sound_volume', soundVolume);
        if (singleVoiceAudio) {
            singleVoiceAudio.volume = Math.max(0, Math.min(1, soundVolume));
        }
    }, [soundVolume]);

    useEffect(() => {
        localStorage.setItem('sound_voice_lang', voiceLangPref);
    }, [voiceLangPref]);

    const [drawModal, setDrawModal] = useState({ open: false, room: null, result: null });
    const userRef = useRef(user);
    useEffect(() => { userRef.current = user; }, [user]);
    const drawModalRef = useRef(drawModal);
    useEffect(() => { drawModalRef.current = drawModal; }, [drawModal]);
    const roomsRef = useRef(rooms);
    useEffect(() => { roomsRef.current = rooms; }, [rooms]);
    useEffect(() => {
        if (drawModal.result) {
            const timer = setTimeout(() => { setDrawModal({ open: false, room: null, result: null }); }, 12000);
            return () => clearTimeout(timer);
        }
    }, [drawModal.result]);
    useEffect(() => {
        if (!seatModal.open && !drawModal.open && !isTestingAudioRef.current) {
            stopAllVoice();
        }
    }, [seatModal.open, drawModal.open]);
    const [confirmOpenRoom, setConfirmOpenRoom] = useState(false);
    const [walletTabState, setWalletTabState] = useState({ active: 'deposit', amount: '', transactionId: '', phone: '', loading: false });
    const [myWithdrawals, setMyWithdrawals] = useState([]);
    const [orderAmount, setOrderAmount] = useState(100);
    const [orderExpanded, setOrderExpanded] = useState(true);
    const [createdOrder, setCreatedOrder] = useState(null);
    const [orderLoading, setOrderLoading] = useState(false);
    const [inviteCodeInput, setInviteCodeInput] = useState('');
    const [appliedInvite, setAppliedInvite] = useState(false);
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteMessage, setInviteMessage] = useState(null);
    const [systemConfig, setSystemConfig] = useState({ telebirrPhone: '0949626463', telebirrName: 'Abel Wondmeneh' });
    const [wizard, setWizard] = useState({ groupSize: 10, seatNumbers: [1], jackpot: 500 });
    const [wizardStep, setWizardStep] = useState(1); // 1 = choose prize, 2 = choose players & join
    const [roomSubTab, setRoomSubTab] = useState('players'); // 'players' | 'results' inside active room
    const [roomFilter, setRoomFilter] = useState('live'); // 'live' | 'results' in room list overview

    // ── Language State ────────────────────────────────────────────────────────
    const [language, setLanguageState] = useState(() => localStorage.getItem('fastderash_lang') || 'am');
    const languageRef = useRef(language);
    const setLanguage = (newLang) => {
        stopAllVoice();
        localStorage.setItem('fastderash_lang', newLang);
        currentAppLanguage = newLang;
        languageRef.current = newLang;
        setLanguageState(newLang);
    };
    useEffect(() => {
        currentAppLanguage = language;
        languageRef.current = language;
    }, [language]);

    // ── Modern Alert Modal & Toast Notification System ────────────────────────
    const [modalAlert, setModalAlert] = useState({
        open: false,
        title: '',
        message: '',
        type: 'warning', // 'error', 'warning', 'success', 'info', 'confirm'
        onConfirm: null,
        confirmText: '',
        cancelText: ''
    });
    const [toastState, setToastState] = useState({ open: false, message: '' });
    const toastTimeoutRef = useRef(null);

    const showToast = (message) => {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        const currentLang = languageRef.current || 'am';
        setToastState({ open: true, message: formatAlertMessage(message, currentLang) });
        toastTimeoutRef.current = setTimeout(() => {
            setToastState({ open: false, message: '' });
        }, 2800);
    };

    const toggleMasterSound = () => {
        const next = !soundEnabled;
        setSoundEnabled(next);
        if (next) {
            initAudio();
            setTimeout(() => playSeatBuy(), 60);
            showToast(language === 'am' ? 'ድምጽ እና የጥሪ ሙዚቃ በርቷል 🔊' : 'Sound & Voice enabled 🔊');
        } else {
            stopAllVoice();
            showToast(language === 'am' ? 'ድምጽ እና የጥሪ ሙዚቃ ጠፍቷል 🔇' : 'Sound & Voice muted 🔇');
        }
    };

    const handleTestSoundAndVoice = () => {
        initAudio();
        if (!soundEnabled) {
            setSoundEnabled(true);
            localStorage.setItem('sound', 'true');
        }
        if (!soundSfxEnabled) {
            setSoundSfxEnabled(true);
            localStorage.setItem('sound_sfx', 'true');
        }
        if (!soundVoiceEnabled) {
            setSoundVoiceEnabled(true);
            localStorage.setItem('sound_voice', 'true');
        }
        setIsTestingAudio(true);
        isTestingAudioRef.current = true;

        // 1. Play SFX chime
        playSeatBuy();

        // 2. Follow with voice preview
        setTimeout(() => {
            const activeLang = resolveVoiceLang(language);
            const voiceFile = activeLang === 'en' ? '/sounds/voice/en_3.mp3' : '/sounds/voice/3.mp3';
            playSingleVoice(voiceFile, () => {
                setIsTestingAudio(false);
                isTestingAudioRef.current = false;
            });
            setTimeout(() => {
                setIsTestingAudio(false);
                isTestingAudioRef.current = false;
            }, 2500);
        }, 320);

        showToast(language === 'am' ? 'ድምጽ እና የጥሪ ሙዚቃ እየተሞከረ ነው 🔊' : 'Testing Sound & Voice 🔊');
    };

    const showAlert = (rawMessage, type = 'warning', customTitle = null) => {
        const currentLang = languageRef.current || 'am';
        const msg = formatAlertMessage(rawMessage, currentLang);
        let defaultTitle = currentLang === 'am' ? 'ማስጠንቀቂያ' : 'Notice';
        if (type === 'success') defaultTitle = currentLang === 'am' ? 'ተሳክቷል' : 'Success';
        else if (type === 'error') defaultTitle = currentLang === 'am' ? 'ስህተት' : 'Error';
        else if (type === 'info') defaultTitle = currentLang === 'am' ? 'መረጃ' : 'Info';
        else if (type === 'confirm') defaultTitle = currentLang === 'am' ? 'ማረጋገጫ' : 'Confirm';

        setModalAlert({
            open: true,
            title: customTitle || defaultTitle,
            message: msg,
            type,
            onConfirm: null,
            confirmText: '',
            cancelText: ''
        });
    };

    const showConfirm = (message, onConfirm, confirmText = null, cancelText = null) => {
        const currentLang = languageRef.current || 'am';
        setModalAlert({
            open: true,
            title: currentLang === 'am' ? 'ማረጋገጫ' : 'Confirm',
            message: formatAlertMessage(message, currentLang),
            type: 'confirm',
            onConfirm,
            confirmText,
            cancelText
        });
    };

    // Override browser window.alert and window.confirm so any residual call uses custom UI
    useEffect(() => {
        const originalAlert = window.alert;
        window.alert = (msg) => {
            showAlert(msg, 'warning');
        };
        return () => {
            window.alert = originalAlert;
        };
    }, []);

    const displayedLiveRooms = useMemo(() => {
        // Step 2 (ተጫዋቾች & ቀላቀል):
        // List the selected game matching groupSize and jackpot so user can see and join it
        if (wizardStep === 2) {
            const exactMatch = liveRealRooms.filter(r => 
                r.groupSize === wizard.groupSize && 
                Math.round(r.targetJackpot) === Math.round(wizard.jackpot)
            );
            if (exactMatch.length > 0) return exactMatch;
            return liveRealRooms.filter(r => Math.round(r.targetJackpot) === Math.round(wizard.jackpot));
        }

        // Step 1 (ሽልማት ምረጥ):
        // ONLY display rooms where users have joined or are playing (filledSeats > 0 or drawing)
        const roomsWithJoinedUsers = liveRealRooms.filter(r => (r.filledSeats || 0) > 0 || r.status === 'drawing');

        if (wizard.jackpot) {
            const matchingJackpot = roomsWithJoinedUsers.filter(r => 
                Math.round(r.targetJackpot) === Math.round(wizard.jackpot)
            );
            if (matchingJackpot.length > 0) return matchingJackpot;
        }

        // If no rooms with joined users match the selected jackpot, show all rooms where users have joined
        return roomsWithJoinedUsers;
    }, [liveRealRooms, wizardStep, wizard.groupSize, wizard.jackpot]);

    // Auto-ensure open room exists for selected prize and player count
    useEffect(() => {
        if (activeTab === 'rooms' && wizard.jackpot) {
            const targetJackpot = wizard.jackpot;
            const targetSize = wizardStep === 2 ? wizard.groupSize : null;

            const hasExactMatch = targetSize 
                ? liveRealRooms.some(r => r.groupSize === targetSize && Math.round(r.targetJackpot) === Math.round(targetJackpot) && (r.status === 'open' || r.status === 'drawing'))
                : liveRealRooms.some(r => Math.round(r.targetJackpot) === Math.round(targetJackpot) && (r.status === 'open' || r.status === 'drawing'));

            if (!hasExactMatch) {
                fetch('http://localhost:3000/api/v1/rooms/ensure', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        targetJackpot, 
                        groupSize: targetSize || 'all' 
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.rooms) setRooms(data.rooms);
                })
                .catch(err => console.error('Failed to auto-ensure room:', err));
            }
        }
    }, [activeTab, wizardStep, wizard.jackpot, wizard.groupSize, liveRealRooms]);
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [profileForm, setProfileForm] = useState({ displayName: '', password: '' });
    const [results, setResults] = useState([]);
    const [walletTransactions, setWalletTransactions] = useState([]);
    const drawIntervalRef = useRef(null);

    const i18n = {
      am: {
        home: "መነሻ",
        rooms: "ክፍሎች",
        wallet: "ዋሌት",
        howToPlay: "አጨዋወት",
        profile: "መገለጫ",
        title: "ፋስት እቁብ",
        subtitle: "እውነተኛ ብር",
        slogan: "ፋስት እቁብ · ምረጥ · ዕጣ · አንድ አሸናፊ",
        desc: "ከኢትዮጵያ እቁብ ክበቦች የተነሳሳ። ሁሉም ተመሳሳይ መግቢያ ይከፍላሉ። ኮምፒውተሩ አንድ ቁጥር ይመርጣል። ያ ተጫዋች ሙሉ ሽልማቱን ያሸንፋል።",
        welcome: "እንኳን በደህና መጡ!",
        goToRooms: "ወደ ክፍሎች ይሂዱ",
        loginOrReg: "ግባ ወይም መለያ ፍጠር",
        login: "ግባ (Login)",
        register: "መመዝገብ (Register)",
        loginBtn: "ግባ",
        regBtn: "ይመዝገቡ",
        fullName: "ሙሉ ስም (Full Name)",
        phone: "ስልክ ቁጥር (Phone Number)",
        pass: "የይለፍ ቃል (Password)",
        confirmPass: "የይለፍ ቃል ያረጋግጡ (Confirm Password)",
        forgotPass: "የይለፍ ቃል ረሱ?",
        resetPass: "የይለፍ ቃል ዳግም አስጀምር",
        verificationCode: "የማረጋገጫ ኮድ",
        newPassword: "አዲስ የይለፍ ቃል",
        sendCode: "ኮድ ላክ",
        resetPassword: "የይለፍ ቃል ዳግም አስጀምር",
        backToLogin: "ወደ መግቢያ ተመለስ",
        codeSentToTelegram: "የማረጋገጫ ኮድ ወደ ቴሌግራም አካውንትዎ ተልኳል",
        checkVerificationChannel: "ኮድዎን በ @FastEqubCodes ቻናል ላይ ያረጋግጡ",
        telegramId: "ቴሌግራም መለያ (አማራጭ)",
        telegramIdHelper: "ለይለፍ ቃል መልሶ ማግኘት @userinfobot ን ይጠቀሙ",
        seatLabel: "መቀመጫ",
        drawLabel: "ዕጣ",
        winnerLabel: "አሸናፊ",
        rulesLabel: "ደንቦች",
        rule1: "ክፍል ይምረጡ (ቁጥር እና ሽልማት)",
        rule2: "በሰሌዳው ላይ አንድ ልዩ ቁጥር ይምረጡ",
        rule3: "መቀመጫዎችን ይሙሉ (ከጓደኞች ጋር)",
        rule4: "ክሪፕቶ ዕጣ → የሚመሳሰል ቁጥር ሽልማቱን ያሸንፋል",
        step1: "1 · በክፍሉ ውስጥ ተጫዋቾች",
        selectGroupSize: "የቡድን መጠን ይምረጡ",
        step2: "2 · የሽልማት ገንዘብ",
        selectPrize: "ሽልማት ይምረጡ",
        birr: "ብር",
        totalEntry: "ጠቅላላ መግቢያ",
        players: "ተጫዋቾች",
        prize: "ሽልማት",
        step3: "3 · የእርስዎ ቁጥር",
        canSelect: "እስከ",
        numbers: "ቁጥሮች መምረጥ ይችላሉ",
        openRoomBtn: "ክፍል ክፈት · መቀመጫዎች አሳይ",
        recentWinners: "የቅርብ ጊዜ አሸናፊዎች",
        allOpenGames: "ክፍት የቀጥታ ክፍሎች",
        openLiveRooms: "ክፍት የቀጥታ ክፍሎች",
        result: "ውጤቶች",
        selectedRooms: "የተመረጡ ክፍሎች",
        transactionNumberOnly: "የትራንዛክሽን ቁጥር ብቻ",
        transactionNumberDesc: "በቴሌብር ገንዘብ ከላኩ በኋላ የትራንዛክሽን ቁጥሩን እዚህ ያስገቡ። ወዲያውኑ አረጋግጠን ወደ ዋሌትዎ ገቢ እናደርጋለን።",
        optionalOrderAmountFirst: "Optional · order + amount first",
        createOrder: "Create order",
        orderCreatedTitle: "Order Created",
        all: "ሁሉም",
        selected: "የተመረጡ",
        resultsTitle: "ውጤቶች",
        noResults: "ምንም ውጤት የለም",
        noOpenGames: "ክፍት ጨዋታ የለም — ከላይ አዲስ ዑደት ይፍጠሩ",
        loginFirst: "እባክዎ በመጀመሪያ ይግቡ (Please login first)",
        selectSeats: "መቀመጫ ይምረጡ (Select Seats)",
        playersJoined: "ተጫዋቾች (Players Joined):",
        gameStarts: "⚠️ ጨዋታው የሚጀምረው ሁሉም ቦታዎች ሲሞሉ ብቻ ነው",
        totalPrice: "መግቢያ (Total Price)",
        limitReached: "ሙሉ ነው (Limit Reached)",
        buySeat: "መቀመጫ ግዛ (Buy Seat)",
        drawing: "ዕጣ እየወጣ ነው...",
        nextCycle: "ቀጣዩ ዑደት ተከፍቷል · Next game cycle is now open for joins!",
        winnerPrefix: "አሸናፊ:",
        congrats: "🎉 እንኳን ደስ አለዎት! ያሸነፉት መቀመጫ #",
        wonSeat: "ያሸነፈው መቀመጫ #",
        awesome: "አስደናቂ!",
        amh: "አማ",
        createAccount: "አዲስ አካውንት",
        chooseRoom: "ክፍል ይምረጡ",
        pickNumbersBet: "ቁጥሮችን ይምረጡ እና ይጫወቱ",
        drawPrize: "ዕጣ ይወጣል",
        tips: "ጠቃሚ ምክሮች",
        howToPlayDesc1: "በስምዎ፣ ስልክ ቁጥርዎ እና የይለፍ ቃል ይመዝገቡ። ስልክ ቁጥርዎ እንደ መግቢያ ስም (username) ያገለግላል።",
        howToPlayDesc2: "ወደ ዋሌት ይሂዱ። ለቀረበው የስልክ ቁጥር በቴሌብር ገንዘብ ይላኩ፣ ከዚያ የትራንዛክሽን ቁጥሩን ያስገቡ።",
        howToPlayDesc3: "ጨዋታውን ለመቀላቀል የመግቢያ ክፍያዎን መሰረት በማድረግ ክፍል ይምረጡ።",
        howToPlayDesc4: "ክፍል ከገቡ በኋላ መቀመጫዎችን ለመምረጥ 60 ሰከንዶች አልዎት። በጣም ፈጣን እና ቀላል ምርጫ።",
        howToPlayDesc5: "ሰዓቱ 0 ሲደርስ፣ ዕጣው ይታያል። አሸናፊው 100% ሽልማቱን ይወስዳል (15% የአገልግሎት ክፍያ ይቀነሳል)።",
        howToPlayTitle: "እንዴት እንደሚጫወቱ (How to play)",
        stepRegister: "ይመዝገቡ (Register)",
        stepDeposit: "ገንዘብ ያስገቡ (Deposit)",
        stepPlayWin: "ይጫወቱ እና ያሸንፉ (Play & Win)",
        phoneEqualsUsername: "ስልክ ቁጥር = መግቢያ ስም",
        depositTelebirr: "ቴሌብር ያስገቡ",
        balanceUpdates: "ሲረጋገጥ ቀሪ ሂሳብ ይሞላል",
        eng: "EN",
        roomSubtitle: "ማሸነፍ የሚፈልጉትን የገንዘብ መጠን ይምረጡ. አብረው መጫወት የሚፈልጉትን የሰው ብዛት ይምረጡ. ክፍል ይክፈቱ",
        min2Players: "ሁሉም መቀመጫዎች እስኪሞሉ ይጠብቃል",
        buyTicket: "ትኬት መግዣ",
        remaining: "ቀሪ",
        createAcctAm: "አዲስ አካውንት",
        createAcctDescAm: "በሙሉ ስም፣ ስልክ ቁጥር እና የይለፍ ቃል ይመዝገቡ። ስልክ ቁጥሮ (username) ይሆንሎታል።",
        depositTelebirrAm: "ቴሌብር ያስገቡ",
        depositTelebirrDescAm: "ወደ ዋሌት ይግቡ። የቴሌብር ክፍያ ወደ ነጋዴው ስልክ ቁጥር ይላኩ፣ ከዚያም የግብይት ቁጥሩን ያስገቡ።",
        chooseRoomAm: "ክፍል ይምረጡ",
        chooseRoomDescAm: "በመግቢያ ዋጋቸው የተመደቡ ክፍሎችን አይተው ወደሚፈልጉት ይግቡ።",
        pickNumbersAm: "ቁጥር ይምረጡ",
        pickNumbersDescAm: "ክፍል ውስጥ ሲገቡ ቁጥር ለመምረጥ 60 ሴኮንዶች አሎት። በጣም ቀላል እና ፈጣን አሰራር።",
        drawPrizeAm: "ዕጣ ይወጣል",
        drawPrizeDescAm: "ሰዓቱ 0 ሲደርስ ዕጣው ይወጣል። አሸናፊው ከጠቅላላው የሽልማት ገንዘብ 15% ተቀንሶ ቀሪውን ይወስዳል።",
        rulesTipsAm: "ህግ እና ደንብ",
        ruleTip1Am: "በአንድ ጨዋታ ውስጥ ብዙ ቲኬቶችን መግዛት ይችላሉ።",
        ruleTip2Am: "ብዙ ቲኬት በገዙ ቁጥር የማሸነፍ እድልዎ ይጨምራል።",
        ruleTip3Am: "ጨዋታዎች 24/7 ይሰራሉ። ስለዚህ ዝግጁ ሲሆኑ ይጫወቱ።",
        roomFull: "ክፍሉ ሙሉ ነው",
        drawingWinner: "አሸናፊ በማውጣት ላይ",
        ticketPriceSeat: "ብር/መቀመጫ",
        alertMinSeat: "እባክዎ ቢያንስ አንድ መቀመጫ ይምረጡ (Please select at least one seat)",
        alertPleaseLogin: "እባክዎ በመጀመሪያ ይግቡ (Please login first)",
        balance: "ቀሪ ሂሳብ (Balance)",
        deposit: "አስገባ",
        withdraw: "አውጣ",
        history: "ታሪክ",
        sendPaymentTo: "ክፍያ ይላኩ ወደ (Send Payment To)",
        telebirrName: "የቴሌብር ስም (Name)",
        sendViaTelebirr: "ቴሌብር ወደ ቁጥሩ ይላኩ፣ ከዚያ የግብይት ቁጥር ብቻ ያስገቡ። (Send via Telebirr, then enter transaction ID)",
        transactionId: "ግብይት ቁጥር ብቻ (Transaction ID)",
        enterTxAfterPay: "ቴሌብር ክፍያ ከላኩ በኋላ የግብይት ቁጥሩን ያስገቡ። API ያረጋግጣልና ሂሳብዎን ይሞላል።",
        verifying: "በማረጋገጥ ላይ...",
        verifyAndDeposit: "አረጋግጥ እና አስገባ",
        withdrawFunds: "ገንዘብ ማውጣት (Withdraw)",
        enterAmount: "የሚፈልጉትን የገንዘብ መጠን ያስገቡ።",
        withdrawing: "በማውጣት ላይ...",
        noHistory: "ታሪክ የለም (No history yet)",
        profileLabel: "መገለጫ (Profile)",
        signOut: "ዘግተህ ውጣ (Sign Out)",
        deleteBtn: "ሰርዝ (Delete)",
        minPlayersNeeded: "⏳ ሁሉም መቀመጫዎች እስኪሞሉ በመጠበቅ ላይ",
        ticketBuying: "⏱️ ትኬት መግዣ",
        perSeat: "መቀመጫ",
        accountRules: "ህግ እና ደንብ",
        pickNumbers: "ቁጥር ይምረጡ",
        rulesTips: "ደንብ እና መረጃዎች",
        // Room Interface
        gameLabel: "ጨዋታ #",
        tierStarter: "ጀማሪ",
        tierBronze: "ነሐስ",
        tierSilver: "ብር",
        tierGold: "ወርቅ",
        tierVIP: "ቪአይፒ",
        tierStandard: "መደበኛ",
        realMoneyDesc: "እውነተኛ ገንዘብ · በቴሌብር ያስገቡ · ከእውነተኛ ተጫዋቾች ጋር ይጫወቱ",
        maxPicksDesc: (max, price, gs) => `ከፍተኛ ${max} ምርጫ · ${price} ብር / ቁጥር · ሁሉም ሲሞሉ ይጀምራል`,
        prizePool: "የሽልማት ፈንድ",
        entryLabel: "መግቢያ",
        playersLabel: "ተጫዋቾች",
        nextDraw: "የመቀመጫ ሁኔታ",
        secLabel: "የተሞላ",
        every60s: "ሲሞላ ይጀምራል",
        need2Players: (n, gs) => `ሁሉም መቀመጫዎች እስኪሞሉ በመጠበቅ ላይ (${n}/${gs || 10})`,
        gameReady: (n, gs) => `ሁሉም መቀመጫዎች ሞልተዋል! ጨዋታው እየጀመረ ነው (${n}/${gs})`,
        pickNumsMax: (max) => `ቁጥር ይምረጡ · ከፍተኛ ${max}`,
        alreadyOwn: (n) => `ቀደም ሲል ${n} ይዘዋል`,
        youLabel: "እርስዎ",
        playersTab: "ተጫዋቾች",
        resultsTab: "ዕጣ ውጤቶች",
        activePlayersRoom: "በጨዋታው ያሉ ተጫዋቾች",
        participants: "ተሳታፊዎች",
        seatsLabel: "መቀመጫ",
        noPlayersYet: "እስካሁን ምንም ተጫዋች አልተቀላቀለም",
        beFirst: "የመጀመሪያው ተጫዋች ለመሆን ከላይ ቁጥር ይምረጡና ይወራረዱ!",
        youBadge: "እርስዎ",
        numbersPlural: "ቁጥሮች",
        numberSingle: "ቁጥር",
        recentSettled: "የቅርብ ጊዜ አሸናፊዎች",
        provablyFair: "ክሪፕቶ ዕጣ የተረጋገጠ",
        noResultsYet: "እስካሁን የወጣ ዕጣ ውጤት የለም",
        resultsAppearHere: "ይህ ጨዋታ ሲጠናቀቅ አሸናፊው እዚህ ይዘረዘራል!",
        youWonBadge: "እርስዎ አሸንፈዋል!",
        birLabel: "ብር",
        betLabel: "ይወራረዱ",
        selectThenBet: "ቁጥር ይምረጡ · ከዚያ ይወራረዱ",
        // Home stats
        activePlayers: "ተጫዋቾች",
        gamesPlayed: "ጨዋታዎች",
        winnersDaily: "አሸናፊዎች",
        loggedInAs: (name) => `${name} ሆነው ገብተዋል።`,
        // Wizard
        prizeEntry: "ሽልማት ምረጥ",
        playersJoinLabel: "ተጫዋቾች & ቀላቀል",
        choosePrizeTitle: "የሽልማት መጠን ምረጡ",
        choosePrizeDesc: "ማሸነፍ የሚፈልጉትን የሽልማት ገንዘብ ይምረጡ",
        selectedPrize: "የተመረጠ ሽልማት",
        continueBtn: "ቀጥል",
        choosePlayersTitle: "የተጫዋቾች ብዛት ምረጡ",
        choosePlayersDesc: "ክፍሉ ምን ያህል ተጫዋቾች እንዲኖሩት እንደሚፈልጉ ምረጡ",
        backBtn: "ተመለስ",
        playersCountLabel: "ተጫዋቾች",
        entryBtnLabel: "መግቢያ",
        liveLabel: "ክፍት",
        waitLabel: "በጥ",
        prizeCol: "ሽልማት",
        playersCol: "ተጫዋቾች",
        perPlayerCol: "የአንድ ሰው ዋጋ",
        joinedLabel: (n) => `${n} ተቀላቅለዋል`,
        loadingRoom: "ክፍሉ በመከፈት ላይ ነው...",
        roomFullLabel: "🚫 ክፍሉ ሙሉ ነው",
        liveFilter: "የቀጥታ",
        resultsFilter: "ውጤቶች",
        recentResultsTitle: "የቅርብ ጊዜ ውጤቶች (10)",
        noResultsYetFilter: "ምንም ውጤት የለም",
        noActiveGames: "ተጫዋቾች የተቀላቀሉበት ጨዋታ የለም",
        drawingLabel: "ዕጣ በማውጣት ላይ...",
        fullRoom: (total) => `ሙሉ · ${total} ተጫዋቾች`,
        joinedCount: (n) => `${n} ተቀላቅለዋል`,
        openRoom: (total) => `ክፍት · እስከ ${total}`,
        playBtn: "ይጫወቱ",
        gameNumLabel: (n) => `ጨዋታ #${n}`,
        // Wallet
        depositLabel: "አስገባ",
        withdrawLabel: "አውጣ",
        historyLabel: "ታሪክ",
        copyLabel: "ቅዳ",
        telebirrPhoneCopied: "የቴሌብር ስልክ ቁጥር ተቀድቷል!",
        nameLabel: "የቴሌብር ስም",
        creatingOrder: "ትዕዛዝ እየተፈጠረ...",
        telebirrPhone: "የቴሌብር ስልክ",
        orderName: "ስም",
        orderAmount: "መጠን",
        sendOrderInstructions: (amount, phone, name) => `እባክዎ ${amount} ብር ወደ ${phone} (${name}) በቴሌብር ይላኩ፣ ከዚያ የትራንዛክሽን ቁጥሩን ከላይ ያስገቡ።`,
        // Profile
        verifiedBadge: "የተረጋገጠ",
        editBtn: "አድስ",
        walletStats: "የሂሳብ እና ስታቲስቲክስ መረጃ",
        openWalletBtn: "ዋሌት ክፈት",
        mainBalance: "ዋና ቀሪ ሂሳብ",
        depositBtnShort: "+ አስገባ",
        withdrawBtnShort: "ወጪ",
        playWallet: "የጨዋታ ዋሌት",
        gamesWon: "ያሸነፏቸው",
        totalInvites: "የተጋበዙ",
        totalEarnings: "ጠቅላላ ገቢ",
        inviteCodeQuestion: "የግብዣ ኮድ አለዎት?",
        inviteCodeDesc: "የጓደኛዎን የግብዣ ኮድ በማስገባት ጉርሻ ያግኙ",
        appliedLabel: "ተቀብሏል",
        applyBtn: "ተግብር",
        inviteCodeApplied: "ተተግብሯል",
        yourInviteCode: "የእርስዎ የግብዣ ኮድ:",
        inviteCodeCopied: "የግብዣ ኮድዎ ተቀድቷል!",
        soundVoiceLabel: "ድምጽ እና የጥሪ ሙዚቃ",
        soundOn: "በርቷል",
        soundOff: "ጠፍቷል",
        soundDesc: "የጨዋታ ድምጾች እና የቀጥታ 10 ሰከንድ ቆጠራ ጥሪ",
        manageAudio: "አስተዳድር",
        soundEffectsLabel: "የጨዋታ ድምጾች",
        soundEffectsDesc: "የመቀመጫ ምርጫ እና የግዢ ድምጽ",
        voiceCalloutsLabel: "የጥሪ ድምጽ",
        voiceCalloutsDesc: "የ10 ሰከንድ ቆጠራ እና አሸናፊ",
        voiceLangLabel: "የጥሪ ቋንቋ",
        voiceLangAuto: "ከመተግበሪያው ጋር (Auto)",
        voiceLangAutoEn: "Matches App Language",
        volumeLabel: "የድምጽ መጠን",
        testAudioLabel: "ድምጽ እና የጥሪ ሙዚቃን ሞክር",
        testingAudio: "ድምጽ እየተጫወተ ነው...",
        editProfileLabel: "የመገለጫ ስም እና የይለፍ ቃል ቀይር",
        deleteAccountLabel: "መለያን በቋሚነት ሰርዝ",
        signOutLabel: "ከመለያ ውጣ (Sign Out)",
        updateProfileTitle: "መገለጫ አድስ",
        updateProfileDesc: "የመገለጫ ስምዎን ወይም የይለፍ ቃልዎን ይቀይሩ",
        displayNameLabel: "የመገለጫ ስም (Display Name)",
        newPasswordLabel: "አዲስ የይለፍ ቃል (New Password)",
        leaveBlank: "ለመተው ባዶ ይተዉት",
        cancelBtn: "ተው",
        saveBtn: "አስቀምጥ",
        // How to Play
        howToPlaySubtitle: "ጨዋታ ለመጫወት ቀላል ደረጃ በደረጃ መመሪያ",
        step1Tag: "ደረጃ 1",
        step2Tag: "ደረጃ 2",
        step3Tag: "ደረጃ 3",
        step4Tag: "ደረጃ 4",
        pickRoom: "ክፍል ምረጥ",
        pickNumbers: "ቁጥር ምረጥ",
        waitForDraw: "ሁሉም ተጫዋቾች ታቀዱ",
        winLabel: "ማሸነፍ!",
        step1Title: "ክፍሉ ይምረጡ",
        step1Desc: "ወደ ክፍሎች ይሂዱ እና ወዲያውኑ ከየትኛው ክፍል የሚጫወቱት ይምረጡ። ከተለያዩ ሽልማቶች እና ተጫዋቾች ብዛት ይምረጡ።",
        step1Tip1: "ለእርስዎ ተስማሚ ሽልማት ይምረጡ",
        step1Tip2: "ጨዋታዎች ሙሉ ከመሆናቸው በፊት ይገቡ",
        step2Title: "ቁጥሮች ይምረጡ",
        step2Desc: "ሚገኙት መቀመጫዎች ውስጥ ቁጥሮችን ይምረጡ። 1 ወይም ከዚያ በላይ መቀመጫዎችን መምረጥ ይችላሉ። ብዙ መቀመጫዎችን በመረጡ ቁጥር የማሸነፍ እድሉ ከፍ ያለ ይሆናል።",
        step2Tip1: "አንድ ክፍል ከሞላ፣ የተለየ ክፍል ይምረጡ - መጠበቅ አያስፈልግም ....",
        step2Tip2: "ተጨማሪ መቀመጫዎች = ተጨማሪ የማሸነፍ እድል",
        step3Title: "ለዕጣ ጊዜ ይጠብቁ",
        step3Desc: "ሁሉም ተጫዋቾች መቀመጫቸውን እንደመረጡ፣ ዕጣው ወዲያው ይጀምራል! የኬኖ ማሽን ከሁሉም መቀመጫዎች ውስጥ አንድ አሸናፊ ቁጥሮችን ሲመርጥ ማያ ገጹን ይመልከቱ።",
        step3Tip1: "ዕጣ ሁሌ በ60 ሰከንዶች ውስጥ ይሆናል",
        step3Tip2: "ውጤት ወዲያውኑ ይታያል - ሌላ ጨዋታ ወዲያውኑ ይቀላቀሉ",
        step4Title: "ማሸነፍ ወይም ድግም!",
        step4Desc: "ቁጥርዎ ከወጣ አሸንፈዋል! ሽልማትዎ በቀጥታ ወደ ቦርሳዎ ይሄዳል። ቁጥርዎ ካልወጣ በዚህ ጊዜ አላሸነፉም? ችግር የለም - ሌላ ጨዋታ ይቀላቀሉ እና እንደገና ይሞክሩ!",
        step4Tip1: "ሽልማት ወዲያውኑ ወደ መለያዎ ይደርሳል",
        step4Tip2: "ጨዋታዎች 24/7 ይሰራሉ - ማንኛውም ጊዜ ይጫወቱ",
        youWinLabel: "ማሸነፎ!",
        keyTipsTitle: "የበለጠ ለማሸነፍ ዋና ምክሮች",
        tip1Title: "ተጨማሪ መቀመጫዎች = የተሻለ የማሸነፍ እድል",
        tip1Desc: "ብዙ ቁጥሮችን በመረጡ ቁጥር፣ ከአሸናፊው ቁጥር ጋር የመገጣጠም እድልዎ ከፍ ያለ ይሆናል።",
        tip2Title: "ጨዋታዎች 24/7 ይሰራሉ",
        tip2Desc: "መጠበቅ አያስፈልግም - ሌላ አዲስ ጨዋታ በየ 60 ሰከንዱ ሁልጊዜ ይጀምራል።",
        tip3Title: "ፈጣን ገንዘብ ማውጣት",
        tip3Desc: "ያሸነፉትን ገንዘብ በማንኛውም ጊዜ በ5 ደቂቃ ውስጥ በቴሌብር ያውጡ።",
        tip4Title: "ብልጥ አጨዋወት",
        tip4Desc: "ተመጣጣኝ ክፍያ ይምረጡ - ተጨማሪ ትኬቶች = ተጨማሪ የማሸነፍ እድሎች።",
        readyToPlay: "ገና አልጀመሩም?",
        readyToPlayDesc: "ዋሌት ማስገባት ይጀምሩ እና ታላቅ ማሸነፍ!",
        startPlayingBtn: "ጨዋታ ጀምር",
        depositBtn: "ገንዘብ አስገባ",
        // Draw modal
        drawModalSubtitle: "ቀጣዩ ዑደት ተከፍቷል · ወደሚቀጥለው ጨዋታ ይቀላቀሉ!",
        lostMessage: "💔 ጨዋታ አልሸነፉም፣ ዳግም ይሞክሩ!",
        grossJackpot: "ጠቅላላ ሽልማት",
        platformFee: "የአገልግሎት ክፍያ",
        netPayout: "ጸጥ ክፍያ",
        joinNextGame: (num) => `🎮 ቀጣዩ ጨዋታ ቀላቀል (ጨዋታ #${num})`,
        // Confirm open room modal
        confirmOpenRoomTitle: "ክፍሉን መክፈት ይፈልጋሉ?",
        confirmOpenRoomDesc: "ይህ አዲስ ጨዋታ ክፍል ይፈጥራል እና ከቀሪ ሂሳብዎ ይቀነሳል።",
        noBtn: "አይ",
        yesBtn: "አዎ",
        // Wallet modal
        telebirrDepositTitle: "ቴሌብር አስገባ",
        withdrawFundsTitle: "ገንዘብ አውጣ",
        telebirrTxLabel: "የቴሌብር ትራንዛክሽን መ.ቁ",
        telebirrDepositDesc: "ያስቀመጡትን ቴሌብር ትራንዛክሽን ቁጥር ያስገቡ።",
        withdrawModalDesc: "ማውጣት የሚፈልጉትን የገንዘብ መጠን ያስገቡ።",
        amountLabel: "መጠን (ETB)",
        cancelWalletBtn: "ተው",
        processingBtn: "በማቀናበር ላይ...",
        verifyDepositBtn: "አረጋግጥ እና አስገባ",
        withdrawActionBtn: "አውጣ",
      },
      en: {
        home: "Home",
        rooms: "Rooms",
        wallet: "Wallet",
        howToPlay: "How to Play",
        profile: "Profile",
        title: "Fast Equb",
        subtitle: "Real Money",
        slogan: "Fast Equb · Pick · Draw · One Winner",
        desc: "Inspired by Ethiopian Equb circles. Everyone pays the same entry fee. The computer picks one number. That player wins the entire pot.",
        welcome: "Welcome!",
        goToRooms: "Go to Rooms",
        loginOrReg: "Login or Register",
        login: "Login",
        register: "Register",
        loginBtn: "Login",
        regBtn: "Register",
        fullName: "Full Name",
        phone: "Phone Number",
        pass: "Password",
        confirmPass: "Confirm Password",
        forgotPass: "Forgot Password?",
        resetPass: "Reset Password",
        verificationCode: "Verification Code",
        newPassword: "New Password",
        sendCode: "Send Code",
        resetPassword: "Reset Password",
        backToLogin: "Back to Login",
        codeSentToTelegram: "Verification code sent to your Telegram account",
        checkVerificationChannel: "Check @FastEqubCodes channel for your code",
        telegramId: "Telegram ID (Optional)",
        telegramIdHelper: "Get it from @userinfobot for password recovery",
        seatLabel: "Seat",
        drawLabel: "Draw",
        winnerLabel: "Winner",
        rulesLabel: "Rules",
        rule1: "Choose a room (Amount & Prize)",
        rule2: "Pick a unique number on the board",
        rule3: "Fill the seats (with friends)",
        rule4: "Crypto draw → Matching number wins prize",
        step1: "1 · Players in the room",
        selectGroupSize: "Select Group Size",
        step2: "2 · Prize Money",
        selectPrize: "Select Prize",
        birr: "ETB",
        totalEntry: "Total Entry",
        players: "Players",
        prize: "Prize",
        step3: "3 · Your Number",
        canSelect: "You can select up to",
        numbers: "numbers",
        openRoomBtn: "Open Room · Show Seats",
        recentWinners: "Recent Winners",
        allOpenGames: "Open Live Rooms",
        openLiveRooms: "Open Live Rooms",
        result: "Result",
        selectedRooms: "Selected Rooms",
        transactionNumberOnly: "Transaction number only",
        transactionNumberDesc: "After sending Telebirr, paste the transaction number. We check the API and credit your wallet.",
        optionalOrderAmountFirst: "Optional · order + amount first",
        createOrder: "Create order",
        orderCreatedTitle: "Order Created",
        all: "All",
        selected: "Selected",
        resultsTitle: "Results",
        noResults: "No results",
        roomSubtitle: "Choose the amount of money you want to win. Choose how many people you want to play with. Open a room",
        noOpenGames: "No open games — create a new cycle above",
        loginFirst: "Please login first",
        selectSeats: "Select Seats",
        playersJoined: "Players Joined:",
        gameStarts: "⚠️ Game starts when all seats are filled",
        totalPrice: "Total Price",
        limitReached: "Limit Reached",
        buySeat: "Buy Seat",
        drawing: "Drawing...",
        nextCycle: "Next game cycle is now open for joins!",
        winnerPrefix: "Winner:",
        congrats: "🎉 Congratulations! You won with seat #",
        wonSeat: "Winning seat is #",
        awesome: "Awesome!",
        amh: "Amh",
        createAccount: "Create an account",
        chooseRoom: "Choose a room",
        pickNumbersBet: "Pick numbers & BET",
        drawPrize: "Draw A prize",
        tips: "Tips",
        howToPlayDesc1: "Register with full name, phone number, and password. Your phone number is your username.",
        howToPlayDesc2: "Go to Wallet. Send Telebirr to the merchant phone, then enter the transaction number. Balance updates after verification.",
        howToPlayDesc3: "Join a game by choosing a room based on the entry fee you wish to wager.",
        howToPlayDesc4: "You have 60 seconds to pick a seat or seats after entering a room. Very fast and simple selection.",
        howToPlayDesc5: "After the clock is 0, the drawing will be shown. The winner gets 100% of the pot minus 15%.",
        howToPlayTitle: "How to play",
        stepRegister: "Register",
        stepDeposit: "Deposit",
        stepPlayWin: "Play & Win",
        phoneEqualsUsername: "Phone number is username",
        depositTelebirr: "Deposit Telebirr",
        balanceUpdates: "Balance updates after verification",
        eng: "EN",
        min2Players: "Waits until all seats are filled",
        buyTicket: "Buy Ticket",
        remaining: "left",
        createAcctAm: "Create an account",
        depositTelebirrAm: "Deposit Telebirr",
        chooseRoomAm: "Choose a room",
        chooseRoomDescAm: "Join a game by choosing a room based on the entry fee you wish to wager.",
        pickNumbersAm: "Pick numbers & BET",
        pickNumbersDescAm: "You have 60 seconds to pick a seat or seats after entering a room. Very fast and simple selection.",
        drawPrizeAm: "Draw A prize",
        drawPrizeDescAm: "After the clock is 0, the drawing will be shown. The winner gets 100% of the pot minus 15%.",
        rulesTipsAm: "Rules & Tips",
        ruleTip1Am: "You can purchase multiple tickets in a game.",
        ruleTip2Am: "The more tickets you buy the more chance you win.",
        ruleTip3Am: "Games run 24/7. So play when you are ready.",
        roomFull: "Full Limit Reached",
        drawingWinner: "Drawing Winner",
        ticketPriceSeat: "ETB/Seat",
        alertMinSeat: "Please select at least one seat",
        alertPleaseLogin: "Please login first",
        balance: "Balance",
        deposit: "Deposit",
        withdraw: "Withdraw",
        history: "History",
        sendPaymentTo: "Send Payment To",
        telebirrName: "Telebirr Name",
        sendViaTelebirr: "Send via Telebirr, then enter transaction ID",
        transactionId: "Transaction ID",
        enterTxAfterPay: "Enter transaction ID after payment. API will verify and fund your account.",
        verifying: "Verifying...",
        verifyAndDeposit: "Verify & Deposit",
        withdrawFunds: "Withdraw",
        enterAmount: "Enter the amount you wish to withdraw.",
        withdrawing: "Withdrawing...",
        noHistory: "No history yet",
        profileLabel: "Profile",
        signOut: "Sign Out",
        deleteBtn: "Delete",
        minPlayersNeeded: "⏳ Waiting for all seats to fill",
        ticketBuying: "⏱️ Ticket Buying",
        perSeat: "Seat",
        accountRules: "Terms & Conditions",
        pickNumbers: "Pick numbers & BET",
        rulesTips: "Rules & Tips",
        // Room Interface
        gameLabel: "Game #",
        tierStarter: "Starter",
        tierBronze: "Bronze",
        tierSilver: "Silver",
        tierGold: "Gold",
        tierVIP: "VIP",
        tierStandard: "Standard",
        realMoneyDesc: "Real money · Deposit via Telebirr · Play with real players",
        maxPicksDesc: (max, price, gs) => `Max ${max} picks · ${price} Birr / number · starts when full`,
        prizePool: "PRIZE POOL",
        entryLabel: "ENTRY",
        playersLabel: "PLAYERS",
        nextDraw: "SEATS",
        secLabel: "FILLED",
        every60s: "starts when full",
        need2Players: (n, gs) => `Waiting for all seats to fill (${n}/${gs || 10})`,
        gameReady: (n, gs) => `All seats filled! Starting game (${n}/${gs})`,
        pickNumsMax: (max) => `Pick numbers · max ${max}`,
        alreadyOwn: (n) => `Already own ${n}`,
        youLabel: "YOU",
        playersTab: "Players",
        resultsTab: "Draw Results",
        activePlayersRoom: "Active Players in this Room",
        participants: "participants",
        seatsLabel: "seats",
        noPlayersYet: "No players have joined this room yet",
        beFirst: "Pick your lucky numbers above to be the first in this game!",
        youBadge: "YOU",
        numbersPlural: "numbers",
        numberSingle: "number",
        recentSettled: "Recent Settled Games",
        provablyFair: "Provably Fair",
        noResultsYet: "No settled results recorded yet",
        resultsAppearHere: "When games settle, winning tickets appear here!",
        youWonBadge: "YOU WON!",
        birLabel: "Birr",
        betLabel: "BET",
        selectThenBet: "Select number · then BET",
        // Home stats
        activePlayers: "Active Players",
        gamesPlayed: "Games Played",
        winnersDaily: "Winners Daily",
        loggedInAs: (name) => `You are logged in as ${name}.`,
        // Wizard
        prizeEntry: "Prize Entry",
        playersJoinLabel: "Players & Join",
        choosePrizeTitle: "Choose Your Prize Entry",
        choosePrizeDesc: "Select the total prize pool you want to win",
        selectedPrize: "Selected Prize",
        continueBtn: "Continue",
        choosePlayersTitle: "Choose Number of Players",
        choosePlayersDesc: "Select how many players fill the room",
        backBtn: "Back",
        playersCountLabel: "players",
        entryBtnLabel: "Entry",
        liveLabel: "LIVE",
        waitLabel: "WAIT",
        prizeCol: "Prize",
        playersCol: "Players",
        perPlayerCol: "Per Player",
        joinedLabel: (n) => `${n} joined`,
        loadingRoom: "Loading open room...",
        roomFullLabel: "🚫 Room Full",
        liveFilter: "Live",
        resultsFilter: "Results",
        recentResultsTitle: "Recent Results (Top 10)",
        noResultsYetFilter: "No results yet",
        noActiveGames: "No active games with joined players",
        drawingLabel: "Drawing...",
        fullRoom: (total) => `Full · ${total}p`,
        joinedCount: (n) => `${n} joined`,
        openRoom: (total) => `Open · up to ${total}`,
        playBtn: "Play",
        gameNumLabel: (n) => `Game #${n}`,
        // Wallet
        depositLabel: "Deposit",
        withdrawLabel: "Withdraw",
        historyLabel: "History",
        copyLabel: "Copy",
        telebirrPhoneCopied: "Telebirr phone copied!",
        nameLabel: "Name",
        creatingOrder: "Creating order...",
        telebirrPhone: "Telebirr Phone",
        orderName: "Name",
        orderAmount: "Amount",
        sendOrderInstructions: (amount, phone, name) => `Please send ${amount} ETB to ${phone} (${name}) on Telebirr, then paste your transaction number above.`,
        // Profile
        verifiedBadge: "VERIFIED",
        editBtn: "Edit",
        walletStats: "Wallet & Statistics",
        openWalletBtn: "Open Wallet",
        mainBalance: "Main Balance",
        depositBtnShort: "+ Deposit",
        withdrawBtnShort: "Withdraw",
        playWallet: "Play Wallet",
        gamesWon: "Games Won",
        totalInvites: "Total Invites",
        totalEarnings: "Total Earnings",
        inviteCodeQuestion: "Have an invite code?",
        inviteCodeDesc: "Enter an invite code to claim rewards & bonus",
        appliedLabel: "Applied",
        applyBtn: "Apply",
        inviteCodeApplied: "Applied",
        yourInviteCode: "Your invite code:",
        inviteCodeCopied: "Invite code copied!",
        soundVoiceLabel: "Sound & Voice",
        soundOn: "ON",
        soundOff: "OFF",
        soundDesc: "Game sounds & live 10s countdown voice",
        manageAudio: "Manage",
        soundEffectsLabel: "Sound Effects (SFX)",
        soundEffectsDesc: "Seat tap & win chimes",
        voiceCalloutsLabel: "Voice Callouts",
        voiceCalloutsDesc: "Live 10s countdown & winner",
        voiceLangLabel: "Voice Language",
        voiceLangAuto: "Matches App Language",
        volumeLabel: "Volume Level",
        testAudioLabel: "Test Sound & Voice",
        testingAudio: "Testing audio playback...",
        editProfileLabel: "Edit Profile Name & Password",
        deleteAccountLabel: "Delete Account Forever",
        signOutLabel: "Sign Out",
        updateProfileTitle: "Update Profile",
        updateProfileDesc: "Change your display name or password",
        displayNameLabel: "Display Name",
        newPasswordLabel: "New Password",
        leaveBlank: "Leave blank to keep current",
        cancelBtn: "Cancel",
        saveBtn: "Save",
        // How to Play
        howToPlaySubtitle: "Simple step-by-step guide to play and win",
        step1Tag: "Step 1",
        step2Tag: "Step 2",
        step3Tag: "Step 3",
        step4Tag: "Step 4",
        pickRoom: "Pick Room",
        pickNumbers: "Pick Numbers",
        waitForDraw: "Wait for Draw",
        winLabel: "Win!",
        step1Title: "Choose Your Room",
        step1Desc: "Go to Rooms tab and choose your game. Pick from different prize amounts (500 - 50,000 Birr) and player counts (5-80 players).",
        step1Tip1: "Select prize amount that matches your budget",
        step1Tip2: "Join before the room fills up",
        step2Title: "Pick Your Numbers",
        step2Desc: "Select numbers from the available seats. You can choose 1 or more seats. The more seats you pick, the higher your chances to win!",
        step2Tip1: "If a room fills up, pick a different room - no need to wait",
        step2Tip2: "More seats = More chances to win",
        step3Title: "Wait for the Draw",
        step3Desc: "Once all players have selected their seats, the draw begins automatically! Watch the screen as the machine picks one winning number.",
        step3Tip1: "Draw happens every 60 seconds",
        step3Tip2: "Result shows instantly - you can join next game immediately",
        step4Title: "Win or Play Again",
        step4Desc: "If your number is drawn, you win! Your prize goes directly to your wallet. Didn't win? No problem - join another game!",
        step4Tip1: "Winnings instantly credited to your account",
        step4Tip2: "Games run 24/7 - play anytime, anywhere",
        youWinLabel: "You Win!",
        keyTipsTitle: "Key Tips to Win More",
        tip1Title: "More Seats = Better Odds",
        tip1Desc: "The more numbers you pick, the higher your chance to match the winning number.",
        tip2Title: "Games Run 24/7",
        tip2Desc: "No need to wait - another game is always starting in 60 seconds.",
        tip3Title: "Instant Withdrawals",
        tip3Desc: "Withdraw your winnings anytime within 5 minutes via Telebirr.",
        tip4Title: "Smart Play",
        tip4Desc: "Choose balanced stakes - more tickets = more winning chances.",
        readyToPlay: "Ready to Play?",
        readyToPlayDesc: "Deposit now and start winning big!",
        startPlayingBtn: "Start Playing",
        depositBtn: "Deposit",
        // Draw modal
        drawModalSubtitle: "Next game cycle is now open for joins!",
        lostMessage: "💔 You lost the game, try again and take a chance!",
        grossJackpot: "Gross Jackpot",
        platformFee: "Platform Fee",
        netPayout: "Net Payout",
        joinNextGame: (num) => `🎮 Join Next Game (Game #${num})`,
        // Confirm open room modal
        confirmOpenRoomTitle: "Open this room?",
        confirmOpenRoomDesc: "This will create a new game room and deduct the ticket price from your balance.",
        noBtn: "No",
        yesBtn: "Yes",
        // Wallet modal
        telebirrDepositTitle: "Telebirr Deposit",
        withdrawFundsTitle: "Withdraw Funds",
        telebirrTxLabel: "Telebirr Transaction ID",
        telebirrDepositDesc: "Enter your Telebirr Transaction ID to verify and deposit.",
        withdrawModalDesc: "Enter the amount you wish to withdraw.",
        amountLabel: "Amount (ETB)",
        cancelWalletBtn: "Cancel",
        processingBtn: "Processing...",
        verifyDepositBtn: "Verify & Deposit",
        withdrawActionBtn: "Withdraw",
      }
    };
    const t = (key, ...args) => {
        const val = i18n[language]?.[key];
        if (typeof val === 'function') return val(...args);
        return val || key;
    };

    useEffect(() => {
        fetch('http://localhost:3000/api/v1/config')
            .then(res => res.json())
            .then(data => {
                if (data.telebirrPhone || data.telebirrName) {
                    setSystemConfig({ 
                        telebirrPhone: data.telebirrPhone || '0949626463', 
                        telebirrName: data.telebirrName || 'Abel Wondmeneh' 
                    });
                }
            })
            .catch(err => console.error('Failed to load system config:', err));

        const currentUserId = user?.id;
        if (currentUserId) {
            authFetch(`http://localhost:3000/api/v1/wallet/balance?mode=${mode}`)
                .then(res => res.json())
                .then(data => {
                    if (data && data.balance !== undefined) {
                        setUserState(prev => prev ? { ...prev, balance: data.balance } : prev);
                        // Also update localStorage so it's in sync
                        const saved = localStorage.getItem('fastderash_user');
                        if (saved) {
                            try {
                                const parsed = JSON.parse(saved);
                                parsed.balance = data.balance;
                                localStorage.setItem('fastderash_user', JSON.stringify(parsed));
                            } catch {}
                        }
                    }
                })
                .catch(err => console.error(err));

            authFetch(`http://localhost:3000/api/v1/wallet/transactions?mode=${mode}`)
                .then(res => res.json())
                .then(data => setWalletTransactions(Array.isArray(data) ? data : []))
                .catch(err => console.error('Failed to fetch transactions:', err));

            fetchMyWithdrawals();

            authFetch('http://localhost:3000/api/v1/user/invite')
                .then(res => res.json())
                .then(data => {
                    if (data && data.hasRedeemed) {
                        setAppliedInvite(true);
                        setInviteCodeInput(data.inviteCode || '');
                    }
                })
                .catch(() => {});
        }
    }, [user?.id, mode]);

    useEffect(() => {
        const socket = getSocket();
        const handleInteraction = () => initAudio();
        document.body.addEventListener('click', handleInteraction, { once: true });
        document.body.addEventListener('touchstart', handleInteraction, { once: true });
        document.body.addEventListener('pointerdown', handleInteraction, { once: true });

        fetch('http://localhost:3000/api/v1/rooms')
            .then(res => res.json())
            .then(data => setRooms(data));
            
        fetch('http://localhost:3000/api/v1/results')
            .then(res => res.json())
            .then(data => setResults(data || []))
            .catch(err => console.error(err));

        socket.on('room:state_update', (roomsData) => setRooms(roomsData));
        
        socket.on('room:time_tick', ({ roomId, roomNumber, timeRemaining, filledSeats, groupSize, playerCount }) => {
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
            
            // Pure, crystal-clear countdown voice (10 down to 1) only if room is full
            const isViewingThisRoom = seatModalRef.current.open && seatModalRef.current.room?.id === roomId;
            const isRoomFilled = (filledSeats !== undefined ? filledSeats : seatModalRef.current.room?.filledSeats || 0) >= (groupSize || seatModalRef.current.room?.groupSize || 10);
            if (isViewingThisRoom && isRoomFilled && timeRemaining <= 10 && timeRemaining > 0) {
                if (lastCountdownTickRef.current.roomId !== roomId || lastCountdownTickRef.current.sec !== timeRemaining) {
                    lastCountdownTickRef.current = { roomId, sec: timeRemaining };
                    playCountdownVoice(timeRemaining, languageRef.current);
                }
            }
        });

        socket.on('room:waiting_for_players', ({ roomId }) => {
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
            stopAllVoice();
            const currentUserId = userRef.current?.id;
            const isViewing = seatModalRef.current.open && seatModalRef.current.room?.id === data.roomId;
            const isParticipant = Boolean(
                currentUserId && (
                    (seatModalRef.current.room?.id === data.roomId && (seatModalRef.current.room?.seats || []).some(s => s.userId === currentUserId)) ||
                    (roomsRef.current || []).find(r => r.id === data.roomId)?.seats?.some(s => s.userId === currentUserId)
                )
            );

            // Pop up draw modal if user is actively viewing this room or has tickets in it
            if (isViewing || isParticipant) {
                const roomObj = (roomsRef.current || []).find(r => r.id === data.roomId);
                setDrawModal({ 
                    open: true, 
                    room: data.roomId, 
                    roomNumber: data.roomNumber, 
                    groupSize: data.groupSize || roomObj?.groupSize || 10,
                    nextGameId: data.nextGameId,
                    nextRoomNumber: data.nextRoomNumber,
                    result: null 
                });
                setSeatModal(prev => prev.room && prev.room.id === data.roomId ? { open: false, room: null, selectedSeats: [] } : prev);
            }

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
            
            // If user has the draw modal open for this room, update with winner result
            setDrawModal(prev => (prev.open && prev.room === data.roomId) || (seatModalRef.current.room?.id === data.roomId) ? { 
                ...prev, 
                open: true,
                room: data.roomId,
                roomNumber: data.roomNumber,
                groupSize: prev.groupSize || data.groupSize || (roomsRef.current || []).find(r => r.id === data.roomId)?.groupSize || 10,
                result: data 
            } : prev);
            
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
                const currentUserId = userRef.current?.id;
                const isWinner = Boolean(currentUserId && data.winnerUserId === currentUserId);
                const participated = Boolean(currentUserId && (
                    (data.participantUserIds && data.participantUserIds.includes(currentUserId)) ||
                    (seatModalRef.current.room?.id === data.roomId && (seatModalRef.current.room?.seats || []).some(s => s.userId === currentUserId)) ||
                    (roomsRef.current || []).find(r => r.id === data.roomId)?.seats?.some(s => s.userId === currentUserId)
                ));

                const winAmount = Math.round(data.netPayout || (data.targetJackpot ? data.targetJackpot * 0.85 : 0));

                if (isWinner) {
                    triggerConfetti();
                    playWinnerVoice(winAmount, languageRef.current);
                    setUser(u => u ? { ...u, balance: data.winnerBalance } : u);
                } else if (participated) {
                    playLoserVoice(languageRef.current);
                } else if ((drawModalRef.current.open && drawModalRef.current.room === data.roomId) || (seatModalRef.current.open && seatModalRef.current.room?.id === data.roomId)) {
                    playGameFinishVoice(data.winnerUsername, winAmount, languageRef.current);
                }
            }, 800);
        });

        return () => socket.off();
    }, []);

    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({ phoneNumber: '', password: '', displayName: '', confirmPassword: '', telegramId: '' });
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [resetStep, setResetStep] = useState(1); // 1: enter phone, 2: enter code & new password
    const [resetCode, setResetCode] = useState('');

    const handleAuth = async (e) => {
        e?.preventDefault();
        
        // Validate password confirmation for registration
        if (!isLogin && formData.password !== formData.confirmPassword) {
            showAlert(language === 'am' ? 'የይለፍ ቃሎች አይዛመዱም' : 'Passwords do not match', 'error');
            return;
        }
        
        try {
            const endpoint = isLogin ? 'login' : 'register';
            const res = await fetch(`http://localhost:3000/api/v1/auth/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (data.error) {
                showAlert(data.error, 'error');
                return;
            }
            // Store token for authenticated API calls
            if (data.token) localStorage.setItem('fastderash_token', data.token);
            setUser({ id: data.userId, name: data.username, balance: data.balance });
            setMode(data.mode);
            setActiveTab('rooms');
            } catch(e) {
            console.error("Auth failed", e);
            showAlert("Authentication failed", 'error');
        }
    };

    const handleForgotPasswordRequest = async (e) => {
        e?.preventDefault();
        if (!formData.phoneNumber) {
            showAlert(language === 'am' ? 'እባክዎ ስልክ ቁጥር ያስገቡ' : 'Please enter phone number', 'error');
            return;
        }
        try {
            const res = await fetch('http://localhost:3000/api/v1/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber: formData.phoneNumber })
            });
            const data = await res.json();
            if (data.error) {
                if (data.needsStart && data.botLink) {
                    showAlert(
                        language === 'am'
                            ? 'እባክዎ @fasterekub_bot ን ቴሌግራም ላይ ክፈቱ፣ /start ይጫኑ፣ ከዚያ እንደገና ይሞክሩ'
                            : 'Please open @fasterekub_bot on Telegram, tap Start, then try again',
                        'error'
                    );
                    setTimeout(() => window.open('https://t.me/fasterekub_bot', '_blank'), 1500);
                } else {
                    showAlert(data.error, 'error');
                }
                return;
            }
            showAlert(language === 'am' ? 'የማረጋገጫ ኮድ ወደ ቴሌግራም ተልኳል' : 'Verification code sent to your Telegram', 'success');
            setResetStep(2);
        } catch(e) {
            console.error("Forgot password failed", e);
            showAlert("Failed to send verification code", 'error');
        }
    };

    const handlePasswordReset = async (e) => {
        e?.preventDefault();
        if (!resetCode || !formData.password || !formData.confirmPassword) {
            showAlert(language === 'am' ? 'እባክዎ ሁሉንም መስኮች ይሙሉ' : 'Please fill all fields', 'error');
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            showAlert(language === 'am' ? 'የይለፍ ቃሎች አይዛመዱም' : 'Passwords do not match', 'error');
            return;
        }
        try {
            const res = await fetch('http://localhost:3000/api/v1/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    phoneNumber: formData.phoneNumber,
                    code: resetCode,
                    newPassword: formData.password
                })
            });
            const data = await res.json();
            if (data.error) {
                showAlert(data.error, 'error');
                return;
            }
            showAlert(language === 'am' ? 'የይለፍ ቃል በተሳካ ሁኔታ ተቀይሯል' : 'Password reset successfully', 'success');
            setIsForgotPassword(false);
            setResetStep(1);
            setResetCode('');
            setFormData({ phoneNumber: '', password: '', displayName: '', confirmPassword: '', telegramId: '' });
            setIsLogin(true);
        } catch(e) {
            console.error("Password reset failed", e);
            showAlert("Failed to reset password", 'error');
        }
    };


    // Redirect unauthenticated users to login/register form
    const requireLogin = () => {
        setSeatModal({ open: false, room: null, selectedSeats: [] });
        setIsLogin(true);
        setIsForgotPassword(false);
        setActiveTab('home');
        showAlert(t('loginFirst'), 'warning');
    };

    const buySeat = async () => {
        if (!user) {
            requireLogin();
            return;
        }
        if (!seatModal.selectedSeats || seatModal.selectedSeats.length === 0) {
            showAlert('Please select at least one seat', 'warning');
            return;
        }
        try {
            const res = await authFetch('http://localhost:3000/api/v1/rooms/join', {
                method: 'POST',
                body: JSON.stringify({
                    roomId: seatModal.room.id,
                    seatCount: seatModal.selectedSeats.length,
                    mode,
                    username: user.name,
                    seatNumbers: seatModal.selectedSeats
                })
            });
            const data = await res.json();
            if (data.error) showAlert(data.error, 'warning');
            else {
                playSeatBuy();
                if (data.balance !== undefined) {
                    setUser(u => ({ ...u, balance: data.balance }));
                } else {
                    setUser(u => ({ ...u, balance: u.balance - (seatModal.room.ticketPrice * seatModal.selectedSeats.length) }));
                }
                setSeatModal(prev => ({ ...prev, selectedSeats: [] }));
            }
        } catch {
            showAlert('Purchase failed', 'error');
        }
    };

    const openWalletModal = (action) => {
        if (!user) {
            requireLogin();
            return;
        }
        setWalletModal({ open: true, action, amount: '', transactionId: '', loading: false });
    };

    const executeWalletAction = async (e) => {
        e.preventDefault();
        setWalletModal(prev => ({ ...prev, loading: true }));
        
        let payload = { userId: user.id, mode };
        if (walletModal.action === 'deposit') {
            if (!walletModal.transactionId) {
                showAlert('Please enter a Telebirr Transaction ID', 'warning');
                setWalletModal(prev => ({ ...prev, loading: false }));
                return;
            }
            payload.transactionId = walletModal.transactionId.trim();
        } else {
            const amount = parseFloat(walletModal.amount);
            if (isNaN(amount) || amount <= 0) {
                showAlert('Invalid amount', 'warning');
                setWalletModal(prev => ({ ...prev, loading: false }));
                return;
            }
            payload.amount = amount;
        }

        try {
            const endpoint = walletModal.action === 'deposit' ? 'deposit/telebirr' : walletModal.action;
            const res = await authFetch(`http://localhost:3000/api/v1/wallet/${endpoint}`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.error) showAlert(data.error, 'error');
            else {
                setUser(u => ({ ...u, balance: data.balance }));
                setWalletModal({ open: false, action: null, amount: '', transactionId: '', loading: false });
                if (walletModal.action === 'deposit') {
                    showAlert(`Successfully verified and deposited ${data.depositedAmount || 0} ETB!`, 'success');
                }
            }
        } catch {
            showAlert(`Failed to ${walletModal.action}`, 'error');
        } finally {
            setWalletModal(prev => ({ ...prev, loading: false }));
        }
    };
    const executeInlineWalletAction = async (e, actionType) => {
        e.preventDefault();
        setWalletTabState(prev => ({ ...prev, loading: true }));
        
        let payload = { userId: user.id, mode };
        if (actionType === 'deposit') {
            if (!walletTabState.transactionId) {
                showAlert('Please enter a Telebirr Transaction ID', 'warning');
                setWalletTabState(prev => ({ ...prev, loading: false }));
                return;
            }
            payload.transactionId = walletTabState.transactionId.trim();
        } else {
            const amount = parseFloat(walletTabState.amount);
            if (isNaN(amount) || amount <= 0) {
                showAlert('Invalid amount', 'warning');
                setWalletTabState(prev => ({ ...prev, loading: false }));
                return;
            }
            payload.amount = amount;
            if (walletTabState.phone) {
                payload.phoneNumber = walletTabState.phone.trim();
            }
        }

        try {
            const endpoint = actionType === 'deposit' ? 'deposit/telebirr' : actionType;
            const res = await authFetch(`http://localhost:3000/api/v1/wallet/${endpoint}`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.error) showAlert(data.error, 'error');
            else {
                setUser(u => ({ ...u, balance: data.balance }));
                setWalletTabState(prev => ({ ...prev, amount: '', transactionId: '', phone: '', loading: false }));
                if (actionType === 'deposit') {
                    showAlert(`Successfully verified and deposited ${data.depositedAmount || 0} ETB!`, 'success');
                } else {
                    showAlert(data.message || 'Withdrawal request submitted successfully', 'success');
                    fetchMyWithdrawals();
                }
                
                // Refresh transactions
                authFetch(`http://localhost:3000/api/v1/wallet/transactions?mode=${mode}`)
                    .then(res => res.json())
                    .then(txData => setWalletTransactions(Array.isArray(txData) ? txData : []))
                    .catch(err => console.error(err));
            }
        } catch {
            showAlert(`Failed to ${actionType}`, 'error');
        } finally {
            setWalletTabState(prev => ({ ...prev, loading: false }));
        }
    };

    const fetchMyWithdrawals = () => {
        if (!user) return;
        authFetch('http://localhost:3000/api/v1/wallet/withdrawals')
            .then(res => res.json())
            .then(data => {
                if (data && Array.isArray(data.requests)) {
                    setMyWithdrawals(data.requests);
                }
            })
            .catch(() => {});
    };

    const cancelWithdrawalRequest = async (requestId) => {
        try {
            const res = await authFetch(`http://localhost:3000/api/v1/wallet/withdraw/${requestId}/cancel`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.error) {
                showAlert(data.error, 'error');
            } else {
                showAlert(data.message || 'Withdrawal request cancelled and refunded', 'success');
                if (data.newBalance !== undefined) {
                    setUser(u => ({ ...u, balance: data.newBalance }));
                }
                fetchMyWithdrawals();
                authFetch(`http://localhost:3000/api/v1/wallet/transactions?mode=${mode}`)
                    .then(res => res.json())
                    .then(txData => setWalletTransactions(Array.isArray(txData) ? txData : []))
                    .catch(() => {});
            }
        } catch {
            showAlert('Failed to cancel withdrawal request', 'error');
        }
    };


    const handleCreateOrder = async () => {
        if (!user) {
            requireLogin();
            return;
        }
        const amountNum = parseFloat(orderAmount);
        if (isNaN(amountNum) || amountNum <= 0) {
            showAlert('Please enter a valid amount', 'warning');
            return;
        }
        setOrderLoading(true);
        try {
            const res = await authFetch('http://localhost:3000/api/v1/wallet/order', {
                method: 'POST',
                body: JSON.stringify({ amount: amountNum, mode })
            });
            const data = await res.json();
            const orderRef = data.orderRef || ('ORD-' + Date.now().toString(36).toUpperCase());
            setCreatedOrder({
                orderRef,
                amount: amountNum,
                phone: data.telebirrPhone || systemConfig.telebirrPhone,
                name: data.telebirrName || systemConfig.telebirrName,
                time: new Date().toLocaleTimeString()
            });
            try {
                await navigator.clipboard.writeText(data.telebirrPhone || systemConfig.telebirrPhone);
            } catch {}
        } catch {
            const orderRef = 'ORD-' + Date.now().toString(36).toUpperCase();
            setCreatedOrder({
                orderRef,
                amount: amountNum,
                phone: systemConfig.telebirrPhone,
                name: systemConfig.telebirrName,
                time: new Date().toLocaleTimeString()
            });
        } finally {
            setOrderLoading(false);
        }
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        try {
            const res = await authFetch('http://localhost:3000/api/v1/auth/profile', {
                method: 'PUT',
                body: JSON.stringify({ displayName: profileForm.displayName, password: profileForm.password })
            });
            const data = await res.json();
            if (data.error) showAlert(data.error, 'error');
            else {
                setUser(u => ({ ...u, name: data.username }));
                setIsEditingProfile(false);
                showAlert('Profile updated successfully!', 'success');
            }
        } catch {
            showAlert('Failed to update profile', 'error');
        }
    };

    const handleApplyInviteCode = async (e) => {
        e.preventDefault();
        if (!user) {
            requireLogin();
            return;
        }
        const code = inviteCodeInput.trim().toUpperCase();
        if (!code) {
            setInviteMessage({ type: 'error', text: language === 'am' ? 'እባክዎ የግብዣ ኮድ ያስገቡ' : 'Please enter an invite code' });
            return;
        }
        const myCode = `EQUB-${(user?.id || '').slice(0, 4).toUpperCase()}`;
        if (code === myCode) {
            setInviteMessage({ type: 'error', text: language === 'am' ? 'የራስዎን የግብዣ ኮድ መጠቀም አይችሉም' : 'You cannot use your own invite code' });
            return;
        }
        setInviteLoading(true);
        setInviteMessage(null);
        try {
            const res = await authFetch('http://localhost:3000/api/v1/user/invite', {
                method: 'POST',
                body: JSON.stringify({ inviteCode: code })
            });
            const data = await res.json();
            if (data.error) {
                setInviteMessage({ type: 'error', text: data.error });
            } else {
                setAppliedInvite(true);
                setInviteMessage({ type: 'success', text: data.message || (language === 'am' ? 'የግብዣ ኮድ ተቀባይነት አግኝቷል!' : 'Invite code applied successfully!') });
                if (data.newBalance !== undefined) {
                    setUser(u => ({ ...u, balance: data.newBalance }));
                }
            }
        } catch {
            setInviteMessage({ type: 'error', text: 'Network error, please try again' });
        } finally {
            setInviteLoading(false);
        }
    };

    const handleDeleteProfile = async () => {
        showConfirm(
            language === 'am' ? 'እርግጠኛ ነዎት መለያዎን በቋሚነት መሰረዝ ይፈልጋሉ? ይህ እርምጃ ሊመለስ አይችልም!' : 'Are you sure you want to completely delete your account? This cannot be undone!',
            async () => {
                try {
                    const res = await authFetch('http://localhost:3000/api/v1/auth/profile', {
                        method: 'DELETE'
                    });
                    const data = await res.json();
                    if (data.error) showAlert(data.error, 'error');
                    else {
                        setUser(null);
                        setActiveTab('home');
                        showAlert('Account deleted forever.', 'info');
                    }
                } catch {
                    showAlert('Failed to delete account', 'error');
                }
            }
        );
    };

    const executeOpenRoom = async () => {
        setConfirmOpenRoom(false);
        try {
            const res = await authFetch('http://localhost:3000/api/v1/rooms/create_and_join', {
                method: 'POST',
                body: JSON.stringify({
                    mode,
                    username: user.name,
                    groupSize: wizard.groupSize,
                    seatNumbers: wizard.seatNumbers,
                    targetJackpot: wizard.jackpot
                })
            });
            const data = await res.json();
            if (data.error) showAlert(data.error, 'error');
            else {
                playSeatBuy();
                if (data.balance !== undefined) {
                    setUser(u => ({ ...u, balance: data.balance }));
                }
                if (data.room) {
                    setRooms(prev => [data.room, ...prev.filter(r => r.id !== data.room.id)]);
                }
                setActiveTab('rooms');
                setSeatModal({ open: true, room: data.room, selectedSeats: [] });
            }
        } catch {
            showAlert('Failed to create room', 'error');
        }
    };

    const handleJoinNextGame = async (nextGameId) => {
        setDrawModal({ open: false, room: null, result: null });
        if (nextGameId) {
            try {
                const res = await fetch(`http://localhost:3000/api/v1/rooms/${nextGameId}`);
                const nextRoom = await res.json();
                if (nextRoom && !nextRoom.error) {
                    setActiveTab('rooms');
                    setSeatModal({ open: true, room: nextRoom, selectedSeats: [] });
                    return;
                }
            } catch {}
        }
        setActiveTab('rooms');
    };

    const userInviteCode = user ? `EQUB-${user.id.slice(0, 4).toUpperCase()}${user.phone ? user.phone.slice(-3) : '77'}` : 'EQUB-7721';

    const activeRoom = seatModal.open && seatModal.room ? (rooms.find(r => r.id === seatModal.room.id) || seatModal.room) : null;

    return (
        <div className="flex min-h-dvh w-full flex-col font-sans bg-surface-950 text-white">
            <style>
            {`
                @keyframes panHero {
                    0% { object-position: 0% 50%; }
                    50% { object-position: 100% 50%; }
                    100% { object-position: 0% 50%; }
                }
                .hero-pan {
                    animation: panHero 25s ease-in-out infinite;
                }
            `}
            </style>
            <header className="sticky top-0 z-30 border-b border-white/10 bg-surface-950/95 backdrop-blur-xl safe-top">
                <div className="mx-auto flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8 max-w-6xl">
                    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                        <button onClick={() => { setActiveTab('home'); setSeatModal({...seatModal, open: false}); }} className="flex min-w-0 items-center gap-2">
                            <span className="flex h-12 w-auto shrink-0 items-center justify-center overflow-hidden">
                                <img src="/logo.png" alt="Logo" className="h-full w-auto object-contain rounded-xl" />
                            </span>
                            <div className="min-w-0 text-left">
                                <p className="truncate text-sm font-bold leading-tight lg:text-base">{t('title')}</p>
                                <p className="truncate text-[10px] text-equb-400">{t('subtitle')}</p>
                            </div>
                        </button>
                    </div>
                    <nav className="hidden items-center gap-1 lg:flex">
                        <NavigationLinks activeTab={activeTab} seatModal={seatModal} t={t} setActiveTab={setActiveTab} />
                    </nav>
                    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                        <div className="inline-flex rounded-full border border-white/10 bg-black/30 p-0.5 scale-90">
                            <button type="button" onClick={() => setLanguage('am')} className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${language === 'am' ? 'bg-equb-500 text-white' : 'text-white/45 hover:text-white/70'}`}>AMH</button>
                            <button type="button" onClick={() => setLanguage('en')} className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${language === 'en' ? 'bg-equb-500 text-white' : 'text-white/45 hover:text-white/70'}`}>EN</button>
                        </div>
                        {!user ? (
                            <button onClick={() => { setActiveTab('home'); setIsLogin(true); }} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-equb-400 hover:bg-white/5">{t('loginBtn')}</button>
                        ) : (
                            <div className="text-xs text-emerald-400 font-bold">{user.balance.toLocaleString()} ETB</div>
                        )}
                    </div>
                </div>
            </header>

            <main className={`mx-auto w-full flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 ${seatModal.open ? 'pb-8' : 'pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-10'} max-w-6xl`}>
                {seatModal.open && activeRoom ? (
                    <div className="flex flex-col gap-2 sm:gap-3 animate-in fade-in zoom-in-95 duration-200 w-full max-w-md mx-auto">
                        {/* Room Interface Header with Back Button */}
                        <div className="flex items-center justify-between gap-2">
                            <button 
                                type="button" 
                                onClick={() => { stopAllVoice(); setSeatModal({ open: false, room: null, selectedSeats: [] }); }} 
                                className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-surface-800 border border-white/10 hover:bg-surface-700 transition text-white text-[11px] sm:text-xs font-bold active:scale-95 shadow-sm"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                                <span>{t('rooms')}</span>
                            </button>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                                <span className="font-mono text-[11px] sm:text-xs font-black text-gold-400 bg-gold-500/10 border border-gold-500/20 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg">
                                    🎮 {t('gameLabel')}{activeRoom.roomNumber || activeRoom.id}
                                </span>
                                <span className="text-[9px] sm:text-[10px] font-bold text-white/50 uppercase tracking-wider bg-white/5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg border border-white/5">
                                    {({
                                        Starter: t('tierStarter'),
                                        Bronze: t('tierBronze'),
                                        Silver: t('tierSilver'),
                                        Gold: t('tierGold'),
                                        VIP: t('tierVIP'),
                                        Standard: t('tierStandard')
                                    })[activeRoom.tierCategory] || activeRoom.tierCategory || t('tierStandard')}
                                </span>
                            </div>
                        </div>

                        {/* Room Subtitle Rules */}
                        <div className="text-center px-1">
                            <p className="hidden sm:block text-gold-400 text-xs font-bold leading-tight">
                                {t('realMoneyDesc')}
                            </p>
                            <p className="text-white/50 text-[9px] sm:text-[10px] font-medium mt-0 sm:mt-0.5">
                                {`${language === 'am' ? 'ከፍተኛ' : 'Max'} ${activeRoom.maxSeatsPerUser || (activeRoom.groupSize === 5 ? 1 : Math.floor(activeRoom.groupSize / 10) + 1)} ${language === 'am' ? 'ምርጫ' : 'picks'} · ${activeRoom.ticketPrice % 1 === 0 ? activeRoom.ticketPrice.toLocaleString() : activeRoom.ticketPrice.toFixed(2)} ${language === 'am' ? 'ብር / ቁጥር · ሁሉም ሲሞሉ ይጀምራል' : 'Birr / number · starts when all seats filled'}`}
                            </p>
                        </div>

                        {/* Compact Unified Game HUD: Prize Pool + Countdown Timer */}
                        <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-gold-500/25 bg-gradient-to-br from-surface-900 via-[#0b1713] to-surface-950 p-2.5 sm:p-3.5 shadow-xl">
                            {/* Ambient background glows */}
                            <div className="pointer-events-none absolute -left-6 -top-6 h-16 sm:h-20 w-16 sm:w-20 rounded-full bg-gold-500/10 blur-xl"></div>
                            <div className="pointer-events-none absolute -right-6 -bottom-6 h-16 sm:h-20 w-16 sm:w-20 rounded-full bg-equb-500/10 blur-xl"></div>

                            <div className="relative z-10 flex items-center justify-between gap-2 sm:gap-3">
                                {/* Left Section: Prize Pool & Chips */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5">
                                        <span className="text-[9px] sm:text-[10px] font-extrabold tracking-wider text-gold-400 uppercase flex items-center gap-1">
                                            <span>🏆</span>
                                            <span>{t('prizePool')}</span>
                                        </span>
                                        <span className="text-[9px] sm:text-[10px] text-white/30 font-mono">#{activeRoom.roomNumber || activeRoom.id}</span>
                                    </div>
                                    
                                    <div className="flex items-baseline gap-1 sm:gap-1.5 mb-1 sm:mb-2">
                                        <span className="text-xl sm:text-3xl font-black text-gold-400 tracking-tight leading-none">
                                            {activeRoom.targetJackpot?.toLocaleString()}
                                        </span>
                                        <span className="text-[10px] sm:text-xs font-bold text-gold-500/80">{t('birLabel')}</span>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                                        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded-md sm:rounded-lg border border-white/10 bg-black/40 text-[9.5px] sm:text-[11px] font-semibold text-emerald-400">
                                            <span className="text-white/40 text-[8px] sm:text-[9px] font-medium uppercase tracking-wider">{t('entryLabel')}</span>
                                            <span>{activeRoom.ticketPrice % 1 === 0 ? activeRoom.ticketPrice.toLocaleString() : activeRoom.ticketPrice.toFixed(2)} {t('birLabel')}</span>
                                        </div>
                                        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded-md sm:rounded-lg border border-equb-500/25 bg-equb-500/10 text-[9.5px] sm:text-[11px] font-semibold text-equb-400">
                                            <span className="text-white/40 text-[8px] sm:text-[9px] font-medium uppercase tracking-wider">{t('playersLabel')}</span>
                                            <span>{activeRoom.filledSeats || 0}/{activeRoom.groupSize}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Section: Compact Circular Seat Fill Progress */}
                                <div className="flex flex-col items-center shrink-0 pl-2.5 sm:pl-3 border-l border-white/10">
                                    <span className="text-[8px] sm:text-[9px] font-extrabold tracking-wider text-equb-400/90 uppercase mb-0.5 sm:mb-1">
                                        {(activeRoom.filledSeats || 0) >= activeRoom.groupSize ? t('drawing') : t('nextDraw')}
                                    </span>
                                    <div className="relative w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center">
                                        <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 64 64">
                                            <circle cx="32" cy="32" r="26" fill="none" stroke="#10b98120" strokeWidth="4.5" />
                                            <circle 
                                                cx="32" 
                                                cy="32" 
                                                r="26" 
                                                fill="none" 
                                                stroke={(activeRoom.filledSeats || 0) >= activeRoom.groupSize ? '#34d399' : '#fbbf24'} 
                                                strokeWidth="4.5" 
                                                strokeDasharray="163.36" 
                                                strokeDashoffset={163.36 * (1 - (Math.min(activeRoom.groupSize, activeRoom.filledSeats || 0) / activeRoom.groupSize))} 
                                                strokeLinecap="round" 
                                                className="transition-all duration-500 linear" 
                                            />
                                        </svg>
                                        <div className="relative flex flex-col items-center">
                                            <span className={`text-xs sm:text-base font-black leading-none tracking-tight font-mono transition-colors duration-300 ${(activeRoom.filledSeats || 0) >= activeRoom.groupSize ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                {activeRoom.filledSeats || 0}/{activeRoom.groupSize}
                                            </span>
                                            <span className="text-[7px] sm:text-[8px] text-white/50 font-bold mt-0.5">{t('secLabel')}</span>
                                        </div>
                                    </div>
                                    <span className="hidden sm:block text-[9px] text-white/40 mt-0.5">
                                        {(activeRoom.filledSeats || 0) >= activeRoom.groupSize 
                                            ? (language === 'am' ? 'ሙሉ ነው' : 'Full') 
                                            : `${activeRoom.groupSize - (activeRoom.filledSeats || 0)} ${t('remaining')}`}
                                    </span>
                                </div>
                            </div>

                            {/* Bottom Strip: Room Status & Linear Progress Bar */}
                            <div className="mt-2 sm:mt-2.5 pt-1.5 sm:pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-gold-400/90 text-[10px] sm:text-[11px] font-medium min-w-0 truncate">
                                    <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${(activeRoom.filledSeats || 0) < activeRoom.groupSize ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}></span>
                                    <span className="truncate">
                                        {(activeRoom.filledSeats || 0) < activeRoom.groupSize
                                            ? t('need2Players', activeRoom.filledSeats || 0, activeRoom.groupSize)
                                            : t('gameReady', activeRoom.filledSeats || 0, activeRoom.groupSize)}
                                    </span>
                                </div>
                                <div className="w-14 sm:w-20 h-1 sm:h-1.5 bg-white/10 rounded-full overflow-hidden shrink-0">
                                    <div 
                                        className="h-full bg-gradient-to-r from-equb-500 to-emerald-400 rounded-full transition-all duration-500" 
                                        style={{ width: `${Math.min(100, (((activeRoom.filledSeats || 0) / activeRoom.groupSize) * 100))}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>

                        {(() => {
                            const maxAllowed = activeRoom.maxSeatsPerUser || (activeRoom.groupSize === 5 ? 1 : Math.floor(activeRoom.groupSize / 10) + 1);
                            const myExistingSeatsCount = (activeRoom.seats || []).filter(s => user && s.userId === user.id).length;
                            const remainingAllowed = Math.max(0, maxAllowed - myExistingSeatsCount);
                            const totalBet = seatModal.selectedSeats.length * activeRoom.ticketPrice;
                            const formattedBet = totalBet % 1 === 0 ? totalBet.toLocaleString() : totalBet.toFixed(2);
                            return (
                                <>
                                    <div className="mt-0.5 sm:mt-1">
                                        <div className="flex justify-between items-center mb-1.5 sm:mb-2 px-1">
                                            <span className="text-xs sm:text-sm font-bold text-white/90">
                                                {t('pickNumsMax', maxAllowed)}
                                            </span>
                                            {myExistingSeatsCount > 0 && (
                                                <span className="text-[11px] font-bold text-emerald-400">
                                                    {t('alreadyOwn', myExistingSeatsCount)}
                                                </span>
                                            )}
                                        </div>

                                        <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: activeRoom.groupSize === 5 ? 'repeat(5, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(min(100%, 42px), 1fr))' }}>
                                            {Array.from({ length: activeRoom.groupSize }, (_, i) => i + 1).map(seatNumber => {
                                                const seatOwner = (activeRoom.seats || []).find(s => s.seatNumber === seatNumber);
                                                const isTaken = Boolean(seatOwner);
                                                const isMySeat = Boolean(user && seatOwner && (seatOwner.userId === user.id));
                                                const isSelected = seatModal.selectedSeats.includes(seatNumber);
                                                const isRoomFull = (activeRoom.filledSeats || 0) >= activeRoom.groupSize;
                                                return (
                                                    <button 
                                                        key={seatNumber}
                                                        disabled={isTaken || isRoomFull}
                                                        onClick={() => {
                                                            if (isSelected) {
                                                                playTick();
                                                                setSeatModal({...seatModal, selectedSeats: seatModal.selectedSeats.filter(n => n !== seatNumber)});
                                                            } else if (remainingAllowed <= 0) {
                                                                showAlert(
                                                                    language === 'am' 
                                                                        ? `ለ ${activeRoom.groupSize} ተጫዋቾች ክፍል በአንድ ሰው ከፍተኛ ${maxAllowed} መቀመጫ ብቻ ነው የሚፈቀደው። ቀድመው ${myExistingSeatsCount} መቀመጫ ይዘዋል።` 
                                                                        : `Max ${maxAllowed} seats allowed per player for group size ${activeRoom.groupSize}. You already own ${myExistingSeatsCount} seat${myExistingSeatsCount > 1 ? 's' : ''}.`,
                                                                    'warning'
                                                                );
                                                            } else {
                                                                playTick();
                                                                setSeatModal({...seatModal, selectedSeats: [...seatModal.selectedSeats, seatNumber]});
                                                            }
                                                        }}
                                                        className={`aspect-square max-h-12 sm:max-h-14 w-full rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold transition flex flex-col items-center justify-center relative
                                                            ${isMySeat 
                                                                ? 'bg-emerald-500/20 border-2 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)] scale-[1.02]' 
                                                                : isTaken 
                                                                    ? 'bg-surface-900/90 text-white/30 cursor-not-allowed border border-white/5' 
                                                                    : isSelected 
                                                                        ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)] scale-105 z-10 font-black' 
                                                                        : 'bg-surface-800 border border-white/5 text-white/80 hover:bg-surface-700 active:scale-95'}`}
                                                    >
                                                        <span>{seatNumber.toString().padStart(2, '0')}</span>
                                                        {isMySeat && (
                                                            <span className="text-[7.5px] font-black text-emerald-400 tracking-tight leading-none mt-0.5">
                                                                {t('youLabel')}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Room Sub-Tabs: Players & Results Switcher */}
                                        <div className="flex items-center gap-1.5 p-1 bg-surface-900/90 border border-white/10 rounded-xl sm:rounded-2xl mt-3 mb-2 shadow-inner">
                                            <button
                                                type="button"
                                                onClick={() => setRoomSubTab('players')}
                                                className={`flex-1 py-1.5 sm:py-2 px-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                                                    roomSubTab === 'players'
                                                        ? 'bg-gradient-to-r from-gold-500 to-amber-500 text-black shadow-md font-black'
                                                        : 'text-white/60 hover:text-white hover:bg-white/5'
                                                }`}
                                            >
                                                <span>👥</span>
                                                <span>{t('playersTab')}</span>
                                                <span className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-bold ${
                                                    roomSubTab === 'players' ? 'bg-black/20 text-black' : 'bg-white/10 text-white/70'
                                                }`}>
                                                    {(activeRoom.seats || []).length}/{activeRoom.groupSize}
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setRoomSubTab('results')}
                                                className={`flex-1 py-1.5 sm:py-2 px-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                                                    roomSubTab === 'results'
                                                        ? 'bg-gradient-to-r from-gold-500 to-amber-500 text-black shadow-md font-black'
                                                        : 'text-white/60 hover:text-white hover:bg-white/5'
                                                }`}
                                            >
                                                <span>🏆</span>
                                                <span>{t('resultsTab')}</span>
                                                <span className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-bold ${
                                                    roomSubTab === 'results' ? 'bg-black/20 text-black' : 'bg-white/10 text-white/70'
                                                }`}>
                                                    {results.length}
                                                </span>
                                            </button>
                                        </div>

                                        {/* Sub-Tab 1: Players in Room */}
                                        {roomSubTab === 'players' && (() => {
                                            const playerGroupMap = new Map();
                                            (activeRoom.seats || []).forEach(s => {
                                                const key = s.userId || s.username || 'unknown';
                                                if (!playerGroupMap.has(key)) {
                                                    playerGroupMap.set(key, {
                                                        userId: s.userId,
                                                        username: s.username || t('playersTab'),
                                                        seats: [s.seatNumber]
                                                    });
                                                } else {
                                                    playerGroupMap.get(key).seats.push(s.seatNumber);
                                                }
                                            });
                                            const playerGroups = Array.from(playerGroupMap.values());

                                            return (
                                                <div className="space-y-2 mt-1">
                                                    <div className="flex items-center justify-between px-1 text-[11px] text-white/50 font-medium">
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                                            <span>{t('activePlayersRoom')}</span>
                                                        </span>
                                                        <span>
                                                            {playerGroups.length} {t('participants')} · {(activeRoom.seats || []).length}/{activeRoom.groupSize} {t('seatsLabel')}
                                                        </span>
                                                    </div>

                                                    {playerGroups.length === 0 ? (
                                                        <div className="rounded-xl border border-dashed border-white/15 bg-surface-900/40 p-4 text-center">
                                                            <div className="w-10 h-10 rounded-full bg-gold-500/10 text-gold-400 flex items-center justify-center mx-auto mb-2 text-base">
                                                                🎲
                                                            </div>
                                                            <p className="text-xs font-bold text-white/80">
                                                                {t('noPlayersYet')}
                                                            </p>
                                                            <p className="text-[10px] text-white/40 mt-1">
                                                                {t('beFirst')}
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-1.5">
                                                            {playerGroups.map((p, idx) => {
                                                                const isMe = Boolean(user && user.id && p.userId === user.id);
                                                                const totalPaid = p.seats.length * activeRoom.ticketPrice;
                                                                return (
                                                                    <div 
                                                                        key={p.userId || idx} 
                                                                        className={`flex items-center justify-between gap-2.5 p-2.5 rounded-xl border transition ${
                                                                            isMe 
                                                                                ? 'bg-gradient-to-r from-emerald-950/40 via-surface-900 to-surface-900 border-emerald-500/40 shadow-sm' 
                                                                                : 'bg-surface-900/60 border-white/5 hover:border-white/10'
                                                                        }`}
                                                                    >
                                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                                                                isMe 
                                                                                    ? 'bg-emerald-500 text-black shadow-md' 
                                                                                    : 'bg-gradient-to-br from-gold-500/20 to-amber-500/10 border border-gold-500/30 text-gold-400'
                                                                            }`}>
                                                                                {(p.username || 'P')[0].toUpperCase()}
                                                                            </div>
                                                                            <div className="min-w-0">
                                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                                    <span className="text-xs font-bold text-white truncate max-w-[120px] sm:max-w-[160px]">
                                                                                        {p.username}
                                                                                    </span>
                                                                                    {isMe && (
                                                                                        <span className="text-[9px] font-black px-1.5 py-0.2 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                                                                            {language === 'am' ? 'እርስዎ' : 'YOU'}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <div className="text-[10px] text-white/40 mt-0.5">
                                                                                    {p.seats.length} {p.seats.length > 1 ? t('numbersPlural') : t('numberSingle')}
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex flex-col items-end shrink-0 gap-1">
                                                                            <div className="flex flex-wrap items-center justify-end gap-1">
                                                                                {p.seats.sort((a,b)=>a-b).map(num => (
                                                                                    <span 
                                                                                        key={num} 
                                                                                        className={`text-[10.5px] font-mono font-black px-1.5 py-0.5 rounded-md border ${
                                                                                            isMe 
                                                                                                ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300' 
                                                                                                : 'bg-gold-500/10 border-gold-500/20 text-gold-400'
                                                                                        }`}
                                                                                    >
                                                                                        #{num.toString().padStart(2, '0')}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                            <span className="text-[9.5px] font-medium text-white/50">
                                                                                {totalPaid % 1 === 0 ? totalPaid.toLocaleString() : totalPaid.toFixed(2)} {t('birLabel')}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {/* Sub-Tab 2: Results & Past Winners */}
                                        {roomSubTab === 'results' && (
                                            <div className="space-y-2 mt-1">
                                                <div className="flex items-center justify-between px-1 text-[11px] text-white/50 font-medium">
                                                    <span className="flex items-center gap-1.5">
                                                        <span>🏆</span>
                                                        <span>{language === 'am' ? 'የቅርብ ጊዜ አሸናፊዎች' : 'Recent Settled Games'}</span>
                                                    </span>
                                                    <span className="text-gold-400 font-mono text-[10px]">
                                                        {language === 'am' ? 'ክሪፕቶ ዕጣ የተረጋገጠ' : 'Provably Fair'}
                                                    </span>
                                                </div>

                                                {results.length === 0 ? (
                                                    <div className="rounded-xl border border-dashed border-white/15 bg-surface-900/40 p-4 text-center">
                                                        <div className="w-10 h-10 rounded-full bg-gold-500/10 text-gold-400 flex items-center justify-center mx-auto mb-2 text-base">
                                                            🏆
                                                        </div>
                                                        <p className="text-xs font-bold text-white/80">
                                                            {language === 'am' ? 'እስካሁን የወጣ ዕጣ ውጤት የለም' : 'No settled results recorded yet'}
                                                        </p>
                                                        <p className="text-[10px] text-white/40 mt-1">
                                                            {language === 'am' ? 'ይህ ጨዋታ ሲጠናቀቅ አሸናፊው እዚህ ይዘረዘራል!' : 'When games settle, winning tickets appear here!'}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
                                                        {results.slice(0, 10).map((res, idx) => {
                                                            const isWinnerMe = Boolean(user && res.winner_username && user.displayName && res.winner_username.toLowerCase() === user.displayName.toLowerCase());
                                                            const payoutFormatted = res.amount ? Math.round(res.amount).toLocaleString() : '—';
                                                            return (
                                                                <div 
                                                                    key={res.id || idx}
                                                                    className={`flex items-center justify-between gap-2.5 p-2.5 rounded-xl border transition ${
                                                                        isWinnerMe 
                                                                            ? 'bg-gradient-to-r from-gold-950/40 via-surface-900 to-surface-900 border-gold-500/40 shadow-sm'
                                                                            : 'bg-surface-900/60 border-white/5 hover:border-white/10'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-gold-600 text-black flex items-center justify-center font-black text-xs font-mono shadow-md shrink-0">
                                                                            #{res.seat_number ? res.seat_number.toString().padStart(2, '0') : '★'}
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                                <span className="text-xs font-bold text-white truncate max-w-[120px] sm:max-w-[160px]">
                                                                                    {res.winner_username || 'Winner'}
                                                                                </span>
                                                                                {isWinnerMe && (
                                                                                    <span className="text-[9px] font-black px-1.5 py-0.2 rounded-md bg-gold-500/20 text-gold-400 border border-gold-500/40">
                                                                                        {language === 'am' ? 'እርስዎ አሸንፈዋል!' : 'YOU WON!'}
                                                                                    </span>
                                                                                )}
                                                                                <span className="text-white/30 text-[10px]">•</span>
                                                                                <span className="capitalize text-[10px] text-white/50">{res.tier || 'Standard'}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex flex-col items-end shrink-0">
                                                                        <span className="text-xs font-black text-emerald-400 font-mono">
                                                                            +{payoutFormatted} {t('birLabel')}
                                                                        </span>
                                                                        <span className="text-[9px] text-white/30 mt-0.5">
                                                                            {res.settled_at ? new Date(res.settled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Settled'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-[calc(1rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-surface-950 via-surface-950/95 to-transparent z-40 pointer-events-none">
                                        <button 
                                            onClick={buySeat}
                                            disabled={seatModal.selectedSeats.length === 0 || (activeRoom.filledSeats || 0) >= activeRoom.groupSize}
                                            className={`pointer-events-auto w-full max-w-md mx-auto block py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black text-xs sm:text-[15px] transition ${seatModal.selectedSeats.length > 0 && (activeRoom.filledSeats || 0) < activeRoom.groupSize ? 'bg-gradient-to-b from-gold-300 to-gold-600 text-black shadow-[0_0_20px_rgba(234,161,27,0.3)] active:scale-98' : 'bg-surface-800 text-white/30 cursor-not-allowed border border-white/10'}`}
                                        >
                                            {(activeRoom.filledSeats || 0) >= activeRoom.groupSize 
                                                ? t('limitReached') 
                                                : seatModal.selectedSeats.length > 0 
                                                    ? `${t('betLabel')} ${formattedBet} ${t('birLabel')} (${seatModal.selectedSeats.length} ${seatModal.selectedSeats.length > 1 ? t('numbersPlural') : t('numberSingle')})` 
                                                    : t('selectThenBet')}
                                        </button>
                                    </div>
                                </>
                            );
                        })()}
                        
                        <div className="h-28 sm:h-32"></div>
                    </div>
                ) : (
                    <>
                        {activeTab === 'home' && (
                    <div className="space-y-6 lg:space-y-8">
                        <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
                            <div className="hidden lg:block lg:col-span-4 rounded-3xl overflow-hidden shadow-2xl border border-white/10 relative group">
                                <div className="absolute inset-0 bg-gradient-to-t from-surface-950/90 via-transparent to-transparent pointer-events-none z-10"></div>
                                <img src="/hero.png" alt="Hero Graphic" className="hero-pan absolute inset-0 w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-110" />
                            </div>
                            <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0e1a16] via-[#0a1210] to-[#0c1412] p-5 sm:p-7 lg:col-span-5 lg:p-10">
                                <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-equb-500/20 blur-3xl"></div>
                                <div className="pointer-events-none absolute -bottom-10 left-4 h-32 w-32 rounded-full bg-gold-500/15 blur-3xl"></div>
                                <div className="relative flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-equb-500/30 bg-equb-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-equb-300">
                                            <img src="/logo.png" alt="Logo" className="h-3 w-auto object-contain" />
                                            {t('subtitle')}
                                        </div>
                                        <h1 className="keno-title text-3xl leading-tight lg:text-4xl">{t('title')}</h1>
                                        <p className="mt-2 max-w-md text-sm leading-relaxed text-white/50 lg:text-base">{t('slogan')}</p>
                                    </div>
                                </div>
                                <p className="relative mt-5 max-w-xl text-sm leading-relaxed text-white/65 lg:text-base">{t('desc')}</p>
                                <div className="relative mt-6 max-w-md">
                                    <div className="rounded-3xl border border-equb-800/50 bg-black/35 p-4 sm:p-5">
                                        {user ? (
                                            <div>
                                                <h2 className="mb-3 text-sm font-bold text-equb-200">{t('welcome')}</h2>
                                                <p className="text-white/60 text-sm mb-4">You are logged in as {user.name}.</p>
                                                <button onClick={() => setActiveTab('rooms')} className="btn-gold w-full py-3.5 text-sm">{t('goToRooms')}</button>
                                            </div>
                                        ) : (
                                            <div>
                                                <h2 className="mb-3 text-sm font-bold text-equb-200">{isForgotPassword ? t('resetPass') : t('loginOrReg')}</h2>
                                                <div className="space-y-4">
                                                    {!isForgotPassword && (
                                                        <div className="flex gap-1 rounded-2xl border border-white/10 bg-black/30 p-1">
                                                            <button type="button" onClick={() => setIsLogin(true)} className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${isLogin ? 'bg-equb-600 text-white shadow' : 'text-white/45 hover:text-white/70'}`}>{t('login')}</button>
                                                            <button type="button" onClick={() => setIsLogin(false)} className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${!isLogin ? 'bg-equb-600 text-white shadow' : 'text-white/45 hover:text-white/70'}`}>{t('register')}</button>
                                                        </div>
                                                    )}
                                                    
                                                    {isForgotPassword ? (
                                                        resetStep === 1 ? (
                                                            <form className="space-y-3" onSubmit={handleForgotPasswordRequest}>
                                                                <input type="text" placeholder={t('phone')} required value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-equb-500/50 focus:outline-none focus:ring-1 focus:ring-equb-500/50 transition" />
                                                                <div className="rounded-xl border border-equb-500/20 bg-equb-500/5 p-3 space-y-2">
                                                                    <p className="text-[11px] font-bold text-equb-300 flex items-center gap-1.5">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                                                                        {language === 'am' ? 'እንዴት እንደሚሰራ' : 'How it works'}
                                                                    </p>
                                                                    <ol className="space-y-1.5 text-[10px] text-white/60 leading-relaxed">
                                                                        <li className="flex gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-equb-500/30 text-[9px] font-bold text-equb-300">1</span><span>{language === 'am' ? 'በመመዝገብ ጊዜ የተጠቀሙበትን ስልክ ቁጥር ያስገቡ' : 'Enter the phone number you used during registration'}</span></li>
                                                                        <li className="flex gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-equb-500/30 text-[9px] font-bold text-equb-300">2</span><span>{language === 'am' ? 'የማረጋገጫ ኮድ ወደ ቴሌግራም መለያዎ @fasterekub_bot ይላካል' : 'A verification code will be sent to your Telegram via @fasterekub_bot'}</span></li>
                                                                        <li className="flex gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-equb-500/30 text-[9px] font-bold text-equb-300">3</span><span>{language === 'am' ? 'ኮዱን ያስገቡና አዲስ የይለፍ ቃል ያስቀምጡ' : 'Enter the code and set your new password'}</span></li>
                                                                    </ol>
                                                                    <p className="text-[10px] text-white/50 mt-2">
                                                                        {language === 'am' ? '⚠️ የቴሌግራም መለያ ካልተገናኘ እንደገና ይመዝገቡ' : '⚠️ If no Telegram linked, please re-register with Telegram ID'}
                                                                    </p>
                                                                </div>
                                                                <button type="submit" className="btn-gold w-full py-3.5 text-sm mt-2">{t('sendCode')}</button>
                                                                <button type="button" onClick={() => { setIsForgotPassword(false); setResetStep(1); }} className="w-full text-center text-xs text-white/50 hover:text-white/80 transition">{t('backToLogin')}</button>
                                                            </form>
                                                        ) : (
                                                            <form className="space-y-3" onSubmit={handlePasswordReset}>
                                                                <input type="text" placeholder={t('verificationCode')} required value={resetCode} onChange={e => setResetCode(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-equb-500/50 focus:outline-none focus:ring-1 focus:ring-equb-500/50 transition" />
                                                                <input type="password" placeholder={t('newPassword')} required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-equb-500/50 focus:outline-none focus:ring-1 focus:ring-equb-500/50 transition" />
                                                                <input type="password" placeholder={t('confirmPass')} required value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-equb-500/50 focus:outline-none focus:ring-1 focus:ring-equb-500/50 transition" />
                                                                <button type="submit" className="btn-gold w-full py-3.5 text-sm mt-2">{t('resetPassword')}</button>
                                                                <button type="button" onClick={() => { setIsForgotPassword(false); setResetStep(1); }} className="w-full text-center text-xs text-white/50 hover:text-white/80 transition">{t('backToLogin')}</button>
                                                            </form>
                                                        )
                                                    ) : (
                                                        <form className="space-y-3" onSubmit={handleAuth}>
                                                            {!isLogin && (
                                                                <input type="text" placeholder={t('fullName')} required value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-equb-500/50 focus:outline-none focus:ring-1 focus:ring-equb-500/50 transition" />
                                                            )}
                                                            <input type="text" placeholder={t('phone')} required value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-equb-500/50 focus:outline-none focus:ring-1 focus:ring-equb-500/50 transition" />
                                                            <input type="password" placeholder={t('pass')} required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-equb-500/50 focus:outline-none focus:ring-1 focus:ring-equb-500/50 transition" />
                                                            {!isLogin && (
                                                                <>
                                                                    <input type="password" placeholder={t('confirmPass')} required value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-equb-500/50 focus:outline-none focus:ring-1 focus:ring-equb-500/50 transition" />
                                                                    {/* Telegram ID field with how-it-works info */}
                                                                    <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-3 space-y-2.5">
                                                                        {/* Header */}
                                                                        <p className="text-[11px] font-bold text-blue-300 flex items-center gap-1.5">
                                                                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                                                                            {language === 'am' ? 'ቴሌግራም መለያ (ለይለፍ ቃል መልሶ ማግኛ)' : 'Telegram ID (for password recovery)'}
                                                                        </p>
                                                                        {/* Input */}
                                                                        <input
                                                                            type="text"
                                                                            placeholder={language === 'am' ? 'ቴሌግራም ID (ቁጥር ብቻ)' : 'Telegram ID (numbers only)'}
                                                                            value={formData.telegramId}
                                                                            onChange={e => setFormData({...formData, telegramId: e.target.value})}
                                                                            className="w-full rounded-xl border border-blue-500/20 bg-black/40 px-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-blue-400/50 focus:outline-none focus:ring-1 focus:ring-blue-400/40 transition"
                                                                        />

                                                                        {/* Warning + userinfobot link */}
                                                                        <div className="rounded-lg bg-amber-500/8 border border-amber-500/20 px-2.5 py-2 flex flex-col gap-1.5">
                                                                            <p className="text-[10px] text-amber-300/80 flex items-start gap-1.5">
                                                                                <span className="shrink-0 mt-0.5">⚠️</span>
                                                                                <span>{language === 'am' ? 'ቴሌግራም ID ካልሞሉ፣ የይለፍ ቃል ሲረሱ ማስመለስ አይቻልም!' : 'Without a Telegram ID, password recovery will not work!'}</span>
                                                                            </p>
                                                                            <a
                                                                                href="https://t.me/userinfobot"
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="inline-flex items-center gap-1.5 self-start rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 px-2.5 py-1 text-[10px] font-bold text-blue-300 hover:text-blue-200 transition"
                                                                            >
                                                                                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                                                                                {language === 'am' ? '@userinfobot ን ክፈቱ — ID ይሰጥዎታል' : 'Open @userinfobot — it gives you your ID'}
                                                                            </a>
                                                                        </div>
                                                                    </div>
                                                                </>
                                                            )}
                                                            {isLogin && (
                                                                <button type="button" onClick={() => setIsForgotPassword(true)} className="w-full text-right text-xs text-equb-400 hover:text-equb-300 transition">{t('forgotPass')}</button>
                                                            )}
                                                            <button type="submit" className="btn-gold w-full py-3.5 text-sm mt-2">{isLogin ? t('loginBtn') : t('regBtn')}</button>
                                                        </form>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </section>
                            <div className="space-y-4 lg:col-span-3 lg:space-y-5">
                                <div className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-3">
                                      {/* Active Players */}
                                      <div className="glass flex flex-col items-center justify-center rounded-2xl px-3 py-3.5 text-center lg:flex-row lg:justify-start lg:gap-4 lg:px-4 lg:text-left border border-white/5 hover:bg-white/5 transition-colors">
                                          <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center mb-1.5 lg:mb-0 shrink-0">
                                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                          </div>
                                          <div>
                                              <p className="text-sm font-black text-yellow-400 lg:text-lg">8,402</p>
                                              <p className="text-[9px] font-bold text-purple-300 uppercase tracking-widest sm:text-[10px] lg:text-[10px] mt-0.5">Active Players</p>
                                          </div>
                                      </div>
                                      
                                      {/* Game Played */}
                                      <div className="glass flex flex-col items-center justify-center rounded-2xl px-3 py-3.5 text-center lg:flex-row lg:justify-start lg:gap-4 lg:px-4 lg:text-left border border-white/5 hover:bg-white/5 transition-colors">
                                          <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center mb-1.5 lg:mb-0 shrink-0">
                                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400"><rect width="20" height="12" x="2" y="6" rx="2"/><path d="M12 12h.01"/><path d="M17 12h.01"/><path d="M7 12h.01"/></svg>
                                          </div>
                                          <div>
                                              <p className="text-sm font-black text-yellow-400 lg:text-lg">150K+</p>
                                              <p className="text-[9px] font-bold text-purple-300 uppercase tracking-widest sm:text-[10px] lg:text-[10px] mt-0.5">Games Played</p>
                                          </div>
                                      </div>
                                      
                                      {/* Winner Daily */}
                                      <div className="glass flex flex-col items-center justify-center rounded-2xl px-3 py-3.5 text-center lg:flex-row lg:justify-start lg:gap-4 lg:px-4 lg:text-left border border-white/5 hover:bg-white/5 transition-colors">
                                          <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center mb-1.5 lg:mb-0 shrink-0">
                                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
                                          </div>
                                          <div>
                                              <p className="text-sm font-black text-yellow-400 lg:text-lg">240</p>
                                              <p className="text-[9px] font-bold text-purple-300 uppercase tracking-widest sm:text-[10px] lg:text-[10px] mt-0.5">Winners Daily</p>
                                          </div>
                                      </div>
                                  </div>
                                  <div className="glass-strong rounded-2xl p-4 sm:p-5 lg:p-6">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold-400/90">{t('rulesLabel')}</p>
                                    <ol className="mt-3 space-y-2.5 text-xs leading-relaxed text-white/60 sm:text-sm">
                                        <li className="flex gap-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-equb-500/20 text-[10px] font-bold text-equb-300">1</span><span>{t('rule1')}</span></li>
                                        <li className="flex gap-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-equb-500/20 text-[10px] font-bold text-equb-300">2</span><span>{t('rule2')}</span></li>
                                        <li className="flex gap-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-equb-500/20 text-[10px] font-bold text-equb-300">3</span><span>{t('rule3')}</span></li>
                                        <li className="flex gap-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-equb-500/20 text-[10px] font-bold text-equb-300">4</span><span>{t('rule4')}</span></li>
                                    </ol>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'rooms' && (
                    <div className="space-y-5 lg:space-y-6">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h1 className="text-xl font-black tracking-tight text-gold-400 drop-shadow-[0_0_8px_rgba(234,161,27,0.4)] sm:text-2xl lg:text-3xl">{t('title')}</h1>
                                <p className="mt-1 text-xs text-white/45 sm:text-sm">{t('roomSubtitle')}</p>
                            </div>
                        </div>
                          <div className="grid grid-cols-12 gap-2 sm:gap-4 lg:gap-8 items-start">
                            <div className={`space-y-3 sm:space-y-4 min-w-0 ${wizardStep === 2 ? 'col-span-12 sm:col-span-8 sm:mx-auto sm:w-full' : 'col-span-6 sm:col-span-7'}`}>
                                {/* ── PRIZE ENTRY & PLAYER DIVISION WIZARD ── */}

                                {/* Step Indicator */}
                                <div className="flex items-center gap-1.5 sm:gap-3 px-0.5">
                                    <div 
                                        onClick={() => setWizardStep(1)}
                                        className={`flex items-center gap-1 sm:gap-2 cursor-pointer transition ${wizardStep >= 1 ? 'opacity-100' : 'opacity-40'}`}
                                    >
                                        <span className={`flex h-5 w-5 sm:h-7 sm:w-7 items-center justify-center rounded-full text-[10px] sm:text-xs font-black transition ${wizardStep === 1 ? 'bg-gold-500 text-black shadow-lg shadow-gold-500/40' : wizardStep > 1 ? 'bg-equb-500 text-white' : 'bg-white/10 text-white/50'}`}>
                                            {wizardStep > 1 ? '✓' : '1'}
                                        </span>
                                        <span className={`text-[11px] sm:text-xs font-bold truncate ${wizardStep === 1 ? 'text-gold-400' : wizardStep > 1 ? 'text-equb-400' : 'text-white/40'}`}>
                                            {t('prizeEntry')}
                                        </span>
                                    </div>
                                    <div className={`flex-1 h-px ${wizardStep > 1 ? 'bg-equb-500/60' : 'bg-white/10'} transition-colors duration-300`}></div>
                                    <div className={`flex items-center gap-1 sm:gap-2 ${wizardStep >= 2 ? 'opacity-100' : 'opacity-40'}`}>
                                        <span className={`flex h-5 w-5 sm:h-7 sm:w-7 items-center justify-center rounded-full text-[10px] sm:text-xs font-black transition ${wizardStep === 2 ? 'bg-gold-500 text-black shadow-lg shadow-gold-500/40' : 'bg-white/10 text-white/50'}`}>
                                            2
                                        </span>
                                        <span className={`text-[11px] sm:text-xs font-bold truncate ${wizardStep === 2 ? 'text-gold-400' : 'text-white/40'}`}>
                                            {t('playersJoinLabel')}
                                        </span>
                                    </div>
                                </div>

                                {/* ── STEP 1: Choose Prize Entry ── */}
                                {wizardStep === 1 && (
                                    <section className="glass rounded-xl sm:rounded-2xl p-2.5 sm:p-5">
                                        <div className="mb-2 sm:mb-3.5">
                                            <h2 className="text-xs sm:text-base font-extrabold text-white tracking-tight flex items-center gap-1">
                                                <span>🏆</span>
                                                <span>{t('choosePrizeTitle')}</span>
                                            </h2>
                                            <p className="text-[10px] sm:text-[11px] text-white/45 mt-0.5">
                                                {t('choosePrizeDesc')}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-1.5 sm:gap-2.5">
                                            {[500, 1000, 2000, 5000, 10000, 20000, 50000].map(amt => (
                                                <button
                                                    key={amt}
                                                    type="button"
                                                    onClick={() => {
                                                        setWizard({...wizard, jackpot: amt});
                                                        setWizardStep(2);
                                                    }}
                                                    className={`relative flex flex-col items-center justify-center p-2 sm:p-3.5 rounded-lg sm:rounded-xl border transition-all active:scale-95 ${
                                                        wizard.jackpot === amt
                                                            ? 'border-gold-500 bg-gradient-to-b from-gold-500/20 to-gold-600/10 text-gold-300 shadow-md shadow-gold-500/20 ring-1 ring-gold-400/50'
                                                            : 'border-white/10 bg-white/[0.04] text-white/70 hover:border-white/20 hover:bg-white/[0.08]'
                                                    }`}
                                                >
                                                    {wizard.jackpot === amt && (
                                                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-gold-400 shadow-[0_0_6px_#fbbf24]"></span>
                                                    )}
                                                    <span className="text-xs sm:text-lg font-black tracking-tight">
                                                        {amt >= 1000 
                                                            ? (language === 'am' ? `${(amt / 1000).toLocaleString()} ሺህ` : `${(amt / 1000).toLocaleString()}K`) 
                                                            : amt.toLocaleString()}
                                                    </span>
                                                    <span className="text-[9px] sm:text-[10px] font-bold text-current opacity-70 mt-0.5">
                                                        {t('birLabel')}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>

                                        <div className="mt-3 sm:mt-4 p-2 sm:p-3 rounded-lg sm:rounded-xl border border-gold-500/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2" style={{background:'rgba(251,191,36,0.05)'}}>
                                            <div>
                                                <p className="text-[9px] sm:text-[10px] uppercase tracking-widest text-gold-400/70 font-bold">{t('selectedPrize')}</p>
                                                <p className="text-sm sm:text-xl font-black text-gold-400 mt-0.5">{wizard.jackpot.toLocaleString()} {t('birLabel')}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setWizardStep(2)}
                                                className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl bg-gradient-to-r from-gold-400 to-gold-500 text-black font-black text-xs sm:text-sm transition active:scale-95 hover:shadow-lg hover:shadow-gold-500/30 flex items-center justify-center gap-1.5"
                                            >
                                                <span>{t('continueBtn')}</span>
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                                            </button>
                                        </div>
                                    </section>
                                )}

                                {/* ── STEP 2: Choose Players & Join ── */}
                                {wizardStep === 2 && (() => {
                                    const PLAYER_SIZES = [80, 50, 40, 20, 15, 10, 5];
                                    const pricePerPlayer = wizard.jackpot / wizard.groupSize;
                                    const matchingRoom = liveRealRooms.find(r => 
                                        r.groupSize === wizard.groupSize && 
                                        Math.round(r.targetJackpot) === Math.round(wizard.jackpot) && 
                                        (r.status === 'open' || r.status === 'drawing')
                                    );
                                    const filled = matchingRoom ? (matchingRoom.filledSeats || 0) : 0;
                                    const isFull = filled >= wizard.groupSize;
                                    return (
                                        <section className="glass rounded-xl sm:rounded-2xl p-2.5 sm:p-5">
                                            {/* Header with Title and Back Badge */}
                                            <div className="flex items-center justify-between gap-1.5 mb-2.5 sm:mb-3">
                                                <div>
                                                    <h2 className="text-xs sm:text-base font-extrabold text-white tracking-tight flex items-center gap-1">
                                                        <span>👥</span>
                                                        <span>{t('choosePlayersTitle')}</span>
                                                    </h2>
                                                    <p className="text-[9px] sm:text-[11px] text-white/45 mt-0.5 line-clamp-1 sm:line-clamp-none">
                                                        {t('choosePlayersDesc')}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setWizardStep(1)}
                                                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] sm:text-xs font-semibold text-white/70 hover:text-white transition shrink-0"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                                                    <span>{t('backBtn')}</span>
                                                    <span className="text-gold-400 font-bold ml-0.5 font-mono">{wizard.jackpot.toLocaleString()} {t('birLabel')}</span>
                                                </button>
                                            </div>

                                            {/* Player Size List Rows */}
                                             <div className="space-y-2">
                                                 {PLAYER_SIZES.map(size => {
                                                     const perPlayer = wizard.jackpot / size;
                                                     const isSelected = wizard.groupSize === size;
                                                     const hasOpenRoom = liveRealRooms.some(r =>
                                                         r.groupSize === size &&
                                                         Math.round(r.targetJackpot) === Math.round(wizard.jackpot) &&
                                                         (r.status === 'open' || r.status === 'drawing')
                                                     );
                                                     return (
                                                         <button
                                                             key={size}
                                                             type="button"
                                                             onClick={() => {
                                                                 const updatedWizard = {...wizard, groupSize: size, seatNumbers: [1]};
                                                                 setWizard(updatedWizard);
                                                                 const roomForSize = liveRealRooms.find(r =>
                                                                     r.groupSize === size &&
                                                                     Math.round(r.targetJackpot) === Math.round(wizard.jackpot) &&
                                                                     (r.status === 'open' || r.status === 'drawing')
                                                                 );
                                                                 if (roomForSize) {
                                                                     if (!user) { requireLogin(); return; }
                                                                     if (roomForSize.status === 'drawing') {
                                                                         setDrawModal({ open: true, room: roomForSize.id, roomNumber: roomForSize.roomNumber, result: null });
                                                                     } else {
                                                                         setSeatModal({ open: true, room: roomForSize, selectedSeats: [] });
                                                                     }
                                                                 }
                                                             }}
                                                             className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all active:scale-[0.99] text-left ${
                                                                 isSelected
                                                                     ? 'border-equb-400 bg-equb-500/10 ring-1 ring-equb-400/40 shadow-md shadow-equb-500/10'
                                                                     : 'border-white/8 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.07]'
                                                             }`}
                                                         >
                                                             {/* Left: player count */}
                                                             <div className="flex items-baseline gap-1.5 min-w-[80px]">
                                                                 <span className={`text-2xl font-black tracking-tight leading-none ${isSelected ? 'text-equb-300' : 'text-white'}`}>
                                                                     {size}
                                                                 </span>
                                                                 <span className="text-xs font-semibold text-white/50">
                                                                     {t('playersCountLabel')}
                                                                 </span>
                                                             </div>

                                                             {/* Center: entry price */}
                                                             <div className="flex items-baseline justify-center gap-1.5 flex-1 px-3">
                                                                 <span className="text-xs text-white/45 font-medium shrink-0">
                                                                     {t('entryBtnLabel')}
                                                                 </span>
                                                                 <span className={`text-base font-black font-mono ${isSelected ? 'text-gold-400' : 'text-gold-400/90'}`}>
                                                                     {perPlayer % 1 === 0 ? perPlayer.toLocaleString() : perPlayer.toFixed(2)}
                                                                 </span>
                                                                 <span className="text-xs font-semibold text-white/50">
                                                                     {t('birLabel')}
                                                                 </span>
                                                             </div>

                                                             {/* Right: status badge + chevron */}
                                                             <div className="flex items-center gap-2 shrink-0">
                                                                 <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                                     hasOpenRoom
                                                                         ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                                                                         : 'bg-white/5 text-white/30 border-white/10'
                                                                 }`}>
                                                                     <span className={`w-1.5 h-1.5 rounded-full ${hasOpenRoom ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />
                                                                     {hasOpenRoom ? (t('liveLabel')) : (t('waitLabel'))}
                                                                 </span>
                                                                 <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/30"><path d="m9 18 6-6-6-6"/></svg>
                                                             </div>
                                                         </button>
                                                     );
                                                 })}
                                             </div>
                                            {/* Summary Card */}
                                            <div className="mt-3 sm:mt-4 rounded-lg sm:rounded-xl bg-black/40 border border-white/10 overflow-hidden">
                                                <div className="grid grid-cols-3 divide-x divide-white/10 text-center py-2 bg-white/[0.02]">
                                                    <div className="px-1 sm:px-2">
                                                        <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-white/40 font-bold">{t('prizeCol')}</p>
                                                        <p className="text-[11px] sm:text-sm font-black text-gold-400 mt-0.5">
                                                            {wizard.jackpot.toLocaleString()} <span className="text-[8px] sm:text-[10px] font-normal text-gold-400/70">{t('birLabel')}</span>
                                                        </p>
                                                    </div>
                                                    <div className="px-1 sm:px-2">
                                                        <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-white/40 font-bold">{t('playersCountLabel')}</p>
                                                        <p className="text-[11px] sm:text-sm font-black text-white mt-0.5">
                                                            {wizard.groupSize} <span className="text-[8px] sm:text-[10px] font-normal text-white/40">{t('playersCountLabel')}</span>
                                                        </p>
                                                    </div>
                                                    <div className="px-1 sm:px-2">
                                                        <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-white/40 font-bold">{t('perPlayerCol')}</p>
                                                        <p className="text-[11px] sm:text-sm font-black text-equb-400 mt-0.5">
                                                            {pricePerPlayer % 1 === 0 ? pricePerPlayer.toLocaleString() : pricePerPlayer.toFixed(2)} <span className="text-[8px] sm:text-[10px] font-normal text-equb-400/70">{t('birLabel')}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                {matchingRoom ? (
                                                    <div 
                                                        onClick={() => {
                                                            if (!user) { requireLogin(); return; }
                                                            if (matchingRoom.status === 'drawing') {
                                                                setDrawModal({ open: true, room: matchingRoom.id, roomNumber: matchingRoom.roomNumber, result: null });
                                                                return;
                                                            }
                                                            setSeatModal({ open: true, room: matchingRoom, selectedSeats: [] });
                                                        }}
                                                        className="border-t border-white/10 px-2 sm:px-3.5 py-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-emerald-950/20 hover:bg-emerald-900/30 cursor-pointer transition group"
                                                    >
                                                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                                                                <span className="text-white font-bold truncate">
                                                                    {matchingRoom.gameId || t('gameNumLabel', matchingRoom.roomNumber)}
                                                                </span>
                                                                <span className="text-white/40">·</span>
                                                                <span className="text-white/70 font-medium truncate text-[9px] sm:text-[11px]">
                                                                    {language === 'am' ? `${filled} ተቀላቅለዋል` : `${filled} joined`}
                                                                </span>
                                                            </div>
                                                            <div className="w-full bg-white/10 rounded-full h-1 mt-1 overflow-hidden">
                                                                <div className="h-full rounded-full bg-gradient-to-r from-equb-500 to-gold-400 transition-all" style={{ width: `${Math.min(100, (filled / wizard.groupSize) * 100)}%` }} />
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0">
                                                            {matchingRoom.status === 'drawing' ? (
                                                                <span className="text-amber-400 font-mono text-[9px] font-semibold bg-amber-950/70 border border-amber-500/30 px-1 py-0.5 rounded animate-pulse">
                                                                    🎲 {t('drawing')}
                                                                </span>
                                                            ) : (
                                                                <span className="text-emerald-400 font-mono text-[9px] font-semibold bg-emerald-950/70 border border-emerald-500/30 px-1 py-0.5 rounded">
                                                                    {filled >= wizard.groupSize ? (language === 'am' ? 'ሙሉ' : 'Full') : `${wizard.groupSize - filled} ${t('remaining')}`}
                                                                </span>
                                                            )}
                                                            <button 
                                                                type="button"
                                                                className="px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-gradient-to-r from-gold-400 to-gold-500 hover:from-gold-300 hover:to-gold-400 text-black font-black text-[10px] sm:text-xs shadow-md shadow-gold-500/20 transition active:scale-95 flex items-center gap-1"
                                                            >
                                                                <span>🎮</span>
                                                                <span>{t('playBtn')}</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="border-t border-white/10 px-2 sm:px-3.5 py-2 flex items-center justify-between gap-2 bg-emerald-950/20">
                                                        <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-emerald-400">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                                            <span className="font-semibold">{t('loadingRoom')}</span>
                                                        </div>
                                                    </div>
                                                )}
                                                {isFull && (
                                                    <div className="px-2 py-1 text-center text-[10px] sm:text-xs font-bold border-t border-white/10 text-rose-400 bg-rose-500/10">
                                                        {t('roomFullLabel')}
                                                    </div>
                                                )}
                                            </div>
                                        </section>
                                    );
                                })()}
                            </div>

                            <div className={`col-span-6 sm:col-span-5 min-w-0 ${wizardStep === 2 ? 'hidden sm:block sm:col-span-4' : ''}`}>
                                <div className="lg:sticky lg:top-24 space-y-3 sm:space-y-4">
                                    {/* Main Box matching user screenshot */}
                                    <div className="rounded-xl sm:rounded-3xl border border-emerald-950/80 bg-[#06120d] p-2 sm:p-5 relative overflow-hidden shadow-2xl">
                                        {/* Repeating watermark pattern: FAST BINGO / ፈጣን ቢንጎ */}
                                        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.06] select-none" xmlns="http://www.w3.org/2000/svg">
                                            <defs>
                                                <pattern id="fastBingoWatermark" width="230" height="110" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)">
                                                    <text x="10" y="28" fill="#34d399" fontSize="13" fontWeight="900" letterSpacing="2">FAST BINGO</text>
                                                    <text x="110" y="80" fill="#34d399" fontSize="13" fontWeight="900" letterSpacing="1">ፈጣን ቢንጎ</text>
                                                </pattern>
                                            </defs>
                                            <rect width="100%" height="100%" fill="url(#fastBingoWatermark)" />
                                        </svg>

                                        {wizardStep === 1 && (
                                            <>
                                                {/* Filter toggle */}
                                                <div className="flex mb-2.5 sm:mb-4 relative z-10">
                                                    <div className="inline-flex rounded-lg sm:rounded-xl bg-black/60 p-0.5 sm:p-1 border border-white/10 text-[9.5px] sm:text-[10px]">
                                                        <button
                                                            type="button"
                                                            onClick={() => setRoomFilter('live')}
                                                            className={`px-2 py-0.5 sm:px-3 sm:py-1 rounded sm:rounded-lg font-bold transition flex items-center gap-1 ${roomFilter === 'live' ? 'bg-emerald-600 text-white shadow' : 'text-white/40 hover:text-white/70'}`}
                                                        >
                                                            <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                                            {t('liveFilter')} ({displayedLiveRooms.length})
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setRoomFilter('results')}
                                                            className={`px-2 py-0.5 sm:px-3 sm:py-1 rounded sm:rounded-lg font-bold transition ${roomFilter === 'results' ? 'bg-emerald-600 text-white shadow' : 'text-white/40 hover:text-white/70'}`}
                                                        >
                                                            {t('resultsFilter')}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Content */}
                                                {roomFilter === 'results' ? (
                                                    <div className="glass rounded-xl sm:rounded-2xl p-2.5 sm:p-5 border border-white/5 relative z-10">
                                                        <h3 className="text-xs sm:text-sm font-bold text-equb-400 mb-2 sm:mb-4">{t('recentResultsTitle')}</h3>
                                                        <div className="space-y-1.5 sm:space-y-2">
                                                            {results.length === 0 ? (
                                                                <div className="text-center text-xs text-white/35">{t('noResultsYetFilter')}</div>
                                                            ) : results.slice(0, 10).map((res, i) => (
                                                                <div key={`${res.id}-${i}`} className="flex justify-between items-center bg-[#151c1a] rounded-lg sm:rounded-xl px-2 py-1.5 sm:px-4 sm:py-3 border border-white/5">
                                                                    <span className="font-mono text-[10px] sm:text-xs font-bold text-gold-400 w-6 sm:w-8">
                                                                        #{res.seat_number ? res.seat_number.toString().padStart(2, '0') : '00'}
                                                                    </span>
                                                                    <span className="text-white/80 text-[10px] sm:text-xs font-medium truncate flex-1 text-center px-1">
                                                                        {res.winner_username}
                                                                    </span>
                                                                    <span className="font-mono text-[9px] sm:text-[11px] font-bold text-equb-400 whitespace-nowrap">
                                                                        {parseFloat(res.amount).toLocaleString()} {t('birLabel')}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : displayedLiveRooms.length === 0 ? (
                                                    <div className="rounded-xl sm:rounded-2xl p-3 sm:p-6 text-center text-xs sm:text-sm text-white/35 bg-black/30 border border-white/5 relative z-10">
                                                        {t('noActiveGames')}
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2 sm:space-y-3 max-h-[75vh] overflow-y-auto pr-0.5 sm:pr-1 no-scrollbar relative z-10">
                                                        {displayedLiveRooms.map(room => {
                                                            const filled = room.filledSeats || 0;
                                                            const total = room.groupSize || 10;
                                                            const isFull = filled >= total;
                                                            const percent = Math.min(100, Math.max(0, (filled / total) * 100));
                                                            const radius = 18;
                                                            const circ = 2 * Math.PI * radius;
                                                            const strokeDashoffset = circ - (percent / 100) * circ;
                                                            const isAm = language === 'am';
                                                            let subtitle = '';
                                                            if (room.status === 'drawing') subtitle = t('drawingLabel');
                                                            else if (isFull) subtitle = isAm ? `ሙሉ · ${total} ተጫዋቾች` : `Full · ${total}p`;
                                                            else if (filled > 0) subtitle = isAm ? `${filled} ተቀላቅለዋል` : `${filled} joined`;
                                                            else subtitle = isAm ? `ክፍት · እስከ ${total}` : `Open · up to ${total}`;
                                                            return (
                                                                <button
                                                                    key={room.id}
                                                                    onClick={() => {
                                                                        if (!user) { requireLogin(); return; }
                                                                        if (room.status === 'drawing') { setDrawModal({ open: true, room: room.id, roomNumber: room.roomNumber, result: null }); return; }
                                                                        setSeatModal({ open: true, room, selectedSeats: [] });
                                                                    }}
                                                                    disabled={isFull && room.status !== 'drawing'}
                                                                    className={`w-full text-left rounded-xl sm:rounded-2xl p-2 sm:p-4 flex items-center justify-between border transition group relative overflow-hidden ${
                                                                        ((room.status === 'open' && !isFull) || room.status === 'drawing')
                                                                            ? 'border-[#173a2a] bg-[#091712]/95 hover:border-emerald-500/60 hover:bg-[#0c221a] cursor-pointer hover:shadow-lg hover:shadow-emerald-500/10'
                                                                            : 'border-white/5 opacity-60 cursor-not-allowed bg-black/40'
                                                                    }`}
                                                                >
                                                                    <div className="flex flex-col gap-0.5 pr-1.5 sm:pr-3 min-w-0 flex-1">
                                                                        <h4 className="text-xs sm:text-base font-bold text-white tracking-tight flex items-center gap-1 flex-wrap leading-tight">
                                                                            <span>{total} {t('playersCountLabel')}</span>
                                                                            <span className="text-white/40">·</span>
                                                                            <span>{room.targetJackpot ? Number(room.targetJackpot).toLocaleString() : '500'} {t('birLabel')}</span>
                                                                        </h4>
                                                                        <div className="text-emerald-400 font-mono text-[9.5px] sm:text-xs font-semibold">
                                                                            ({room.ticketPrice % 1 === 0 ? Number(room.ticketPrice).toLocaleString() : Number(room.ticketPrice).toFixed(2)} {t('birLabel')})
                                                                        </div>
                                                                        <div className="text-[8.5px] sm:text-xs text-white/45 font-normal flex items-center gap-1 flex-wrap mt-0.5">
                                                                            <span className="truncate">{subtitle}</span>
                                                                            {room.status === 'drawing' ? (
                                                                                <span className="text-amber-400 font-mono text-[8.5px] sm:text-[11px] font-semibold bg-amber-950/70 border border-amber-500/30 px-1 py-0.5 rounded animate-pulse">
                                                                                    🎲 {t('drawing')}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-emerald-400 font-mono text-[8.5px] sm:text-[11px] font-semibold bg-emerald-950/70 border border-emerald-500/30 px-1 py-0.5 rounded">
                                                                                    {filled >= total ? (isAm ? 'ሙሉ' : 'Full') : `${total - filled} ${t('remaining')}`}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex flex-col items-center justify-center shrink-0">
                                                                        <div className="relative w-8 h-8 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-[#0d1e16] border border-[#1a382b] shadow-inner">
                                                                            <svg className="w-8 h-8 sm:w-12 sm:h-12 -rotate-90" viewBox="0 0 44 44">
                                                                                <circle cx="22" cy="22" r={radius} className="stroke-[#163124]" strokeWidth="2.5" fill="none" />
                                                                                <circle cx="22" cy="22" r={radius} className="stroke-emerald-400 transition-all duration-500" strokeWidth="2.5" strokeDasharray={circ} strokeDashoffset={strokeDashoffset} strokeLinecap="round" fill="none" />
                                                                            </svg>
                                                                            <div className={`absolute top-0.5 sm:top-1 w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full ${percent > 0 ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-emerald-400/50'}`} />
                                                                            <span className="absolute text-[8px] sm:text-[11px] font-bold font-mono text-white tracking-tighter">{filled}/{total}</span>
                                                                        </div>
                                                                        <span className="text-[8px] sm:text-xs font-bold font-mono text-emerald-400 mt-0.5 sm:mt-1">{filled}/{total}</span>
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'wallet' && (
                    <div className="space-y-4 max-w-lg mx-auto animate-fade-in pb-24">
                        <div className="glass-strong p-4 sm:p-5 rounded-2xl border border-white/10 shadow-xl">
                            <p className="text-white/50 text-[11px] uppercase tracking-wider font-semibold mb-0.5 text-center">{t('balance')}</p>
                            <h1 className="text-2xl sm:text-3xl font-black text-emerald-400 mb-4 text-center tracking-tight">{user ? user.balance.toLocaleString() : 0} ETB</h1>
                            
                            {/* Top Tabs */}
                            <div className="flex bg-black/40 rounded-xl p-1 mb-4 border border-white/5">
                                <button 
                                    onClick={() => setWalletTabState(prev => ({...prev, active: 'deposit'}))}
                                    className={`flex-1 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${walletTabState.active === 'deposit' ? 'bg-gold-500 text-black shadow-md' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                                    {t('depositLabel')}
                                </button>
                                <button 
                                    onClick={() => setWalletTabState(prev => ({...prev, active: 'withdraw'}))}
                                    className={`flex-1 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${walletTabState.active === 'withdraw' ? 'bg-gold-500 text-black shadow-md' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                                    {t('withdrawLabel')}
                                </button>
                                <button 
                                    onClick={() => setWalletTabState(prev => ({...prev, active: 'history'}))}
                                    className={`flex-1 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${walletTabState.active === 'history' ? 'bg-gold-500 text-black shadow-md' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    {t('historyLabel')}
                                </button>
                            </div>

                            {/* Content based on tab */}
                            {walletTabState.active === 'deposit' && (
                                <div className="space-y-3.5">

                                    {/* Instructions Card */}
                                    <div className="bg-[#181308] border border-gold-500/25 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl relative overflow-hidden">
                                        <h4 className="text-gold-400 text-[11px] font-bold uppercase tracking-wider mb-2">{t('sendPaymentTo')}</h4>
                                        <div className="flex items-center justify-between mb-3 bg-black/40 border border-gold-500/15 rounded-xl px-3 py-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <svg className="text-gold-400 shrink-0" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                                <span className="text-lg sm:text-xl font-black font-mono text-white tracking-wider truncate">{systemConfig.telebirrPhone}</span>
                                            </div>
                                            <button 
                                                onClick={() => { 
                                                    navigator.clipboard.writeText(systemConfig.telebirrPhone); 
                                                    showToast(t('telebirrPhoneCopied')); 
                                                }}
                                                className="bg-gold-500 hover:bg-gold-400 text-black px-2.5 py-1.5 rounded-lg text-xs font-bold transition active:scale-95 shrink-0 flex items-center gap-1 shadow-sm"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                                <span>{t('copyLabel')}</span>
                                            </button>
                                        </div>
                                        <div className="bg-black/40 rounded-xl p-2.5 sm:p-3 flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-1.5 text-white/50">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                                <span>{t('nameLabel')}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-gold-400 font-bold">
                                                {systemConfig.telebirrName}
                                            </div>
                                        </div>
                                        <p className="text-white/40 text-[10px] sm:text-xs mt-2.5">{t('sendViaTelebirr')}</p>
                                    </div>

                                    {/* Transaction number only Card */}
                                    <div className="bg-[#181308] border border-gold-500/25 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl">
                                        <h4 className="text-white text-xs sm:text-sm font-bold mb-0.5">{t('transactionNumberOnly')}</h4>
                                        <p className="text-white/50 text-[10px] sm:text-xs mb-3">{t('transactionNumberDesc')}</p>
                                        <form onSubmit={(e) => executeInlineWalletAction(e, 'deposit')}>
                                            <input 
                                                type="text" 
                                                required
                                                value={walletTabState.transactionId}
                                                onChange={e => setWalletTabState({...walletTabState, transactionId: e.target.value})}
                                                className="w-full bg-black/60 border border-white/10 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm sm:text-base font-mono font-bold text-white focus:outline-none focus:border-gold-500 transition placeholder-white/20 mb-3" 
                                                placeholder="e.g.  DET8FJGUJ4"
                                            />
                                            <button 
                                                type="submit" 
                                                disabled={walletTabState.loading}
                                                className="w-full py-2.5 sm:py-3 rounded-xl bg-gold-600 hover:bg-gold-500 text-black font-black text-xs sm:text-sm transition shadow-[0_0_15px_rgba(234,161,27,0.2)] flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                                                {walletTabState.loading ? t('verifying') : t('verifyAndDeposit')}
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            )}

                            {walletTabState.active === 'withdraw' && (() => {
                                const pendingWithdrawal = myWithdrawals.find(w => w.status === 'pending');
                                const currentBal = parseFloat(user?.balance || 0);

                                return (
                                    <div className="space-y-3.5">
                                        {/* Active Pending Withdrawal Card */}
                                        {pendingWithdrawal ? (
                                            <div className="bg-gradient-to-r from-amber-950/40 to-black/60 border border-amber-500/40 p-4 rounded-xl sm:rounded-2xl space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                                                        <span className="text-amber-400 font-bold text-xs uppercase tracking-wider">Pending Payout Request</span>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                        Under Review
                                                    </span>
                                                </div>

                                                <div className="flex items-baseline justify-between">
                                                    <div>
                                                        <div className="text-2xl font-black text-white font-mono">
                                                            {parseFloat(pendingWithdrawal.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-xs text-gold-400">ETB</span>
                                                        </div>
                                                        <div className="text-white/50 text-[11px] mt-0.5">
                                                            Payout to: <span className="text-white font-mono font-bold">{pendingWithdrawal.phone_number}</span> (Telebirr)
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => cancelWithdrawalRequest(pendingWithdrawal.id)}
                                                        className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-xs font-bold transition active:scale-95 flex items-center gap-1"
                                                        title="Cancel request and instantly refund to your wallet"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                        <span>Cancel & Refund</span>
                                                    </button>
                                                </div>

                                                <div className="text-white/40 text-[10px] flex items-center justify-between pt-2 border-t border-white/5">
                                                    <span>Submitted: {new Date(pendingWithdrawal.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    <span>Processed within 5–15 mins</span>
                                                </div>
                                            </div>
                                        ) : null}

                                        {/* New Withdrawal Form */}
                                        <div className="bg-[#181308] border border-gold-500/25 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl">
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className="text-gold-400 text-xs sm:text-sm font-bold">{t('withdrawFunds')}</h4>
                                                <span className="text-white/40 text-[11px]">
                                                    Available: <strong className="text-gold-300 font-mono">{currentBal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB</strong>
                                                </span>
                                            </div>
                                            <p className="text-white/50 text-[10px] sm:text-xs mb-3">
                                                Enter the amount and your Telebirr phone number. Payouts are sent directly to your phone.
                                            </p>

                                            <form onSubmit={(e) => executeInlineWalletAction(e, 'withdraw')} className="space-y-3">
                                                {/* Amount input */}
                                                <div>
                                                    <label className="block text-white/50 text-[10px] font-bold uppercase mb-1">Amount to Withdraw</label>
                                                    <div className="relative">
                                                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 font-bold text-xs sm:text-sm">ETB</span>
                                                        <input 
                                                            type="number" 
                                                            min="10"
                                                            step="1"
                                                            required
                                                            disabled={Boolean(pendingWithdrawal)}
                                                            value={walletTabState.amount}
                                                            onChange={e => setWalletTabState({...walletTabState, amount: e.target.value})}
                                                            className="w-full bg-black/60 border border-white/10 rounded-xl pl-12 pr-3.5 py-2.5 sm:py-3 text-sm sm:text-base font-mono font-bold text-white focus:outline-none focus:border-gold-500 transition placeholder-white/20 disabled:opacity-50" 
                                                            placeholder="Min: 10.00"
                                                        />
                                                    </div>

                                                    {/* Quick Presets */}
                                                    {!pendingWithdrawal && currentBal >= 10 && (
                                                        <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                                                            {[50, 100, 200, 500].filter(amt => amt <= currentBal).map(preset => (
                                                                <button
                                                                    key={preset}
                                                                    type="button"
                                                                    onClick={() => setWalletTabState(prev => ({ ...prev, amount: String(preset) }))}
                                                                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-gold-500/20 text-white/70 hover:text-gold-300 border border-white/10 text-[11px] font-mono transition"
                                                                >
                                                                    +{preset}
                                                                </button>
                                                            ))}
                                                            <button
                                                                type="button"
                                                                onClick={() => setWalletTabState(prev => ({ ...prev, amount: String(Math.floor(currentBal)) }))}
                                                                className="px-2.5 py-1 rounded-lg bg-gold-500/10 hover:bg-gold-500/20 text-gold-400 border border-gold-500/30 text-[11px] font-bold font-mono transition"
                                                            >
                                                                Max
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Payout Phone input */}
                                                <div>
                                                    <label className="block text-white/50 text-[10px] font-bold uppercase mb-1">Telebirr Payout Phone</label>
                                                    <input 
                                                        type="tel" 
                                                        disabled={Boolean(pendingWithdrawal)}
                                                        value={walletTabState.phone !== undefined && walletTabState.phone !== '' ? walletTabState.phone : (user?.phoneNumber || '')}
                                                        onChange={e => setWalletTabState({...walletTabState, phone: e.target.value})}
                                                        className="w-full bg-black/60 border border-white/10 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm font-mono text-white focus:outline-none focus:border-gold-500 transition placeholder-white/20 disabled:opacity-50" 
                                                        placeholder="09xxxxxxxx or +2519xxxxxxxx"
                                                    />
                                                </div>

                                                <button 
                                                    type="submit" 
                                                    disabled={walletTabState.loading || Boolean(pendingWithdrawal) || currentBal < 10}
                                                    className="w-full py-2.5 sm:py-3 rounded-xl bg-gold-600 hover:bg-gold-500 text-black font-black text-xs sm:text-sm transition shadow-[0_0_15px_rgba(234,161,27,0.2)] flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                                                    {walletTabState.loading ? t('withdrawing') : pendingWithdrawal ? 'Pending Request Active' : currentBal < 10 ? 'Insufficient Balance' : t('withdraw')}
                                                </button>
                                            </form>
                                        </div>

                                        {/* Player's Past Withdrawal Requests */}
                                        {myWithdrawals.length > 0 && (
                                            <div className="bg-[#181308] border border-white/5 p-3.5 rounded-xl sm:rounded-2xl space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <h5 className="text-white/70 text-xs font-bold">My Payout History</h5>
                                                    <span className="text-white/40 text-[10px]">{myWithdrawals.length} request(s)</span>
                                                </div>

                                                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                                    {myWithdrawals.slice(0, 10).map(req => (
                                                        <div key={req.id} className="p-2.5 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between text-xs">
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold text-white font-mono">
                                                                        {parseFloat(req.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB
                                                                    </span>
                                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                                        req.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                                                                        req.status === 'pending' ? 'bg-amber-500/20 text-amber-300' :
                                                                        req.status === 'cancelled' ? 'bg-white/10 text-white/50' :
                                                                        'bg-red-500/20 text-red-400'
                                                                    }`}>
                                                                        {req.status}
                                                                    </span>
                                                                </div>
                                                                <div className="text-white/40 text-[10px] mt-0.5">
                                                                    {new Date(req.created_at).toLocaleDateString()} {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {req.phone_number}
                                                                </div>
                                                            </div>

                                                            {req.status === 'pending' && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => cancelWithdrawalRequest(req.id)}
                                                                    className="px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-bold border border-red-500/30 transition"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}


                            {walletTabState.active === 'history' && (
                                <div className="space-y-3">
                                    {walletTransactions.length === 0 ? (
                                        <div className="bg-[#181308] border border-gold-500/20 p-4 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center py-8">
                                            <svg className="text-white/20 mb-2" xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                            <p className="text-white/40 text-xs sm:text-sm">{t('noHistory')}</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {walletTransactions.map(tx => (
                                                <div key={tx.id} className="bg-[#181308] border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${tx.direction > 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                                            {tx.direction > 0 ? (
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                                            ) : (
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="text-white font-bold text-xs capitalize">{tx.tx_type}</div>
                                                            <div className="text-white/40 text-[10px]">{new Date(tx.created_at).toLocaleDateString()} {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={`font-bold font-mono text-xs sm:text-sm ${tx.direction > 0 ? 'text-green-400' : 'text-white'}`}>
                                                            {tx.direction > 0 ? '+' : '-'}{parseFloat(tx.amount).toLocaleString()}
                                                        </div>
                                                        <div className="text-white/30 text-[10px] font-mono">{parseFloat(tx.running_balance).toLocaleString()} Bal</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'profile' && (
                    <div className="max-w-xl mx-auto w-full animate-fade-in pb-28 sm:pb-16 space-y-3.5 sm:space-y-4">
                        {/* Profile Hero Card */}
                        <div className="glass-strong rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-white/10 shadow-2xl relative overflow-hidden">
                            {/* Ambient background glows */}
                            <div className="absolute -top-12 -right-12 w-40 h-40 bg-equb-500/15 blur-3xl rounded-full pointer-events-none"></div>
                            <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-gold-500/10 blur-3xl rounded-full pointer-events-none"></div>

                            <div className="relative flex items-center justify-between gap-3 sm:gap-4">
                                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                    {/* Avatar */}
                                    <div className="relative shrink-0">
                                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-equb-400 via-equb-500 to-emerald-700 flex items-center justify-center text-xl sm:text-2xl font-black text-black shadow-lg shadow-equb-500/20 border border-white/20">
                                            {user ? user.name.charAt(0).toUpperCase() : '?'}
                                        </div>
                                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-surface-900 shadow-sm shadow-emerald-400/50"></div>
                                    </div>

                                    {/* Name & Badges */}
                                    <div className="min-w-0">
                                        <h2 className="text-base sm:text-lg font-black text-white tracking-tight truncate">
                                            {user ? user.name : 'Guest'}
                                        </h2>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                            <span className="px-2 py-0.5 bg-white/5 rounded-md text-white/50 text-[10px] sm:text-[11px] font-mono uppercase tracking-wider border border-white/5">
                                                ID: {user ? user.id.split('-')[0] : '---'}
                                            </span>
                                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] sm:text-[11px] font-bold rounded-md border border-emerald-500/20 flex items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                                {t('verifiedBadge')}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Quick Edit Profile Button */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setProfileForm({ displayName: user ? user.name : '', password: '' });
                                        setIsEditingProfile(true);
                                    }}
                                    className="shrink-0 p-2 sm:px-3 sm:py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition active:scale-95 flex items-center gap-1.5 text-xs font-bold"
                                    title="Edit Profile"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                                    <span className="hidden sm:inline">{t('editBtn')}</span>
                                </button>
                            </div>
                        </div>

                        {/* Wallet & Statistics Section */}
                        <div className="glass-strong rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-white/10 shadow-xl space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] sm:text-xs font-bold text-white/40 uppercase tracking-widest">
                                    {t('walletStats')}
                                </span>
                                <button 
                                    onClick={() => setActiveTab('wallet')} 
                                    className="text-[11px] font-bold text-gold-400 hover:text-gold-300 transition flex items-center gap-1"
                                >
                                    {t('openWalletBtn')} →
                                </button>
                            </div>

                            {/* Featured Main Wallet Card */}
                            <div className="bg-gradient-to-br from-emerald-950/40 via-surface-900 to-black/60 border border-emerald-500/20 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path></svg>
                                        <span>{t('mainBalance')}</span>
                                    </div>
                                    <div className="text-xl sm:text-2xl font-black text-white tracking-tight">
                                        {user ? user.balance.toLocaleString() : '0'}{' '}
                                        <span className="text-gold-400 text-xs sm:text-sm font-extrabold">{t('birLabel')}</span>
                                    </div>
                                </div>

                                <div className="flex gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => openWalletModal('deposit')}
                                        className="px-3 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 text-black text-xs font-black shadow-sm transition active:scale-95"
                                    >
                                        {t('depositBtnShort')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openWalletModal('withdraw')}
                                        className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold border border-white/10 transition active:scale-95"
                                    >
                                        {t('withdrawBtnShort')}
                                    </button>
                                </div>
                            </div>

                            {/* 4 Compact Stat Cards in 2x2 grid */}
                            <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                                {/* Play Wallet */}
                                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-2.5 sm:p-3 hover:bg-white/[0.06] transition">
                                    <div className="flex items-center gap-1.5 text-purple-400 text-[10px] sm:text-[11px] font-bold mb-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                        <span>{t('playWallet')}</span>
                                    </div>
                                    <div className="text-base sm:text-lg font-black text-white">0 <span className="text-[10px] font-bold text-white/40">{t('birLabel')}</span></div>
                                </div>

                                {/* Games Won */}
                                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-2.5 sm:p-3 hover:bg-white/[0.06] transition">
                                    <div className="flex items-center gap-1.5 text-amber-400 text-[10px] sm:text-[11px] font-bold mb-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
                                        <span>{t('gamesWon')}</span>
                                    </div>
                                    <div className="text-base sm:text-lg font-black text-white">0</div>
                                </div>

                                {/* Total Invites */}
                                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-2.5 sm:p-3 hover:bg-white/[0.06] transition">
                                    <div className="flex items-center gap-1.5 text-sky-400 text-[10px] sm:text-[11px] font-bold mb-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>
                                        <span>{t('totalInvites')}</span>
                                    </div>
                                    <div className="text-base sm:text-lg font-black text-white">0</div>
                                </div>

                                {/* Total Earning */}
                                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-2.5 sm:p-3 hover:bg-white/[0.06] transition">
                                    <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] sm:text-[11px] font-bold mb-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                                        <span>{t('totalEarnings')}</span>
                                    </div>
                                    <div className="text-base sm:text-lg font-black text-white">0 <span className="text-[10px] font-bold text-white/40">{t('birLabel')}</span></div>
                                </div>
                            </div>
                        </div>

                        {/* Have an invite code? Section */}
                        <div className="glass-strong rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-white/10 shadow-xl space-y-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-gold-500/15 border border-gold-500/25 flex items-center justify-center text-gold-400 shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/></svg>
                                </div>
                                <div>
                                    <h4 className="text-xs sm:text-sm font-bold text-white">
                                        {t('inviteCodeQuestion')}
                                    </h4>
                                    <p className="text-[10px] sm:text-[11px] text-white/50">
                                        {t('inviteCodeDesc')}
                                    </p>
                                </div>
                            </div>

                            <form onSubmit={handleApplyInviteCode} className="flex gap-2">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        value={inviteCodeInput}
                                        onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                                        placeholder="e.g. EQUB-WIN77"
                                        disabled={appliedInvite || inviteLoading}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-mono font-bold text-white uppercase placeholder-white/25 focus:outline-none focus:border-equb-500 transition disabled:opacity-60"
                                    />
                                    {appliedInvite && (
                                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                                            ✓ {t('inviteCodeApplied')}
                                        </span>
                                    )}
                                </div>
                                <button
                                    type="submit"
                                    disabled={appliedInvite || inviteLoading || !inviteCodeInput.trim()}
                                    className="px-4 py-2 sm:py-2.5 rounded-xl bg-equb-500 hover:bg-equb-400 active:scale-95 disabled:opacity-40 text-black font-extrabold text-xs uppercase transition shadow-sm whitespace-nowrap"
                                >
                                    {inviteLoading ? '...' : appliedInvite ? (t('appliedLabel')) : (t('applyBtn'))}
                                </button>
                            </form>

                            {inviteMessage && (
                                <div className={`p-2.5 rounded-xl text-xs font-medium border flex items-center gap-2 ${
                                    inviteMessage.type === 'success' 
                                        ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' 
                                        : 'bg-red-950/40 border-red-500/30 text-red-300'
                                }`}>
                                    <span>{inviteMessage.type === 'success' ? '🎉' : '⚠️ '}</span>
                                    <span>{inviteMessage.text}</span>
                                </div>
                            )}

                            {user && (
                                <div className="pt-2.5 border-t border-white/5 flex items-center justify-between text-xs">
                                    <span className="text-white/40 text-[11px]">
                                        {t('yourInviteCode')}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-bold text-equb-400 bg-equb-500/10 px-2 py-0.5 rounded-md border border-equb-500/20 text-xs">
                                            {userInviteCode}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                navigator.clipboard.writeText(userInviteCode);
                                                showToast(t('inviteCodeCopied'));
                                            }}
                                            className="text-white/60 hover:text-white p-1 hover:bg-white/10 rounded-md transition"
                                            title="Copy Code"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Settings & Account Controls Card */}
                        <div className="glass-strong rounded-2xl sm:rounded-3xl border border-white/10 shadow-xl overflow-hidden divide-y divide-white/5">
                            {/* Sound & Voice Master & Management Panel */}
                            <div className="divide-y divide-white/5">
                                <div className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-white/[0.02] transition">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center border transition shrink-0 ${soundEnabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-white/40 border-white/5'}`}>
                                            {soundEnabled ? (
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                                            )}
                                        </div>
                                        <div className="truncate">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs sm:text-sm font-bold text-white">
                                                    {t('soundVoiceLabel')}
                                                </span>
                                                <span className={`text-[9.5px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${soundEnabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/10 text-white/40 border border-white/10'}`}>
                                                    {soundEnabled ? (t('soundOn')) : (t('soundOff'))}
                                                </span>
                                            </div>
                                            <p className="text-[10.5px] sm:text-[11px] text-white/40 font-medium truncate mt-0.5">
                                                {t('soundDesc')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setSoundSettingsOpen(!soundSettingsOpen)}
                                            className={`px-2 py-1 rounded-lg border transition text-xs font-bold flex items-center gap-1 ${soundSettingsOpen ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-white/5 text-white/60 border-white/5 hover:bg-white/10 hover:text-white'}`}
                                            title={language === 'am' ? 'ድምጽ አስተዳድር' : 'Manage Audio'}
                                        >
                                            <span className="text-[11px]">{t('manageAudio')}</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${soundSettingsOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={toggleMasterSound}
                                            className={`w-10 h-5.5 rounded-full transition-colors relative ${soundEnabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.35)]' : 'bg-white/20'}`}
                                            title={soundEnabled ? (language === 'am' ? 'አጥፋ' : 'Turn Off') : (language === 'am' ? 'አብራ' : 'Turn On')}
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${soundEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
                                        </button>
                                    </div>
                                </div>

                                {/* Expandable Detailed Management Settings */}
                                {soundSettingsOpen && (
                                    <div className="p-3.5 sm:p-4 bg-black/30 space-y-3 border-t border-white/5">
                                        {/* SFX and Voice Sub-toggles */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {/* Sound Effects (SFX) */}
                                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm">🔔</span>
                                                    <div>
                                                        <span className="text-xs font-bold text-white block">
                                                            {t('soundEffectsLabel')}
                                                        </span>
                                                        <span className="text-[10px] text-white/40 block">
                                                            {t('soundEffectsDesc')}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={!soundEnabled}
                                                    onClick={() => {
                                                        const next = !soundSfxEnabled;
                                                        setSoundSfxEnabled(next);
                                                        if (next && soundEnabled) playSeatBuy();
                                                    }}
                                                    className={`w-8 h-4.5 rounded-full transition-colors relative disabled:opacity-40 ${soundSfxEnabled && soundEnabled ? 'bg-emerald-500' : 'bg-white/20'}`}
                                                >
                                                    <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${soundSfxEnabled && soundEnabled ? 'translate-x-4' : 'translate-x-0.5'}`}></div>
                                                </button>
                                            </div>

                                            {/* Voice Callouts */}
                                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm">🎙️</span>
                                                    <div>
                                                        <span className="text-xs font-bold text-white block">
                                                            {t('voiceCalloutsLabel')}
                                                        </span>
                                                        <span className="text-[10px] text-white/40 block">
                                                            {t('voiceCalloutsDesc')}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={!soundEnabled}
                                                    onClick={() => {
                                                        const next = !soundVoiceEnabled;
                                                        setSoundVoiceEnabled(next);
                                                        if (!next) stopAllVoice();
                                                    }}
                                                    className={`w-8 h-4.5 rounded-full transition-colors relative disabled:opacity-40 ${soundVoiceEnabled && soundEnabled ? 'bg-emerald-500' : 'bg-white/20'}`}
                                                >
                                                    <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${soundVoiceEnabled && soundEnabled ? 'translate-x-4' : 'translate-x-0.5'}`}></div>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Voice Language Preference */}
                                        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                                    <span>🌐</span>
                                                    <span>{t('voiceLangLabel')}</span>
                                                </span>
                                                <span className="text-[10px] font-medium text-white/50">
                                                    {voiceLangPref === 'auto' 
                                                        ? (t('voiceLangAuto')) 
                                                        : voiceLangPref === 'am' ? 'አማርኛ (Amharic Voice)' : 'English Voice'}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {[
                                                    { id: 'auto', label: language === 'am' ? 'አውቶማቲክ' : 'Auto' },
                                                    { id: 'am', label: 'አማርኛ' },
                                                    { id: 'en', label: 'English' }
                                                ].map(opt => (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setVoiceLangPref(opt.id);
                                                            if (soundEnabled && soundVoiceEnabled) {
                                                                initAudio();
                                                                const activeLang = opt.id === 'auto' ? language : opt.id;
                                                                playSingleVoice(activeLang === 'en' ? '/sounds/voice/en_3.mp3' : '/sounds/voice/3.mp3');
                                                            }
                                                        }}
                                                        className={`py-1 px-2 rounded-lg text-xs font-bold transition border ${voiceLangPref === opt.id ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm' : 'bg-white/5 text-white/60 border-white/5 hover:bg-white/10 hover:text-white'}`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Volume Level Slider & Audio Test Button */}
                                        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 space-y-2.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                                    <span>🔊</span>
                                                    <span>{t('volumeLabel')}</span>
                                                </span>
                                                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                                    {Math.round(soundVolume * 100)}%
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.1"
                                                max="1"
                                                step="0.05"
                                                value={soundVolume}
                                                onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                                                disabled={!soundEnabled}
                                                className="w-full accent-emerald-500 cursor-pointer disabled:opacity-40"
                                            />

                                            {/* Test Audio Button */}
                                            <button
                                                type="button"
                                                onClick={handleTestSoundAndVoice}
                                                disabled={isTestingAudio}
                                                className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition active:scale-98 border shadow-sm ${
                                                    isTestingAudio 
                                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse' 
                                                        : 'bg-gradient-to-r from-emerald-500/20 via-equb-500/20 to-teal-500/20 text-emerald-300 border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/25'
                                                }`}
                                            >
                                                {isTestingAudio ? (
                                                    <>
                                                        <span className="flex gap-0.5 items-end h-3">
                                                            <span className="w-1 bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms', height: '100%' }}></span>
                                                            <span className="w-1 bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms', height: '60%' }}></span>
                                                            <span className="w-1 bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms', height: '80%' }}></span>
                                                        </span>
                                                        <span>{t('testingAudio')}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                                                        <span>{t('testAudioLabel')}</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Edit Profile */}
                            <button 
                                type="button"
                                onClick={() => {
                                    setProfileForm({ displayName: user ? user.name : '', password: '' });
                                    setIsEditingProfile(true);
                                }} 
                                className="w-full flex items-center justify-between p-3.5 sm:p-4 hover:bg-white/[0.04] transition group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-white/5 text-white/70 flex items-center justify-center border border-white/5">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                                    </div>
                                    <span className="text-xs sm:text-sm font-bold text-white">
                                        {t('editProfileLabel')}
                                    </span>
                                </div>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30 group-hover:text-white transition group-hover:translate-x-0.5"><path d="m9 18 6-6-6-6"/></svg>
                            </button>

                            {/* Delete Account */}
                            <button 
                                type="button"
                                onClick={handleDeleteProfile} 
                                className="w-full flex items-center justify-between p-3.5 sm:p-4 hover:bg-red-500/5 transition group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center border border-red-500/20">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                    </div>
                                    <span className="text-xs sm:text-sm font-bold text-red-400">
                                        {t('deleteAccountLabel')}
                                    </span>
                                </div>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500/30 group-hover:text-red-400 transition group-hover:translate-x-0.5"><path d="m9 18 6-6-6-6"/></svg>
                            </button>

                            {/* Sign Out */}
                            <button 
                                type="button"
                                onClick={() => { setUser(null); setActiveTab('home'); }} 
                                className="w-full flex items-center justify-between p-3.5 sm:p-4 hover:bg-white/[0.04] transition group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                                    </div>
                                    <span className="text-xs sm:text-sm font-bold text-amber-300">
                                        {t('signOutLabel')}
                                    </span>
                                </div>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30 group-hover:text-white transition group-hover:translate-x-0.5"><path d="m9 18 6-6-6-6"/></svg>
                            </button>
                        </div>

                        {/* Update Profile Modal Component */}
                        {isEditingProfile && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
                                <div className="relative overflow-hidden bg-surface-900 border border-white/10 p-1 rounded-3xl w-full max-w-sm shadow-2xl">
                                    <div className="absolute inset-0 bg-gradient-to-br from-equb-500/20 to-transparent opacity-50 pointer-events-none"></div>
                                    <form onSubmit={handleUpdateProfile} className="relative bg-black/80 backdrop-blur-xl p-5 sm:p-6 rounded-[22px] space-y-4 sm:space-y-5">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-10 h-10 rounded-xl bg-equb-500/20 flex items-center justify-center border border-equb-500/30">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-equb-400"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                            </div>
                                            <div>
                                                <h3 className="text-base font-bold text-white tracking-wide">
                                                    {t('updateProfileTitle')}
                                                </h3>
                                                <p className="text-white/50 text-[11px]">
                                                    {t('updateProfileDesc')}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-[10px] font-bold text-white/50 mb-1.5 uppercase tracking-wider">
                                                    {t('displayNameLabel')}
                                                </label>
                                                <div className="relative">
                                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
                                                    <input type="text" value={profileForm.displayName} onChange={e => setProfileForm({...profileForm, displayName: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-equb-500 transition font-bold" required />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-white/50 mb-1.5 uppercase tracking-wider">
                                                    {t('newPasswordLabel')}
                                                </label>
                                                <div className="relative">
                                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
                                                    <input type="password" placeholder={t('leaveBlank')} value={profileForm.password} onChange={e => setProfileForm({...profileForm, password: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-xs sm:text-sm text-white placeholder-white/20 focus:outline-none focus:border-equb-500 transition font-bold" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2.5 pt-1">
                                            <button type="button" onClick={() => setIsEditingProfile(false)} className="flex-1 bg-white/5 border border-white/10 text-white py-2.5 rounded-xl font-bold hover:bg-white/10 transition text-xs sm:text-sm">
                                                {t('cancelBtn')}
                                            </button>
                                            <button type="submit" className="flex-1 bg-equb-500 hover:bg-equb-400 text-black py-2.5 rounded-xl font-bold shadow-sm transition text-xs sm:text-sm">
                                                {t('saveBtn')}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'how_to_play' && (
                    <div className="animate-fade-in pb-24 max-w-2xl lg:max-w-4xl mx-auto">

                        {/* Header */}
                        <div className="mb-4 sm:mb-6">
                            <h2 className="text-lg sm:text-2xl font-black text-white mb-2">{t('howToPlayTitle')}</h2>
                            <p className="text-white/60 text-xs sm:text-sm mb-3">{t('howToPlaySubtitle')}</p>
                            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                                <span className="px-2.5 py-1 rounded-full bg-white/10 text-white text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0">
                                    <span className="text-equb-400 mr-1">1️⃣</span>{t('pickRoom')}
                                </span>
                                <span className="px-2.5 py-1 rounded-full bg-white/10 text-white text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0">
                                    <span className="text-equb-400 mr-1">2️⃣</span>{t('pickNumbers')}
                                </span>
                                <span className="px-2.5 py-1 rounded-full bg-white/10 text-white text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0">
                                    <span className="text-equb-400 mr-1">3️⃣</span>{t('waitForDraw')}
                                </span>
                                <span className="px-2.5 py-1 rounded-full bg-white/10 text-white text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0">
                                    <span className="text-equb-400 mr-1">4️⃣</span>{t('winLabel')}
                                </span>
                            </div>
                        </div>

                        {/* Steps */}
                        <div className="space-y-3 sm:space-y-4">

                            {/* Step 1: Pick a Room */}
                            <div className="bg-[#121513] rounded-2xl border border-white/5 overflow-hidden shadow-lg">
                                <div className="flex flex-col sm:flex-row">
                                    <div className="flex-1 p-4 sm:p-5 flex flex-col gap-2.5">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-9 h-9 shrink-0 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center text-lg font-bold">1️⃣</div>
                                            <div>
                                                <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 mr-2">{t('step1Tag')}</span>
                                                <span className="text-white font-bold text-sm sm:text-base">{t('step1Title')}</span>
                                            </div>
                                        </div>
                                        <p className="text-white/55 text-xs sm:text-sm leading-relaxed">
                                            {language === 'am' 
                                                ? 'ወደ ክፍሎች ይሂዱ እና ወዲያውኑ ከየትኛው ክፍል የሚጫወቱት ይምረጡ። ከተለያዩ ሽልማቶች እና ተጫዋቾች ብዛት ይምረጡ።' 
                                                : 'Go to Rooms tab and choose your game. Pick from different prize amounts (500 - 50,000 Birr) and player counts (5-80 players).'}
                                        </p>
                                        <ul className="text-xs sm:text-sm text-white/70 space-y-1.5 mt-1">
                                            <li className="flex items-start gap-2">
                                                <span className="text-green-400 font-bold mt-0.5">✓</span>
                                                <span>{t('step1Tip1')}</span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <span className="text-green-400 font-bold mt-0.5">✓</span>
                                                <span>{t('step1Tip2')}</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <div className="flex items-center justify-center bg-[#0a0c0b] border-t sm:border-t-0 sm:border-l border-white/5 p-4 sm:p-5 sm:w-52 lg:w-64">
                                        <div className="w-full max-w-[200px] aspect-[16/10] border-[3px] border-[#222624] rounded-xl overflow-hidden shadow-xl bg-black">
                                            <img src="/step1.png" alt="Choose room" className="w-full h-full object-cover" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Step 2: Pick Your Numbers */}
                            <div className="bg-[#121513] rounded-2xl border border-white/5 overflow-hidden shadow-lg">
                                <div className="flex flex-col sm:flex-row">
                                    <div className="flex-1 p-4 sm:p-5 flex flex-col gap-2.5">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-9 h-9 shrink-0 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center text-lg font-bold">2️⃣</div>
                                            <div>
                                                <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 mr-2">{t('step2Tag')}</span>
                                                <span className="text-white font-bold text-sm sm:text-base">{t('step2Title')}</span>
                                            </div>
                                        </div>
                                        <p className="text-white/55 text-xs sm:text-sm leading-relaxed">
                                            {language === 'am' 
                                                ? 'ሚገኙት መቀመጫዎች ውስጥ ቁጥሮችን ይምረጡ። 1 ወይም ከዚያ በላይ መቀመጫዎችን መምረጥ ይችላሉ። ብዙ መቀመጫዎችን በመረጡ ቁጥር የማሸነፍ እድሉ ከፍ ያለ ይሆናል።' 
                                                : 'Select numbers from the available seats. You can choose 1 or more seats. The more seats you pick, the higher your chances to win!'}
                                        </p>
                                        <ul className="text-xs sm:text-sm text-white/70 space-y-1.5 mt-1">
                                            <li className="flex items-start gap-2">
                                                <span className="text-green-400 font-bold mt-0.5">✓</span>
                                                <span>{t('step2Tip1')}</span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <span className="text-green-400 font-bold mt-0.5">✓</span>
                                                <span>{language === 'am' ? 'ተጨማሪ መቀመጫዎች = ተጨማሪ የማሸነፍ እድል' : 'More seats = More chances to win'}</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <div className="flex items-center justify-center bg-[#0a0c0b] border-t sm:border-t-0 sm:border-l border-white/5 p-4 sm:p-5 sm:w-52 lg:w-64">
                                        <div className="w-full max-w-[200px] aspect-[16/10] border-[3px] border-[#222624] rounded-xl overflow-hidden shadow-xl bg-black">
                                            <img src="/step2.png" alt="Pick numbers" className="w-full h-full object-cover" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Step 3: Wait for Draw */}
                            <div className="bg-[#121513] rounded-2xl border border-white/5 overflow-hidden shadow-lg">
                                <div className="flex flex-col sm:flex-row">
                                    <div className="flex-1 p-4 sm:p-5 flex flex-col gap-2.5">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-9 h-9 shrink-0 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center text-lg font-bold">3️⃣</div>
                                            <div>
                                                <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 mr-2">{t('step3Tag')}</span>
                                                <span className="text-white font-bold text-sm sm:text-base">{t('step3Title')}</span>
                                            </div>
                                        </div>
                                        <p className="text-white/55 text-xs sm:text-sm leading-relaxed">
                                            {language === 'am' 
                                                ? 'ሁሉም ተጫዋቾች መቀመጫቸውን እንደመረጡ፣ ዕጣው ወዲያው ይጀምራል! የኬኖ ማሽን ከሁሉም መቀመጫዎች ውስጥ አንድ አሸናፊ ቁጥሮችን ሲመርጥ ማያ ገጹን ይመልከቱ።' 
                                                : 'Once all players have selected their seats, the draw begins automatically! Watch the screen as the keno machine picks one winning number from all the available seats.'}
                                        </p>
                                        <ul className="text-xs sm:text-sm text-white/70 space-y-1.5 mt-1">
                                            <li className="flex items-start gap-2">
                                                <span className="text-green-400 font-bold mt-0.5">✓</span>
                                                <span>{t('step3Tip1')}</span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <span className="text-green-400 font-bold mt-0.5">✓</span>
                                                <span>{t('step3Tip2')}</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <div className="flex items-center justify-center bg-[#0a0c0b] border-t sm:border-t-0 sm:border-l border-white/5 p-4 sm:p-5 sm:w-52 lg:w-64">
                                        <div className="w-full max-w-[200px] aspect-[16/10] border-[3px] border-[#222624] rounded-xl overflow-hidden shadow-xl bg-black">
                                            <img src="/step3.png" alt="Draw happening" className="w-full h-full object-cover" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Step 4: Win & Repeat */}
                            <div className="bg-[#121513] rounded-2xl border border-white/5 overflow-hidden shadow-lg">
                                <div className="flex flex-col sm:flex-row">
                                    <div className="flex-1 p-4 sm:p-5 flex flex-col gap-2.5">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-9 h-9 shrink-0 rounded-xl bg-green-500/20 text-green-400 flex items-center justify-center text-lg font-bold">4️⃣</div>
                                            <div>
                                                <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 mr-2">{t('step4Tag')}</span>
                                                <span className="text-white font-bold text-sm sm:text-base">{t('step4Title')}</span>
                                            </div>
                                        </div>
                                        <p className="text-white/55 text-xs sm:text-sm leading-relaxed">
                                            {language === 'am' 
                                                ? 'ቁጥርዎ ከወጣ አሸንፈዋል! ሽልማትዎ በቀጥታ ወደ ቦርሳዎ ይሄዳል። ቁጥርዎ ካልወጣ በዚህ ጊዜ አላሸነፉም? ችግር የለም - ሌላ ጨዋታ ይቀላቀሉ እና እንደገና ይሞክሩ!' 
                                                : 'If your number is drawn, you win! Your prize goes directly to your wallet. Didn\'t win this time? No problem - join another game and try again!'}
                                        </p>
                                        <ul className="text-xs sm:text-sm text-white/70 space-y-1.5 mt-1">
                                            <li className="flex items-start gap-2">
                                                <span className="text-green-400 font-bold mt-0.5">✓</span>
                                                <span>{t('step4Tip1')}</span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <span className="text-green-400 font-bold mt-0.5">✓</span>
                                                <span>{t('step4Tip2')}</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <div className="flex items-center justify-center bg-[#0a0c0b] border-t sm:border-t-0 sm:border-l border-white/5 p-4 sm:p-5 sm:w-52 lg:w-64">
                                        <div className="w-full max-w-[200px] flex items-center justify-center">
                                            <div className="text-center">
                                                <div className="text-5xl mb-2">🏆</div>
                                                <p className="text-gold-400 font-bold text-sm">{t('youWinLabel')}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* Key Tips */}
                        <div className="bg-[#121513] rounded-2xl p-4 sm:p-5 border border-white/5 shadow-lg mt-3 sm:mt-4">
                            <div className="flex items-center gap-2.5 mb-3">
                                <div className="w-7 h-7 rounded-lg bg-yellow-500/20 text-yellow-400 flex items-center justify-center">⭐ </div>
                                <h3 className="text-white font-bold text-sm sm:text-base">{t('keyTipsTitle')}</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                <div className="bg-[#0a0c0b] rounded-xl p-3 border border-white/5">
                                    <p className="text-white/70 text-xs sm:text-sm leading-relaxed">
                                        <span className="text-equb-400 font-bold block mb-1">💰 {t('tip1Title')}</span>
                                        {t('tip1Desc')}
                                    </p>
                                </div>
                                <div className="bg-[#0a0c0b] rounded-xl p-3 border border-white/5">
                                    <p className="text-white/70 text-xs sm:text-sm leading-relaxed">
                                        <span className="text-equb-400 font-bold block mb-1">⏱️ {t('tip2Title')}</span>
                                        {t('tip2Desc')}
                                    </p>
                                </div>
                                <div className="bg-[#0a0c0b] rounded-xl p-3 border border-white/5">
                                    <p className="text-white/70 text-xs sm:text-sm leading-relaxed">
                                        <span className="text-equb-400 font-bold block mb-1">💳 {t('tip3Title')}</span>
                                        {t('tip3Desc')}
                                    </p>
                                </div>
                                <div className="bg-[#0a0c0b] rounded-xl p-3 border border-white/5">
                                    <p className="text-white/70 text-xs sm:text-sm leading-relaxed">
                                        <span className="text-equb-400 font-bold block mb-1">🎯 {t('tip4Title')}</span>
                                        {t('tip4Desc')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Ready CTA */}
                        <div className="bg-[#121513] rounded-2xl p-4 sm:p-6 border border-white/5 shadow-lg mt-3 sm:mt-4 text-center">
                            <h3 className="text-white font-bold text-base sm:text-lg mb-1">{t('readyToPlay')}</h3>
                            <p className="text-white/50 text-xs sm:text-sm mb-4">{t('readyToPlayDesc')}</p>
                            <div className="flex flex-col sm:flex-row justify-center gap-2.5 max-w-xs sm:max-w-sm mx-auto">
                                <button onClick={() => setActiveTab('rooms')} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-equb-500 to-equb-600 text-black font-bold hover:from-equb-400 hover:to-equb-500 text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(234,161,27,0.2)] active:scale-95">
                                    <span>🎮 {t('startPlayingBtn')}</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                                </button>
                                <button onClick={() => setActiveTab('wallet')} className="flex-1 py-2.5 rounded-xl bg-[#1a1e1c] text-white/80 font-bold hover:bg-[#222624] text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 border border-white/5 active:scale-95">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>
                                    {t('depositBtn')}
                                </button>
                            </div>
                        </div>

                    </div>
                )}
                </>
                )}
            </main>

            {/* Bottom Nav for Mobile */}
            <nav className={`fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-surface-950/95 backdrop-blur-xl safe-bottom lg:hidden ${seatModal.open ? 'hidden' : ''}`}>
                <div className="mx-auto flex max-w-lg justify-around pb-[env(safe-area-inset-bottom)] pt-1">
                    <button onClick={() => { setActiveTab('home'); setSeatModal({...seatModal, open: false}); }} className={`flex min-w-[3.5rem] flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] touch-manipulation ${activeTab==='home'?'text-equb-400':'text-white/40'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-house h-5 w-5"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
                        <span className="truncate">{t('home')}</span>
                    </button>
                    <button onClick={() => { setActiveTab('rooms'); setSeatModal({...seatModal, open: false}); }} className={`flex min-w-[3.5rem] flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] touch-manipulation ${activeTab==='rooms'?'text-equb-400':'text-white/40'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-users h-5 w-5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                        <span className="truncate">{t('rooms')}</span>
                    </button>
                    <button onClick={() => { setActiveTab('how_to_play'); setSeatModal({...seatModal, open: false}); }} className={`flex min-w-[3.5rem] flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] touch-manipulation ${activeTab==='how_to_play'?'text-equb-400':'text-white/40'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-circle-help h-5 w-5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
                        <span className="truncate">{t('howToPlay')}</span>
                    </button>
                    <button onClick={() => { setActiveTab('wallet'); setSeatModal({...seatModal, open: false}); }} className={`flex min-w-[3.5rem] flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] touch-manipulation ${activeTab==='wallet'?'text-equb-400':'text-white/40'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-wallet h-5 w-5"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path></svg>
                        <span className="truncate">{t('wallet')}</span>
                    </button>
                    <button onClick={() => { setActiveTab('profile'); setSeatModal({...seatModal, open: false}); }} className={`flex min-w-[3.5rem] flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] touch-manipulation ${activeTab==='profile'?'text-equb-400':'text-white/40'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user h-5 w-5"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        <span className="truncate">{t('profile')}</span>
                    </button>
                </div>
            </nav>

            {/* Fast Keno Draw Modal */}
            {drawModal.open && (
                <div className="fixed inset-0 bg-surface-950/95 z-[60] flex flex-col items-center justify-start sm:justify-center p-3 sm:p-6 backdrop-blur-xl overflow-y-auto">
                    <button onClick={() => setDrawModal({ open: false, room: null, result: null })} className="fixed sm:absolute top-4 right-4 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition active:scale-95 z-50 text-lg sm:text-xl font-bold">✕</button>
                    
                    <div className="my-auto flex flex-col items-center w-full max-w-lg py-4">
                        <h2 className="text-2xl sm:text-3xl font-bold text-equb-400 mb-1 animate-pulse text-center">
                            🎮 Game #{drawModal.roomNumber || drawModal.result?.roomNumber || '1'} {t('drawing')}
                        </h2>
                        <p className="text-[11px] sm:text-xs text-gold-400 font-semibold mb-4 sm:mb-6 text-center px-2">
                            ቀጣዩ ዑደት ተከፍቷል · Next game cycle is now open for joins!
                        </p>
                        
                        {(() => {
                            const rawTotal = drawModal.groupSize 
                                || drawModal.result?.groupSize
                                || (drawModal.room ? (rooms.find(r => r.id === drawModal.room)?.groupSize) : null)
                                || (drawModal.result?.winnerSeatNumber ? Math.max(10, drawModal.result.winnerSeatNumber) : 10);
                            const totalNumbers = Math.max(rawTotal, drawModal.result?.winnerSeatNumber || 0);

                            let cols = 5;
                            let ballSize = 'w-10 h-10 sm:w-11 sm:h-11';
                            let textSize = 'text-xs sm:text-sm font-black';
                            let gapPx = 8;

                            if (totalNumbers <= 5) {
                                cols = 5;
                                ballSize = 'w-11 h-11 sm:w-13 sm:h-13';
                                textSize = 'text-sm sm:text-base font-black';
                                gapPx = 8;
                            } else if (totalNumbers <= 10) {
                                cols = 5;
                                ballSize = 'w-9 h-9 sm:w-10 sm:h-10';
                                textSize = 'text-xs sm:text-sm font-black';
                                gapPx = 6;
                            } else if (totalNumbers <= 15) {
                                cols = 5;
                                ballSize = 'w-8 h-8 sm:w-9 sm:h-9';
                                textSize = 'text-xs sm:text-sm font-bold';
                                gapPx = 5;
                            } else if (totalNumbers <= 20) {
                                cols = 5;
                                ballSize = 'w-7 h-7 sm:w-8 sm:h-8';
                                textSize = 'text-[11px] sm:text-xs font-bold';
                                gapPx = 4;
                            } else if (totalNumbers <= 40) {
                                cols = 8;
                                ballSize = 'w-6 h-6 sm:w-7 sm:h-7';
                                textSize = 'text-[9.5px] sm:text-[11px] font-bold';
                                gapPx = 3;
                            } else if (totalNumbers <= 60) {
                                cols = 10;
                                ballSize = 'w-5 h-5 sm:w-6 sm:h-6';
                                textSize = 'text-[8.5px] sm:text-[9.5px] font-bold';
                                gapPx = 2;
                            } else {
                                cols = 10;
                                ballSize = 'w-[18px] h-[18px] sm:w-[21px] sm:h-[21px]';
                                textSize = 'text-[7.5px] sm:text-[8.5px] font-black';
                                gapPx = 2;
                            }

                            return (
                                <div className="relative w-[300px] h-[300px] sm:w-[350px] sm:h-[350px] mb-6 sm:mb-8 flex items-center justify-center shrink-0" id="keno-machine">
                                    {/* Glass Sphere Dome with authentic lighting */}
                                    <div className="absolute inset-0 rounded-full border-4 border-equb-500/40 glass shadow-[inset_0_0_60px_rgba(16,185,129,0.25),0_0_35px_rgba(16,185,129,0.2)] flex items-center justify-center">
                                        {/* Specular curved reflection */}
                                        <div className="absolute top-2 left-8 right-8 h-10 rounded-full bg-gradient-to-b from-white/20 to-transparent blur-[1px] pointer-events-none"></div>

                                        {/* Inscribed safe area: 84% width & height prevents any corner clipping */}
                                        <div className="w-[84%] h-[84%] flex items-center justify-center">
                                            <div 
                                                className="grid place-items-center"
                                                style={{
                                                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                                                    gap: `${gapPx}px`
                                                }}
                                            >
                                                {Array.from({ length: totalNumbers }, (_, i) => i + 1).map(n => {
                                                    const isWinner = Boolean(drawModal.result && drawModal.result.winnerSeatNumber === n);
                                                    return (
                                                        <div 
                                                            key={n} 
                                                            className={`${ballSize} ${textSize} rounded-full flex items-center justify-center transition-all duration-150 keno-ball select-none ${
                                                                isWinner 
                                                                    ? 'bg-gold-500 text-black font-extrabold ring-2 ring-white shadow-[0_0_15px_rgba(234,179,8,1)] scale-110 z-10' 
                                                                    : 'bg-surface-800 text-white/90 border border-white/10 shadow-inner'
                                                            }`}
                                                        >
                                                            {n}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Winner Spotlight floating in center */}
                                        {drawModal.result && (
                                            <div className="absolute z-50 w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-amber-300 via-gold-400 to-amber-600 shadow-[0_0_60px_rgba(234,161,27,0.95)] flex flex-col items-center justify-center text-white transform scale-100 animate-[bounce-slight_2s_infinite] border-2 border-white/40">
                                                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-black/75 -mb-0.5">WINNER</span>
                                                <span className="text-3xl sm:text-4xl font-black text-black font-mono">
                                                    #{drawModal.result.winnerSeatNumber}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Metallic base stand shadow */}
                                    <div className="absolute -bottom-2 w-36 sm:w-44 h-2.5 bg-gradient-to-r from-transparent via-gold-500/40 to-transparent rounded-full blur-[1px]"></div>
                                </div>
                            );
                        })()}

                        {drawModal.result && (
                            <div className="flex flex-col items-center glass-strong p-5 sm:p-6 rounded-3xl border border-gold-500/50 shadow-[0_0_30px_rgba(234,161,27,0.2)] animate-[bounce-slight_2s_infinite] w-full">
                                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2 text-center">{t('winnerPrefix')} <span className="text-gold-400">{drawModal.result.winnerUsername || 'Player'}</span>!</h3>
                                <p className="text-base sm:text-lg text-equb-400 font-bold mb-4 text-center">
                                    {drawModal.result.winnerUserId === user?.id 
                                        ? `${t('congrats')}${drawModal.result.winnerSeatNumber}` 
                                        : (drawModal.result.participantUserIds?.includes(user?.id) ? "💔 You lost the game, try again and take a chance!" : `${t('wonSeat')}${drawModal.result.winnerSeatNumber}`)}
                                </p>
                                
                                <div className="w-full bg-black/40 rounded-2xl p-4 text-xs sm:text-sm text-white/70 space-y-2 border border-white/5">
                                    <div className="flex justify-between">
                                        <span>Gross Jackpot</span>
                                        <span className="font-mono text-white">{drawModal.result.grossPool.toLocaleString()} ETB</span>
                                    </div>
                                    <div className="flex justify-between text-red-400/80">
                                        <span>Platform Fee</span>
                                        <span className="font-mono">-{drawModal.result.platformFee.toLocaleString()} ETB</span>
                                    </div>
                                    <div className="h-px bg-white/10 my-2"></div>
                                    <div className="flex justify-between font-bold text-equb-400 text-base sm:text-lg">
                                        <span>Net Payout</span>
                                        <span className="font-mono">{drawModal.result.netPayout.toLocaleString()} ETB</span>
                                    </div>
                                </div>
                                
                                <button className="mt-5 btn-gold w-full py-3" onClick={() => setDrawModal({ open: false, room: null, result: null })}>{t('awesome')}</button>
                                {drawModal.nextGameId && (
                                    <button 
                                        className="mt-2.5 w-full py-3 rounded-2xl bg-surface-800 hover:bg-surface-700 text-gold-400 font-bold border border-gold-500/30 transition flex items-center justify-center gap-2 active:scale-95 text-xs sm:text-sm" 
                                        onClick={() => handleJoinNextGame(drawModal.nextGameId)}
                                    >
                                        🎮 Join Next Game (Game #{drawModal.nextRoomNumber || 'Next'})
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Confirmation Modal for Opening a Room */}
            {confirmOpenRoom && (
                <div className="fixed inset-0 bg-black/85 z-[60] flex flex-col items-center justify-center p-4 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
                    <div className="glass w-full max-w-sm rounded-3xl p-6 relative border border-white/10 shadow-2xl text-center">
                        <div className="w-16 h-16 rounded-full bg-gold-500/20 text-gold-400 flex items-center justify-center mx-auto mb-4 border border-gold-500/30">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Are you sure you want to open this room?</h2>
                        <p className="text-sm text-white/60 mb-6">This will create a new game room and deduct the ticket price from your balance.</p>
                        <div className="flex gap-3 w-full">
                            <button 
                                onClick={() => setConfirmOpenRoom(false)} 
                                className="flex-1 py-3 rounded-xl bg-surface-800 hover:bg-surface-700 text-white border border-white/10 font-bold transition active:scale-95"
                            >
                                No
                            </button>
                            <button 
                                onClick={executeOpenRoom} 
                                className="flex-1 py-3 rounded-xl btn-gold font-bold transition active:scale-95 shadow-[0_0_15px_rgba(234,161,27,0.3)]"
                            >
                                Yes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Wallet Action Modal */}
            {walletModal.open && (
                <div className="fixed inset-0 bg-black/85 z-[60] flex flex-col items-center justify-center p-4 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
                    <div className="glass w-full max-w-sm rounded-3xl p-6 relative border border-white/10 shadow-2xl">
                        <button className="absolute top-4 right-4 text-white/50 hover:text-white transition" onClick={() => setWalletModal({ open: false, action: null, amount: '' })}>✕</button>
                        
                        <div className="w-16 h-16 rounded-full bg-gold-500/20 text-gold-400 flex items-center justify-center mx-auto mb-4 border border-gold-500/30">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>
                        </div>
                        
                        <h2 className="text-xl font-bold text-white mb-1 text-center capitalize">{walletModal.action === 'deposit' ? 'Telebirr Deposit' : 'Withdraw Funds'}</h2>
                        <p className="text-sm text-white/60 mb-6 text-center">
                            {walletModal.action === 'deposit' 
                                ? 'Enter your Telebirr Transaction ID to verify and deposit real money.' 
                                : 'Enter the amount you wish to withdraw.'}
                        </p>
                        
                        <form onSubmit={executeWalletAction} className="space-y-4">
                            {walletModal.action === 'deposit' ? (
                                <div>
                                    <label className="block text-xs font-bold text-white/50 mb-2 uppercase tracking-wider">Telebirr Transaction ID</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={walletModal.transactionId} 
                                        onChange={e => setWalletModal({...walletModal, transactionId: e.target.value})} 
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-lg font-mono font-bold text-white focus:outline-none focus:border-equb-500 transition placeholder-white/20" 
                                        placeholder="e.g. OTX123456789"
                                        autoFocus
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-bold text-white/50 mb-2 uppercase tracking-wider">Amount (ETB)</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-bold">ETB</span>
                                        <input 
                                            type="number" 
                                            min="1"
                                            step="1"
                                            required
                                            value={walletModal.amount} 
                                            onChange={e => setWalletModal({...walletModal, amount: e.target.value})} 
                                            className="w-full bg-black/40 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-lg font-mono font-bold text-white focus:outline-none focus:border-equb-500 transition" 
                                            placeholder="0.00"
                                            autoFocus
                                        />
                                    </div>
                                </div>
                            )}
                            
                            <div className="flex gap-3 pt-2">
                                <button 
                                    type="button" 
                                    onClick={() => setWalletModal({ open: false, action: null, amount: '', transactionId: '', loading: false })} 
                                    className="flex-1 py-3 rounded-xl bg-surface-800 hover:bg-surface-700 text-white border border-white/10 font-bold transition active:scale-95"
                                    disabled={walletModal.loading}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    className="flex-1 py-3 rounded-xl btn-gold font-bold transition active:scale-95 shadow-[0_0_15px_rgba(234,161,27,0.3)] capitalize disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={walletModal.loading}
                                >
                                    {walletModal.loading ? 'Processing...' : (walletModal.action === 'deposit' ? 'Verify & Deposit' : 'Withdraw')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modern Glassmorphic Alert & Confirm Modal ──────────────────────── */}
            {modalAlert.open && (
                <div 
                    className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]"
                    onClick={(e) => {
                        if (e.target === e.currentTarget && modalAlert.type !== 'confirm') {
                            setModalAlert(prev => ({ ...prev, open: false }));
                        }
                    }}
                >
                    <div className="relative w-full max-w-sm glass-strong rounded-3xl p-6 border border-white/15 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden animate-modal-in">
                        {/* Ambient background radial glow */}
                        <div 
                            className={`absolute -top-20 -left-20 w-44 h-44 rounded-full blur-3xl pointer-events-none opacity-30 ${
                                modalAlert.type === 'error' ? 'bg-rose-500' :
                                modalAlert.type === 'success' ? 'bg-emerald-500' :
                                modalAlert.type === 'info' ? 'bg-sky-500' :
                                'bg-amber-400'
                            }`} 
                        />
                        <div 
                            className={`absolute -bottom-20 -right-20 w-44 h-44 rounded-full blur-3xl pointer-events-none opacity-20 ${
                                modalAlert.type === 'error' ? 'bg-rose-600' :
                                modalAlert.type === 'success' ? 'bg-emerald-600' :
                                modalAlert.type === 'info' ? 'bg-blue-600' :
                                'bg-amber-500'
                            }`} 
                        />

                        {/* Top close button (for non-confirm) */}
                        {modalAlert.type !== 'confirm' && (
                            <button
                                type="button"
                                onClick={() => setModalAlert(prev => ({ ...prev, open: false }))}
                                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-white/50 hover:text-white flex items-center justify-center transition border border-white/5 text-sm"
                            >
                                ✕
                            </button>
                        )}

                        {/* Glowing Icon Header Badge */}
                        <div className={`relative mx-auto mb-4 w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg border backdrop-blur-xl ${
                            modalAlert.type === 'error' 
                                ? 'bg-rose-500/15 text-rose-400 border-rose-500/30 shadow-[0_0_20px_rgba(244,63,94,0.25)]' :
                            modalAlert.type === 'success' 
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.25)]' :
                            modalAlert.type === 'info' 
                                ? 'bg-sky-500/15 text-sky-400 border-sky-500/30 shadow-[0_0_20px_rgba(14,165,233,0.25)]' :
                                'bg-amber-500/15 text-amber-400 border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                        }`}>
                            {modalAlert.type === 'error' && (
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="15" y1="9" x2="9" y2="15" />
                                    <line x1="9" y1="9" x2="15" y2="15" />
                                </svg>
                            )}
                            {modalAlert.type === 'success' && (
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                    <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                            )}
                            {modalAlert.type === 'info' && (
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="16" x2="12" y2="12" />
                                    <line x1="12" y1="8" x2="12.01" y2="8" />
                                </svg>
                            )}
                            {(modalAlert.type === 'warning' || modalAlert.type === 'confirm') && (
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                                    <line x1="12" y1="9" x2="12" y2="13" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                            )}
                        </div>

                        {/* Title */}
                        <h3 className="relative text-lg font-black text-white text-center mb-2 tracking-wide">
                            {modalAlert.title}
                        </h3>

                        {/* Message */}
                        <p className="relative text-sm text-white/85 leading-relaxed text-center mb-6 font-medium px-2 break-words">
                            {modalAlert.message}
                        </p>

                        {/* Buttons */}
                        <div className="relative flex gap-3">
                            {modalAlert.type === 'confirm' ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setModalAlert(prev => ({ ...prev, open: false }))}
                                        className="flex-1 py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 hover:text-white font-bold border border-white/10 transition active:scale-95 text-sm"
                                    >
                                        {modalAlert.cancelText || (t('cancelBtn'))}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const cb = modalAlert.onConfirm;
                                            setModalAlert(prev => ({ ...prev, open: false }));
                                            if (cb) cb();
                                        }}
                                        className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black shadow-lg shadow-rose-900/40 transition active:scale-95 text-sm"
                                    >
                                        {modalAlert.confirmText || (language === 'am' ? 'አረጋግጥ' : 'Confirm')}
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setModalAlert(prev => ({ ...prev, open: false }))}
                                    className={`w-full py-3.5 px-4 rounded-xl font-black text-sm tracking-wide transition active:scale-95 shadow-lg ${
                                        modalAlert.type === 'error'
                                            ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-rose-900/40'
                                            : modalAlert.type === 'success'
                                            ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-emerald-900/40'
                                            : modalAlert.type === 'info'
                                            ? 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-sky-900/40'
                                            : 'btn-gold shadow-gold-500/30'
                                    }`}
                                >
                                    {modalAlert.confirmText || (language === 'am' ? 'ተረዳሁ' : 'Got it')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modern Toast Notification ───────────────────────────────────────── */}
            {toastState.open && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[130] max-w-sm w-[90%] pointer-events-none animate-toast-in">
                    <div className="glass-strong rounded-2xl px-4 py-3 border border-gold-500/40 shadow-[0_15px_35px_rgba(0,0,0,0.6)] flex items-center gap-3 backdrop-blur-2xl">
                        <div className="w-8 h-8 rounded-xl bg-gold-500/20 text-gold-400 flex items-center justify-center shrink-0 border border-gold-500/30">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </div>
                        <p className="text-sm font-bold text-white leading-snug">{toastState.message}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
