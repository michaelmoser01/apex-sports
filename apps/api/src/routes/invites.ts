import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

// Public: resolve invite slug to coach info (for join page / SPA)
router.get("/:slug", async (req, res) => {
  const slug = typeof req.params.slug === "string" ? req.params.slug.trim().toLowerCase() : "";
  if (!slug) return res.status(400).json({ error: "Invalid invite" });

  const invite = await prisma.coachInvite.findUnique({
    where: { slug },
    include: {
      coach: {
        select: {
          id: true,
          displayName: true,
          sports: true,
          serviceCities: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!invite) return res.status(404).json({ error: "Invite not found" });

  res.json({
    slug: invite.slug,
    coach: invite.coach
      ? {
          id: invite.coach.id,
          displayName: invite.coach.displayName,
          sports: invite.coach.sports,
          serviceCities: invite.coach.serviceCities,
          avatarUrl: invite.coach.avatarUrl,
        }
      : null,
  });
});

export default router;
