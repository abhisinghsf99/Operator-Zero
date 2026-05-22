/**
 * tests/unit/onboarding-progress.test.ts
 * Wave-0 scaffold — ONBOARD-06: Step-progress persistence + resume from last step
 *
 * Tests that abandoned onboarding saves progress and resumes from the correct step
 * using user_profiles.onboarding_step.
 *
 * Requirement: ONBOARD-06 — Abandoned onboarding saves progress and resumes
 */
import { describe, it, expect } from "vitest";

describe("ONBOARD-06 — Onboarding step-progress persistence + resume", () => {
  it.todo("saveOnboardingStep updates user_profiles.onboarding_step in DB");

  it.todo("onboarding_step is persisted per user (scoped by user_id)");

  it.todo("re-visiting onboarding redirects to the last saved step");

  it.todo("onboarding_step = 0 means start of onboarding (not completed)");

  it.todo("completing all steps sets user_profiles.onboarding_completed_at");

  it.todo("after completion, onboarding redirect does not loop back to wizard");

  it.todo("step 2 (Shopify) is required — cannot advance without integration");

  it.todo("step 3 (Gmail) is skippable with explicit skipGmail flag");
});
