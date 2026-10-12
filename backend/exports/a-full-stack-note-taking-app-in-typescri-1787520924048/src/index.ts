import express from 'express';
import noteRouter from './routes/note';

const appInstance = express();
appInstance.use(express.json());
appInstance.use('/notes', noteRouter);

const PORT = process.env.PORT || 3000;

appInstance.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Add basic CLI argument handling
process.argv.forEach((val, index) => {
  if (index === 2) {
    console.log(`Argument ${index}: ${val}`);
  }
});