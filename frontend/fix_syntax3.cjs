const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Find the NavigationLinks definition
const navStart = content.indexOf('const NavigationLinks = () => (');
if (navStart !== -1) {
    // We want to keep my new NavigationLinks up to its closing );
    // And remove the garbage old one.
    // The garbage starts with // \n <>
    const garbageStart = content.indexOf('//\n          <>', navStart);
    if (garbageStart !== -1) {
        // The garbage ends with \n      );
        // Let's find the closing );
        let bracketCount = 0;
        let garbageEnd = -1;
        // Easier way: just remove from //\n          <> down to the next );
        const searchRegex = /\/\/\r?\n\s*<>\r?\n[\s\S]*?<\/([^>]+)?>\r?\n\s*\);/;
        content = content.replace(searchRegex, '');
    } else {
        // Maybe the garbage doesn't have //\n
        const searchRegex = /\/\/\r?\n\s*<>\r?\n[\s\S]*?<\/([^>]+)?>\r?\n\s*\);/;
        content = content.replace(searchRegex, '');
        // Actually, let's just use string replacement on what we know is there
        const oldContent = `      //
          <>
              <button onClick={() => { setActiveTab('home'); setSeatModal({...seatModal, open: false}); }} className={\`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition \${activeTab==='home'?'bg-equb-500/15 text-equb-300':'text-white/50 hover:bg-white/5 hover:text-white/80'}\`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-house h-4 w-4"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
                  {t('home')}
              </button>
              <button onClick={() => { setActiveTab('rooms'); setSeatModal({...seatModal, open: false}); }} className={\`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition \${activeTab==='rooms'?'bg-equb-500/15 text-equb-300':'text-white/50 hover:bg-white/5 hover:text-white/80'}\`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-users h-4 w-4"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                  {t('rooms')}
              </button>
              <button onClick={() => { setActiveTab('wallet'); setSeatModal({...seatModal, open: false}); }} className={\`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition \${activeTab==='wallet'?'bg-equb-500/15 text-equb-300':'text-white/50 hover:bg-white/5 hover:text-white/80'}\`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-wallet h-4 w-4"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path></svg>
                  {t('wallet')}
              </button>
              <button onClick={() => { setActiveTab('how_to_play'); setSeatModal({...seatModal, open: false}); }} className={\`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition \${activeTab==='how_to_play'?'bg-equb-500/15 text-equb-300':'text-white/50 hover:bg-white/5 hover:text-white/80'}\`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-circle-help h-4 w-4"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
                  {t('howToPlay')}
              </button>
              <button onClick={() => { setActiveTab('profile'); setSeatModal({...seatModal, open: false}); }} className={\`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition \${activeTab==='profile'?'bg-equb-500/15 text-equb-300':'text-white/50 hover:bg-white/5 hover:text-white/80'}\`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user h-4 w-4"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  {t('profile')}
              </button>
          </>
      );`;
        // Instead of exact string match (which might fail due to tabs/spaces), I'll use regex block match.
    }
}
// Delete the old commented out code block
content = content.replace(/\/\/\r?\n\s*<>\r?\n[\s\S]*?<\/([^>]+)?>\r?\n\s*\);/m, '');

// If the regex doesn't catch it, fallback to something simpler:
content = content.replace(/\/\/\r?\n\s*<>\r?\n([\s\S]*?)\s*\);\r?\n\r?\n\s*return \(/, '\n    return (');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed dangling code');
