const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const regexHeader = /(<h1 className="text-xl font-black tracking-tight )text-white( sm:text-2xl lg:text-3xl">\{t\('title'\)\}<\/h1>)/;
content = content.replace(regexHeader, '$1text-gold-400 drop-shadow-[0_0_8px_rgba(234,161,27,0.4)]$2');

const insertRegex = /(<div className="grid gap-5 lg:grid-cols-5 lg:gap-8">)/;

const cardComponent = `
                          {/* Number Selection Rule Card */}
                          <div className="rounded-3xl border border-green-900/40 bg-[#0a120c] p-5 lg:p-6 shadow-[0_0_30px_rgba(34,197,94,0.03)] relative overflow-hidden">
                              {/* Subtle yellowish glow in upper right */}
                              <div className="absolute top-0 right-0 w-64 h-64 bg-gold-500/5 blur-[100px] rounded-full pointer-events-none transform translate-x-1/3 -translate-y-1/3"></div>
                              
                              <div className="relative z-10">
                                  <h3 className="text-green-400 font-bold text-lg mb-1">የቁጥር ምርጫ ህግ</h3>
                                  <p className="text-white/40 text-xs sm:text-sm mb-6">5 ተጫዋቾች = 1 ቁጥር · ቡድን ሲጨምር ቁጥር ምርጫ በ1 ይጨምራል</p>
                                  
                                  {/* Chips */}
                                  <div className="flex flex-col gap-2.5 items-center justify-center mb-6">
                                      <div className="flex flex-wrap gap-2 justify-center max-w-[300px]">
                                          <div className="px-4 py-2 rounded-xl border border-green-500/50 bg-green-500/20 text-white font-black shadow-[0_0_15px_rgba(34,197,94,0.3)] text-sm whitespace-nowrap">
                                              5 → 1
                                          </div>
                                          <div className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white/50 font-bold text-sm whitespace-nowrap">
                                              10 → 2
                                          </div>
                                          <div className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white/50 font-bold text-sm whitespace-nowrap">
                                              20 → 3
                                          </div>
                                          <div className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white/50 font-bold text-sm whitespace-nowrap">
                                              30 → 4
                                          </div>
                                          <div className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white/50 font-bold text-sm whitespace-nowrap">
                                              40 → 5
                                          </div>
                                          <div className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white/50 font-bold text-sm whitespace-nowrap">
                                              50 → 6
                                          </div>
                                      </div>
                                      <div className="flex justify-center">
                                          <div className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white/40 font-bold text-sm whitespace-nowrap">
                                              ...80 → 9
                                          </div>
                                      </div>
                                  </div>
                                  
                                  <div className="text-center">
                                      <p className="text-white/90 font-medium text-xs sm:text-sm tracking-wide">ይህ ክፍል · ከፍተኛ 1 ቁጥር ይምረጡ</p>
                                  </div>
                              </div>
                          </div>
                          
                          $1`;

content = content.replace(insertRegex, cardComponent);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Added rule card to Rooms tab');
