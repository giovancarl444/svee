import { describe, it, expect } from "vitest";
import { resolveMessageChannel, channelReadiness } from "./channels.js";
import { selectChannel } from "./channel.js";
import { makeFacts } from "./test-support.js";

const cfg = { messageChannel: "email" as const, emailProvider: "gmail" as const };

describe("selectChannel — email carries the provider", () => {
  it("stages Gmail vs Outlook per config", () => {
    expect(selectChannel(makeFacts({ applyMethod: "email", applyEmail: "j@co.com" }), { emailProvider: "gmail" }).channel).toBe("email:gmail");
    expect(selectChannel(makeFacts({ applyMethod: "email", applyEmail: "j@co.com" }), { emailProvider: "outlook" }).channel).toBe("email:outlook");
  });
});

describe("resolveMessageChannel — reply on the same channel", () => {
  it("uses the inbound channel when known, else the configured default", () => {
    expect(resolveMessageChannel("whatsapp", cfg).id).toBe("whatsapp");
    expect(resolveMessageChannel("linkedin", cfg).id).toBe("linkedin:dm");
    expect(resolveMessageChannel(undefined, cfg).id).toBe("email:gmail");
    expect(resolveMessageChannel(undefined, { ...cfg, messageChannel: "whatsapp" }).id).toBe("whatsapp");
  });

  it("each resolution carries an approval type and a concrete handoff", () => {
    const r = resolveMessageChannel("linkedin", cfg);
    expect(r.approvalType).toBe("send_followup");
    expect(r.handoff).toMatch(/send the LinkedIn message/i);
  });
});

describe("channelReadiness — the 'everything ready' matrix", () => {
  it("covers both layers and every surface, with a Sphere action per channel", () => {
    const rows = channelReadiness();
    const app = rows.filter((r) => r.layer === "application");
    const msg = rows.filter((r) => r.layer === "message");
    expect(app.length).toBeGreaterThanOrEqual(5); // ats, company_page, gmail, outlook, easy_apply, external
    expect(msg.length).toBeGreaterThanOrEqual(3); // email, linkedin dm, whatsapp
    // Every channel has a Sphere action and never says the twin sends.
    for (const r of rows) {
      expect(r.sphereExecutes.length).toBeGreaterThan(0);
      expect(r.prepares.length).toBeGreaterThan(0);
    }
    const surfaces = rows.map((r) => r.channel).join(" ");
    for (const s of ["ats", "company_page", "email:gmail", "email:outlook", "linkedin:easy_apply", "linkedin:dm", "whatsapp"]) {
      expect(surfaces).toContain(s);
    }
  });
});
