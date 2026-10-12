# Note-Taking App

A full-stack note-taking app built with Express.js (Node.js) as the backend and React as the frontend.

## Project Structure

- `src/`: Source code files
  - `api.ts`: Express API routes and middleware
  - `database.ts`: In-memory database for notes
  - `index.ts`: Entry point for the Express API server
- `src/tests/`: Unit tests for the Express API server and in-memory database
- `Dockerfile`: Dockerfile for deployment
- `package.json`: Node.js package configuration
- `README.md`: Project documentation

## Running the App

1. Clone the repository:
   ```sh
   git clone https://github.com/your-username/note-taking-app.git
   cd note-taking-app
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Build the project:
   ```sh
   npm run build
   ```
4. Start the server:
   ```sh
   npm start
   ```

## Testing

Run the tests using Jest:
```sh
npm test
```

## Docker

Build and run the Docker container:
```sh
docker build -t note-taking-app .
docker run -p 3000:3000 note-taking-app
```

## License

[MIT License](LICENSE)
