import { FormControl } from '@angular/forms';
import { recipeGrams, recipeName } from './recipe-create-form';

describe('Recipe creation input', () => {
  it('converts comma/dot kg inputs to exact positive grams without rounding', () => {
    expect(recipeGrams(' 60,001 ')).toBe('60001');
    expect(recipeGrams('0.001')).toBe('1');
    expect(recipeGrams('0001,20')).toBe('1200');
    expect(recipeGrams('9223372036854775.807')).toBe('9223372036854775807');
  });
  it('rejects zero, negatives, excess precision, grouped numbers, exponents and overflow', () => {
    for (const value of ['', '0', '0,000', '-1', '1,0001', '1.234,50', '1e3', 'NaN', 'Infinity', '1.', '9223372036854775.808']) expect(recipeGrams(value)).toBeNull();
  });
  it('requires a non-whitespace recipe name', () => {
    expect(recipeName(new FormControl('   '))).toEqual({ required: true });
    expect(recipeName(new FormControl(' Ración BB '))).toBeNull();
  });
});
