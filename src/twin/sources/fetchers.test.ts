import { describe, it, expect, vi, afterEach } from "vitest";
import {
  greenhouseFetcher,
  leverFetcher,
  buildFetcher,
  greenhouseToken,
  leverCompany,
  stripHtml,
} from "./fetchers.js";
import type { Source } from "../kb.schema.js";

const src = (o: Partial<Source>): Source => ({ name: "Test", kind: "ats", url: "", query: "", ...o });

function stubFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status, json: async () => body })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("token extraction", () => {
  it("reads a Greenhouse token from a URL or a query", () => {
    expect(greenhouseToken(src({ url: "https://boards.greenhouse.io/acme" }))).toBe("acme");
    expect(greenhouseToken(src({ query: "greenhouse:acme_co" }))).toBe("acme_co");
    expect(greenhouseToken(src({ query: "greenhouse:your-company-token" }))).toBe("your-company-token");
    expect(greenhouseToken(src({}))).toBeNull();
  });

  it("reads a Lever company from a URL or a query", () => {
    expect(leverCompany(src({ url: "https://jobs.lever.co/acme/123" }))).toBe("acme");
    expect(leverCompany(src({ query: "lever:acme" }))).toBe("acme");
    expect(leverCompany(src({}))).toBeNull();
  });
});

describe("buildFetcher dispatch", () => {
  it("routes to the right fetcher, or none for a non-ATS source", () => {
    expect(buildFetcher(src({ query: "greenhouse:acme" }))).toBe(greenhouseFetcher);
    expect(buildFetcher(src({ url: "https://jobs.lever.co/acme" }))).toBe(leverFetcher);
    expect(buildFetcher(src({ url: "https://linkedin.com/jobs" }))).toBeUndefined();
  });
});

describe("stripHtml", () => {
  it("strips tags and decodes common entities", () => {
    expect(stripHtml("<p>We use &lt;TypeScript&gt; &amp; Next.js</p><p>Remote</p>")).toBe(
      "We use <TypeScript> & Next.js\nRemote",
    );
  });
});

describe("greenhouseFetcher", () => {
  it("maps the public jobs JSON to RawListing[]", async () => {
    stubFetch({
      jobs: [
        {
          title: "Full-stack Engineer",
          absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
          location: { name: "Remote (EU)" },
          content: "<p>TypeScript, Next.js, Supabase.</p>",
        },
        { title: "", absolute_url: "" }, // skipped (incomplete)
      ],
    });
    const out = await greenhouseFetcher(src({ name: "Acme", query: "greenhouse:acme" }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      company: "Acme",
      role: "Full-stack Engineer",
      url: "https://boards.greenhouse.io/acme/jobs/1",
    });
    expect(out[0]!.text).toContain("TypeScript");
    expect(out[0]!.facts?.atsVendor).toBe("greenhouse");
    expect(out[0]!.facts?.applyMethod).toBe("ats");
  });

  it("returns [] when no token is configured (no network call)", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await greenhouseFetcher(src({ query: "not-a-board" }))).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("leverFetcher", () => {
  it("maps the postings JSON to RawListing[]", async () => {
    stubFetch([
      {
        text: "Growth Engineer",
        hostedUrl: "https://jobs.lever.co/acme/abc",
        categories: { location: "Stockholm" },
        descriptionPlain: "Own growth and attribution.",
      },
    ]);
    const out = await leverFetcher(src({ name: "Acme", query: "lever:acme" }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ role: "Growth Engineer", url: "https://jobs.lever.co/acme/abc" });
    expect(out[0]!.facts?.location).toBe("Stockholm");
  });
});
