const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Find NavigationLinks and replace it with a fixed version
const oldNavBlock = `const NavigationLinks = () => (
          <>
              {['home', 'rooms', 'wallet', 'howToPlay'].map(tab => (
                  <button 
                      key={tab}
                      onClick={() => { setActiveTab(tab); setSeatModal({...seatModal, open: false}); }}
                      className={\`px-3 py-2 text-sm font-bold transition \${activeTab === tab && !seatModal.open ? 'text-equb-400' : 'text-white/60 hover:text-white'}\`}
                  >
                      {t(tab)}
                  </button>
              ))}
          </>
      );`;

// Let's use a regex to be safe
const searchRegex = /const NavigationLinks = \(\) => \([\s\S]*?<\/button>\s*\)\)\}\s*<\/>\s*\);/;

const newNavBlock = `const NavigationLinks = () => (
          <>
              {[
                  { id: 'home', key: 'home' },
                  { id: 'rooms', key: 'rooms' },
                  { id: 'wallet', key: 'wallet' },
                  { id: 'how_to_play', key: 'howToPlay' }
              ].map(tab => (
                  <button 
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id); setSeatModal({...seatModal, open: false}); }}
                      className={\`px-3 py-2 text-sm font-bold transition \${activeTab === tab.id && !seatModal.open ? 'text-equb-400' : 'text-white/60 hover:text-white'}\`}
                  >
                      {t(tab.key)}
                  </button>
              ))}
          </>
      );`;

content = content.replace(searchRegex, newNavBlock);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed NavigationLinks');
