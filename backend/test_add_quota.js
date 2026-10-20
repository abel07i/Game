const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const token = jwt.sign({ id: '00000000-0000-0000-0000-000000000001', role: 'admin' }, process.env.JWT_SECRET);
const opts = { hostname: 'localhost', port: 3000, path: '/api/v1/admin/room-configs/quota', method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } };
const req = http.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => console.log(res.statusCode, d)); }).on('error', console.error);
req.write(JSON.stringify({ groupSize: 100, maxSeatsPerUser: 10 }));
req.end();
