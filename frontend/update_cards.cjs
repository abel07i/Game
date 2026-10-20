const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const regex = /<div className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-3">[\s\S]*?<\/div>\s*<\/div>\s*<div className="glass-strong rounded-2xl p-4 sm:p-5 lg:p-6">/;

const replacement = `<div className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-3">
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
                                  <div className="glass-strong rounded-2xl p-4 sm:p-5 lg:p-6">`;

content = content.replace(regex, replacement);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Cards replaced successfully.');
