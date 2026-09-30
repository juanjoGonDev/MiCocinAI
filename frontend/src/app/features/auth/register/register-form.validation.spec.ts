import {
  registerNameIssue,
  registerEmailIssue,
  registerPasswordIssue,
  type RegisterPasswordIssue
} from './register-form.validation';

describe('register form validation', () => {
  it('matches the backend name length boundaries', () => {
    expect(registerNameIssue('')).toBe('required');
    expect(registerNameIssue('A')).toBe('tooShort');
    expect(registerNameIssue('Ab')).toBeNull();
    expect(registerNameIssue('N'.repeat(100))).toBeNull();
    expect(registerNameIssue('N'.repeat(101))).toBe('tooLong');
  });

  it('matches the backend email format', () => {
    expect(registerEmailIssue('')).toBe('required');
    expect(registerEmailIssue('not-an-email')).toBe('invalidEmail');
    expect(registerEmailIssue('ana@localhost')).toBe('invalidEmail');
    expect(registerEmailIssue('ana@example.c')).toBe('invalidEmail');
    expect(registerEmailIssue('ana..smith@example.com')).toBe('invalidEmail');
    expect(registerEmailIssue('ana@example.com')).toBeNull();
    expect(registerEmailIssue('first.last+tag@sub.example.co')).toBeNull();
  });

  it('matches the backend password requirements in validation order', () => {
    const cases: [string, RegisterPasswordIssue | null][] = [
      ['', 'required'],
      ['Abc1', 'tooShort'],
      ['abcdef1', 'uppercaseRequired'],
      ['Abcdef', 'numberRequired'],
      ['Ábcde1', 'uppercaseRequired'],
      ['Abcde1', null]
    ];

    for (const [password, issue] of cases) {
      expect(registerPasswordIssue(password)).withContext(password).toBe(issue);
    }
  });
});
