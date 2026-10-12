import { notesRouter } from '../src/routes/notes.ts';

describe('Notes API', () => {
  let app: Express.Application;
  let server: http.Server;
  let db: Database;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/notes', notesRouter);
    db = new Database();
    db.connect();
    server = app.listen(3000);
  });

  afterEach(() => {
    db.disconnect();
    server.close();
  });

  describe('GET /notes', () => {
    it('should return a list of notes', async () => {
      const response = await request(app).get('/notes');
      expect(response.statusCode).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
    });
  });

  describe('POST /notes', () => {
    it('should create a new note', async () => {
      const note = { title: 'Test Note', content: 'This is a test note.' };
      const response = await request(app).post('/notes').send(note);
      expect(response.statusCode).toBe(201);
      expect(response.body).toHaveProperty('id');
    });
  });

  describe('GET /notes/:id', () => {
    it('should return a single note by ID', async () => {
      const note = { title: 'Test Note', content: 'This is a test note.' };
      const savedNote = await db.createNote(note);
      const response = await request(app).get(`/notes/${savedNote.id}`);
      expect(response.statusCode).