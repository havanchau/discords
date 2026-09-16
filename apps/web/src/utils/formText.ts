/** Reads a text field from a form. A missing field or a file input reads as an empty string. */
export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
