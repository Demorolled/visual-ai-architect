# Full-Stack Note-Taking App

This is a full-stack note-taking app built with Express.js for the backend, React for the frontend, and in-memory storage for simplicity. The app allows users to add, list, and delete notes.

## Project Structure

```
full-stack-notes/
├── client/
│   ├── node_modules/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AddNote.tsx
│   │   │   ├── NoteList.tsx
│   ├── App.tsx
│   ├── index.tsx
├── tests/
│   ├── app.test.ts
├── Dockerfile
├── docker-compose.yml
├── package.json
├── README.md
├── LICENSE
└── index.html
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/your-username/full-stack-notes.git
   cd full-stack-notes
   ```

2. Install dependencies for the server:
   ```sh
   npm install
   ```

3. Start the server:
   ```sh
   npm start
   ```

4. Open a new terminal window and navigate to the `client` directory:
   ```sh
   cd client
   ```

5. Install dependencies for the frontend:
   ```sh
   npm install
   ```

6. Start the frontend development server:
   ```sh
   npm start
   ```

7. Open your browser and go to `http://localhost:3000` to access the app.

## Features

- **Add Notes:** Enter a title and content for a note.
- **List Notes:** View all notes.
- **Delete Notes:** Remove a note by clicking the trash icon.

## Testing

The app includes unit tests for the core logic. To run the tests:

1. Navigate to the root directory of the project.
2. Run the tests using npm:
   ```sh
   npm test
   ```

## Docker Deployment

You can also deploy the app using Docker. Make sure Docker is installed on your machine, then run:

1. Build the Docker image:
   ```sh
   docker build -t full-stack-notes .
   ```

2. Run the container:
   ```sh
   docker run -p 3000:3000 full-stack-notes
   ```

3. Open your browser and go to `http://localhost:3000` to access the app.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

Enjoy building and using your full-stack note-taking app!