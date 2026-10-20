const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const token = jwt.sign({ id: '00000000-0000-0000-0000-000000000001', role: 'admin' }, process.env.JWT_SECRET);

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/admin/profit/summary',
  method: 'GET',
  headers: { 'Authorization': 'Bearer ' + token }
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(res.statusCode, data));
});
req.on('error', console.error);
req.end();
