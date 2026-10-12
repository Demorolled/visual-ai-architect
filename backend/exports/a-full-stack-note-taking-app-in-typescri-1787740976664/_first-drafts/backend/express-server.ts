import * as express from 'express';
import * as http from 'http';

const app: express.Application = express();
const server: http.Server = http.createServer(app);

app.use(express.json());
app.use(express.static('frontend/build'));

app.get('*', (req, res) => {
  res.sendFile(require.resolve('../frontend/build/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});