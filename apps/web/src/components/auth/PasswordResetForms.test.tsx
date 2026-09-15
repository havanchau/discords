import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResetPasswordForm } from './PasswordResetForms';

describe('ResetPasswordForm', () => {
  it('keeps submit disabled until the confirmation matches', () => {
    render(<ResetPasswordForm isSubmitting={false} onSubmit={vi.fn()} onBack={vi.fn()} />);
    const submit = screen.getByRole('button', { name: 'Update password' });

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Str0ng!Pass' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Str0ng!Pas' } });
    expect(submit).toHaveProperty('disabled', true);
    expect(screen.getByText('Passwords do not match.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Str0ng!Pass' } });
    expect(submit).toHaveProperty('disabled', false);
  });
});
