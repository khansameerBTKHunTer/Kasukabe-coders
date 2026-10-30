import { NextRequest } from "next/server";
import { createDemoToken } from "../src/lib/auth/demo";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { getStore, IncidentService, resetStore } from "../src/lib/data-store";
import { generateSitRep, type SitRepSnapshot } from "../src/lib/sitrep";
import { GET } from "../src/app/api/reports/sitrep/route";

async function main() {
  process.env.CIVISCOPE_DEMO_MODE = "true";
  const request = () =>
    new NextRequest("http://localhost/api/reports/sitrep", {
      headers: {
        cookie: `civiscope_demo=${createDemoToken("a0000000-0000-0000-0000-000000000001")}`,
      },
    });
  resetStore();
  try {
    const snapshot: SitRepSnapshot = {
      generatedAt: "2026-10-30T12:00:00.000Z",
      incidents: await IncidentService.getIncidents(),
      stats: await IncidentService.getStatistics(),
      activityLogs: await IncidentService.getActivityLogs(),
    };
    const pdf = Buffer.from(generateSitRep(snapshot));
    const content = pdf.toString("latin1");
    assert.ok(content.startsWith("%PDF-"));
    assert.ok(content.includes("Total incidents: 4 | Citizen reports: 6"));
    assert.ok(content.includes("EXERCISE DATA"));
    assert.ok(content.includes("Priority rationale:"));
    assert.ok(content.includes("Feeder 4 remote-tripped"));
    assert.ok(
      content.includes("Status transition: acknowledged -> in_progress"),
    );
    assert.ok(content.indexOf("1. [Simulated] Partial") >= 0);
    assert.ok(
      content.indexOf("1. [Simulated] Partial") <
        content.indexOf("2. [Simulated] Snapped"),
    );

    // Empty state and missing optional response data must still yield a valid PDF.
    const empty = Buffer.from(
      generateSitRep({
        ...snapshot,
        incidents: [],
        activityLogs: [],
        stats: {
          total: 0,
          critical: 0,
          high: 0,
          awaitingAssignment: 0,
          activeResponses: 0,
          totalReports: 0,
        },
      }),
    ).toString("latin1");
    assert.ok(empty.includes("No active Critical or High priority incidents."));
    assert.ok(empty.includes("No departmental assignments recorded."));
    assert.ok(empty.includes("No response activity recorded."));

    const long = structuredClone(snapshot);
    long.incidents[0].assignments![0].notes =
      "Long response note with (parentheses) and \\ backslash. ".repeat(700) +
      "END_OF_LONG_NOTE";
    const multipage = Buffer.from(generateSitRep(long)).toString("latin1");
    assert.ok(multipage.includes("END_OF_LONG_NOTE"));
    const pageCount = Number(multipage.match(/\/Count (\d+)/)?.[1]);
    assert.ok(
      pageCount > 5,
      `Expected pagination for long notes, got ${pageCount}`,
    );
    assert.ok(multipage.includes(`Page ${pageCount} of ${pageCount}`));

    // Resolved high-priority incidents are excluded from the active breakdown.
    const resolved = structuredClone(snapshot);
    resolved.incidents.forEach((i) => {
      i.status = "resolved";
      i.assignments = [];
    });
    assert.ok(
      Buffer.from(generateSitRep(resolved))
        .toString("latin1")
        .includes("No active Critical or High priority incidents."),
    );

    const response = await GET(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "application/pdf");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.match(
      response.headers.get("Content-Disposition")!,
      /^attachment; filename="CIVISCOPE-SitRep-.*\.pdf"$/,
    );
    const downloaded = Buffer.from(await response.arrayBuffer());
    assert.ok(downloaded.toString("latin1").startsWith("%PDF-"));
    // A later request must reflect newly recorded operations, not a cached snapshot.
    getStore().assignments[0].notes = "LATEST_FIELD_UPDATE";
    const latest = await GET(request());
    assert.ok(
      Buffer.from(await latest.arrayBuffer())
        .toString("latin1")
        .includes("LATEST_FIELD_UPDATE"),
    );

    const originalGetIncidents = IncidentService.getIncidents;
    const originalConsoleError = console.error;
    try {
      IncidentService.getIncidents = async () => {
        throw new Error("test failure");
      };
      console.error = () => {};
      const failure = await GET(request());
      assert.equal(failure.status, 500);
      assert.equal(failure.headers.get("Cache-Control"), "no-store");
      assert.equal((await failure.json()).success, false);
    } finally {
      IncidentService.getIncidents = originalGetIncidents;
      console.error = originalConsoleError;
    }
    // Optional artifact for inspection with a PDF reader or pdftotext.
    if (process.env.SITREP_TEST_OUTPUT)
      writeFileSync(process.env.SITREP_TEST_OUTPUT, downloaded);
    console.log(
      "SitRep tests passed: content, ordering, empty states, pagination, download, freshness, error handling.",
    );
  } finally {
    resetStore();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
