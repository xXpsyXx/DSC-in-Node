import express from 'express';
import cors from 'cors';
import signRoutes from './routes/sign.route.ts';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', signRoutes);

app.get('/health', (_, res) => {
  res.send('Helper app running');
});



app.listen(5000, () => {
  console.log('DSC Helper running on http://localhost:5000');
});