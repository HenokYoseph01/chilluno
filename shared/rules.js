export function isWildCard(card) {
  return card.color === "wild" || card.value === "Wild" || card.value === "Wild4";
}

export function isPlayable(card, top) {
  if (isWildCard(card) || card.value === "RPS" || card.value === "HT") return true;
  return card.color === top.color || card.value === top.value;
}

export function isPlayableForTurn(card, top, pendingDraw2) {
  return pendingDraw2 > 0 ? card.value === "Draw2" : isPlayable(card, top);
}

export function canPlayFinalCard(handCount, unoCalled) {
  return handCount !== 1 || unoCalled;
}

export function resolveRpsWinner(throwerChoice, targetChoice) {
  if (throwerChoice === targetChoice) return "tie";
  if (
    (throwerChoice === "rock" && targetChoice === "scissors") ||
    (throwerChoice === "paper" && targetChoice === "rock") ||
    (throwerChoice === "scissors" && targetChoice === "paper")
  ) return "thrower";
  return "target";
}

export function actionTurnSteps(value, playerCount) {
  if (value === "Skip" || value === "Wild4") return 2;
  if (value === "Reverse" && playerCount === 2) return 2;
  return 1;
}

export function nextDirection(value, direction) {
  return value === "Reverse" ? direction * -1 : direction;
}
