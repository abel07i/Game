const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const regexToReplace = /(<h3 className="text-xs font-bold text-white\/40 uppercase tracking-\[0\.2em\] mb-4 pl-1">Settings<\/h3>\s*<div className="bg-white\/5 border border-white\/10 rounded-2xl overflow-hidden backdrop-blur-sm">)/;

const newSoundToggle = `$1
                                  <div className="w-full flex items-center justify-between p-4 hover:bg-white/10 transition-colors border-b border-white/5 group">
                                      <div className="flex items-center gap-3">
                                          <div className={\`w-9 h-9 rounded-full flex items-center justify-center transition-colors border \${soundEnabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10' : 'bg-white/5 text-white/50 border-white/5 group-hover:bg-white/10'}\`}>
                                              {soundEnabled ? (
                                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                                              ) : (
                                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                                              )}
                                          </div>
                                          <span className="text-sm font-bold text-white tracking-wide">Sound & Voice</span>
                                      </div>
                                      <button 
                                          onClick={() => setSoundEnabled(!soundEnabled)}
                                          className={\`w-12 h-6 rounded-full transition-colors relative \${soundEnabled ? 'bg-emerald-500' : 'bg-white/20'}\`}
                                      >
                                          <div className={\`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform \${soundEnabled ? 'translate-x-7' : 'translate-x-1'}\`}></div>
                                      </button>
                                  </div>`;

content = content.replace(regexToReplace, newSoundToggle);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Added Sound Toggle to Settings');
