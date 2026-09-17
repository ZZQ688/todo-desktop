import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "./App";
import { asLocalDate } from "../domain/local-date";
import type { HealthCheck } from "../application/health";

const ready: HealthCheck = async () => ({ schemaVersion: 1, databaseReady: true });

test("shows a successful native connection", async () => {
  render(<App getHealth={ready} />);
  expect(screen.getByRole("heading", { name: "每日待办" })).toBeInTheDocument();
  expect(await screen.findByText("本地数据已连接")).toBeInTheDocument();
});

test("surfaces storage failures instead of displaying success", async () => {
  const failed: HealthCheck = async () => { throw { code: "database_unavailable" }; };
  render(<App getHealth={failed} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("本地数据无法打开");
  expect(screen.queryByText("本地数据已连接")).not.toBeInTheDocument();
});

test("changes dates and preserves selection when switching views", async () => {
  const user = userEvent.setup();
  render(<App today={() => asLocalDate("2026-09-16")} getHealth={ready} />);
  await screen.findByText("本地数据已连接");
  const date = screen.getByLabelText("日期");
  expect(date).toHaveValue("2026-09-16");
  await user.click(screen.getByRole("button", { name: "下一天" }));
  expect(date).toHaveValue("2026-09-17");
  await user.click(screen.getByRole("tab", { name: "项目" }));
  expect(screen.getByRole("heading", { name: "项目" })).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "每日" }));
  expect(screen.getByLabelText("日期")).toHaveValue("2026-09-17");
  await user.click(screen.getByRole("button", { name: "今天" }));
  expect(screen.getByLabelText("日期")).toHaveValue("2026-09-16");
  await user.click(screen.getByRole("tab", { name: "设置" }));
  expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
});

test("reads today's date when the Today button is clicked", async () => {
  const user = userEvent.setup();
  let currentDate = asLocalDate("2026-09-16");
  render(<App today={() => currentDate} getHealth={ready} />);
  await screen.findByText("本地数据已连接");

  await user.click(screen.getByRole("button", { name: "下一天" }));
  currentDate = asLocalDate("2026-09-17");
  await user.click(screen.getByRole("button", { name: "今天" }));

  expect(screen.getByLabelText("日期")).toHaveValue("2026-09-17");
});
