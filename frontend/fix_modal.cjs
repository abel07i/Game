const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add <- Rooms button to header
content = content.replace(
    /<div className="flex min-w-0 items-center gap-2 sm:gap-3">/,
    `<div className="flex min-w-0 items-center gap-2 sm:gap-3">
                        {seatModal.open && (
                            <button 
                                onClick={() => setSeatModal({...seatModal, open: false})}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-surface-800 border border-white/10 hover:bg-surface-700 transition-colors text-white text-xs font-bold"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-left"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
                                {t('rooms')}
                            </button>
                        )}`
);

// 2. Fix the header logo click to also close the modal
content = content.replace(
    /<button onClick=\{\(\) => setActiveTab\('home'\)\} className="flex min-w-0 items-center gap-2">/,
    "<button onClick={() => { setActiveTab('home'); setSeatModal({...seatModal, open: false}); }} className={`flex min-w-0 items-center gap-2 ${seatModal.open ? 'hidden sm:flex' : ''}`}>"
);

// 3. Fix bottom navigation to clear the modal
const bottomNavIndex = content.indexOf('{/* Bottom Nav for Mobile */}');
if (bottomNavIndex !== -1) {
    let topPart = content.substring(0, bottomNavIndex);
    let bottomPart = content.substring(bottomNavIndex);

    bottomPart = bottomPart.replace(/onClick=\{\(\) => setActiveTab\('([^']+)'\)\}/g, "onClick={() => { setActiveTab('$1'); setSeatModal({...seatModal, open: false}); }}");
    
    content = topPart + bottomPart;
}

// 4. Update NavigationLinks component to also clear modal
// Let's search for NavigationLinks definition
content = content.replace(
    /const NavigationLinks = \(\) => \(/,
    `const NavigationLinks = () => (
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
    );
    //`
);
// Wait, `NavigationLinks` is already defined in App.jsx. Let's not blind replace it unless we know its exact structure.
// Instead of replacing the whole component, let's just find where it sets activeTab and modify it.
content = content.replace(
    /onClick=\{\(\) => setActiveTab\(tab\)\}/g,
    "onClick={() => { setActiveTab(tab); setSeatModal({...seatModal, open: false}); }}"
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed header and bottom nav');
