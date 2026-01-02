/**
 * Auto-Handoff Hook
 *
 * Automatically creates handoffs and spawns subagents for resume operations.
 *
 * Usage:
 * 1. Copy this file to your Claude Code hooks directory
 * 2. Configure in .claude/settings.json:
 *    "hooks": {
 *      "beforeExit": "./hooks/auto-handoff.ts"
 *    }
 */

import { Hook } from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

interface HandoffHookContext {
  workingDirectory: string;
  conversationTokens: number;
  sessionDuration: number; // minutes
  task: (options: {
    subagent_type: string;
    description: string;
    prompt: string;
  }) => Promise<any>;
}

/**
 * Before Exit Hook
 * Automatically creates handoff when session ends
 */
export const beforeExit: Hook<HandoffHookContext> = async (context) => {
  const { workingDirectory, conversationTokens, task } = context;

  console.log("🔥 Auto-handoff: Session ending, creating handoff...");

  try {
    // Check if we should create a handoff
    if (conversationTokens < 10000) {
      console.log("   Short session, skipping auto-handoff");
      return;
    }

    // Determine handoff type based on token usage
    const handoffType = conversationTokens > 100000 ? "create" : "quick";

    // Spawn subagent to create handoff
    await task({
      subagent_type: "general-purpose",
      description: `Auto-create ${handoffType} handoff`,
      prompt: `Use the /reheat:${handoffType} skill to document the current session's work before exiting.

Session context:
- Token usage: ${conversationTokens}
- Create ${handoffType === "create" ? "comprehensive" : "quick"} documentation
- Focus on what was accomplished, what failed, and what's next

Execute /reheat:${handoffType} now.`,
    });

    console.log(`   ✅ Created ${handoffType} handoff at RESUME.md`);
  } catch (error) {
    console.error("   ❌ Auto-handoff failed:", error);
  }
};

/**
 * Context Limit Warning Hook
 * Creates handoff when approaching context limit
 */
export const onContextWarning: Hook<HandoffHookContext> = async (context) => {
  const { conversationTokens, task } = context;

  if (conversationTokens > 180000) {
    console.log("🔥 Context limit approaching, creating handoff...");

    await task({
      subagent_type: "general-purpose",
      description: "Emergency handoff before context limit",
      prompt: `We're approaching context limits. Use /reheat:save to document all current work immediately.

This is critical - we're about to lose context. Capture:
- What we're working on
- What's been done
- What failed and why
- What's next

Execute /reheat:save now.`,
    });

    console.log("   ✅ Emergency handoff created");
  }
};

/**
 * Session Start Hook
 * Automatically resumes from existing handoff
 */
export const onSessionStart: Hook<HandoffHookContext> = async (context) => {
  const { workingDirectory, task } = context;

  const handoffPath = path.join(workingDirectory, "RESUME.md");

  if (!fs.existsSync(handoffPath)) {
    console.log("🔥 No handoff found, starting fresh");
    return;
  }

  // Check handoff age
  const stats = fs.statSync(handoffPath);
  const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);

  console.log(`🔥 Found handoff (${ageHours.toFixed(1)}h old), auto-resuming...`);

  // Determine resume type based on age
  const resumeType = ageHours < 4 ? "resume-quick" : "resume";

  try {
    await task({
      subagent_type: "general-purpose",
      description: `Auto-resume from ${ageHours.toFixed(1)}h old handoff`,
      prompt: `A handoff document exists from ${ageHours.toFixed(1)} hours ago. Use /reheat:${resumeType} to resume the work.

Handoff age: ${ageHours.toFixed(1)} hours
Resume mode: ${resumeType === "resume-quick" ? "Quick (context still fresh)" : "Full (deep rebuild needed)"}

Execute /reheat:${resumeType} now.`,
    });

    console.log(`   ✅ Resumed via ${resumeType}`);
  } catch (error) {
    console.error("   ❌ Auto-resume failed:", error);
    console.log("   💡 You can manually resume with /reheat:resume");
  }
};

/**
 * Periodic Checkpoint Hook (Optional)
 * Creates checkpoint handoffs during long sessions
 */
export const onCheckpoint: Hook<HandoffHookContext> = async (context) => {
  const { sessionDuration, task } = context;

  // Every 2 hours, create a checkpoint
  if (sessionDuration > 0 && sessionDuration % 120 === 0) {
    console.log(`🔥 Session checkpoint (${sessionDuration / 60}h), creating handoff...`);

    await task({
      subagent_type: "general-purpose",
      description: "Periodic checkpoint handoff",
      prompt: `Creating periodic checkpoint after ${sessionDuration / 60} hours of work.

Use /reheat:save-quick to document current progress as a safety checkpoint.

Execute /reheat:save-quick now.`,
    });

    console.log("   ✅ Checkpoint handoff created");
  }
};

export default {
  beforeExit,
  onContextWarning,
  onSessionStart,
  onCheckpoint,
};
