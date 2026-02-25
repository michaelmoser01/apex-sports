import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { prisma } from "./db.js";

const COGNITO_REGION = process.env.COGNITO_REGION ?? "us-east-1";
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;

const jwksUri = COGNITO_USER_POOL_ID
  ? `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`
  : "";

const client = jwksUri
  ? jwksClient({
      jwksUri,
      cache: true,
      rateLimit: true,
    })
  : null;

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  if (!client || !header.kid) {
    callback(new Error("JWKS not configured"));
    return;
  }
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

export interface AuthUser {
  id: string;
  email: string;
  cognitoSub: string;
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  if (!COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID || !client) {
    return null;
  }

  return new Promise((resolve) => {
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ["RS256"],
        issuer: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`,
        audience: COGNITO_CLIENT_ID,
      },
      async (err, decoded) => {
        if (err || !decoded || typeof decoded === "string") {
          resolve(null);
          return;
        }
        const sub = decoded.sub as string;
        const email = (decoded.email as string) ?? (decoded["cognito:username"] as string);
        const name = (decoded.name as string) ?? (decoded["custom:name"] as string);
        // Ensure unique email (User.email is @unique); avoid "unknown" for multiple users
        const emailValue = email?.trim() || `unknown-${sub}@placeholder.local`;

        const user = await prisma.user.upsert({
          where: { cognitoSub: sub },
          create: {
            email: emailValue,
            cognitoSub: sub,
            name: name ?? null,
          },
          update: {
            ...(email?.trim() && { email: email.trim() }),
            name: name ?? undefined,
          },
        });

        resolve({
          id: user.id,
          email: user.email,
          cognitoSub: sub,
        });
      }
    );
  });
}

export function authMiddleware(required = true) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!COGNITO_USER_POOL_ID && process.env.NODE_ENV !== "production") {
      const devUserId = req.headers["x-dev-user-id"] as string | undefined;
      if (devUserId) {
        try {
          const user = await prisma.user.findUnique({ where: { id: devUserId } });
          if (user) {
            (req as Request & { user?: AuthUser }).user = {
              id: user.id,
              email: user.email,
              cognitoSub: "",
            };
            return next();
          }
        } catch (err) {
          console.error("Auth middleware error (dev user lookup):", err);
          next(err);
          return;
        }
      }
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      if (required) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      (req as Request & { user?: AuthUser }).user = undefined;
      next();
      return;
    }

    try {
      const user = await verifyToken(token);
      if (!user) {
        if (required) {
          res.status(401).json({ error: "Invalid token" });
          return;
        }
      }
      (req as Request & { user?: AuthUser }).user = user ?? undefined;
      next();
    } catch (err) {
      console.error("Auth middleware error (verifyToken):", err);
      next(err);
    }
  };
}
