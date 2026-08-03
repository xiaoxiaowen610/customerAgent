import { expect, test } from "@playwright/test";

const password = process.env.DEMO_PASSWORD ?? "";

test("agent runs regression suite and manages prompt governance", async ({ page }) => {
  test.skip(!password, "DEMO_PASSWORD is required");
  await page.goto("/login");
  await page.getByLabel("邮箱").fill("agent@finserve.dev");
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();

  await page.getByRole("link", { name: "质量治理" }).click();
  await expect(page.getByRole("heading", { name: "Agent 质量治理" })).toBeVisible();
  await expect(page.getByText("Prompt Registry", { exact: true })).toBeVisible();
  await expect(page.getByText("Human Review", { exact: true })).toBeVisible();

  const suiteResponse = page.waitForResponse(
    (response) => response.url().includes("/admin/evaluation/run-suite") && response.request().method() === "POST" && response.ok()
  );
  const dashboardAfterSuite = page.waitForResponse(
    (response) => response.url().includes("/admin/evaluation/dashboard") && response.request().method() === "GET" && response.ok()
  );
  await page.getByRole("button", { name: "运行 Golden Suite" }).click();
  await Promise.all([suiteResponse, dashboardAfterSuite]);
  await expect(page.getByText(/回归完成：\d+\/\d+ 通过/)).toBeVisible();
  await expect(page.getByRole("cell", { name: /loan-status-routing/ }).first()).toBeVisible();

  const prompt = "你是经过 E2E 验证的消费金融客服 Agent。只能调用白名单工具，禁止编造事实，遇到未知问题、投诉和人工请求必须创建工单。";
  await page.getByPlaceholder("输入新的客服 Agent 系统 Prompt，保存为草稿版本").fill(prompt);
  const createPromptResponse = page.waitForResponse(
    (response) => response.url().endsWith("/admin/evaluation/prompts") && response.request().method() === "POST" && response.ok()
  );
  const dashboardAfterCreate = page.waitForResponse(
    (response) => response.url().includes("/admin/evaluation/dashboard") && response.request().method() === "GET" && response.ok()
  );
  await page.getByRole("button", { name: "创建 Prompt 草稿" }).click();
  await Promise.all([createPromptResponse, dashboardAfterCreate]);
  await expect(page.getByText("已创建新的 Prompt 草稿版本", { exact: true })).toBeVisible();
  const promptText = page.getByText(prompt, { exact: true }).first();
  await expect(promptText).toBeVisible();

  const promptCard = promptText.locator("xpath=../..");
  const activateResponse = page.waitForResponse(
    (response) => response.url().includes("/activate") && response.request().method() === "POST" && response.ok()
  );
  const dashboardAfterActivate = page.waitForResponse(
    (response) => response.url().includes("/admin/evaluation/dashboard") && response.request().method() === "GET" && response.ok()
  );
  await promptCard.getByRole("button", { name: "激活", exact: true }).click();
  await Promise.all([activateResponse, dashboardAfterActivate]);
  await expect(page.getByText("Prompt 版本已激活，旧版本已归档", { exact: true })).toBeVisible();
});
