const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const token = jwt.sign({ id: '00000000-0000-0000-0000-000000000001', role: 'admin' }, process.env.JWT_SECRET);
const opts = { hostname: 'localhost', port: 3000, path: '/api/v1/admin/room-configs', method: 'GET', headers: { 'Authorization': 'Bearer ' + token } };
http.get(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => console.log(res.statusCode, d)); }).on('error', console.error);
