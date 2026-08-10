import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { streamDataChanges } from "../services/changeEventService.js";

const router = express.Router();

router.get("/stream", authenticate, streamDataChanges);

export default router;

