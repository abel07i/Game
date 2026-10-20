const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/admin/dashboard/stats',
  method: 'GET',
  headers: {
    // We need a token to hit this endpoint
  }
};

// Instead of curling, let's just create a token and curl it
const jwt = require('jsonwebtoken');
require('dotenv').config();
const token = jwt.sign({ id: '00000000-0000-0000-0000-000000000001', role: 'admin' }, process.env.JWT_SECRET);

options.headers['Authorization'] = 'Bearer ' + token;

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(res.statusCode, data));
});
req.on('error', console.error);
req.end();
