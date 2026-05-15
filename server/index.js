import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDeleteUser, requireAdmin } from "./routes/admin-auth";

export function createServer() {
    const app = express();
    // Middleware
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({
        extended: true
    }));

    // Admin routes (require authenticated admin)
    app.delete("/api/admin/delete-user/:uid", requireAdmin, handleDeleteUser);

    return app;
}

