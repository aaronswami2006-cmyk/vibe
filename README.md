# Real-Time Chat Application

A MERN real-time chat app built from `Review1.docx`.

## Features

- User registration and login with JWT authentication
- Password hashing with bcrypt
- One-to-one and group chats
- Real-time messaging with Socket.IO
- Online/offline user status
- Message history stored in MongoDB
- In-app and browser notifications
- Admin dashboard for user monitoring/blocking

## Project Structure

```text
client/   React + Vite frontend
server/   Node.js + Express + MongoDB backend
```

## Setup

1. Install dependencies:

```bash
npm run install:all
```

2. Create `server/.env` from `server/.env.example`.

3. Start MongoDB locally or use MongoDB Atlas.

4. Run the app:

```bash
npm run dev
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:5000`

## Deploy For Multiple Users

For public use, do not use the local MongoDB service. Use MongoDB Atlas so the hosted backend can reach the database.

### 1. Create MongoDB Atlas Database

1. Go to MongoDB Atlas and create a free cluster.
2. Create a database user and password.
3. Add your IP address for development, and allow hosting provider access.
4. Copy the connection string.

Use it as:

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/vibe
```

### 2. Push To GitHub

Install Git for Windows first if `git --version` does not work:

```text
https://git-scm.com/download/win
```

Then run:

```bash
git init
git add .
git commit -m "Build Vibe real-time chat app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/vibe.git
git push -u origin main
```

### 3. Host Backend

Host the `server` folder on Render, Railway, or a similar Node.js hosting platform.

Backend settings:

```text
Root directory: server
Build command: npm install
Start command: npm start
```

Environment variables:

```env
MONGODB_URI=your-mongodb-atlas-uri
JWT_SECRET=a-long-random-secret
CLIENT_URLS=http://localhost:5173,https://your-frontend-url
```

### 4. Host Frontend

Host the `client` folder on Vercel or Netlify.

Frontend settings:

```text
Root directory: client
Build command: npm run build
Output directory: dist
```

Environment variables:

```env
VITE_API_URL=https://your-backend-url/api
VITE_SOCKET_URL=https://your-backend-url
```

After frontend deployment, add the final frontend URL to the backend `CLIENT_URLS` variable and restart the backend.
