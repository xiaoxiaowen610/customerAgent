import { expect, test } from "@playwright/test";

const password = process.env.DEMO_PASSWORD ?? "";

test("user query, human transfer and agent reply form one visible loop", async ({ page }) => {
  test.skip(!password, "DEMO_PASSWORD is required");
  await page.goto("/login");
  await page.getByLabel("邮箱").fill("user@finserve.dev");
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "智能客服会话" })).toBeVisible();

  await page.getByPlaceholder("输入咨询内容").fill("帮我查一下借款审核进度");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByText(/审核中/).last()).toBeVisible();
  await expect(page.getByText("查询借款进度")).toBeVisible();

  await page.getByPlaceholder("输入咨询内容").fill("我要转人工");
  await page.getByRole("button", { name: "发送消息" }).click();
  const transferMessage = page.getByText(/工单号：FS-/).last();
  await expect(transferMessage).toBeVisible();
  const ticketNo = (await transferMessage.textContent())?.match(/FS-\d+-\d+/)?.[0];
  expect(ticketNo).toBeTruthy();

  await page.getByRole("button", { name: /退出/ }).click();
  await page.getByLabel("邮箱").fill("agent@finserve.dev");
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "工单工作台" })).toBeVisible();
  await page.getByLabel("搜索工单").fill(ticketNo!);
  await page.getByRole("button", { name: "搜索" }).click();
  await expect(page.getByText(ticketNo!, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "查看工单详情" }).click();
  await page.getByPlaceholder("输入处理结论").fill("已接单，正在核验用户信息。");
  await page.locator("select").last().selectOption("PROCESSING");
  await page.getByRole("button", { name: "回复用户" }).click();
  await expect(page.getByText("已接单，正在核验用户信息。")).toBeVisible();
});
