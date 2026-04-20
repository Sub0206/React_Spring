import { useEffect } from "react";
import { useRouter } from "expo-router";

// The old 4-screen swiper has been REPLACED by the in-app coachmarks tour.
// This page simply bounces to /.
export default function OnboardingRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/" as any); }, [router]);
  return null;
}
