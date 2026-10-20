#!/usr/bin/env python3
import sys

APP_PATH = r"c:\Users\abel w\OneDrive\Desktop\Game\frontend\src\App.jsx"

with open(APP_PATH, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Find start and end of old wizard section
# Start marker: line containing "space-y-5 order-2 lg:order-1 lg:col-span-3"
# End marker: line AFTER the closing </div> that precedes the right column div

start_idx = None
end_idx = None

for i, line in enumerate(lines):
    if 'space-y-5 order-2 lg:order-1 lg:col-span-3' in line:
        start_idx = i
    if start_idx is not None and '</button>' in line and 'openRoomBtn' in line:
        # The next line should be the closing </div>
        # Find the closing </div> after this
        for j in range(i+1, min(i+5, len(lines))):
            if '</div>' in lines[j] and lines[j].strip() == '</div>':
                end_idx = j
                break
        if end_idx:
            break

if start_idx is None or end_idx is None:
    print(f"ERROR: Could not find markers. start={start_idx}, end={end_idx}")
    sys.exit(1)

print(f"Found wizard section: lines {start_idx+1} to {end_idx+1}")

NEW_SECTION = '''                            <div className="space-y-5 order-2 lg:order-1 lg:col-span-3">
                                {/* \u2500\u2500 PRIZE ENTRY & PLAYER DIVISION WIZARD \u2500\u2500 */}

                                {/* Step Indicator */}
                                <div className="flex items-center gap-3 px-1">
                                    <div className={`flex items-center gap-2 ${wizardStep >= 1 ? 'opacity-100' : 'opacity-40'}`}>
                                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black transition ${wizardStep === 1 ? 'bg-gold-500 text-black shadow-lg shadow-gold-500/40' : wizardStep > 1 ? 'bg-equb-500 text-white' : 'bg-white/10 text-white/50'}`}>
                                            {wizardStep > 1 ? '\u2713' : '1'}
                                        </span>
                                        <span className={`text-xs font-bold ${wizardStep === 1 ? 'text-gold-400' : wizardStep > 1 ? 'text-equb-400' : 'text-white/40'}`}>
                                            {language === 'am' ? '\u123d\u120d\u121b\u1275 \u121d\u1228\u1325' : 'Prize Entry'}
                                        </span>
                                    </div>
                                    <div className={`flex-1 h-px ${wizardStep > 1 ? 'bg-equb-500/60' : 'bg-white/10'} transition-colors duration-300`}></div>
                                    <div className={`flex items-center gap-2 ${wizardStep >= 2 ? 'opacity-100' : 'opacity-40'}`}>
                                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black transition ${wizardStep === 2 ? 'bg-gold-500 text-black shadow-lg shadow-gold-500/40' : 'bg-white/10 text-white/50'}`}>
                                            2
                                        </span>
                                        <span className={`text-xs font-bold ${wizardStep === 2 ? 'text-gold-400' : 'text-white/40'}`}>
                                            {language === 'am' ? '\u1270\u132b\u12cb\u127e\u127d & \u1240\u120b\u1240\u120d' : 'Players & Join'}
                                        </span>
                                    </div>
                                </div>

                                {/* \u2500\u2500 STEP 1: Choose Prize Entry \u2500\u2500 */}
                                {wizardStep === 1 && (
                                    <section className="glass rounded-2xl p-4 sm:p-6">
                                        <div className="mb-4">
                                            <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                                                {language === 'am' ? '\ud83c\udfc6 \u12e8\u123d\u120d\u121b\u1275 \u1218\u1320\u1295 \u121d\u1228\u1321' : '\ud83c\udfc6 Choose Your Prize Entry'}
                                            </h2>
                                            <p className="text-xs text-white/45 mt-1">
                                                {language === 'am' ? '\u121b\u1238\u1290\u134d \u12e8\u121a\u1348\u120d\u1309\u1275\u1295 \u12e8\u123d\u120d\u121b\u1275 \u1308\u1295\u12d8\u1265 \u12ed\u121d\u1228\u1321' : 'Select the total prize pool you want to win'}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                                            {[500, 1000, 2000, 5000, 10000, 20000, 50000].map(amt => (
                                                <button
                                                    key={amt}
                                                    type="button"
                                                    onClick={() => setWizard({...wizard, jackpot: amt})}
                                                    className={`relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 font-bold transition-all active:scale-95 ${
                                                        wizard.jackpot === amt
                                                            ? 'border-gold-500 bg-gradient-to-b from-gold-500/20 to-gold-600/10 text-gold-300 shadow-lg shadow-gold-500/20 scale-[1.03]'
                                                            : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:bg-white/10'
                                                    }`}
                                                >
                                                    {wizard.jackpot === amt && (
                                                        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-gold-400 shadow-[0_0_6px_#fbbf24]"></span>
                                                    )}
                                                    <span className="text-lg sm:text-xl font-black tracking-tight">
                                                        {amt >= 1000 ? `${(amt/1000).toLocaleString()}K` : amt.toLocaleString()}
                                                    </span>
                                                    <span className="text-[11px] font-bold text-current opacity-70 mt-0.5">
                                                        {language === 'am' ? '\u1265\u122d' : 'Birr'}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>

                                        <div className="mt-5 p-3 rounded-xl bg-gold-500/8 border border-gold-500/20 flex items-center justify-between">
                                            <div>
                                                <p className="text-[10px] uppercase tracking-widest text-gold-400/70 font-bold">{language === 'am' ? '\u12e8\u1270\u1218\u1228\u1320 \u123d\u120d\u121b\u1275' : 'Selected Prize'}</p>
                                                <p className="text-xl font-black text-gold-400 mt-0.5">{wizard.jackpot.toLocaleString()} {language === 'am' ? '\u1265\u122d' : 'Birr'}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setWizardStep(2)}
                                                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-gold-400 to-gold-500 text-black font-black text-sm transition active:scale-95 hover:shadow-lg hover:shadow-gold-500/30 flex items-center gap-2"
                                            >
                                                {language === 'am' ? '\u1240\u1325\u120d' : 'Continue'}
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                                            </button>
                                        </div>
                                    </section>
                                )}

                                {/* \u2500\u2500 STEP 2: Choose Players & Join \u2500\u2500 */}
                                {wizardStep === 2 && (() => {
                                    const PLAYER_SIZES = [5, 10, 20, 40, 50, 80];
                                    const pricePerPlayer = wizard.jackpot / wizard.groupSize;
                                    const matchingRoom = liveRealRooms.find(r => r.groupSize === wizard.groupSize && Math.round(r.targetJackpot) === Math.round(wizard.jackpot));
                                    const filled = matchingRoom ? (matchingRoom.filledSeats || 0) : 0;
                                    const remaining = wizard.groupSize - filled;
                                    const isFull = filled >= wizard.groupSize;
                                    return (
                                        <section className="glass rounded-2xl p-4 sm:p-6">
                                            <button
                                                type="button"
                                                onClick={() => setWizardStep(1)}
                                                className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white mb-4 transition"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                                                {language === 'am' ? '\u1270\u1218\u1208\u1235' : 'Back'}
                                                <span className="text-gold-400 font-bold ml-1">{wizard.jackpot.toLocaleString()} {language === 'am' ? '\u1265\u122d' : 'Birr'}</span>
                                            </button>

                                            <div className="mb-4">
                                                <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                                                    {language === 'am' ? '\ud83d\udc65 \u12e8\u1270\u132b\u12cb\u127e\u127d \u1265\u12db\u1275 \u121d\u1228\u1321' : '\ud83d\udc65 Choose Number of Players'}
                                                </h2>
                                                <p className="text-xs text-white/45 mt-1">
                                                    {language === 'am' ? '\u12ad\u134d\u1209 \u121d\u1295 \u12eb\u1205\u120d \u1270\u132b\u12cb\u127e\u127d \u12a5\u1295\u12f0\u121a\u1348\u120d\u130d \u121d\u1228\u1321' : 'Select how many players fill the room'}
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-3 gap-2.5">
                                                {PLAYER_SIZES.map(size => {
                                                    const perPlayer = wizard.jackpot / size;
                                                    const isSelected = wizard.groupSize === size;
                                                    return (
                                                        <button
                                                            key={size}
                                                            type="button"
                                                            onClick={() => setWizard({...wizard, groupSize: size, seatNumbers: [1]})}
                                                            className={`relative flex flex-col items-center p-3 rounded-2xl border-2 transition-all active:scale-95 ${
                                                                isSelected
                                                                    ? 'border-equb-500 bg-equb-500/15 shadow-lg shadow-equb-500/20 scale-[1.04]'
                                                                    : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
                                                            }`}
                                                        >
                                                            {isSelected && (
                                                                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-equb-400 shadow-[0_0_5px_#34d399]"></span>
                                                            )}
                                                            <span className={`text-base sm:text-lg font-black ${isSelected ? 'text-equb-300' : 'text-white/80'}`}>
                                                                {size}
                                                            </span>
                                                            <span className={`text-[10px] font-medium ${isSelected ? 'text-equb-400/70' : 'text-white/40'} mt-0.5`}>
                                                                {language === 'am' ? '\u1230\u12ce\u127d' : 'players'}
                                                            </span>
                                                            <div className={`mt-2 pt-2 border-t w-full text-center ${isSelected ? 'border-equb-500/30' : 'border-white/5'}`}>
                                                                <p className={`text-[11px] font-black font-mono ${isSelected ? 'text-gold-400' : 'text-white/60'}`}>
                                                                    {perPlayer % 1 === 0 ? perPlayer.toLocaleString() : perPlayer.toFixed(2)}
                                                                </p>
                                                                <p className={`text-[9px] ${isSelected ? 'text-gold-400/60' : 'text-white/30'}`}>
                                                                    {language === 'am' ? '\u1265\u122d/\u1230\u12cd' : 'Birr/player'}
                                                                </p>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Summary Card */}
                                            <div className="mt-5 rounded-2xl bg-black/40 border border-white/10 overflow-hidden">
                                                <div className="grid grid-cols-3 divide-x divide-white/10 text-center">
                                                    <div className="p-3">
                                                        <p className="text-[9px] uppercase tracking-widest text-white/35 font-bold">{language === 'am' ? '\u123d\u120d\u121b\u1275' : 'Prize'}</p>
                                                        <p className="text-sm font-black text-gold-400 mt-1">{wizard.jackpot.toLocaleString()}</p>
                                                        <p className="text-[10px] text-white/35">{language === 'am' ? '\u1265\u122d' : 'Birr'}</p>
                                                    </div>
                                                    <div className="p-3">
                                                        <p className="text-[9px] uppercase tracking-widest text-white/35 font-bold">{language === 'am' ? '\u1270\u132b\u12cb\u127e\u127d' : 'Players'}</p>
                                                        <p className="text-sm font-black text-white mt-1">{wizard.groupSize}</p>
                                                        <p className="text-[10px] text-white/35">{language === 'am' ? '\u1230\u12ce\u127d' : 'people'}</p>
                                                    </div>
                                                    <div className="p-3">
                                                        <p className="text-[9px] uppercase tracking-widest text-white/35 font-bold">{language === 'am' ? '\u1290\u134d\u1235 \u12cb\u130b' : 'Per Player'}</p>
                                                        <p className="text-sm font-black text-equb-400 mt-1">
                                                            {pricePerPlayer % 1 === 0 ? pricePerPlayer.toLocaleString() : pricePerPlayer.toFixed(2)}
                                                        </p>
                                                        <p className="text-[10px] text-white/35">{language === 'am' ? '\u1265\u122d' : 'Birr'}</p>
                                                    </div>
                                                </div>
                                                {matchingRoom && (
                                                    <div className="border-t border-white/10 px-4 py-3 flex items-center justify-between gap-3">
                                                        <div className="flex flex-col gap-0.5 flex-1">
                                                            <div className="flex items-center gap-2 text-xs">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                                                <span className="text-white/60 font-medium">
                                                                    {language === 'am' ? `${filled} \u1270\u1240\u120b\u1245\u1208\u12cb\u120d \u00b7 ${remaining} \u1266\u1273 \u1240\u122d\u1277\u120d` : `${filled} joined \u00b7 ${remaining} spots left`}
                                                                </span>
                                                            </div>
                                                            <div className="w-full bg-white/10 rounded-full h-1.5 mt-1 overflow-hidden">
                                                                <div className="h-full rounded-full bg-gradient-to-r from-equb-500 to-gold-400 transition-all" style={{ width: `${Math.min(100, (filled / wizard.groupSize) * 100)}%` }} />
                                                            </div>
                                                        </div>
                                                        <span className="text-xs font-bold text-white/60 shrink-0 font-mono">{filled}/{wizard.groupSize}</span>
                                                    </div>
                                                )}
                                                <div className={`px-4 py-2.5 text-center text-xs font-bold border-t border-white/10 ${
                                                    isFull ? 'text-rose-400 bg-rose-500/10' : matchingRoom ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'
                                                }`}>
                                                    {isFull
                                                        ? (language === 'am' ? '\ud83d\udeab \u12ad\u134d\u1209 \u1219\u1209 \u1290\u12cd \u2014 \u1240\u1323\u12e9 \u12d1\u12f0\u1275 \u12ed\u1320\u1265\u1261' : '\ud83d\udeab Room Full \u2014 Wait for next cycle')
                                                        : matchingRoom
                                                            ? (language === 'am' ? '\u2705 \u12ad\u134d\u1209 \u12ad\u134d\u1275 \u1290\u12cd \u2014 \u12db\u122c \u12ed\u1240\u120b\u1240\u1209!' : '\u2705 Room Open \u2014 Join now!')
                                                            : (language === 'am' ? '\u23f3 \u1208\u12da\u1205 \u12ad\u134d\u1275 \u1225\u134d\u122b \u12dd\u130d\u1305\u1275 \u120b\u12ed \u1290\u1295' : '\u23f3 Getting ready for this room...')
                                                    }
                                                </div>
                                            </div>

                                            {/* Seat Number Picker */}
                                            {!isFull && (
                                                <div className="mt-4">
                                                    <p className="text-[11px] text-white/40 mb-3">
                                                        {language === 'am'
                                                            ? `3 \u00b7 \u12e8\u1241\u1325\u122d \u121d\u122d\u132b \u2014 \u12a5\u1235\u12a8 ${wizard.groupSize === 5 ? 1 : Math.floor(wizard.groupSize / 10) + 1} \u1241\u1325\u122e\u127d \u12ed\u121d\u1228\u1321`
                                                            : `3 \u00b7 Pick Your Seat \u2014 up to ${wizard.groupSize === 5 ? 1 : Math.floor(wizard.groupSize / 10) + 1} number${wizard.groupSize === 5 ? '' : 's'}`
                                                        }
                                                    </p>
                                                    <div
                                                        className="w-full"
                                                        style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: wizard.groupSize === 5 ? 'repeat(5, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(min(100%, 38px), 1fr))',
                                                            gap: '6px'
                                                        }}
                                                    >
                                                        {Array.from({length: wizard.groupSize}, (_, i) => i + 1).map(num => {
                                                            const isSelected = wizard.seatNumbers.includes(num);
                                                            const maxAllowed = wizard.groupSize === 5 ? 1 : Math.floor(wizard.groupSize / 10) + 1;
                                                            return (
                                                                <button
                                                                    key={num}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (isSelected) {
                                                                            setWizard({...wizard, seatNumbers: wizard.seatNumbers.filter(n => n !== num)});
                                                                        } else if (wizard.seatNumbers.length < maxAllowed) {
                                                                            setWizard({...wizard, seatNumbers: [...wizard.seatNumbers, num]});
                                                                        }
                                                                    }}
                                                                    className={`aspect-square w-full rounded-md text-[11px] sm:text-xs md:text-sm font-bold transition flex items-center justify-center active:scale-95 ${isSelected ? 'bg-equb-500 text-white shadow-md scale-110 z-10' : 'bg-surface-800 text-white/80 border border-white/10 hover:bg-surface-700'}`}
                                                                >
                                                                    {num.toString().padStart(2, '0')}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Join Game Button */}
                                            {!isFull && (
                                                <button
                                                    type="button"
                                                    onClick={handleOpenRoomClick}
                                                    className="mt-5 btn-gold w-full py-4 text-sm font-bold transition active:scale-[0.98] flex items-center justify-center gap-2"
                                                >
                                                    \ud83c\udfae {language === 'am' ? '\u1328\u12cb\u1273 \u12ed\u1240\u120b\u1240\u1209' : 'Join Game'}
                                                    <span className="text-xs opacity-70 font-mono">\u2014 {pricePerPlayer % 1 === 0 ? pricePerPlayer.toLocaleString() : pricePerPlayer.toFixed(2)} {language === 'am' ? '\u1265\u122d' : 'Birr'}</span>
                                                </button>
                                            )}
                                        </section>
                                    );
                                })()}
                            </div>
'''

new_lines = lines[:start_idx] + [NEW_SECTION] + lines[end_idx+1:]

with open(APP_PATH, "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print(f"SUCCESS: Replaced lines {start_idx+1} to {end_idx+1} with new Prize Entry & Player Division wizard!")
