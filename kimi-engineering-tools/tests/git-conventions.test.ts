import assert from "node:assert/strict"
import test from "node:test"
import { runGitConventions } from "../src/tools/git-conventions.js"

function hasStatus(output: string, status: "PASS" | "WARN" | "ERROR", label: string): boolean {
  return output.includes(`${status}  ${label}:`) || output.includes(`${status} ${label}:`)
}

test("accepts conventional subject with short bullet body", () => {
  const message = [
    "feat(auth): add login flow",
    "",
    "- add session cookie handling",
    "- cover happy path in unit tests",
  ].join("\n")
  const output = runGitConventions({ message, include_guide: false })
  assert.equal(hasStatus(output, "ERROR", "Format"), false)
  assert.equal(hasStatus(output, "ERROR", "Body"), false)
  assert.match(output, /body enforcement = on/)
})

test("subject-only is WARN when enforce_body is on (default)", () => {
  const output = runGitConventions({ message: "feat(auth): add login flow", include_guide: false })
  assert.ok(hasStatus(output, "WARN", "Body"))
  assert.equal(hasStatus(output, "ERROR", "Body"), false)
})

test("subject-only passes Body when enforce_body is false", () => {
  const output = runGitConventions({
    message: "feat(auth): add login flow",
    enforce_body: false,
    include_guide: false,
  })
  assert.ok(hasStatus(output, "PASS", "Body"))
  assert.match(output, /body enforcement = off/)
})

test("all-prose body is ERROR under enforce_body", () => {
  const message = [
    "feat(auth): add login flow",
    "",
    "This change adds login handling for the service.",
    "It also updates the session store configuration.",
    "Finally it documents the new cookie flags.",
  ].join("\n")
  const output = runGitConventions({ message, include_guide: false })
  assert.ok(hasStatus(output, "ERROR", "Body"))
})

test("AI signature and bad format are ERROR", () => {
  const withSignature = runGitConventions({
    message: "feat(auth): add login\n\n- ok\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
    include_guide: false,
  })
  assert.ok(hasStatus(withSignature, "ERROR", "AI Signature"))

  const badFormat = runGitConventions({
    message: "feat(Tools): add thing",
    include_guide: false,
  })
  assert.ok(hasStatus(badFormat, "ERROR", "Format"))
})

test("branch main is exempt and unknown prefix warns", () => {
  const main = runGitConventions({ branch: "main", include_guide: false })
  assert.ok(hasStatus(main, "PASS", "Branch Name"))

  const random = runGitConventions({ branch: "random-work", include_guide: false })
  assert.ok(hasStatus(random, "WARN", "Branch Name"))
})
