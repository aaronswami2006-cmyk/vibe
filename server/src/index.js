import dotenv from 'dotenv';
import http from 'http';
import app from './app.js';
import { connectDatabase } from './lib/db.js';
import { configureSocket } from './socket.js';

dotenv.config();

const port = process.env.PORT || 5000;
const server = http.createServer(app);

configureSocket(server);

connectDatabase()
  .then(() => {
    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  });
