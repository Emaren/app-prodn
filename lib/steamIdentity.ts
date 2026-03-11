import { PrismaClient } from "@/lib/generated/prisma";
import { fetchSteamProfile } from "@/lib/steamAuth";
import { fetchUserVerification, type UserVerificationRow } from "@/lib/userDto";

function normalizePlayableName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 64);
}

async function seedPlayableNameFromPersona(
  prisma: PrismaClient,
  uid: string,
  personaName: string
) {
  const playableName = normalizePlayableName(personaName);
  if (playableName.length < 2) return null;

  const currentUser = await prisma.user.findUnique({
    where: { uid },
    select: { inGameName: true },
  });

  if (!currentUser || currentUser.inGameName) {
    return null;
  }

  const conflict = await prisma.user.findFirst({
    where: {
      inGameName: playableName,
      NOT: { uid },
    },
    select: { id: true },
  });

  if (conflict) {
    return null;
  }

  await prisma.user.update({
    where: { uid },
    data: { inGameName: playableName },
  });

  return playableName;
}

export async function hydrateSteamIdentity(prisma: PrismaClient, uid: string) {
  let verification: UserVerificationRow = await fetchUserVerification(prisma, uid);
  let seededPlayableName: string | null = null;

  if (verification.steamId && !verification.steamPersonaName) {
    const profile = await fetchSteamProfile(verification.steamId);
    if (profile.personaName) {
      await prisma.$executeRaw`
        UPDATE public.users
        SET steam_persona_name = ${profile.personaName}
        WHERE uid = ${uid}
      `;

      verification = {
        ...verification,
        steamPersonaName: profile.personaName,
      };
    }
  }

  if (verification.steamPersonaName) {
    seededPlayableName = await seedPlayableNameFromPersona(
      prisma,
      uid,
      verification.steamPersonaName
    );
  }

  return {
    verification,
    seededPlayableName,
  };
}
