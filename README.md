# POS Real - Point of Sale Web Application

A simple Point of Sale web application built with React, Express, and Supabase.

## Features

- **Cashier Screen**: Scan barcodes to add items to transactions, process cash payments, and calculate change
- **Item Management**: (Coming soon)
- **Reports**: (Coming soon)

## Setup

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Supabase account and project

### Installation

1. Install all dependencies:
```bash
npm run install-all
```

2. Set up environment variables:

Create `server/.env` file:
```
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
PORT=3001
```

3. Run the database migrations in your Supabase SQL editor (see schema in the project description).

### Running the Application

Start both server and client in development mode:
```bash
npm run dev
```

Or run them separately:
```bash
# Terminal 1 - Backend
npm run server

# Terminal 2 - Frontend
npm run client
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## Project Structure

```
POSReal/
├── server/          # Express backend
│   ├── index.js     # Main server file with API routes
│   └── package.json
├── client/          # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   └── TabBar.js
│   │   ├── screens/
│   │   │   └── CashierScreen.js
│   │   ├── App.js
│   │   └── index.js
│   └── package.json
└── package.json     # Root package.json for workspace scripts
```

## API Endpoints

- `POST /api/barcode/lookup` - Look up item by barcode
- `GET /api/items/:itemId` - Get item details
- `POST /api/transactions` - Create new transaction
- `POST /api/transactions/:transactionId/lines` - Add item to transaction
- `POST /api/transactions/:transactionId/finalize` - Finalize transaction with payment
- `GET /api/transactions/:transactionId` - Get transaction with lines

