const fs = require('fs');

const filePath = 'src/roomManager.js';
let content = fs.readFileSync(filePath, 'utf8');

const oldTickLogic = `      // Check when 60-second timer reaches zero
      if (room.timeRemaining <= 0) {
        // Minimum 2 players required to start
        if (uniquePlayers >= 2) {
          console.log(\`⏱️ 60s cycle ended for Game #\${room.roomNumber} with \${uniquePlayers} players. Starting game!\`);
          this.startRoomGame(roomId);
        } else {
          // Fewer than 2 players joined: keep game waiting until requirement is met
          room.timeRemaining = 60; // Reset 60s cycle to wait for 2nd player
          console.log(\`⏳ Game #\${room.roomNumber} has \${uniquePlayers} player(s) (needs ≥2). Keeping game waiting for next 60s cycle.\`);
          if (this.io) {
            this.io.emit('room:waiting_for_players', {
              roomId,
              roomNumber: room.roomNumber,
              currentPlayers: uniquePlayers,
              requiredPlayers: 2
            });
            this.io.emit('room:state_update', this.getRoomSummaries());
          }
        }
      }`;

const newTickLogic = `      // Check when 60-second timer reaches zero
      if (room.timeRemaining <= 0) {
        const isStrictSize = (room.groupSize === 5 || room.groupSize === 10);
        const canStart = isStrictSize ? (room.filledSeats >= room.groupSize) : (uniquePlayers >= 2);

        if (canStart) {
          console.log(\`⏱️ 60s cycle ended for Game #\${room.roomNumber}. Starting game!\`);
          this.startRoomGame(roomId);
        } else {
          room.timeRemaining = 60; // Reset 60s cycle
          console.log(\`⏳ Game #\${room.roomNumber} keeping game waiting.\`);
          if (this.io) {
            this.io.emit('room:waiting_for_players', {
              roomId,
              roomNumber: room.roomNumber,
              currentPlayers: uniquePlayers,
              requiredPlayers: isStrictSize ? room.groupSize : 2
            });
            this.io.emit('room:state_update', this.getRoomSummaries());
          }
        }
      }`;

content = content.replace(oldTickLogic, newTickLogic);

fs.writeFileSync(filePath, content, 'utf8');
console.log('RoomManager timer logic updated.');
