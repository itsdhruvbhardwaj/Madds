const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { dateTime, scheduleInput, scheduleISO } = require("../dates.js");
const { localSchedule } = require("../notifications.js");
test("date display is always zero-padded DD/MM/YYYY with 24-hour time", () => {
  assert.equal(dateTime(new Date(2026, 0, 5, 4, 3, 2)), "05/01/2026, 04:03:02");
  assert.equal(dateTime(new Date(2026, 10, 8, 23, 15, 0)), "08/11/2026, 23:15:00");
});
test("UTC previews remain UTC and use the same date order", () => {
  assert.equal(dateTime("2026-12-31T23:59:04Z", { utc: true }), "31/12/2026, 23:59:04");
  assert.equal(dateTime("2026-01-01T00:00:00Z", { utc: true }), "01/01/2026, 00:00:00");
});
test("missing or invalid dates never display Invalid Date or the Unix epoch", () => {
  for (const value of [null, undefined, "", "bad"]) assert.equal(dateTime(value), "—");
});
test("schedule text converts day-first dates without swapping day and month", () => {
  assert.equal(scheduleInput(new Date(2026, 10, 8, 14, 5)), "08/11/2026 14:05");
  assert.equal(scheduleISO("08/11/2026 14:05"), "2026-11-08T14:05");
  const now = new Date(2026, 0, 1).getTime();
  assert.equal(localSchedule("08/11/2026 14:05", now), new Date(2026, 10, 8, 14, 5).toISOString());
  assert.throws(() => localSchedule("31/02/2026 14:05", now));
  assert.throws(() => localSchedule("08/13/2026 14:05", now));
  assert.throws(() => localSchedule("08/11/2025 14:05", now));
});
test("the shared formatter is loaded before every dated feature and assets are refreshed", () => {
  const html = fs.readFileSync("Admin-Portal/index.html", "utf8");
  assert.ok(html.indexOf('src="dates.js') < html.indexOf('src="notifications.js'));
  for (const name of ["app", "feedback", "performance", "settings", "storage", "users", "welcome-back", "watermark"]) {
    const source = fs.readFileSync(`Admin-Portal/${name}.js`, "utf8");
    assert.match(source, /MaddsDates\.dateTime/);
    const version = html.match(new RegExp(`${name}\\.js\\?v=(\\d{8})[-\\w]+`));
    assert.ok(version && Number(version[1]) >= 20261108, `${name} must use a current asset version`);
    assert.doesNotMatch(source, /new Date\([^;\n]*\)\.toLocaleString\(\)/);
  }
});
