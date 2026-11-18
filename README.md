# CPN RAJA – VATTI BUSINESS MANAGEMENT SYSTEM
### Final Development & Production Technical Manual

[![Tests](https://img.shields.io/badge/Financial%20Tests-28%20Passed%20%2F%200%20Failed-success)](#10-automated-test-suite)
[![Node](https://img.shields.io/badge/Node.js-v18%2B%20%7C%20v26-blue)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-cyan)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-Build%20Ready-purple)](https://vitejs.dev)
[![Database](https://img.shields.io/badge/MongoDB-Atlas%20Replica%20Set-green)](https://mongodb.com)

A complete, production-ready financial management platform custom-built for **CPN Raja's Vatti Business**. 

This system accurately manages customers, multiple active and completed loans per customer, individual loan interest rates, collections with explicit allocation, double-entry financial ledgers, automated due notifications in `Asia/Kolkata` timezone, and segregated financial reports.

---

## 1. TECHNOLOGY STACK

- **Frontend:**
  - React.js 19
  - Vite
  - Tailwind CSS v4
  - Lucide React
  - Recharts (Interactive financial analytics)
  - Axios (with JWT interceptors)
  - Printable Receipt & Statement templates (`@media print` CSS)

- **Backend:**
  - Node.js & Express.js
  - RESTful APIs
  - Centralized financial calculation engine
  - Luxon (Asia/Kolkata calendar & leap year math)

- **Database & Security:**
  - MongoDB & Mongoose
  - JWT Authentication (Bearer Tokens)
  - bcrypt password hashing
  - Idempotency key protection for payments
  - Multi-document transactions (MongoDB Atlas replica sets with local fallback)
  - Immutable audit logs (`AuditLog` collection)

---

## 2. BUSINESS DETAILS & VATTI CATEGORIES

- **Business Owner:** CPN Raja
- **Application Name:** CPN RAJA – VATTI MANAGEMENT SYSTEM
- **Multi-loan Support:** One customer can have multiple concurrent active, overdue, and settled loans.

### The Three Independent Vatti Categories:

1. **MONTHLY VATTI:**
   - **Formula:** $\text{Monthly Interest} = \frac{\text{Principal} \times \text{Monthly Rate} \times \text{Eligible Months}}{100}$
   - Simple interest model (no automatic compounding).
   - Configurable partial-month rule:
     - `PRO_RATA_DAILY`: Exact days in partial month $\times (\text{rate} / \text{daysInMonth})$.
     - `THIRTY_DAY_BASE`: Partial days / 30.
     - `FULL_MONTH_IF_STARTED`: Started month counts as full month.
     - `NO_INTEREST_IF_PARTIAL`: Only full completed calendar months count.
   - Status flag: Marked as *Pending Owner Confirmation* in Settings.

2. **DAILY VATTI:**
   - **Formula:** $\text{Daily Interest} = \frac{\text{Principal} \times \text{Daily Rate} \times \text{Eligible Days}}{100}$
   - Simple interest.
   - Configurable date-inclusion convention (`INCLUDE_START_EXCLUDE_END` or `INCLUDE_BOTH`).
   - Strict `Asia/Kolkata` timezone calendar evaluation.

3. **MEATER VATTI:**
   - Formula status: **"Calculation configuration pending"**.
   - As per specification, no unconfirmed interest is invented or auto-calculated.
   - Dedicated category, individual interest rate, independent account management, and principal tracking.
   - Pluggable architecture ready to activate the confirmed formula without refactoring.

---

## 3. FINANCIAL PRECISION ENGINE (INTEGER PAISE)

All monetary fields throughout MongoDB collections and backend services are stored in **integer paise** ($1\text{ INR} = 100\text{ paise}$):
- Prevents IEEE 754 floating-point rounding errors (e.g. `19.99 * 100 = 1998.9999999999998`).
- Strict integer mathematics for debits, credits, and running balances.
- Clear separation between **accrued interest** and **collected interest**.
- Never counts loan principal as business income.

---

## 4. INDIVIDUAL LOAN INTEREST RATES & SNAPSHOTS

- Every loan stores its own agreed interest percentage entered by the administrator (e.g. 2%, 3%, 0.1%).
- Saved as a permanent historical snapshot on the loan record.
- Rate changes to one customer or new loans never alter existing loan balances.
- Any subsequent rate changes require an **explicit authorized amendment** with reason, timestamp, user, and immutable audit log.

---

## 5. DATABASE ARCHITECTURE (8 COLLECTIONS)

1. `users`: Administrative and staff authentication accounts.
2. `customers`: Customer profiles, sequential IDs (`CPN-CUST-0001`), and running aggregate balances.
3. `loans`: Loan accounts (`CPN-LN-0001`), rate snapshots, and current balances.
4. `transactions`: Double-entry accounting ledger entries (`CPN-TXN-00001`).
5. `collections`: Payment records (`CPN-COL-0001`), receipt vouchers (`RCP-2026-0001`), and reversal status.
6. `notifications`: Persistent due date monitoring entries (`NOTIF-...`).
7. `auditLogs`: Audit trail recording every financial mutation, rate change, and reversal.
8. `calculationConfigurations`: Stored calculation rules for Monthly, Daily, Meater, and Business parameters.

---

## 6. COLLECTION MANAGEMENT & AUDITED REVERSALS

- **Explicit Allocation:** Does not automatically assume entire payment is interest or principal. Requires explicit principal vs interest allocation.
- **Idempotency Key:** Every payment submission sends a unique idempotency key to prevent accidental double-clicks or duplicate submissions.
- **No Silent Deletions:** Confirmed payment records are never deleted.
- **Audited Reversals:** Corrections use a formal reversal workflow with a mandatory reason, restoring customer/loan balances and creating a compensating audit ledger transaction.
- **Printable Receipts:** One-click official payment voucher with tear-off slip styling.

---

## 7. SEPARATE NOTIFICATIONS MENU

- **Dedicated Menu:** Completely independent from the Dashboard.
- **Categories:**
  1. `UPCOMING`: Accounts within the configurable reminder window (default 3 days).
  2. `DUE TODAY`: Accounts with maturity on the current `Asia/Kolkata` date.
  3. `OVERDUE`: Accounts past the due date with outstanding balances.
  4. `COMPLETED`: Settled accounts.
- **Backend Evaluation:** Evaluated automatically on server startup and periodic background cron. Does not require the browser to stay open.
- **Modular WhatsApp Hook:** Architectural hook prepared for WhatsApp Business API integration in the upcoming phase.

---

## 8. QUICK START & LOCAL SETUP

### Prerequisites:
- Node.js (v18 or later)
- MongoDB running on `mongodb://127.0.0.1:27017`

### 1. Install Dependencies:
```bash
# In backend
cd backend
npm install

# In frontend
cd ../frontend
npm install
```

### 2. Seed Default Admin & Initial Business Data:
```bash
cd backend
npm run seed
```

This creates the admin user:
- **Username:** `cpnraja`
- **Password:** `cpnraja2026`

### 3. Run the Automated Test Suite:
```bash
cd backend
npm test
```

### 4. Build Frontend:
```bash
cd frontend
npm run build
```

### 5. Start Backend Server:
```bash
cd backend
npm start
```
Open **`http://localhost:5000`** in your browser to use the application!

---

## 9. USER INTERFACE WORKSPACES

| Menu Item | Purpose |
| :--- | :--- |
| **Dashboard** | 8 KPI cards, lending vs collections trend chart, category breakdown, due customers list. |
| **Customers** | Borrower directory, multi-loan history, profile view, statement printing. |
| **New Vatti / Loan** | Dedicated form with real-time interest calculation preview and pre-save confirmation modal. |
| **Collections** | Payment recording with live balance calculator, receipt printing, and audited reversal. |
| **Due Management** | Filter by Today, Tomorrow, Next 7 Days, Overdue, or Custom range. |
| **Notifications** | Dedicated 4-category due date monitoring with manual re-evaluation trigger. |
| **Customer Ledgers** | Double-entry accounting ledger by customer and by loan account. |
| **Financial Reports** | Daily, Monthly, Yearly, Customer, and Vatti category reports with CSV and print export. |
| **Settings & Audit** | Business details, calculation rules, reminder window, audit log viewer, JSON database backup. |

---

## 10. AUTOMATED TEST SUITE

The financial engine and API layer are covered by comprehensive automated tests:
```
PASS tests/calculationEngine.test.js
  CPN RAJA – Centralized Financial Calculation Engine
    Integer Paise Conversion & Accuracy
      ✓ converts rupees to paise accurately without floating-point anomalies
      ✓ converts paise to rupees accurately
      ✓ formats INR correctly in Indian number format
    Monthly Vatti Financial Calculations
      ✓ calculates exact 1-month simple interest at 2% on ₹50,000
      ✓ calculates multiple months with individual customer rates (3% on ₹1,00,000 for 3 months)
      ✓ handles month-end leap year dates (Feb 29 on leap year vs Feb 28 on regular year)
      ✓ supports configurable partial month rules (pro-rata vs 30-day base)
    Daily Vatti Financial Calculations
      ✓ calculates daily interest accurately using Asia/Kolkata timezone
      ✓ supports configurable date inclusion conventions
    Meater Vatti Explicit Pending State
      ✓ does NOT invent formula and returns explicit pending status
    Collection Allocation & Balance Safety
      ✓ validates explicit allocation: interest only payment
      ✓ validates explicit allocation: partial principal reduction
      ✓ validates explicit allocation: full settlement of principal and interest
      ✓ rejects allocations that do not equal total payment received
      ✓ rejects principal allocation that exceeds outstanding principal

CPN RAJA – FINANCIAL API INTEGRATION SUITE
  ✓ POST /api/auth/login returns status 200
  ✓ JWT token successfully issued
  ✓ Authenticated user is cpnraja
  ✓ POST /api/customers returns status 201
  ✓ Sequential Customer ID generated
  ✓ POST /api/loans/preview returns status 200
  ✓ Expected interest is exactly ₹4,000 for ₹1,00,000 @ 2% for 2 months
  ✓ Total payable is ₹1,04,000
  ✓ POST /api/loans returns status 201
  ✓ Unique sequential Loan ID generated
  ✓ Individual interest rate preserved
  ✓ POST /api/collections returns status 201
  ✓ Unique printable receipt number generated
  ✓ Principal reduced accurately from ₹1,00,000 to ₹90,000
  ✓ Duplicate payment prevented via Idempotency Key
  ✓ POST /api/collections/:id/reverse returns status 200
  ✓ Collection marked REVERSED without deletion
  ✓ GET /api/ledger/loan/:id returns status 200
  ✓ Transactions array present
  ✓ Disbursement and reversal entries preserved
  ✓ GET /api/notifications returns status 200
  ✓ Notifications array retrieved
  ✓ GET /api/dashboard returns status 200
  ✓ Total customers metric present
  ✓ 6-Month trend dataset available
  ✓ GET /api/reports/daily returns status 200
  ✓ Principal lent segregated from collections
  ✓ Interest collected segregated

TOTAL TESTS: 28 | PASSED: 28 | FAILED: 0
```
