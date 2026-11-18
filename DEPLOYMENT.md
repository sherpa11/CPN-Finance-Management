# CPN RAJA – VATTI MANAGEMENT SYSTEM
## PRODUCTION DEPLOYMENT & OPERATIONS MANUAL

---

## 1. ARCHITECTURE OVERVIEW

The application is architected into two decoupled tiers:

1. **Frontend Tier (Vite + React.js + Tailwind CSS):**
   - High-speed Single Page Application (SPA).
   - Can be deployed to **Vercel**, **Cloudflare Pages**, or served directly from the Node.js backend as a static bundle.
   - All monetary calculations are displayed from the backend engine.

2. **Backend Tier (Node.js + Express.js + Mongoose):**
   - Centralized financial calculation engine with integer paise precision.
   - Due date evaluation running in `Asia/Kolkata` timezone.
   - JWT authentication, bcrypt password hashing, atomic transaction rollback guards, and audit trail.
   - Can be deployed to **Render**, **Railway**, **AWS EC2**, or any Linux VPS (Ubuntu / Debian).

3. **Database Tier (MongoDB Atlas):**
   - 3-node replica set cluster on MongoDB Atlas.
   - Provides native multi-document ACID transactions and automated daily backups.

---

## 2. ENVIRONMENT VARIABLES CONFIGURATION

### Backend Environment Variables (`backend/.env`):

| Variable Name | Example Value | Description |
| :--- | :--- | :--- |
| `PORT` | `5000` | Port for Express HTTP server |
| `NODE_ENV` | `production` | Node environment (`development` or `production`) |
| `MONGODB_URI` | `mongodb+srv://cpnadmin:Password@cluster0.mongodb.net/cpn_raja_vatti_db?retryWrites=true&w=majority` | MongoDB Atlas replica set URI |
| `JWT_SECRET` | `cpn_raja_production_super_secret_jwt_key_2026_xyz` | Minimum 32-character random string |
| `JWT_EXPIRES_IN` | `7d` | Token expiry duration |
| `APP_NAME` | `"CPN RAJA – VATTI MANAGEMENT SYSTEM"` | Application display name |
| `BUSINESS_OWNER` | `"CPN Raja"` | Owner name for receipts & vouchers |
| `TIMEZONE` | `"Asia/Kolkata"` | Standard Indian business timezone |
| `DEFAULT_REMINDER_DAYS` | `3` | Default window for upcoming due notifications |

---

## 3. DATABASE SETUP (MONGODB ATLAS)

1. Create a free or dedicated cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Under **Database Access**, create a user `cpnadmin` with read and write permissions to `cpn_raja_vatti_db`.
3. Under **Network Access**, add the IP address of your backend server (or `0.0.0.0/0` with strong password authentication).
4. Click **Connect** -> **Connect your application** -> **Driver: Node.js (version 6.x or later)** and copy the connection string.
5. Paste the connection string into `backend/.env` as `MONGODB_URI`.

---

## 4. ADMIN PROVISIONING

To initialize the database with default calculation configurations and the official administrator account for CPN Raja:

```bash
cd backend
npm run seed
```

### Initial Administrator Credentials:
- **Username:** `cpnraja`
- **Email:** `cpnraja@vattibusiness.com`
- **Initial Password:** `cpnraja2026`
- **Role:** `admin`

*Note: Immediately after first login, the password can be updated securely in the settings menu or via the API.*

---

## 5. DEPLOYMENT OPTIONS

### OPTION A: Unified Single-Server Deployment (Fastest & Most Economical)

The Node.js backend automatically serves the compiled React frontend from `frontend/dist` when present.

1. Build frontend bundle:
   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. Start backend server:
   ```bash
   cd ../backend
   npm install
   npm start
   ```

3. The entire application (both UI and APIs) is live on `http://localhost:5000` (or Port 80/443 with Nginx reverse proxy).

---

### OPTION B: Split Cloud Deployment (Vercel + Render / Railway)

#### Step 1: Deploy Backend to Render or Railway
1. Push the code to a private GitHub repository.
2. In [Render](https://render.com) or [Railway](https://railway.app), create a new **Web Service**.
3. Set **Root Directory** to `backend`.
4. Set **Build Command** to `npm install`.
5. Set **Start Command** to `npm start`.
6. Add environment variables: `MONGODB_URI`, `JWT_SECRET`, `NODE_ENV=production`, `PORT=5000`.
7. Deploy. Render will provide a backend URL: `https://cpn-vatti-api.onrender.com`.

#### Step 2: Deploy Frontend to Vercel
1. In [Vercel](https://vercel.com), click **Add New Project** and import the repository.
2. Set **Root Directory** to `frontend`.
3. Framework Preset: **Vite**.
4. Under **Build and Output Settings**:
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Create a `vercel.json` in `frontend/` to rewrite `/api/:path*` to your Render backend:
   ```json
   {
     "rewrites": [
       {
         "source": "/api/:path*",
         "destination": "https://cpn-vatti-api.onrender.com/api/:path*"
       },
       {
         "source": "/(.*)",
         "destination": "/index.html"
       }
     ]
   }
   ```
6. Click **Deploy**. Vercel will provide the custom domain for CPN Raja.

---

## 6. BACKUP AND RESTORATION PROCEDURES

### 1. In-App One-Click JSON Backup (Administrator Only)
- Log in as `cpnraja`.
- Navigate to **Settings & Audit**.
- Click **Export Database Backup (JSON)**.
- A complete JSON snapshot containing all customers, active/settled loans, collection receipts, ledger transactions, notifications, and audit logs will be downloaded to your local computer.

### 2. Command-Line MongoDB Native Dump & Restore
To perform an automated command-line dump:
```bash
# Export
mongodump --uri="<YOUR_MONGODB_URI>" --out="./backups/backup_$(date +%Y%m%d)"

# Restore
mongorestore --uri="<YOUR_MONGODB_URI>" --drop ./backups/backup_20261119/cpn_raja_vatti_db
```

---

## 7. AUTOMATED TEST VERIFICATION

Run the full automated test suite anytime to verify calculation and API integrity:

```bash
cd backend
npm test
```

Expected output:
```
TOTAL TESTS: 28 | PASSED: 28 | FAILED: 0
```
