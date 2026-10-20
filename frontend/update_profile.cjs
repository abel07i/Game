const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Replace NavigationLinks
content = content.replace(
    /\{\s*id: 'wallet', key: 'wallet' \s*\},/,
    "{ id: 'wallet', key: 'wallet' }, { id: 'profile', key: 'profile' },"
);

// We need to carefully replace the old {activeTab === 'profile' && ...} block with our new one
// The block starts with `{activeTab === 'profile' && (` and ends before `{activeTab === 'how_to_play' && (`
const profileStart = content.indexOf("{activeTab === 'profile' && (");
const profileEnd = content.indexOf("{activeTab === 'how_to_play' && (");

if (profileStart !== -1 && profileEnd !== -1) {
    const oldProfileStr = content.substring(profileStart, profileEnd);
    const newProfileStr = `{activeTab === 'profile' && (
                    <div className="animate-fade-in pb-24 rounded-3xl overflow-hidden bg-gradient-to-b from-[#0a1f15] to-[#040f0a] min-h-[80vh] border border-white/5 shadow-2xl relative">
                        {/* Decorative background glow */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150%] max-w-2xl h-64 bg-equb-500/10 blur-[120px] rounded-full pointer-events-none"></div>
                        
                        <div className="relative pt-16 pb-8 px-6 text-center">
                            <div className="relative inline-block mb-4">
                                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-equb-400 to-equb-700 flex items-center justify-center text-4xl font-black text-black shadow-[0_0_30px_rgba(234,161,27,0.4)] border-4 border-[#0a1f15] relative z-10 mx-auto">
                                    {user ? user.name.charAt(0).toUpperCase() : '?'}
                                </div>
                                <div className="absolute bottom-1 right-1 w-6 h-6 bg-green-500 rounded-full border-4 border-[#0a1f15] z-20"></div>
                            </div>
                            
                            <h2 className="text-3xl font-black text-white tracking-tight">{user ? user.name : 'Guest'}</h2>
                            <div className="flex justify-center items-center gap-2 mt-3">
                                <span className="px-3 py-1 bg-white/5 rounded-lg text-white/50 text-xs font-mono uppercase tracking-widest border border-white/5">ID: {user ? user.id.split('-')[0] : '---'}</span>
                                <span className="px-3 py-1 bg-equb-500/10 text-equb-400 text-xs font-bold rounded-lg border border-equb-500/20 flex items-center gap-1.5 shadow-[0_0_10px_rgba(234,161,27,0.1)]">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                    VERIFIED
                                </span>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="px-6 pb-8 relative z-10">
                            <h3 className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] mb-4 pl-1">Statistics</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {/* Main Wallet */}
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between hover:bg-white/10 transition-colors backdrop-blur-sm group">
                                    <div className="flex items-center gap-2 text-white/60 mb-3 group-hover:text-white/80 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-equb-400"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path></svg>
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Main Wallet</span>
                                    </div>
                                    <div className="text-2xl font-black text-white tracking-tight">{user ? user.balance.toLocaleString() : '0'} <span className="text-equb-400 text-[10px] font-bold uppercase tracking-widest ml-1">ETB</span></div>
                                </div>
                                
                                {/* Play Wallet */}
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between hover:bg-white/10 transition-colors backdrop-blur-sm group">
                                    <div className="flex items-center gap-2 text-white/60 mb-3 group-hover:text-white/80 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Play Wallet</span>
                                    </div>
                                    <div className="text-2xl font-black text-white tracking-tight">0 <span className="text-purple-400 text-[10px] font-bold uppercase tracking-widest ml-1">ETB</span></div>
                                </div>
                                
                                {/* Games Won */}
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between hover:bg-white/10 transition-colors backdrop-blur-sm group">
                                    <div className="flex items-center gap-2 text-white/60 mb-3 group-hover:text-white/80 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Games Won</span>
                                    </div>
                                    <div className="text-2xl font-black text-white tracking-tight">0</div>
                                </div>
                                
                                {/* Total Invite */}
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between hover:bg-white/10 transition-colors backdrop-blur-sm group">
                                    <div className="flex items-center gap-2 text-white/60 mb-3 group-hover:text-white/80 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Total Invite</span>
                                    </div>
                                    <div className="text-2xl font-black text-white tracking-tight">0</div>
                                </div>
                                
                                {/* Total Earning */}
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between hover:bg-white/10 transition-colors backdrop-blur-sm md:col-span-2 lg:col-span-1 group">
                                    <div className="flex items-center gap-2 text-white/60 mb-3 group-hover:text-white/80 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Total Earning</span>
                                    </div>
                                    <div className="text-2xl font-black text-white tracking-tight">0 <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest ml-1">ETB</span></div>
                                </div>
                            </div>
                        </div>

                        {/* Settings Section */}
                        <div className="px-6 pb-8 relative z-10">
                            <h3 className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] mb-4 pl-1">Settings</h3>
                            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
                                <button onClick={() => {
                                    setProfileForm({ displayName: user ? user.name : '', password: '' });
                                    setIsEditingProfile(true);
                                }} className="w-full flex items-center justify-between p-4 hover:bg-white/10 transition-colors border-b border-white/5 group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-white group-hover:bg-white/10 transition-colors border border-white/5">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                                        </div>
                                        <span className="text-sm font-bold text-white tracking-wide">Edit Profile</span>
                                    </div>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30 group-hover:text-white transition-colors group-hover:translate-x-1 duration-300"><path d="m9 18 6-6-6-6"/></svg>
                                </button>
                                
                                <button onClick={handleDeleteProfile} className="w-full flex items-center justify-between p-4 hover:bg-white/10 transition-colors border-b border-white/5 group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 group-hover:bg-red-500/20 transition-colors border border-red-500/10">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                        </div>
                                        <span className="text-sm font-bold text-red-500 tracking-wide">Delete Account</span>
                                    </div>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500/30 group-hover:text-red-500 transition-colors group-hover:translate-x-1 duration-300"><path d="m9 18 6-6-6-6"/></svg>
                                </button>
                                
                                <button onClick={() => { setUser(null); setActiveTab('home'); }} className="w-full flex items-center justify-between p-4 hover:bg-white/10 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-white group-hover:bg-white/10 transition-colors border border-white/5">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                                        </div>
                                        <span className="text-sm font-bold text-white tracking-wide">Sign Out</span>
                                    </div>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30 group-hover:text-white transition-colors group-hover:translate-x-1 duration-300"><path d="m9 18 6-6-6-6"/></svg>
                                </button>
                            </div>
                        </div>

                        {/* Update Profile Modal Component */}
                        {isEditingProfile && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
                                <div className="relative overflow-hidden bg-[#0a1f15] border border-white/10 p-1 rounded-3xl w-full max-w-sm shadow-2xl">
                                    <div className="absolute inset-0 bg-gradient-to-br from-equb-500/20 to-transparent opacity-50 pointer-events-none"></div>
                                    <form onSubmit={handleUpdateProfile} className="relative bg-black/80 backdrop-blur-xl p-6 rounded-[22px] space-y-6">
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="w-12 h-12 rounded-full bg-equb-500/20 flex items-center justify-center border border-equb-500/30">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-equb-400"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-white tracking-wide">Update Profile</h3>
                                                <p className="text-white/50 text-xs">Change your display name or password</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="group/input">
                                                <label className="block text-[10px] font-bold text-white/50 mb-2 uppercase tracking-widest group-focus-within/input:text-equb-400 transition-colors">Display Name</label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
                                                    <input type="text" value={profileForm.displayName} onChange={e => setProfileForm({...profileForm, displayName: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white focus:outline-none focus:border-equb-500 focus:bg-black/60 transition-all font-bold" required />
                                                </div>
                                            </div>
                                            <div className="group/input">
                                                <label className="block text-[10px] font-bold text-white/50 mb-2 uppercase tracking-widest group-focus-within/input:text-equb-400 transition-colors">New Password</label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
                                                    <input type="password" placeholder="Leave blank to keep" value={profileForm.password} onChange={e => setProfileForm({...profileForm, password: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-equb-500 focus:bg-black/60 transition-all font-bold" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-3 pt-2">
                                            <button type="button" onClick={() => setIsEditingProfile(false)} className="flex-1 bg-white/5 border border-white/10 text-white py-3 rounded-xl font-bold hover:bg-white/10 transition-colors text-sm">Cancel</button>
                                            <button type="submit" className="flex-1 bg-equb-500 hover:bg-equb-400 text-black py-3 rounded-xl font-bold shadow-[0_0_15px_rgba(234,161,27,0.3)] transition-colors text-sm">Save</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}
                    </div>
                )}\n\n                `;

    content = content.replace(oldProfileStr, newProfileStr);
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Profile updated successfully.');
} else {
    console.error('Could not find profile block');
}
