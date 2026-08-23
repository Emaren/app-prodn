import { cookies } from "next/headers";

import ContactEmarenWorkspace from "@/components/contact/ContactEmarenWorkspace";
import { getPrisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  verifySession,
} from "@/lib/session";
import { isPublicZodiacTrainingContactUid } from "@/lib/zodiacTraining";

export const dynamic = "force-dynamic";

export default async function ContactEmarenPage({
  searchParams,
}: {
  searchParams?: Promise<{
    user?: string | string[];
    academyTx?: string | string[];
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedUser = Array.isArray(resolvedSearchParams.user)
    ? resolvedSearchParams.user[0]
    : resolvedSearchParams.user;
  const isZodiacTrainingRequest =
    isPublicZodiacTrainingContactUid(requestedUser);
  const academyTx = Array.isArray(resolvedSearchParams.academyTx)
    ? resolvedSearchParams.academyTx[0]
    : resolvedSearchParams.academyTx;
  const normalizedAcademyTx =
    isZodiacTrainingRequest &&
    typeof academyTx === "string" &&
    /^[A-Fa-f0-9]{16,128}$/.test(academyTx.trim())
      ? academyTx.trim().toUpperCase()
      : null;
  let hasAcademyPayment = false;
  if (normalizedAcademyTx) {
    try {
      const cookieStore = await cookies();
      const claims = await verifySession(
        cookieStore.get(SESSION_COOKIE_NAME)?.value
      );
      if (claims?.uid) {
        const receipt = await getPrisma().userActivityEvent.findFirst({
          where: {
            type: "academy_lesson_payment",
            label: normalizedAcademyTx,
            user: { uid: claims.uid },
          },
          select: { id: true },
        });
        hasAcademyPayment = Boolean(receipt);
      }
    } catch (error) {
      console.warn("Academy payment receipt could not be loaded:", error);
    }
  }

  return (
    <div className="flex h-full min-h-0 max-h-full flex-col gap-2 overflow-hidden py-0 text-white sm:gap-3">
      <section className="hidden shrink-0 overflow-hidden rounded-[1.25rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.14),_transparent_30%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#020617)] p-3 sm:block [@media(max-height:50rem)]:!hidden sm:rounded-[1.6rem] sm:p-5">
        <div className="max-w-3xl space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.28em] text-amber-200/70 sm:text-xs sm:tracking-[0.35em]">
            Direct Line
          </div>
          <h1 className="text-lg font-semibold leading-6 text-white sm:text-2xl sm:leading-8">
            {isZodiacTrainingRequest
              ? "Train Under Zodiac"
              : "Contact Emaren, The AI Scribe, or Grimer"}
          </h1>
          <p className="max-w-2xl overflow-hidden text-xs leading-5 text-slate-300 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] sm:text-sm">
            {isZodiacTrainingRequest
              ? hasAcademyPayment
                ? `Your 100 WOLO Academy payment is verified. Open the private line with Zodiac and bring the replay you want reviewed. Proof ${normalizedAcademyTx?.slice(
                    0,
                    10
                  )}…`
                : "Open a private line with Zodiac, share the replay you want reviewed, and tell him what part of Deathmatch keeps breaking down."
              : "Keep the human line with Emaren open, lean on The AI Scribe for sharp site help and replay context, or let Grimer throw a darker little jab into the room when you want extra colour."}
          </p>
        </div>
      </section>

      <div className="min-h-0 flex-1">
        <ContactEmarenWorkspace />
      </div>
    </div>
  );
}
