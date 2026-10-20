const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. In buySeat, don't close the modal, just clear selectedSeats
// And maybe show a toast or nothing.
content = content.replace(
    /setSeatModal\(\{ open: false, room: null, selectedSeats: \[\] \}\);/,
    `setSeatModal(prev => ({ ...prev, selectedSeats: [] }));`
);

// 2. In the render block for seatModal.open, we need to sync with rooms
// The block starts with: `{seatModal.open && seatModal.room ? (`
// We can inject the activeRoom resolution just before it, but it's JSX.
// Instead, we can do a trick: we replace `{seatModal.open && seatModal.room ? (` with an IIFE that resolves activeRoom, or better yet, do it at the top of the component!
// In App, before `return (`:
content = content.replace(
    /return \(\s*<div className="flex min-h-dvh/,
    `const activeRoom = seatModal.open && seatModal.room ? (rooms.find(r => r.id === seatModal.room.id) || seatModal.room) : null;\n\n    return (\n        <div className="flex min-h-dvh`
);

// Now replace all `seatModal.room` with `activeRoom` ONLY inside the `seatModal.open` rendering block.
// To do this safely, we will replace `seatModal.room` with `activeRoom` everywhere after `{seatModal.open && activeRoom ? (` up to `) : activeTab === 'home' && (`
// Wait, replacing `{seatModal.open && seatModal.room ? (` first:
content = content.replace(/\{seatModal\.open && seatModal\.room \? \(/g, '{seatModal.open && activeRoom ? (');

// Now, we can use a regex to replace seatModal.room with activeRoom within that block.
// Or we can just blindly replace `seatModal.room` with `activeRoom` everywhere in the JSX because if seatModal is closed, it doesn't matter, but it might break other things?
// No, seatModal.room is used in buySeat! We shouldn't replace it in buySeat.
// Let's manually replace `seatModal.room` with `activeRoom` ONLY in the JSX part.
// The JSX part starts at `return (`
const returnIndex = content.indexOf('return (');
const beforeReturn = content.slice(0, returnIndex);
let afterReturn = content.slice(returnIndex);

afterReturn = afterReturn.replace(/seatModal\.room/g, 'activeRoom');

content = beforeReturn + afterReturn;

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed buySeat and seatModal sync');
