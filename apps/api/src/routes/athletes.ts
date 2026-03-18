import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { prisma } from "../db.js";
import { Prisma } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { athleteProfileSchema, athleteProfileUpdateSchema, serviceAreaSchema } from "@apex-sports/shared";

const router = Router();
const s3Client = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;

// Get own athlete profile
router.get("/me", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      athleteProfiles: true,
      coachProfile: { select: { id: true } },
    },
  });

  if (!dbUser) return res.status(404).json({ error: "User not found" });

  let profile = dbUser.athleteProfiles[0] ?? null;
  if (!profile) {
    if (dbUser.signupRole === "coach" || dbUser.coachProfile) {
      return res.status(404).json({ error: "No athlete profile. You signed up as a coach." });
    }
    profile = await prisma.athleteProfile.create({
      data: {
        userId: dbUser.id,
        displayName: dbUser.name ?? "",
        serviceCity: null,
        birthYear: null,
        sports: [],
        level: null,
      },
    });
  }

  res.json({
    id: profile.id,
    displayName: profile.displayName,
    serviceCity: profile.serviceCity,
    avatarUrl: profile.avatarUrl ?? null,
    birthYear: profile.birthYear,
    sports: profile.sports,
    level: profile.level,
    phone: profile.phone ?? null,
  });
});

// Create or update own athlete profile
router.put("/me", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const parsed = athleteProfileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data = parsed.data;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, signupRole: true, coachProfile: { select: { id: true } } },
  });
  if (!dbUser) return res.status(404).json({ error: "User not found" });

  if (dbUser.signupRole === "coach" || dbUser.coachProfile) {
    return res.status(403).json({ error: "Coach accounts cannot create or update athlete profiles." });
  }

  const existing = await prisma.athleteProfile.findFirst({
    where: { userId: user.id },
  });

  let profile;
  if (existing) {
    profile = await prisma.athleteProfile.update({
      where: { id: existing.id },
      data: {
        ...(data.displayName !== undefined && { displayName: data.displayName }),
        ...(data.serviceCity !== undefined && { serviceCity: data.serviceCity }),
        ...(data.birthYear !== undefined && { birthYear: data.birthYear ?? null }),
        ...(data.sports !== undefined && { sports: data.sports }),
        ...(data.level !== undefined && { level: data.level ?? null }),
        ...(data.phone !== undefined && { phone: data.phone ?? null }),
      },
    });
  } else {
    profile = await prisma.athleteProfile.create({
      data: {
        userId: user.id,
        displayName: data.displayName ?? dbUser.name ?? "",
        serviceCity: data.serviceCity !== undefined ? data.serviceCity : null,
        birthYear: data.birthYear !== undefined ? data.birthYear ?? null : null,
        sports: data.sports && data.sports.length > 0 ? data.sports : [],
        level: data.level !== undefined ? data.level ?? null : null,
        phone: data.phone ?? null,
      },
    });
  }

  res.json({
    id: profile.id,
    displayName: profile.displayName,
    serviceCity: profile.serviceCity,
    avatarUrl: profile.avatarUrl ?? null,
    birthYear: profile.birthYear,
    sports: profile.sports,
    level: profile.level,
    phone: profile.phone ?? null,
  });
});

// Presigned URL for athlete profile photo upload
router.post("/me/photo/presign", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!UPLOADS_BUCKET) return res.status(503).json({ error: "Uploads not configured" });
  const profile = await prisma.athleteProfile.findFirst({ where: { userId: user.id }, select: { id: true } });
  if (!profile) return res.status(404).json({ error: "Athlete profile not found" });
  const contentType = (req.body as { contentType?: string }).contentType ?? "image/jpeg";
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowed.includes(contentType)) return res.status(400).json({ error: "Invalid content type" });
  const ext = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
  const key = `athletes/${profile.id}/${randomUUID()}.${ext}`;
  const command = new PutObjectCommand({ Bucket: UPLOADS_BUCKET, Key: key, ContentType: contentType, ACL: "public-read" });
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
  const url = `https://${UPLOADS_BUCKET}.s3.${process.env.AWS_REGION ?? "us-east-1"}.amazonaws.com/${key}`;
  res.json({ uploadUrl, url });
});

// Set athlete avatar URL
router.patch("/me/avatar", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const profile = await prisma.athleteProfile.findFirst({ where: { userId: user.id }, select: { id: true } });
  if (!profile) return res.status(404).json({ error: "Athlete profile not found" });
  const avatarUrl = (req.body as { avatarUrl?: string }).avatarUrl;
  if (typeof avatarUrl !== "string") return res.status(400).json({ error: "avatarUrl is required" });
  await prisma.athleteProfile.update({ where: { id: profile.id }, data: { avatarUrl: avatarUrl.trim() || null } });
  res.json({ avatarUrl: avatarUrl.trim() || null });
});

// Service area for athlete (single)
router.get("/me/service-area", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const profile = await prisma.athleteProfile.findFirst({ where: { userId: user.id }, select: { id: true } });
  if (!profile) return res.status(404).json({ error: "Athlete profile not found" });
  const area = await prisma.serviceArea.findFirst({ where: { athleteProfileId: profile.id } });
  if (!area) return res.json(null);
  res.json({
    id: area.id,
    label: area.label,
    latitude: Number(area.latitude),
    longitude: Number(area.longitude),
    radiusMiles: area.radiusMiles,
  });
});

router.post("/me/service-area", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const profile = await prisma.athleteProfile.findFirst({ where: { userId: user.id }, select: { id: true } });
  if (!profile) return res.status(404).json({ error: "Athlete profile not found" });
  const parsed = serviceAreaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { label, latitude, longitude, radiusMiles } = parsed.data;
  // Replace existing (single area)
  await prisma.serviceArea.deleteMany({ where: { athleteProfileId: profile.id } });
  const area = await prisma.serviceArea.create({
    data: {
      label,
      latitude: new Prisma.Decimal(latitude),
      longitude: new Prisma.Decimal(longitude),
      radiusMiles,
      athleteProfileId: profile.id,
    },
  });
  res.status(201).json({
    id: area.id,
    label: area.label,
    latitude: Number(area.latitude),
    longitude: Number(area.longitude),
    radiusMiles: area.radiusMiles,
  });
});

export default router;

