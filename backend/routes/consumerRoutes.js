import express from "express";
import {
  completeOwnOnboarding,
  editConsumer,
  disconnectConsumer,
  listConsumers,
  registerConsumer,
  removeConsumer,
  showConsumer,
  updateOwnProfile,
} from "../controllers/consumerControllers.js";
import {
  authenticate,
  authorizeOwnerOrRoles,
  authorizeRoles,
} from "../middleware/authMiddleware.js";
import { authorizeConsumerPasswordChange } from "../controllers/authControllers.js";

const router = express.Router();

router.use(authenticate);
router.get("/", authorizeRoles("admin", "meter-reader"), listConsumers);
// Self-service routes must be declared before "/:id", otherwise Express matches
// the literal "me" as a consumer id.
router.patch("/me", authorizeRoles("consumer"), updateOwnProfile);
router.patch("/me/onboarding", authorizeRoles("consumer"), completeOwnOnboarding);
router.get(
  "/:id",
  authorizeOwnerOrRoles("id", "consumer", "admin", "meter-reader"),
  showConsumer
);
router.post("/", authorizeRoles("admin"), registerConsumer);
router.post("/:id/disconnect", authorizeRoles("admin"), disconnectConsumer);
router.patch("/:id", authorizeRoles("admin"), authorizeConsumerPasswordChange, editConsumer);
router.delete("/:id", authorizeRoles("admin"), removeConsumer);

export default router;
