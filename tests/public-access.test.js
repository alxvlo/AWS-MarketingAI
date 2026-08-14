const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("public dashboard", () => {
  test("the public entry route renders the dashboard without authentication", () => {
    const rootPage = read("frontend/app/page.tsx");
    const homePage = read("frontend/app/home/page.tsx");

    expect(rootPage).toMatch(/home\/page|EmotionCapturePanel/);
    expect(rootPage).not.toMatch(/useAuth|\/login\//);
    expect(homePage).not.toMatch(/useAuth|\/login\//);
  });

  test("frontend API calls do not require a browser auth token", () => {
    expect(read("frontend/lib/analytics.ts")).not.toMatch(/getToken|Authorization|Not authenticated/);
    expect(read("frontend/lib/adminApi.ts")).not.toMatch(/getToken|Authorization|Not authenticated|login\(/);
  });

  test("the recipient field explains the SES sandbox restriction", () => {
    const capturePanel = read("frontend/components/home/EmotionCapturePanel.tsx");

    expect(capturePanel).toContain("alexvelo199@gmail.com");
    expect(capturePanel).toMatch(/AWS SES|sandbox/i);
  });

  test("CDK exposes dashboard APIs without login or authorizers", () => {
    const appEntry = read("bin/satisfaction-meter.ts");
    const dashboardStack = read("lib/admin-auth-stack.ts");
    const analyticsStack = read("lib/analytics-stack.ts");

    expect(appEntry).not.toMatch(/protectWithAdminAuthorizer|AdminAuthStack/);
    expect(dashboardStack).not.toMatch(/AdminLoginFunction|TokenAuthorizer|AuthorizationType\.CUSTOM|admin\/login/);
    expect(analyticsStack).not.toMatch(/TokenAuthorizer|AuthorizationType\.CUSTOM|protectWithAdminAuthorizer/);
  });

  test("the public audit feed does not expose submission capabilities or emails", () => {
    const handler = read("lambdas/admin-submissions/index.ts");
    const auditCard = read("frontend/components/home/SubmissionsAuditCard.tsx");

    expect(handler).toContain("ProjectionExpression");
    expect(handler).toContain("displayId");
    expect(handler).not.toMatch(/submissionId:\s*i\.submissionId|email:\s*maskEmail/);
    expect(auditCard).not.toMatch(/s\.email(?!SentAt)|["']Email["']/);
  });
});
