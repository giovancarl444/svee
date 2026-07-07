import { describe, it, expect } from "vitest";
import { HttpClient } from "./http.js";
import { paginate, collect, pageMeta } from "./pagination.js";
import { fakeDeps, testConfig } from "../test-support/http-fakes.js";

describe("paginate", () => {
  it("follows @nextpageuri across pages and flattens items", async () => {
    const { deps, calls } = fakeDeps([
      { json: { "@nextpageuri": "/Advertisers/SID123/Actions?Page=2", Actions: [{ Id: "1" }, { Id: "2" }] } },
      { json: { "@nextpageuri": "/Advertisers/SID123/Actions?Page=3", Actions: [{ Id: "3" }] } },
      { json: { "@nextpageuri": "", Actions: [{ Id: "4" }] } },
    ]);
    const http = new HttpClient(testConfig(), deps);
    const items = await collect(paginate<{ Id: string }>(http, "/Advertisers/SID123/Actions", { dataKey: "Actions" }));
    expect(items.map((i) => i.Id)).toEqual(["1", "2", "3", "4"]);
    expect(calls).toHaveLength(3);
    // page 2+ must use the server URI WITHOUT re-appending the original query.
    expect(calls[1]!.url).toContain("Page=2");
  });

  it("auto-detects the array field when dataKey is omitted", async () => {
    const { deps } = fakeDeps([{ json: { "@total": "2", MediaPartners: [{ MediaId: "a" }, { MediaId: "b" }] } }]);
    const http = new HttpClient(testConfig(), deps);
    const items = await collect(paginate<{ MediaId: string }>(http, "/x"));
    expect(items.map((i) => i.MediaId)).toEqual(["a", "b"]);
  });

  it("stops immediately when there is no next page", async () => {
    const { deps, calls } = fakeDeps([{ json: { Actions: [{ Id: "1" }] } }]);
    const http = new HttpClient(testConfig(), deps);
    const items = await collect(paginate(http, "/x", { dataKey: "Actions" }));
    expect(items).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("collect() honours a limit and short-circuits", async () => {
    const { deps } = fakeDeps([
      { json: { "@nextpageuri": "/next", Actions: [{ Id: "1" }, { Id: "2" }, { Id: "3" }] } },
    ]);
    const http = new HttpClient(testConfig(), deps);
    const items = await collect(paginate(http, "/x", { dataKey: "Actions" }), 2);
    expect(items).toHaveLength(2);
  });

  it("pageMeta parses string-valued meta fields to numbers", async () => {
    const { deps } = fakeDeps([{ json: { "@total": "437", "@numpages": "5", "@pagesize": "100", Actions: [] } }]);
    const http = new HttpClient(testConfig(), deps);
    const meta = await pageMeta(http, "/x");
    expect(meta).toEqual({ total: 437, numPages: 5, pageSize: 100 });
  });
});
