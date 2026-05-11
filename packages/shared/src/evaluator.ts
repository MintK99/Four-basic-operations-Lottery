import type { Operator } from './types';
import { GAME_CONFIG } from './types';

export interface EvalResult {
  value: number | null; // null = 유효하지 않은 수식 (비정수 나누기, 범위 초과 등)
  formula: string;      // 사람이 읽을 수 있는 수식 문자열
}

/**
 * 사칙연산 로또 수식을 평가합니다.
 *
 * 연산 우선순위: ^ > × ÷ > + - > ★
 * ★: 좌우의 계산된 값을 숫자로 이어붙임 (예: 2 ★ 7 → 27)
 *
 * @param numbers 숫자 4개 [n1, n2, n3, n4]
 * @param operators 연산자 3개 [op1, op2, op3]
 * @returns EvalResult
 */
export function evaluate(
  numbers: [number, number, number, number],
  operators: [Operator, Operator, Operator]
): EvalResult {
  const formula = buildFormulaString(numbers, operators);

  // 토큰 배열: [num, op, num, op, num, op, num]
  const tokens: (number | Operator)[] = [
    numbers[0], operators[0],
    numbers[1], operators[1],
    numbers[2], operators[2],
    numbers[3],
  ];

  const result = evalTokens(tokens);

  if (result === null) {
    return { value: null, formula };
  }

  // 당첨번호 유효 범위: 1~45 정수
  if (
    !Number.isInteger(result) ||
    result < GAME_CONFIG.WINNING_NUMBER_MIN ||
    result > GAME_CONFIG.WINNING_NUMBER_MAX
  ) {
    return { value: null, formula };
  }

  return { value: result, formula };
}

function buildFormulaString(
  numbers: [number, number, number, number],
  operators: [Operator, Operator, Operator]
): string {
  return `${numbers[0]}${operators[0]}${numbers[1]}${operators[1]}${numbers[2]}${operators[2]}${numbers[3]}`;
}

/**
 * 토큰 배열을 연산 우선순위에 따라 평가합니다.
 * 토큰 배열: 숫자와 연산자가 교차 [n, op, n, op, n, op, n]
 */
function evalTokens(tokens: (number | Operator)[]): number | null {
  // 1단계: ^ (거듭제곱) 처리
  const afterPow = applyBinaryOps([...tokens], ['^']);
  if (afterPow === null) return null;

  // 2단계: × ÷ 처리
  const afterMulDiv = applyBinaryOps(afterPow, ['×', '÷']);
  if (afterMulDiv === null) return null;

  // 3단계: + - 처리
  const afterAddSub = applyBinaryOps(afterMulDiv, ['+', '-']);
  if (afterAddSub === null) return null;

  // 4단계: ★ 처리 (나머지 숫자들을 문자열 이어붙임)
  const toks = applyStarOp(afterAddSub);
  if (toks === null) return null;

  if (toks.length !== 1 || typeof toks[0] !== 'number') return null;
  return toks[0];
}

/**
 * 지정된 연산자들을 왼쪽부터 순서대로 처리합니다.
 * 처리 후 축소된 토큰 배열을 반환하며, 오류 시 null 반환합니다.
 */
function applyBinaryOps(
  tokens: (number | Operator)[],
  ops: Operator[]
): (number | Operator)[] | null {
  const toks = [...tokens];
  let i = 1; // 연산자 위치
  while (i < toks.length) {
    const op = toks[i] as Operator;
    if (ops.includes(op)) {
      const left = toks[i - 1] as number;
      const right = toks[i + 1] as number;
      const result = applyOp(left, op, right);
      if (result === null) return null;
      // [left, op, right] → [result]
      toks.splice(i - 1, 3, result);
      // i stays at same position (now points to next op)
    } else {
      i += 2;
    }
  }
  return toks;
}

/**
 * ★ 연산자를 처리합니다.
 * ★는 왼쪽 숫자와 오른쪽 숫자를 문자열로 이어붙입니다.
 * 이어붙인 결과가 당첨번호 유효범위를 벗어나도 중간값이면 허용합니다.
 */
function applyStarOp(tokens: (number | Operator)[]): (number | Operator)[] | null {
  const toks = [...tokens];
  let i = 1;
  while (i < toks.length) {
    const op = toks[i] as Operator;
    if (op === '★') {
      const left = toks[i - 1] as number;
      const right = toks[i + 1] as number;
      // 음수이거나 소수면 연결 불가
      if (!Number.isInteger(left) || !Number.isInteger(right) || left < 0 || right < 0) {
        return null;
      }
      const concatenated = parseInt(`${left}${right}`, 10);
      toks.splice(i - 1, 3, concatenated);
    } else {
      i += 2;
    }
  }
  return toks;
}

function applyOp(left: number, op: Operator, right: number): number | null {
  switch (op) {
    case '+': return left + right;
    case '-': return left - right;
    case '×': return left * right;
    case '÷': {
      if (right === 0) return null;
      const result = left / right;
      if (!Number.isInteger(result)) return null;
      return result;
    }
    case '^': {
      if (right < 0) return null; // 음수 지수 허용 안 함 (결과 소수)
      return Math.pow(left, right);
    }
    default:
      return null;
  }
}

/**
 * 숫자 4개 + 연산자 3개 조합으로 만들 수 있는 모든 유효한 결과를 반환합니다.
 * (힌트 시스템이나 자동완성 용도)
 */
export function getAllValidResults(
  numbers: number[],
  operators: Operator[]
): Set<number> {
  const results = new Set<number>();
  // 숫자 4개 선택 (순열)
  const numPerms = permutations(numbers, 4);
  // 연산자 3개 배치 (순열)
  const opPerms = permutations(operators, 3);

  for (const nums of numPerms) {
    for (const ops of opPerms) {
      const { value } = evaluate(
        nums as [number, number, number, number],
        ops as [Operator, Operator, Operator]
      );
      if (value !== null) {
        results.add(value);
      }
    }
  }
  return results;
}

function permutations<T>(arr: T[], r: number): T[][] {
  if (r === 0) return [[]];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest, r - 1)) {
      result.push([arr[i], ...perm]);
    }
  }
  return result;
}
