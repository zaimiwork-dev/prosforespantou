'use server';

/**
 * Verifies the provided password against the ADMIN_PASSWORD environment variable.
 */
export async function verifyAdminPassword(password: string) {
  const correctPassword = process.env.ADMIN_PASSWORD;
  
  if (!correctPassword) {
    console.error('ADMIN_PASSWORD is not set in environment variables');
    return { success: false, error: 'Server configuration error' };
  }

  if (password === correctPassword) {
    return { success: true };
  }

  return { success: false, error: 'Λάθος κωδικός πρόσβασης' };
}
