import {
  loginSchema,
  registerSchema,
  taskSchema,
  taskEditSchema,
  getErrorMessage,
} from '../../utils/validation';

const validate = async (schema, values) => {
  try {
    await schema.validate(values, { abortEarly: false });
    return null;
  } catch (err) {
    return err;
  }
};

describe('validation schemas', () => {
  test('login requires a valid email and a non-blank password', async () => {
    expect(await validate(loginSchema, { email: 'a@b.com', password: 'secret' })).toBeNull();

    const badEmail = await validate(loginSchema, { email: 'nope', password: 'secret' });
    expect(badEmail.errors).toContain('Enter a valid email address');

    const blankPassword = await validate(loginSchema, { email: 'a@b.com', password: '   ' });
    expect(blankPassword.errors).toContain('Password is required');
  });

  test('register enforces name, email, min length and confirmation', async () => {
    expect(await validate(registerSchema, {
      name: 'A',
      email: 'a@b.com',
      password: 'password1',
      confirmPassword: 'password1',
    })).toBeNull();

    const mismatch = await validate(registerSchema, {
      name: 'A',
      email: 'a@b.com',
      password: 'password1',
      confirmPassword: 'password2',
    });
    expect(mismatch.errors).toContain("Passwords don't match");

    const short = await validate(registerSchema, {
      name: 'A',
      email: 'a@b.com',
      password: 'short',
      confirmPassword: 'short',
    });
    expect(short.errors).toContain('Password must be at least 8 characters');
  });

  test('task schema requires a project but the edit schema does not', async () => {
    const base = { title: 'Valid title', description: 'desc' };

    const createErr = await validate(taskSchema, { ...base, project: '' });
    expect(createErr.errors).toContain('Project is required');

    expect(await validate(taskEditSchema, { ...base, project: '' })).toBeNull();

    const shortTitle = await validate(taskSchema, { title: 'ab', description: 'desc', project: '1' });
    expect(shortTitle.errors).toContain('Title must be between 3 and 100 characters');
  });

  test('getErrorMessage prefers the backend envelope, then the error, then the fallback', () => {
    expect(getErrorMessage({ data: { message: 'backend says' }, message: 'js' }, 'fallback')).toBe('backend says');
    expect(getErrorMessage({ message: 'js' }, 'fallback')).toBe('js');
    expect(getErrorMessage(undefined, 'fallback')).toBe('fallback');
  });
});
