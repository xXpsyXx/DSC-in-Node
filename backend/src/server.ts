import express from 'express';
import cors from 'cors';
import signRoutes from './routes/sign.route.ts';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env') });

const app = express();
const port = Number.parseInt(process.env.PORT || '5000', 10);


app.use(
  cors({
    exposedHeaders: ['X-File-Hash', 'X-File-Signature', 'X-Signed-Date'],
  }),
);
app.use(
  cors({
    exposedHeaders: ['X-File-Hash', 'X-File-Signature', 'X-Signed-Date'],
  }),
);
app.use(express.json());

app.use('/api', signRoutes);

app.get('/health', (_, res) => {
  res.send('Helper app running');
});

const server = app.listen(port, () => {
  console.log(`DSC Helper running on http://localhost:${port}`);
});

server.on('error', (error) => {
  console.error('[server] Failed to start:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[server] Uncaught exception:', error);
  process.exit(1);
});
