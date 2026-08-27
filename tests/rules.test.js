import test from "node:test";
import assert from "node:assert/strict";
import {
  actionTurnSteps,
  canPlayFinalCard,
  isPlayable,
  isPlayableForTurn,
  isWildCard,
  nextDirection,
  resolveRpsWinner,
  scoreRound,
} from "../shared/rules.js";

const card = (color, value) => ({ color, value });

test("cards match by color or value", () => {
  const top = card("red", 7);
  assert.equal(isPlayable(card("red", 2), top), true);
  assert.equal(isPlayable(card("blue", 7), top), true);
  assert.equal(isPlayable(card("blue", 2), top), false);
});

test("all special wild cards are always playable", () => {
  const top = card("green", 4);
  for (const value of ["Wild", "Wild4", "RPS", "HT"]) {
    assert.equal(isPlayable(card("wild", value), top), true, value);
  }
  assert.equal(isWildCard(card("wild", "Wild")), true);
});

test("a Draw 2 stack can only be answered by another Draw 2", () => {
  const top = card("red", "Draw2");
  assert.equal(isPlayableForTurn(card("blue", "Draw2"), top, 6), true);
  assert.equal(isPlayableForTurn(card("wild", "Wild4"), top, 6), false);
  assert.equal(isPlayableForTurn(card("red", 3), top, 6), false);
});

test("final card requires UNO, while earlier cards do not", () => {
  assert.equal(canPlayFinalCard(2, false), true);
  assert.equal(canPlayFinalCard(1, false), false);
  assert.equal(canPlayFinalCard(1, true), true);
  assert.equal(canPlayFinalCard(0, false), true);
});

test("RPS resolves every win direction and ties", () => {
  assert.equal(resolveRpsWinner("rock", "scissors"), "thrower");
  assert.equal(resolveRpsWinner("paper", "rock"), "thrower");
  assert.equal(resolveRpsWinner("scissors", "paper"), "thrower");
  assert.equal(resolveRpsWinner("rock", "paper"), "target");
  assert.equal(resolveRpsWinner("paper", "paper"), "tie");
});

test("Skip, Wild 4, and two-player Reverse advance two seats", () => {
  assert.equal(actionTurnSteps("Skip", 4), 2);
  assert.equal(actionTurnSteps("Wild4", 4), 2);
  assert.equal(actionTurnSteps("Reverse", 2), 2);
  assert.equal(actionTurnSteps("Reverse", 4), 1);
  assert.equal(actionTurnSteps(7, 4), 1);
});

test("Reverse flips direction and other cards preserve it", () => {
  assert.equal(nextDirection("Reverse", 1), -1);
  assert.equal(nextDirection("Reverse", -1), 1);
  assert.equal(nextDirection("Skip", -1), -1);
});

test("best-of-three scoring crowns the first player to two", () => {
  const first = scoreRound({ a: 0, b: 0 }, "a");
  assert.deepEqual(first, { scores: { a: 1, b: 0 }, matchWinnerId: null });
  const second = scoreRound(first.scores, "a");
  assert.deepEqual(second, { scores: { a: 2, b: 0 }, matchWinnerId: "a" });
  assert.deepEqual(first.scores, { a: 1, b: 0 }, "input scores stay immutable");
});

test("RPS outcome is exhaustive and symmetric", () => {
  const choices = ["rock", "paper", "scissors"];
  for (const left of choices) {
    for (const right of choices) {
      const forward = resolveRpsWinner(left, right);
      const backward = resolveRpsWinner(right, left);
      if (left === right) assert.equal(forward, "tie");
      else assert.equal(forward === "thrower", backward === "target");
    }
  }
});

test("custom match targets do not crown a player early", () => {
  const first = scoreRound({ a: 2, b: 1 }, "a", 4);
  assert.equal(first.matchWinnerId, null);
  const final = scoreRound(first.scores, "a", 4);
  assert.equal(final.matchWinnerId, "a");
  assert.equal(final.scores.b, 1);
});

test("UNO gate stays closed until the final-card call is recorded", () => {
  assert.equal(canPlayFinalCard(1, false), false);
  assert.equal(canPlayFinalCard(1, true), true);
  assert.equal(canPlayFinalCard(2, false), true, "multi-card turns cannot be falsely blocked");
});
