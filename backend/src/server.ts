import express from 'express';
import cors from 'cors';
import signRoutes from './routes/sign.route.ts';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

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

app.listen(5000, () => {
  console.log('DSC Helper running on http://localhost:5000');
});
