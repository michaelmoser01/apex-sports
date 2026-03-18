export const ONBOARDING_STEPS: readonly { path: string; label: string; stepLabel: string }[] = [
  { path: "basic", label: "Basic info", stepLabel: "Info" },
  { path: "credentials", label: "Credentials", stepLabel: "Credentials" },
  { path: "about", label: "About", stepLabel: "About" },
  { path: "assistant", label: "Assistant", stepLabel: "Set up Assistant" },
];

export const ONBOARDING_BASE = "/coach/onboarding";
export const ONBOARDING_STEP_PATHS = ONBOARDING_STEPS.map((s) => `${ONBOARDING_BASE}/${s.path}`);

export type OnboardingStepPath = (typeof ONBOARDING_STEP_PATHS)[number];

export function getOnboardingStepIndex(pathname: string): number {
  const i = ONBOARDING_STEP_PATHS.findIndex((p) => pathname === p || pathname.startsWith(p + "?"));
  return i >= 0 ? i : 0;
}

export interface OnboardingState {
  hasProfile: boolean;
  hasBio: boolean;
  hasAssistant: boolean;
}

export function getNextOnboardingStep(state: OnboardingState): string | null {
  if (!state.hasProfile) return `${ONBOARDING_BASE}/basic`;
  if (!state.hasBio) return `${ONBOARDING_BASE}/about`;
  if (!state.hasAssistant) return `${ONBOARDING_BASE}/assistant`;
  return null;
}

export function isOnboardingComplete(state: OnboardingState): boolean {
  return state.hasProfile && state.hasBio && state.hasAssistant;
}
