# Hardcoded API URL Fixes in App.jsx

## All Instances to Replace

Replace all instances of `'http://localhost:3000/api/v1/...` with `API_URL + '/api/v1/...`

### List of Changes Required

Line 566: `fetch('http://localhost:3000/api/v1/rooms/ensure'`
→ `fetch(API_URL + '/api/v1/rooms/ensure'`

Line 861: `fetch('http://localhost:3000/api/v1/config'`
→ `fetch(API_URL + '/api/v1/config'`

Line 898: `authFetch('http://localhost:3000/api/v1/user/invite'`
→ `authFetch(API_URL + '/api/v1/user/invite'`

Line 916: `fetch('http://localhost:3000/api/v1/rooms'`
→ `fetch(API_URL + '/api/v1/rooms'`

Line 920: `fetch('http://localhost:3000/api/v1/results'`
→ `fetch(API_URL + '/api/v1/results'`

Line 1113: `authFetch('http://localhost:3000/api/v1/rooms/join'`
→ `authFetch(API_URL + '/api/v1/rooms/join'`

Line 1256: `authFetch('http://localhost:3000/api/v1/wallet/order'`
→ `authFetch(API_URL + '/api/v1/wallet/order'`

Line 1289: `authFetch('http://localhost:3000/api/v1/auth/profile'`
→ `authFetch(API_URL + '/api/v1/auth/profile'`

Line 1325: `authFetch('http://localhost:3000/api/v1/user/invite'`
→ `authFetch(API_URL + '/api/v1/user/invite'`

Line 1351: `authFetch('http://localhost:3000/api/v1/auth/profile'`
→ `authFetch(API_URL + '/api/v1/auth/profile'`

Line 1371: `authFetch('http://localhost:3000/api/v1/rooms/create_and_join'`
→ `authFetch(API_URL + '/api/v1/rooms/create_and_join'`

### Regex Replace Pattern

In your editor, use Find & Replace:
- Find: `http://localhost:3000/api/v1/`
- Replace: `${API_URL}/api/v1/`

Make sure API_URL is imported at the top:
```javascript
import { API_URL } from './config';
```
