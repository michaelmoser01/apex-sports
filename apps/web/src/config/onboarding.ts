/** Off in production builds until assistant + agent testing are ready. */
export const isCoachAssistantOnboardingEnabled = !import.meta.env.PROD;

const baseOnboardingSteps: readonly { path: string; label: string; stepLabel: string }[] = [
  { path: "basic", label: "Basic info", stepLabel: "Info" },
  { path: "pricing", label: "Session pricing", stepLabel: "Pricing" },
  { path: "credentials", label: "Credentials", stepLabel: "Credentials" },
  { path: "about", label: "About", stepLabel: "About" },
];

const assistantOnboardingStep = {
  path: "assistant",
  label: "Assistant",
  stepLabel: "Set up Assistant",
} as const;

export const ONBOARDING_STEPS: readonly { path: string; label: string; stepLabel: string }[] =
  isCoachAssistantOnboardingEnabled ? [...baseOnboardingSteps, assistantOnboardingStep] : baseOnboardingSteps;

export const ONBOARDING_BASE = "/coach/onboarding";
export const ONBOARDING_STEP_PATHS = ONBOARDING_STEPS.map((s) => `${ONBOARDING_BASE}/${s.path}`);

export type OnboardingStepPath = (typeof ONBOARDING_STEP_PATHS)[number];

export function getOnboardingStepIndex(pathname: string): number {
  const i = ONBOARDING_STEP_PATHS.findIndex((p) => pathname === p || pathname.startsWith(p + "?"));
  return i >= 0 ? i : 0;
}

export interface OnboardingState {
  hasProfile: boolean;
  hasHourlyRate: boolean;
  hasBio: boolean;
  hasAssistant: boolean;
}

export function getNextOnboardingStep(state: OnboardingState): string | null {
  if (!state.hasProfile) return `${ONBOARDING_BASE}/basic`;
  if (!state.hasHourlyRate) return `${ONBOARDING_BASE}/pricing`;
  if (!state.hasBio) return `${ONBOARDING_BASE}/about`;
  if (isCoachAssistantOnboardingEnabled && !state.hasAssistant) return `${ONBOARDING_BASE}/assistant`;
  return null;
}

export function isOnboardingComplete(state: OnboardingState): boolean {
  const assistantOk = !isCoachAssistantOnboardingEnabled || state.hasAssistant;
  return state.hasProfile && state.hasHourlyRate && state.hasBio && assistantOk;
}
