import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDeleteUser, requireAdmin } from "./routes/admin-auth.js";

export function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(
    express.urlencoded({
      extended: true,
    }),
  );

  app.delete("/api/admin/delete-user", requireAdmin, handleDeleteUser);

  return app;
}
