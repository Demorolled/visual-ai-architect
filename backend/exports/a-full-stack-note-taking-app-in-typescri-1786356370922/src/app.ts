import { noteRoutes } from "./routes";
import { connectDatabase, saveNote, listNotes } from "./database";
export function run() {
  connectDatabase();
  const app = require("express")();
  app.use("/api/notes", noteRoutes);
  app.listen(3000, () => {
    console.log("Server running on port 3000")
  })
}