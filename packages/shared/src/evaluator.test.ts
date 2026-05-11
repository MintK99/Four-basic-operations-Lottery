import { describe, it, expect } from 'vitest';
import { evaluate } from './evaluator';

describe('evaluate', () => {
  describe('기본 사칙연산', () => {
    it('덧셈', () => {
      expect(evaluate([1, 2, 3, 4], ['+', '+', '+'])).toMatchObject({ value: 10 });
    });

    it('뺄셈', () => {
      expect(evaluate([6, 2, 1, 1], ['-', '-', '-'])).toMatchObject({ value: 2 });
    });

    it('곱셈', () => {
      expect(evaluate([2, 3, 1, 1], ['×', '+', '+'])).toMatchObject({ value: 8 });
    });

    it('나눗셈 (정수 결과)', () => {
      expect(evaluate([6, 2, 1, 1], ['÷', '+', '+'])).toMatchObject({ value: 5 });
    });
  });

  describe('연산 우선순위', () => {
    it('곱셈이 덧셈보다 먼저 계산됨', () => {
      // 2 + 3 × 4 - 1 = 2 + 12 - 1 = 13
      expect(evaluate([2, 3, 4, 1], ['+', '×', '-'])).toMatchObject({ value: 13 });
    });

    it('거듭제곱이 가장 먼저 계산됨', () => {
      // 2 ^ 3 + 1 × 4 = 8 + 4 = 12
      expect(evaluate([2, 3, 1, 4], ['^', '+', '×'])).toMatchObject({ value: 12 });
    });

    it('★ (별)이 가장 마지막에 계산됨: 1×2★3+4 = 27', () => {
      // 1×2=2, 3+4=7, 2★7=27
      expect(evaluate([1, 2, 3, 4], ['×', '★', '+'])).toMatchObject({ value: 27 });
    });
  });

  describe('★ (별) 연산자', () => {
    it('두 숫자를 이어붙임: 3 ★ 5 = 35', () => {
      // 3+1=4... 다르게: 3★5 단독으로 만들기: 1+2★5-1
      // 1+2=3, 5-1=4, 3★4=34 → value: 34 (범위 초과 아님, 1~45)
      expect(evaluate([1, 2, 5, 1], ['+', '★', '-'])).toMatchObject({ value: 34 });
    });

    it('★ 결과가 45 초과면 null', () => {
      // 5+1=6, 4+2=6, 6★6=66 → 범위 초과
      expect(evaluate([5, 1, 4, 2], ['+', '★', '+'])).toMatchObject({ value: null });
    });

    it('★ 결과가 1~45 범위 내면 유효', () => {
      // 1+2=3, 3+2=5, 3★5=35 → 유효
      expect(evaluate([1, 2, 3, 2], ['+', '★', '+'])).toMatchObject({ value: 35 });
    });
  });

  describe('유효하지 않은 수식', () => {
    it('나누기 결과가 소수면 null (5÷2=2.5)', () => {
      // 5 ÷ 2 + 1 - 1 = 2.5 → null
      expect(evaluate([5, 2, 1, 1], ['÷', '+', '-'])).toMatchObject({ value: null });
    });

    it('나누기 결과가 소수면 null', () => {
      // 5 ÷ 2 = 2.5
      expect(evaluate([5, 2, 1, 1], ['÷', '+', '+'])).toMatchObject({ value: null });
    });

    it('결과가 0이면 null (1 미만)', () => {
      // 3 - 3 + 1 × 1 = 1... 아니라면: 1-1+1-1=0
      expect(evaluate([1, 1, 1, 1], ['-', '+', '-'])).toMatchObject({ value: null });
    });

    it('결과가 46 이상이면 null', () => {
      // 6^3 = 216 > 45 → null (중간 계산값이므로 이후 처리에 따름)
      // 6^3 + 1 - 1 = 216 → null
      expect(evaluate([6, 3, 1, 1], ['^', '+', '-'])).toMatchObject({ value: null });
    });
  });

  describe('formula 문자열', () => {
    it('수식 문자열이 올바르게 생성됨', () => {
      const result = evaluate([1, 2, 3, 4], ['+', '×', '-']);
      expect(result.formula).toBe('1+2×3-4');
    });
  });
});
